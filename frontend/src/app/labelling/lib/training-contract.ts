export type ShotFootwork =
  | "front_foot"
  | "back_foot"
  | "both"
  | "unclear";

export type FootworkApplicabilityState =
  | "not_restricted"
  | "applicable"
  | "excluded_mismatch"
  | "excluded_unclear"
  | "unresolved_missing";

interface FootworkApplicableKpi {
  scope: string;
  appliesTo?: string;
}

interface EvidenceLabel {
  evidenceMs: number | null;
  evidenceFramesMs?: number[];
}

const FRONT_FOOT_ONLY = "Front-Foot Only";
const BACK_FOOT_ONLY = "Back-Foot Only";

export function footworkRequirementFor(
  kpi: FootworkApplicableKpi,
): "front_foot" | "back_foot" | null {
  if (kpi.scope !== "delivery") return null;
  if (kpi.appliesTo === FRONT_FOOT_ONLY) return "front_foot";
  if (kpi.appliesTo === BACK_FOOT_ONLY) return "back_foot";
  return null;
}

export function isFootworkRestrictedKpi(kpi: FootworkApplicableKpi): boolean {
  return footworkRequirementFor(kpi) !== null;
}

export function footworkApplicability(
  kpi: FootworkApplicableKpi,
  shotFootwork: ShotFootwork | null | undefined,
): FootworkApplicabilityState {
  if (!isFootworkRestrictedKpi(kpi)) return "not_restricted";
  if (!shotFootwork) return "unresolved_missing";
  if (shotFootwork === "unclear") return "excluded_unclear";
  if (shotFootwork === "both") return "applicable";

  const matches = footworkRequirementFor(kpi) === shotFootwork;
  return matches ? "applicable" : "excluded_mismatch";
}

export function isFootworkApplicableForScoring(
  state: FootworkApplicabilityState,
): boolean {
  return state === "not_restricted" || state === "applicable";
}

/**
 * Returns stable evidence points. With a valid FPS they are snapped to the
 * nearest frame and de-duplicated by frame index; otherwise integer
 * milliseconds are used. The legacy singular timestamp participates in the
 * same sorted set, so index zero is the deterministic primary value exported
 * to older CSV columns.
 */
export function canonicalEvidenceTimestamps(
  label: EvidenceLabel,
  fps?: number,
): number[] {
  const candidates = [
    label.evidenceMs,
    ...(Array.isArray(label.evidenceFramesMs) ? label.evidenceFramesMs : []),
  ].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );

  if (typeof fps === "number" && Number.isFinite(fps) && fps > 0) {
    const frameIndices = candidates.map((timestampMs) =>
      Math.round((timestampMs / 1000) * fps),
    );
    return [...new Set(frameIndices)]
      .sort((left, right) => left - right)
      .map((frameIndex) => Math.round((frameIndex / fps) * 1000));
  }

  const timestamps = candidates.map((value) => Math.round(value));
  return [...new Set(timestamps)].sort((left, right) => left - right);
}

export function evidenceFrameIndices(
  timestampsMs: number[],
  fps: number,
): number[] {
  if (!Number.isFinite(fps) || fps <= 0) return [];
  return timestampsMs.map((timestampMs) =>
    Math.round((timestampMs / 1000) * fps),
  );
}
