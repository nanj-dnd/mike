import {
  type AthleteSex,
  type BattingMode,
  type BattingModeRubrics,
  type CameraAngle,
  type Discipline,
  type KpiDefinition,
  type Rubric,
  eventName,
  getBattingModeRubrics,
  supportsAngle,
} from "./rubric";
import {
  canonicalEvidenceTimestamps,
  evidenceFrameIndices,
  footworkApplicability,
  footworkRequirementFor,
  isDeliveryShotComplete,
  isFootworkApplicableForScoring,
  isFootworkRestrictedKpi,
  isSubjectFocusComplete,
  normalizeDeliveryShotMetadata,
  normalizeShotType,
  normalizeSubjectFocusMetadata,
  normalizeSubjectFocusRole,
  SHOT_TYPE_VALUES,
  SUBJECT_FOCUS_ROLE_VALUES,
  type DeliveryShotMetadata,
  type FootworkApplicabilityState,
  type ShotType,
  type ShotFootwork,
  type SubjectFocusMetadata,
  type SubjectFocusRole,
} from "./training-contract";

export {
  canonicalEvidenceTimestamps,
  evidenceFrameIndices,
  footworkApplicability,
  footworkRequirementFor,
  isDeliveryShotComplete,
  isFootworkApplicableForScoring,
  isFootworkRestrictedKpi,
  isSubjectFocusComplete,
  normalizeDeliveryShotMetadata,
  normalizeShotType,
  normalizeSubjectFocusMetadata,
  normalizeSubjectFocusRole,
  SHOT_TYPE_VALUES,
  SUBJECT_FOCUS_ROLE_VALUES,
};
export type {
  DeliveryShotMetadata,
  FootworkApplicabilityState,
  ShotFootwork,
  ShotType,
  SubjectFocusMetadata,
  SubjectFocusRole,
};

export type Visibility = "visible" | "occluded" | "low_quality" | "uncertain" | "not_applicable";
export const BOWLING_TYPE_FACED_VALUES = ["pace", "spin"] as const;
export type BowlingTypeFaced = BattingMode;
export type BowlingTypeFacedSource = "delivery" | "legacy_review_fallback";

export interface DeliveryLabel {
  id: string;
  deliveryId: string;
  kpiId: string;
  visibility: Visibility;
  score: number | null;
  confidence: number | null;
  evidenceMs: number | null;
  evidenceFramesMs?: number[];
  categoricalBucket: string;
  note: string;
  modelScore: number | null;
  modelVersion: string;
  updatedAt: string;
}

export interface Delivery {
  id: string;
  index: number;
  startMs: number;
  eventMs: number;
  endMs: number;
  outcome: string;
  note: string;
  shotFootwork?: ShotFootwork | null;
  bowlingTypeFaced?: BowlingTypeFaced | null;
  bowlingTypeFacedSource?: BowlingTypeFacedSource;
  shotType?: ShotType | null;
  shotTypeOther?: string;
}

export interface LabelRubricRouting {
  discipline?: Discipline;
  battingRubrics?: Partial<BattingModeRubrics>;
}

export interface ReviewState {
  annotator: string;
  reviewer: string;
  adjudicator: string;
  reviewedAt: string;
  captureSession: string;
  handedness: string;
  bowlerType: string;
  rubricTier: string;
  phvStage: string;
  heightCm: string;
  weightKg: string;
  multiplePeopleVisible: boolean;
  subjectFocusRole: SubjectFocusRole | null;
  subjectFocusDescription: string;
}

export interface AnnotationDocument {
  schemaVersion: "amp-labels-long-v1";
  deliveries: Delivery[];
  labels: DeliveryLabel[];
  review: ReviewState;
}

export interface QualityIssue {
  id: string;
  severity: "blocker" | "warning";
  message: string;
  deliveryId?: string;
  kpiId?: string;
}

export interface ScoreSummary {
  score10: number | null;
  score100: number | null;
  coveragePct: number;
  visibleCells: number;
  expectedCells: number;
  activeWeight: number;
}

export const EMPTY_REVIEW: ReviewState = {
  annotator: "",
  reviewer: "",
  adjudicator: "",
  reviewedAt: "",
  captureSession: "",
  handedness: "",
  bowlerType: "",
  rubricTier: "",
  phvStage: "",
  heightCm: "",
  weightKg: "",
  multiplePeopleVisible: false,
  subjectFocusRole: null,
  subjectFocusDescription: "",
};

export const MIN_RATING_WEIGHT_PCT = 50;

export function emptyDocument(): AnnotationDocument {
  return {
    schemaVersion: "amp-labels-long-v1",
    deliveries: [],
    labels: [],
    review: { ...EMPTY_REVIEW },
  };
}

export function labelKey(deliveryId: string, kpiId: string) {
  return `${deliveryId}::${kpiId}`;
}

export function getLabel(
  labels: DeliveryLabel[],
  deliveryId: string,
  kpiId: string,
) {
  return labels.find(
    (label) => label.deliveryId === deliveryId && label.kpiId === kpiId,
  );
}

export function normalizeBowlingTypeFaced(value: unknown): BowlingTypeFaced | null {
  return BOWLING_TYPE_FACED_VALUES.includes(value as BowlingTypeFaced)
    ? (value as BowlingTypeFaced)
    : null;
}

export function normalizeDeliveryBowlingTypeFaced(
  delivery: Pick<Delivery, "bowlingTypeFaced" | "bowlingTypeFacedSource">,
  legacyReviewValue?: unknown,
) {
  const hasExplicitValue = Object.prototype.hasOwnProperty.call(
    delivery,
    "bowlingTypeFaced",
  );
  const bowlingTypeFaced = hasExplicitValue
    ? normalizeBowlingTypeFaced(delivery.bowlingTypeFaced)
    : normalizeBowlingTypeFaced(legacyReviewValue);
  return {
    bowlingTypeFaced,
    bowlingTypeFacedSource: bowlingTypeFaced
      ? delivery.bowlingTypeFacedSource === "legacy_review_fallback"
        ? "legacy_review_fallback" as const
        : hasExplicitValue
          ? "delivery" as const
          : "legacy_review_fallback" as const
      : undefined,
  };
}

interface RoutedRubricContext {
  rubric: Rubric;
  bowlingTypeFaced: BowlingTypeFaced | null;
  deliveries: Delivery[];
  includeClip: boolean;
  unresolvedBowlingType: boolean;
}

function routedRubricContexts(
  document: AnnotationDocument,
  fallbackRubric: Rubric,
  routing?: LabelRubricRouting,
): RoutedRubricContext[] {
  if (routing?.discipline !== "batting" || !routing.battingRubrics) {
    return [
      {
        rubric: fallbackRubric,
        bowlingTypeFaced: null,
        deliveries: document.deliveries,
        includeClip: true,
        unresolvedBowlingType: false,
      },
    ];
  }

  const paceRubric = routing.battingRubrics.pace;
  const spinRubric = routing.battingRubrics.spin;
  const sharedRubric =
    paceRubric && spinRubric && paceRubric.id === spinRubric.id
      ? paceRubric
      : null;
  const unresolvedDeliveries = document.deliveries.filter(
    (delivery) => !normalizeBowlingTypeFaced(delivery.bowlingTypeFaced),
  );

  // Foundation, Development and legacy projects genuinely share one route for
  // both pace and spin. One active Performance mode is not evidence of a shared route.
  if (sharedRubric) {
    return [
      {
        rubric: sharedRubric,
        bowlingTypeFaced: null,
        deliveries: document.deliveries,
        includeClip: true,
        unresolvedBowlingType: false,
      },
    ];
  }

  const activeModes = BOWLING_TYPE_FACED_VALUES.filter((mode) =>
    document.deliveries.some((delivery) => delivery.bowlingTypeFaced === mode),
  );
  const selected = activeModes
    .map((mode) => ({ mode, rubric: routing.battingRubrics?.[mode] }))
    .filter(
      (entry): entry is { mode: BowlingTypeFaced; rubric: Rubric } => Boolean(entry.rubric),
    );
  const contexts: RoutedRubricContext[] = selected.map(({ mode, rubric }) => ({
    rubric,
    bowlingTypeFaced: mode,
    deliveries: document.deliveries.filter((delivery) => delivery.bowlingTypeFaced === mode),
    includeClip: true,
    unresolvedBowlingType: false,
  }));
  if (unresolvedDeliveries.length > 0) {
    contexts.push({
      rubric: fallbackRubric,
      bowlingTypeFaced: null,
      deliveries: unresolvedDeliveries,
      includeClip: false,
      unresolvedBowlingType: true,
    });
  }
  return contexts;
}

export function battingRubricRouting(
  sex: AthleteSex,
  options: Parameters<typeof getBattingModeRubrics>[1] = {},
): LabelRubricRouting {
  return {
    discipline: "batting",
    battingRubrics: getBattingModeRubrics(sex, options),
  };
}

function scoreSingleRubric(
  document: AnnotationDocument,
  rubric: Rubric,
  angle: CameraAngle,
  clipEvidenceDeliveries?: Delivery[],
  fps = 0,
): ScoreSummary {
  let weightedScore = 0;
  let activeWeight = 0;
  let visibleCells = 0;
  let expectedCells = 0;

  for (const kpi of rubric.kpis) {
    if (!supportsAngle(kpi, angle)) continue;
    const targets =
      kpi.scope === "clip"
        ? [{ id: "clip", shotFootwork: null }]
        : document.deliveries;
    const scores: number[] = [];

    for (const target of targets) {
      const applicability = footworkApplicability(kpi, target.shotFootwork);
      if (!isFootworkApplicableForScoring(applicability)) continue;
      expectedCells += 1;
      const label = getLabel(document.labels, target.id, kpi.id);
      if (label) visibleCells += 1;
      const evidenceTimestamps = label
        ? canonicalEvidenceTimestamps(label, fps)
        : [];
      const clipEvidenceEligible =
        kpi.scope !== "clip" ||
        !clipEvidenceDeliveries ||
        (evidenceTimestamps.length > 0 &&
          evidenceTimestamps.every((timestampMs) =>
            clipEvidenceDeliveries.some(
              (delivery) =>
                timestampMs >= delivery.startMs && timestampMs <= delivery.endMs,
            ),
          ));
      if (
        label?.visibility === "visible" &&
        label.score !== null &&
        clipEvidenceEligible
      ) {
        scores.push(label.score);
      }
    }

    if (scores.length) {
      const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      weightedScore += mean * kpi.weight;
      activeWeight += kpi.weight;
    }
  }

  const score10 = activeWeight ? weightedScore / activeWeight : null;
  return {
    score10,
    score100: score10 === null ? null : score10 * 10,
    coveragePct: expectedCells ? (visibleCells / expectedCells) * 100 : 0,
    visibleCells,
    expectedCells,
    activeWeight,
  };
}

export function scoreDocument(
  document: AnnotationDocument,
  rubric: Rubric,
  angle: CameraAngle,
  routing?: LabelRubricRouting,
  fps = 0,
): ScoreSummary {
  const contexts = routedRubricContexts(document, rubric, routing);
  if (
    contexts.length === 1 &&
    contexts[0].bowlingTypeFaced === null &&
    !contexts[0].unresolvedBowlingType
  ) {
    const resolvedDeliveries = routing?.discipline === "batting"
      ? document.deliveries.filter((delivery) => delivery.bowlingTypeFaced)
      : document.deliveries;
    const clipKpiIds = new Set(
      contexts[0].rubric.kpis
        .filter((kpi) => kpi.scope === "clip")
        .map((kpi) => kpi.id),
    );
    const resolvedDocument = {
      ...document,
      deliveries: resolvedDeliveries,
      labels:
        routing?.discipline === "batting" && resolvedDeliveries.length < 3
          ? document.labels.filter((label) => !clipKpiIds.has(label.kpiId))
          : document.labels,
    };
    return scoreSingleRubric(
      resolvedDocument,
      contexts[0].rubric,
      angle,
      routing?.discipline === "batting" ? resolvedDeliveries : undefined,
      fps,
    );
  }

  const scoringContexts = contexts.filter(
    (context) => !context.unresolvedBowlingType,
  );
  const summaries = scoringContexts.map((context) =>
    scoreSingleRubric(
      {
        ...document,
        deliveries: context.deliveries,
        labels:
          context.deliveries.length < 3
            ? document.labels.filter(
                (label) =>
                  !context.rubric.kpis.some(
                    (kpi) => kpi.scope === "clip" && kpi.id === label.kpiId,
                  ),
              )
            : document.labels,
      },
      context.rubric,
      angle,
      context.deliveries,
      fps,
    ),
  );
  const summedActiveWeight = summaries.reduce(
    (total, summary) => total + summary.activeWeight,
    0,
  );
  const expectedCells = summaries.reduce(
    (total, summary) => total + summary.expectedCells,
    0,
  );
  const visibleCells = summaries.reduce(
    (total, summary) => total + summary.visibleCells,
    0,
  );
  const weightedScore = summaries.reduce(
    (total, summary) =>
      total +
      (summary.score10 === null ? 0 : summary.score10 * summary.activeWeight),
    0,
  );
  const mixedModes = scoringContexts.length > 1;
  const activeWeight = mixedModes
    ? summedActiveWeight / scoringContexts.length
    : summedActiveWeight;
  const score10 =
    mixedModes || !summedActiveWeight
      ? null
      : weightedScore / summedActiveWeight;
  return {
    score10,
    score100: score10 === null ? null : score10 * 10,
    coveragePct: expectedCells ? (visibleCells / expectedCells) * 100 : 0,
    visibleCells,
    expectedCells,
    activeWeight,
  };
}

function validateSingleRubric(
  document: AnnotationDocument,
  rubric: Rubric,
  angle: CameraAngle,
  durationMs: number,
  fps?: number,
  discipline?: Discipline,
  clipEvidenceDeliveries?: Delivery[],
  bowlingTypeFaced?: BowlingTypeFaced | null,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!document.review.annotator.trim()) {
    issues.push({
      id: "annotator-required",
      severity: "blocker",
      message: "Add the annotator name before review.",
    });
  }
  if (!document.review.captureSession.trim()) {
    issues.push({
      id: "session-required",
      severity: "blocker",
      message: "Add a capture-session ID so dataset splits stay player/session safe.",
    });
  }
  if (document.review.multiplePeopleVisible === true) {
    const focus = normalizeSubjectFocusMetadata(document.review);
    if (focus.subjectFocusRole === null) {
      issues.push({
        id: "subject-focus-role-required",
        severity: "blocker",
        message: "Choose the role of the person being labelled in this video.",
      });
    }
    if (!focus.subjectFocusDescription.trim()) {
      issues.push({
        id: "subject-focus-description-required",
        severity: "blocker",
        message: "Describe how to identify the person being labelled in this video.",
      });
    }
  }
  if (document.deliveries.length === 0) {
    issues.push({
      id: "delivery-required",
      severity: "blocker",
      message: "Mark at least one complete delivery.",
    });
  }
  if (document.deliveries.length < 3 && rubric.kpis.some((kpi) => kpi.scope === "clip")) {
    issues.push({
      id: bowlingTypeFaced
        ? `consistency-minimum-${bowlingTypeFaced}`
        : "consistency-minimum",
      severity: "blocker",
      message: bowlingTypeFaced
        ? `Add at least three ${bowlingTypeFaced} deliveries before scoring ${bowlingTypeFaced} consistency KPIs.`
        : "Add at least three deliveries before scoring consistency KPIs.",
    });
  }

  for (const delivery of document.deliveries) {
    if (
      delivery.startMs < 0 ||
      delivery.startMs >= delivery.eventMs ||
      delivery.eventMs >= delivery.endMs ||
      delivery.endMs > durationMs + 50
    ) {
      issues.push({
        id: `segment-${delivery.id}`,
        severity: "blocker",
        message: `Delivery ${delivery.index} needs valid start, event and end markers.`,
        deliveryId: delivery.id,
      });
    }
    if (discipline === "batting") {
      const shot = normalizeDeliveryShotMetadata(delivery);
      if (shot.shotType === null) {
        issues.push({
          id: `shot-type-${delivery.id}`,
          severity: "blocker",
          message: `Delivery ${delivery.index} needs a human shot-type choice.`,
          deliveryId: delivery.id,
        });
      } else if (shot.shotType === "other" && !shot.shotTypeOther.trim()) {
        issues.push({
          id: `shot-type-other-${delivery.id}`,
          severity: "blocker",
          message: `Delivery ${delivery.index} needs a description for the Other shot type.`,
          deliveryId: delivery.id,
        });
      }
    }
  }

  const sorted = [...document.deliveries].sort((a, b) => a.startMs - b.startMs);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startMs < sorted[index - 1].endMs) {
      issues.push({
        id: `overlap-${sorted[index].id}`,
        severity: "warning",
        message: `Delivery ${sorted[index - 1].index} overlaps delivery ${sorted[index].index}.`,
        deliveryId: sorted[index].id,
      });
    }
  }

  const footworkRestrictedKpis = rubric.kpis.filter(
    (kpi) => supportsAngle(kpi, angle) && isFootworkRestrictedKpi(kpi),
  );
  if (footworkRestrictedKpis.length > 0) {
    for (const delivery of document.deliveries) {
      const applicability = footworkApplicability(
        footworkRestrictedKpis[0],
        delivery.shotFootwork,
      );
      if (applicability === "unresolved_missing") {
        issues.push({
          id: `shot-footwork-${delivery.id}`,
          severity: "blocker",
          message: `Delivery ${delivery.index} needs a shot-footwork decision before front/back-only KPIs can be assessed.`,
          deliveryId: delivery.id,
        });
      } else if (applicability === "excluded_unclear") {
        issues.push({
          id: `shot-footwork-unclear-${delivery.id}`,
          severity: "warning",
          message: `Delivery ${delivery.index} is marked unclear; front/back-only KPI rows will be excluded from scoring and training.`,
          deliveryId: delivery.id,
        });
      }
    }
  }

  for (const kpi of rubric.kpis) {
    if (!supportsAngle(kpi, angle)) continue;
    const targets =
      kpi.scope === "clip"
        ? [
            {
              id: "clip",
              index: 0,
              startMs: 0,
              endMs: durationMs,
              shotFootwork: null,
            },
          ]
        : document.deliveries;

    for (const target of targets) {
      const applicability = footworkApplicability(kpi, target.shotFootwork);
      if (!isFootworkApplicableForScoring(applicability)) continue;
      const label = getLabel(document.labels, target.id, kpi.id);
      const deliveryName = kpi.scope === "clip" ? "clip-level" : `delivery ${target.index}`;
      if (!label) {
        issues.push({
          id: `missing-${target.id}-${kpi.id}`,
          severity: "blocker",
          message: `${kpi.name} is unlabelled for ${deliveryName}.`,
          deliveryId: target.id,
          kpiId: kpi.id,
        });
        continue;
      }
      if (label.visibility === "visible") {
        if (label.score === null || label.score < 0 || label.score > 10) {
          issues.push({
            id: `score-${target.id}-${kpi.id}`,
            severity: "blocker",
            message: `${kpi.name} needs a 0–10 score for ${deliveryName}.`,
            deliveryId: target.id,
            kpiId: kpi.id,
          });
        }
        const evidenceTimestamps = canonicalEvidenceTimestamps(label, fps);
        if (evidenceTimestamps.length === 0) {
          issues.push({
            id: `evidence-${target.id}-${kpi.id}`,
            severity: "blocker",
            message: `${kpi.name} needs an evidence frame for ${deliveryName}.`,
            deliveryId: target.id,
            kpiId: kpi.id,
          });
        } else if (
          evidenceTimestamps.some((timestampMs) => {
            if (kpi.scope === "clip" && clipEvidenceDeliveries) {
              return !clipEvidenceDeliveries.some(
                (delivery) =>
                  timestampMs >= delivery.startMs && timestampMs <= delivery.endMs,
              );
            }
            return timestampMs < target.startMs || timestampMs > target.endMs;
          })
        ) {
          issues.push({
            id: `evidence-range-${target.id}-${kpi.id}`,
            severity: "blocker",
            message: `${kpi.name} has evidence frames outside ${deliveryName}.`,
            deliveryId: target.id,
            kpiId: kpi.id,
          });
        }
        if (label.confidence === null || label.confidence < 1 || label.confidence > 5) {
          issues.push({
            id: `confidence-${target.id}-${kpi.id}`,
            severity: "blocker",
            message: `${kpi.name} needs a confidence rating for ${deliveryName}.`,
            deliveryId: target.id,
            kpiId: kpi.id,
          });
        } else if (label.confidence <= 2) {
          issues.push({
            id: `low-confidence-${target.id}-${kpi.id}`,
            severity: "warning",
            message: `${kpi.name} is low confidence for ${deliveryName}; send it to review.`,
            deliveryId: target.id,
            kpiId: kpi.id,
          });
        }
      } else if (!label.note.trim()) {
        issues.push({
          id: `null-reason-${target.id}-${kpi.id}`,
          severity: "blocker",
          message: `${kpi.name} needs a reason when it is not scored.`,
          deliveryId: target.id,
          kpiId: kpi.id,
        });
      }
    }
  }

  const score = scoreSingleRubric(
    document,
    rubric,
    angle,
    clipEvidenceDeliveries,
    fps,
  );
  if (score.activeWeight < MIN_RATING_WEIGHT_PCT) {
    issues.push({
      id: "coverage-policy",
      severity: "warning",
      message: `Observable scored KPI weight is below ${MIN_RATING_WEIGHT_PCT}%; export the labels but suppress the overall rating as low confidence.`,
    });
  }

  return issues;
}

export function validateDocument(
  document: AnnotationDocument,
  rubric: Rubric,
  angle: CameraAngle,
  durationMs: number,
  fps?: number,
  disciplineOrRouting?: Discipline | LabelRubricRouting,
): QualityIssue[] {
  const routing = typeof disciplineOrRouting === "object" ? disciplineOrRouting : undefined;
  const discipline = typeof disciplineOrRouting === "string"
    ? disciplineOrRouting
    : routing?.discipline;
  const bowlingTypeIssues = discipline === "batting"
    ? document.deliveries
        .filter((delivery) => !normalizeBowlingTypeFaced(delivery.bowlingTypeFaced))
        .map((delivery): QualityIssue => ({
          id: `bowling-type-faced-${delivery.id}`,
          severity: "blocker",
          message: `Delivery ${delivery.index} needs a human Pace or Spin bowling-faced choice.`,
          deliveryId: delivery.id,
        }))
    : [];
  const contexts = routedRubricContexts(document, rubric, routing);
  if (
    contexts.length === 1 &&
    contexts[0].bowlingTypeFaced === null &&
    !contexts[0].unresolvedBowlingType
  ) {
    return [
      ...bowlingTypeIssues,
      ...validateSingleRubric(
        document,
        contexts[0]?.rubric ?? rubric,
        angle,
        durationMs,
        fps,
        discipline,
      ),
    ];
  }
  const routedIssues = contexts
    .filter((context) => !context.unresolvedBowlingType)
    .flatMap((context) =>
      validateSingleRubric(
        { ...document, deliveries: context.deliveries },
        context.rubric,
        angle,
        durationMs,
        fps,
        discipline,
        context.deliveries,
        context.bowlingTypeFaced,
      ),
    );
  return [
    ...new Map([...bowlingTypeIssues, ...routedIssues].map((issue) => [issue.id, issue])).values(),
  ];
}

export const LABELS_CSV_SCHEMA_VERSION = "amp-training-labels-long-v2";

/**
 * Stable, ordered contract for one video x target x KPI observation per row.
 * Append new columns instead of reordering existing ones within this schema version.
 */
export const LABELS_CSV_COLUMNS = [
  "csv_schema_version",
  "annotation_schema_version",
  "record_id",
  "label_id",
  "rubric_id",
  "rubric_version",
  "rubric_source",
  "catalog_version",
  "rubric_tier",
  "rubric_variant",
  "route_key",
  "source_workbook",
  "source_workbook_sha256",
  "source_sheet",
  "source_row",
  "video_id",
  "video_sha256",
  "filename",
  "capture_session_id",
  "dataset_group_key",
  "player_ref",
  "discipline",
  "sex_benchmark",
  "age_band",
  "phv_stage",
  "handedness",
  "bowler_type",
  "height_cm",
  "weight_kg",
  "camera_angle",
  "video_fps",
  "target_scope",
  "delivery_id",
  "delivery_index",
  "delivery_start_ms",
  "delivery_start_frame_0based",
  "event_ms",
  "event_frame_0based",
  "event_name",
  "delivery_end_ms",
  "delivery_end_frame_0based",
  "delivery_outcome",
  "delivery_note",
  "kpi_id",
  "kpi_name",
  "kpi_stage",
  "kpi_scope",
  "kpi_tier",
  "kpi_variant",
  "kpi_applies_to",
  "kpi_scoring_system",
  "kpi_scoring_guide",
  "kpi_weight_pct",
  "kpi_master_fundamental",
  "normalized_camera_views",
  "camera_view_logic",
  "camera_view_source_text",
  "nonstandard_source_views",
  "capture_quality_requirements",
  "angle_supported",
  "kpi_evidence_type",
  "kpi_meaning",
  "kpi_benchmark",
  "kpi_off_condition",
  "kpi_observable_check",
  "human_label_state",
  "visibility_status",
  "null_reason",
  "human_categorical_bucket",
  "human_score_0_10",
  "human_confidence_1_5",
  "human_evidence_timestamp_ms",
  "human_evidence_frame_0based",
  "human_note",
  "training_row_status",
  "training_score_eligible",
  "annotator_id",
  "reviewer_id",
  "adjudicator_id",
  "review_status",
  "reviewed_at",
  "label_updated_at",
  "model_score_0_10",
  "model_version",
  "human_model_abs_error",
  "derived_video_score_0_10",
  "derived_scored_weight_pct",
  "label_completion_pct",
  "project_created_at",
  "human_shot_footwork",
  "kpi_footwork_applicability_state",
  "human_evidence_timestamps_ms_json",
  "human_evidence_frames_0based_json",
  "human_evidence_count",
  "human_multiple_people_visible",
  "human_subject_focus_role",
  "human_subject_focus_description",
  "human_shot_type",
  "human_shot_type_other",
  "human_bowling_type_faced",
  "bowling_type_faced_source",
] as const;

type LabelsCsvColumn = (typeof LABELS_CSV_COLUMNS)[number];
type LabelsCsvValue = string | number | boolean | null | undefined;
type LabelsCsvRow = Record<LabelsCsvColumn, LabelsCsvValue>;

function protectsAgainstSpreadsheetFormula(text: string) {
  const candidate = text.trimStart();
  if (/^[=+@]/.test(candidate)) return true;
  if (!candidate.startsWith("-")) return false;
  return !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(candidate);
}

function csvCell(value: LabelsCsvValue) {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && protectsAgainstSpreadsheetFormula(text)) {
    text = `'${text}`;
  }
  // Quoting every field is RFC-4180 compliant and keeps embedded commas/newlines intact.
  return `"${text.replaceAll('"', '""')}"`;
}

function frameIndex(ms: number | "", fps: number) {
  if (ms === "" || !Number.isFinite(ms) || !Number.isFinite(fps) || fps <= 0) {
    return "";
  }
  return Math.round((ms / 1000) * fps);
}

function rounded(value: number | null, decimals: number) {
  if (value === null || !Number.isFinite(value)) return "";
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function footworkExclusionReason(
  kpi: KpiDefinition,
  state: FootworkApplicabilityState,
  shotFootwork: ShotFootwork | null | undefined,
) {
  if (state === "unresolved_missing") {
    return "Shot footwork is missing; resolve it before assessing this front/back-only KPI.";
  }
  if (state === "excluded_unclear") {
    return "Shot footwork is explicitly unclear; this front/back-only KPI is excluded.";
  }
  if (state === "excluded_mismatch") {
    return `KPI applicability is ${kpi.appliesTo}; delivery shot footwork is ${shotFootwork}.`;
  }
  return "";
}

function exportLabel(
  labels: DeliveryLabel[],
  deliveryId: string,
  kpiId: string,
) {
  return labels
    .filter((label) => label.deliveryId === deliveryId && label.kpiId === kpiId)
    .sort((left, right) => {
      const updated = right.updatedAt.localeCompare(left.updatedAt);
      return updated || left.id.localeCompare(right.id);
    })[0];
}

export interface CsvProject {
  id: string;
  filename: string;
  sha256: string;
  playerRef: string;
  discipline: Discipline;
  sex: string;
  ageGroup: string;
  cameraAngle: CameraAngle;
  fps: number;
  status: string;
  rubricVersion: string;
  createdAt: string;
}

export function buildLabelsCsv(
  project: CsvProject,
  document: AnnotationDocument,
  fallbackRubric: Rubric,
  routing?: LabelRubricRouting,
) {
  const canonicalLabelKeys = [
    ...new Set(document.labels.map((label) => labelKey(label.deliveryId, label.kpiId))),
  ].sort();
  const canonicalLabels = canonicalLabelKeys
    .map((key) => {
      const [deliveryId, kpiId] = key.split("::");
      return exportLabel(document.labels, deliveryId, kpiId);
    })
    .filter((label): label is DeliveryLabel => Boolean(label));
  const summary = scoreDocument(
    { ...document, labels: canonicalLabels },
    fallbackRubric,
    project.cameraAngle,
    routing,
    project.fps,
  );
  const rows: LabelsCsvRow[] = [];
  const datasetGroupKey = [project.playerRef, document.review.captureSession]
    .filter(Boolean)
    .join("::");
  const subjectFocus = normalizeSubjectFocusMetadata(document.review);
  const subjectFocusComplete = isSubjectFocusComplete(document.review);

  const contexts = routedRubricContexts(document, fallbackRubric, routing);
  for (const context of contexts) {
    const rubric = context.rubric;
    for (const kpi of rubric.kpis) {
      if (kpi.scope === "clip" && !context.includeClip) continue;
      const supported = supportsAngle(kpi, project.cameraAngle);
      const targets =
        kpi.scope === "clip"
          ? [{
              id: "clip",
              index: "" as const,
              startMs: "" as const,
              eventMs: "" as const,
              endMs: "" as const,
              outcome: "",
              note: "",
              shotFootwork: null,
              bowlingTypeFaced: context.bowlingTypeFaced,
              bowlingTypeFacedSource: "delivery" as const,
              shotType: null,
              shotTypeOther: "",
            }]
          : [...context.deliveries].sort(
              (left, right) =>
                left.index - right.index ||
                left.startMs - right.startMs ||
                left.id.localeCompare(right.id),
            );

      for (const target of targets) {
      const label = exportLabel(document.labels, target.id, kpi.id);
      const shot = normalizeDeliveryShotMetadata(target);
      const deliveryShotComplete = isDeliveryShotComplete(
        target,
        project.discipline,
      );
      const rowContextComplete =
        subjectFocusComplete &&
        (kpi.scope !== "delivery" || deliveryShotComplete);
      const footworkState = footworkApplicability(kpi, target.shotFootwork);
      const footworkApplicable = isFootworkApplicableForScoring(footworkState);
      const bowlingTypeMissing = Boolean(
        routing?.discipline === "batting" &&
          kpi.scope === "delivery" &&
          !target.bowlingTypeFaced,
      );
      const humanLabelApplicable =
        supported && footworkApplicable && !bowlingTypeMissing;
      const visibility = bowlingTypeMissing
        ? "bowling_type_faced_missing"
        : !supported
        ? "wrong_angle"
        : footworkState === "excluded_mismatch"
          ? "footwork_mismatch"
          : footworkState === "excluded_unclear"
            ? "footwork_unclear"
            : footworkState === "unresolved_missing"
              ? "footwork_missing"
              : label?.visibility ?? "not_assessed";
      const nullReason = bowlingTypeMissing
        ? "Bowling type faced is missing; choose pace or spin before this batting delivery can be routed."
        : !supported
          ? `Selected ${project.cameraAngle} view is not among the normalized source views: ${kpi.angles.join("|")}`
          : !footworkApplicable
            ? footworkExclusionReason(kpi, footworkState, target.shotFootwork)
            : label && label.visibility !== "visible"
              ? label.note
              : "";
      const hasHumanScore =
        humanLabelApplicable &&
        label?.visibility === "visible" &&
        typeof label.score === "number" &&
        Number.isFinite(label.score);
      const hasModelScore =
        typeof label?.modelScore === "number" && Number.isFinite(label.modelScore);
      const humanScore = hasHumanScore ? label.score : null;
      const modelScore = hasModelScore ? label.modelScore : null;
      const humanEvidenceTimestamps =
        humanLabelApplicable && label?.visibility === "visible"
          ? canonicalEvidenceTimestamps(label, project.fps)
          : [];
      const humanEvidenceFrames = evidenceFrameIndices(
        humanEvidenceTimestamps,
        project.fps,
      );
      const humanEvidenceMs = humanEvidenceTimestamps[0] ?? "";
      const resolvedContextDeliveries = context.deliveries.filter(
        (delivery) => delivery.bowlingTypeFaced,
      );
      const evidenceWithinTarget =
        kpi.scope === "delivery"
          ? typeof target.startMs === "number" &&
            typeof target.endMs === "number" &&
            humanEvidenceTimestamps.every(
              (timestampMs) =>
                timestampMs >= target.startMs && timestampMs <= target.endMs,
            )
          : routing?.discipline === "batting"
            ? humanEvidenceTimestamps.every((timestampMs) =>
                resolvedContextDeliveries.some(
                  (delivery) =>
                    timestampMs >= delivery.startMs && timestampMs <= delivery.endMs,
                ),
              )
            : true;
      const hasClipDeliveryMinimum =
        kpi.scope !== "clip" ||
        routing?.discipline !== "batting" ||
        resolvedContextDeliveries.length >= 3;
      const trainingScoreEligible = Boolean(
        rowContextComplete &&
        humanLabelApplicable &&
        hasClipDeliveryMinimum &&
        humanScore !== null &&
        humanScore >= 0 &&
        humanScore <= 10 &&
        typeof label?.confidence === "number" &&
        label.confidence >= 1 &&
        label.confidence <= 5 &&
        humanEvidenceTimestamps.length > 0 &&
        evidenceWithinTarget,
      );
      const modelError =
        humanScore !== null && modelScore !== null
          ? Math.abs(humanScore - modelScore)
          : "";
      const humanLabelState = bowlingTypeMissing
        ? "unresolved_bowling_type_faced"
        : !supported
        ? "excluded_wrong_angle"
        : footworkState === "excluded_mismatch"
          ? "excluded_footwork_mismatch"
          : footworkState === "excluded_unclear"
            ? "excluded_footwork_unclear"
            : footworkState === "unresolved_missing"
              ? "unresolved_footwork_missing"
              : !label
                ? "unlabelled"
                : label.visibility === "visible"
                  ? hasHumanScore
                    ? "human_scored"
                    : "human_score_missing"
                  : "human_null";
      const trainingRowStatus = bowlingTypeMissing
        ? "exclude_bowling_type_faced_missing"
        : kpi.scope === "clip" && !hasClipDeliveryMinimum
          ? "exclude_insufficient_mode_deliveries"
          : kpi.scope === "clip" && humanEvidenceTimestamps.length > 0 && !evidenceWithinTarget
            ? "exclude_evidence_outside_mode_deliveries"
        : !rowContextComplete
        ? "exclude_incomplete"
        : !supported
          ? "exclude_wrong_angle"
          : footworkState === "excluded_mismatch"
            ? "exclude_footwork_mismatch"
            : footworkState === "excluded_unclear"
              ? "exclude_footwork_unclear"
              : footworkState === "unresolved_missing"
                ? "exclude_footwork_missing"
                : trainingScoreEligible
                  ? "ready_scored_label"
                  : label && label.visibility !== "visible" && label.note.trim()
                    ? "ready_null_label"
                    : "exclude_incomplete";

      rows.push({
        csv_schema_version: LABELS_CSV_SCHEMA_VERSION,
        annotation_schema_version: document.schemaVersion,
        record_id: `${project.id}::${target.id}::${kpi.id}`,
        label_id: label?.id ?? "",
        rubric_id: context.unresolvedBowlingType ? "" : rubric.id,
        rubric_version: project.rubricVersion,
        rubric_source: context.unresolvedBowlingType ? "" : rubric.source,
        catalog_version: context.unresolvedBowlingType
          ? ""
          : rubric.catalogVersion ?? "",
        rubric_tier: context.unresolvedBowlingType ? "" : rubric.tier ?? "",
        rubric_variant: context.unresolvedBowlingType
          ? ""
          : rubric.variant ?? "",
        route_key: context.unresolvedBowlingType ? "" : rubric.routeKey ?? "",
        source_workbook: context.unresolvedBowlingType
          ? ""
          : kpi.sourceWorkbook ?? rubric.sourceWorkbook ?? "",
        source_workbook_sha256:
          context.unresolvedBowlingType
            ? ""
            : kpi.sourceWorkbookSha256 ?? rubric.sourceWorkbookSha256 ?? "",
        source_sheet: context.unresolvedBowlingType
          ? ""
          : kpi.sourceSheet ?? rubric.sourceSheet ?? "",
        source_row: context.unresolvedBowlingType ? "" : kpi.sourceRow ?? "",
        video_id: project.id,
        video_sha256: project.sha256,
        filename: project.filename,
        capture_session_id: document.review.captureSession,
        dataset_group_key: datasetGroupKey,
        player_ref: project.playerRef,
        discipline: project.discipline,
        sex_benchmark: project.sex,
        age_band: project.ageGroup,
        phv_stage: document.review.phvStage,
        handedness: document.review.handedness,
        bowler_type: document.review.bowlerType,
        height_cm: document.review.heightCm,
        weight_kg: document.review.weightKg,
        camera_angle: project.cameraAngle,
        video_fps: project.fps,
        target_scope: kpi.scope,
        delivery_id: target.id,
        delivery_index: target.index,
        delivery_start_ms: target.startMs,
        delivery_start_frame_0based: frameIndex(target.startMs, project.fps),
        event_ms: target.eventMs,
        event_frame_0based: frameIndex(target.eventMs, project.fps),
        event_name: eventName(project.discipline).toLowerCase(),
        delivery_end_ms: target.endMs,
        delivery_end_frame_0based: frameIndex(target.endMs, project.fps),
        delivery_outcome: target.outcome,
        delivery_note: target.note,
        kpi_id: kpi.id,
        kpi_name: kpi.name,
        kpi_stage: kpi.group,
        kpi_scope: kpi.scope,
        kpi_tier: kpi.tier ?? "",
        kpi_variant: kpi.variant ?? "",
        kpi_applies_to: kpi.appliesTo ?? "",
        kpi_scoring_system: kpi.scoringSystem ?? "",
        kpi_scoring_guide: kpi.scoringGuide ?? "",
        kpi_weight_pct: kpi.weight,
        kpi_master_fundamental: kpi.master,
        normalized_camera_views: kpi.angles.join("|"),
        camera_view_logic: kpi.viewLogic ?? "",
        camera_view_source_text: kpi.viewSourceText ?? "",
        nonstandard_source_views: kpi.nonstandardSourceViews?.join("|") ?? "",
        capture_quality_requirements: kpi.captureQualityRequirements?.join("|") ?? "",
        angle_supported: supported,
        kpi_evidence_type: kpi.evidenceType,
        kpi_meaning: kpi.meaning,
        kpi_benchmark: kpi.benchmark,
        kpi_off_condition: kpi.offCondition,
        kpi_observable_check: kpi.observation,
        human_label_state: humanLabelState,
        visibility_status: visibility,
        null_reason: nullReason,
        human_categorical_bucket: humanLabelApplicable
          ? label?.categoricalBucket ?? ""
          : "",
        human_score_0_10: humanScore ?? "",
        human_confidence_1_5:
          humanLabelApplicable && label?.visibility === "visible"
            ? label.confidence
            : "",
        human_evidence_timestamp_ms: humanEvidenceMs,
        human_evidence_frame_0based: frameIndex(humanEvidenceMs, project.fps),
        human_note: humanLabelApplicable ? label?.note ?? "" : "",
        training_row_status: trainingRowStatus,
        training_score_eligible: trainingScoreEligible,
        annotator_id: document.review.annotator,
        reviewer_id: document.review.reviewer,
        adjudicator_id: document.review.adjudicator,
        review_status: project.status,
        reviewed_at: document.review.reviewedAt,
        label_updated_at: label?.updatedAt ?? "",
        model_score_0_10: modelScore ?? "",
        model_version: label?.modelVersion ?? "",
        human_model_abs_error: modelError,
        derived_video_score_0_10: rounded(summary.score10, 3),
        derived_scored_weight_pct: rounded(summary.activeWeight, 1),
        label_completion_pct: rounded(summary.coveragePct, 1),
        project_created_at: project.createdAt,
        human_shot_footwork: target.shotFootwork ?? "",
        kpi_footwork_applicability_state: footworkState,
        human_evidence_timestamps_ms_json: JSON.stringify(
          humanEvidenceTimestamps,
        ),
        human_evidence_frames_0based_json: JSON.stringify(humanEvidenceFrames),
        human_evidence_count: humanEvidenceTimestamps.length,
        human_multiple_people_visible: subjectFocus.multiplePeopleVisible,
        human_subject_focus_role: subjectFocus.subjectFocusRole ?? "",
        human_subject_focus_description:
          subjectFocus.subjectFocusDescription,
        human_shot_type:
          project.discipline === "batting" && kpi.scope === "delivery"
            ? shot.shotType ?? ""
            : "",
        human_shot_type_other:
          project.discipline === "batting" &&
          kpi.scope === "delivery" &&
          shot.shotType === "other"
            ? shot.shotTypeOther
            : "",
        human_bowling_type_faced:
          kpi.scope === "delivery"
            ? target.bowlingTypeFaced ?? ""
            : context.bowlingTypeFaced ?? "",
        bowling_type_faced_source:
          kpi.scope === "delivery"
            ? target.bowlingTypeFacedSource ?? (target.bowlingTypeFaced ? "delivery" : "")
            : context.bowlingTypeFaced
              ? "delivery_mode_group"
              : "",
      });
    }
  }
  }

  return [
    LABELS_CSV_COLUMNS.map((column) => csvCell(column)).join(","),
    ...rows.map((row) => LABELS_CSV_COLUMNS.map((column) => csvCell(row[column])).join(",")),
  ]
    .join("\r\n");
}

export function makeLabel(
  deliveryId: string,
  kpi: KpiDefinition,
): DeliveryLabel {
  return {
    id: crypto.randomUUID(),
    deliveryId,
    kpiId: kpi.id,
    visibility: "visible",
    score: null,
    confidence: null,
    evidenceMs: null,
    evidenceFramesMs: [],
    categoricalBucket: "",
    note: "",
    modelScore: null,
    modelVersion: "",
    updatedAt: new Date().toISOString(),
  };
}
