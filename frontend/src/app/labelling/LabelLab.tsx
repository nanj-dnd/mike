"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  buildLabelsCsv,
  emptyDocument,
  getLabel,
  LABELS_CSV_SCHEMA_VERSION,
  MIN_RATING_WEIGHT_PCT,
  labelKey,
  makeLabel,
  scoreDocument,
  validateDocument,
  type AnnotationDocument,
  type Delivery,
  type DeliveryLabel,
  type ReviewState,
  type Visibility,
} from "./lib/labels";
import {
  eventName,
  getRubric,
  RUBRIC_VERSION,
  supportsAngle,
  type AthleteSex,
  type BattingMode,
  type CameraAngle,
  type Discipline,
  type KpiDefinition,
  type KpiTier,
} from "./lib/rubric";
import {
  formatTime,
  frameIndexForMs,
  frameTimeMs,
  parseTimecode,
  steppedFrameTimeMs,
} from "./lib/timecode";
import {
  canonicalEvidenceTimestamps,
  footworkApplicability,
  footworkRequirementFor,
  isFootworkApplicableForScoring,
  isFootworkRestrictedKpi,
  type ShotFootwork,
} from "./lib/training-contract";

type WorkflowStep = "setup" | "segment" | "label" | "review";
type LabelPatch = Partial<DeliveryLabel>;

const SHOT_FOOTWORK_OPTIONS: { value: ShotFootwork; label: string }[] = [
  { value: "front_foot", label: "Front foot" },
  { value: "back_foot", label: "Back foot" },
  { value: "both", label: "Both" },
  { value: "unclear", label: "Unclear" },
];

function shotFootworkFor(delivery?: Delivery): ShotFootwork | null {
  const value = delivery?.shotFootwork;
  return SHOT_FOOTWORK_OPTIONS.some((option) => option.value === value)
    ? (value as ShotFootwork)
    : null;
}

function shotFootworkLabel(value: ShotFootwork | null) {
  return SHOT_FOOTWORK_OPTIONS.find((option) => option.value === value)?.label ?? "Not selected";
}

function kpiFootworkAssessability(
  kpi: KpiDefinition,
  delivery: Delivery | undefined,
  discipline: Discipline,
) {
  if (discipline !== "batting") {
    return { assessable: true, state: "not_restricted" as const, reason: "" };
  }

  const footwork = shotFootworkFor(delivery);
  const state = footworkApplicability(kpi, footwork);
  const assessable = isFootworkApplicableForScoring(state);
  if (assessable) return { assessable, state, reason: "" };
  const requirementLabel = footworkRequirementFor(kpi) === "front_foot" ? "front-foot" : "back-foot";
  const reason = state === "unresolved_missing"
    ? `Choose shot footwork before assessing this ${requirementLabel}-only KPI.`
    : state === "excluded_unclear"
      ? `Footwork is explicitly marked unclear, so this ${requirementLabel}-only KPI is excluded from scoring.`
      : `This ${requirementLabel}-only KPI is excluded for the selected ${shotFootworkLabel(footwork).toLowerCase()} shot.`;
  return { assessable, state, reason };
}

function evidenceFramesFor(label: DeliveryLabel | undefined, fps: number) {
  return canonicalEvidenceTimestamps(
    label ?? { evidenceMs: null, evidenceFramesMs: [] },
    fps,
  );
}

function ShotFootworkField({
  delivery,
  compact = false,
  onChange,
}: {
  delivery: Delivery;
  compact?: boolean;
  onChange: (value: ShotFootwork) => void;
}) {
  const value = shotFootworkFor(delivery);
  return (
    <fieldset className={`footwork-field ${compact ? "footwork-field--compact" : ""}`}>
      <legend>Shot footwork <em>human selected</em></legend>
      <div className="footwork-options">
        {SHOT_FOOTWORK_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            className={value === option.value ? "active" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {!compact && (
        <small>
          Choose from the footage; never infer it. “Unclear” explicitly excludes front/back-only KPIs.
        </small>
      )}
    </fieldset>
  );
}

interface VideoProject {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  durationMs: number;
  fps: number;
  playerRef: string;
  discipline: Discipline;
  sex: AthleteSex;
  ageGroup: string;
  cameraAngle: CameraAngle;
  consentConfirmed: boolean;
  rubricVersion: string;
  status: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  annotations?: unknown;
}

interface UploadForm {
  playerRef: string;
  discipline: Discipline;
  sex: AthleteSex;
  ageGroup: string;
  battingMode: BattingMode;
  rubricTier: KpiTier;
  cameraAngle: CameraAngle;
  fps: number;
  consentConfirmed: boolean;
}

const INITIAL_UPLOAD: UploadForm = {
  playerRef: "",
  discipline: "batting",
  sex: "male",
  ageGroup: "adult",
  battingMode: "pace",
  rubricTier: "performance",
  cameraAngle: "side",
  fps: 30,
  consentConfirmed: false,
};

const VISIBILITY_OPTIONS: { value: Visibility; label: string; helper: string }[] = [
  { value: "visible", label: "Visible", helper: "Score with evidence" },
  { value: "occluded", label: "Occluded", helper: "Body or equipment blocked" },
  { value: "low_quality", label: "Low quality", helper: "Blur, crop or poor light" },
  { value: "uncertain", label: "Uncertain", helper: "Evidence is too ambiguous to score" },
  { value: "not_applicable", label: "Not applicable", helper: "Action does not contain this cue" },
];

const STEPS: { id: WorkflowStep; number: string; label: string }[] = [
  { id: "setup", number: "01", label: "Capture setup" },
  { id: "segment", number: "02", label: "Mark deliveries" },
  { id: "label", number: "03", label: "Label KPIs" },
  { id: "review", number: "04", label: "Review & export" },
];

const AGE_OPTIONS = [
  { value: "u9", label: "U9" },
  { value: "u11", label: "U11" },
  { value: "u13", label: "U13" },
  { value: "u15", label: "U15" },
  { value: "u17", label: "U17" },
  { value: "u19", label: "U19" },
  { value: "adult", label: "Adult" },
];

const TIER_OPTIONS: { value: KpiTier; label: string }[] = [
  { value: "foundation", label: "Foundation (~5–9)" },
  { value: "development", label: "Development (~9–13)" },
  { value: "performance", label: "Performance (~15+)" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFilename(value: string) {
  return value.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
}

function hydrateDocument(value: unknown, fps?: number): AnnotationDocument {
  const fallback = emptyDocument();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<AnnotationDocument>;
  const deliveries = Array.isArray(candidate.deliveries)
    ? candidate.deliveries.map((delivery) => ({
        ...delivery,
        shotFootwork: shotFootworkFor(delivery),
      }))
    : [];
  const labels = Array.isArray(candidate.labels)
    ? candidate.labels.map((label) => {
        const evidenceFramesMs = canonicalEvidenceTimestamps(label, fps);
        return {
          ...label,
          evidenceMs: evidenceFramesMs[0] ?? null,
          evidenceFramesMs,
        };
      })
    : [];
  return {
    schemaVersion: "amp-labels-long-v1",
    deliveries,
    labels,
    review: { ...fallback.review, ...(candidate.review ?? {}) },
  };
}

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function LabelLab({ onExit }: { onExit?: () => void | Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [document, setDocument] = useState<AnnotationDocument>(emptyDocument);
  const [step, setStep] = useState<WorkflowStep>("setup");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState("");
  const [uploadForm, setUploadForm] = useState<UploadForm>(INITIAL_UPLOAD);
  const [uploadDurationMs, setUploadDurationMs] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [precisionAnchorMs, setPrecisionAnchorMs] = useState(0);
  const [timecodeDraft, setTimecodeDraft] = useState<string | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("");
  const [selectedKpiId, setSelectedKpiId] = useState("");
  const [kpiSearch, setKpiSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [evidenceCaptureError, setEvidenceCaptureError] = useState<{
    targetId: string;
    kpiId: string;
    message: string;
  } | null>(null);

  const rubric = useMemo(
    () => getRubric(
      project?.discipline ?? uploadForm.discipline,
      project?.sex ?? uploadForm.sex,
      {
        ageGroup: project?.ageGroup ?? uploadForm.ageGroup,
        battingMode: project
          ? document.review.bowlerType || "pace"
          : uploadForm.battingMode,
        tier: project
          ? ["foundation", "development", "performance"].includes(document.review.rubricTier)
            ? document.review.rubricTier as KpiTier
            : undefined
          : uploadForm.rubricTier,
        rubricVersion: project?.rubricVersion,
      },
    ),
    [
      document.review.bowlerType,
      document.review.rubricTier,
      project,
      uploadForm.ageGroup,
      uploadForm.battingMode,
      uploadForm.discipline,
      uploadForm.rubricTier,
      uploadForm.sex,
    ],
  );
  const supportedKpis = rubric.kpis.filter((kpi) =>
    supportsAngle(kpi, project?.cameraAngle ?? uploadForm.cameraAngle),
  );
  const selectedDelivery =
    document.deliveries.find((delivery) => delivery.id === selectedDeliveryId) ??
    document.deliveries[0];
  const activeDeliveryId = selectedDelivery?.id ?? "";
  const selectedKpi =
    supportedKpis.find((kpi) => kpi.id === selectedKpiId) ??
    supportedKpis[0] ??
    rubric.kpis[0];
  const selectedTargetId = selectedKpi?.scope === "clip" ? "clip" : activeDeliveryId;
  const selectedLabel = selectedKpi
    ? getLabel(document.labels, selectedTargetId, selectedKpi.id)
    : undefined;
  const activeDiscipline = project?.discipline ?? uploadForm.discipline;
  const selectedKpiAssessability = selectedKpi
    ? kpiFootworkAssessability(selectedKpi, selectedDelivery, activeDiscipline)
    : { assessable: true, state: "not_restricted" as const, reason: "" };
  const canExplicitlyExcludeSelectedKpi =
    selectedKpiAssessability.state === "excluded_mismatch" ||
    selectedKpiAssessability.state === "excluded_unclear";
  const selectedEvidenceFrames = evidenceFramesFor(
    selectedLabel,
    project?.fps ?? uploadForm.fps,
  );
  const rubricHasFootworkSpecificKpis = activeDiscipline === "batting" &&
    rubric.kpis.some((kpi) => isFootworkRestrictedKpi(kpi));
  const score = useMemo(
    () =>
      project
        ? scoreDocument(document, rubric, project.cameraAngle)
        : { score10: null, score100: null, coveragePct: 0, visibleCells: 0, expectedCells: 0, activeWeight: 0 },
    [document, project, rubric],
  );
  const issues = useMemo(
    () =>
      project
        ? validateDocument(
            document,
            rubric,
            project.cameraAngle,
            project.durationMs,
            project.fps,
          )
        : [],
    [document, project, rubric],
  );
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const filteredKpis = supportedKpis.filter((kpi) =>
    `${kpi.name} ${kpi.group}`.toLowerCase().includes(kpiSearch.toLowerCase()),
  );
  const assessableKpiCount = supportedKpis.filter(
    (kpi) => kpiFootworkAssessability(kpi, selectedDelivery, activeDiscipline).assessable,
  ).length;
  const currentFrame = project
    ? Math.min(frameIndexForMs(project.durationMs, project.fps), frameIndexForMs(currentMs, project.fps))
    : 0;
  const precisionWindowMs = Math.min(2000, project?.durationMs ?? 2000);
  const precisionStartMs = project
    ? Math.max(0, Math.min(precisionAnchorMs - precisionWindowMs / 2, project.durationMs - precisionWindowMs))
    : 0;
  const precisionEndMs = project ? Math.min(project.durationMs, precisionStartMs + precisionWindowMs) : 0;

  const fetchProjects = useCallback(async () => {
    const response = await fetch("/labelling/api/videos");
    const payload = (await response.json()) as { videos?: VideoProject[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not load projects.");
    setProjects(payload.videos ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/labelling/api/videos")
      .then(async (response) => {
        const payload = (await response.json()) as { videos?: VideoProject[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load projects.");
        if (!cancelled) setProjects(payload.videos ?? []);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load projects.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button")) return;
      const video = videoRef.current;
      if (!video || !project) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (video.paused) void video.play();
        else video.pause();
      }
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "," ||
        event.key === "."
      ) {
        event.preventDefault();
        video.pause();
        const direction = event.key === "ArrowLeft" || event.key === "," ? -1 : 1;
        const frames = event.shiftKey ? 10 : 1;
        const nextMs = steppedFrameTimeMs(
          video.currentTime * 1000,
          project.fps,
          direction * frames,
          (video.duration || project.durationMs / 1000) * 1000,
        );
        video.currentTime = nextMs / 1000;
        setCurrentMs(nextMs);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [project]);

  const loadProject = useCallback(
    async (id: string) => {
      if (dirty && !window.confirm("Discard unsaved changes and open another project?")) return;
      setError("");
      setNotice("");
      setIsLoading(true);
      try {
        const response = await fetch(`/labelling/api/videos/${id}`);
        const payload = (await response.json()) as { video?: VideoProject; error?: string };
        if (!response.ok || !payload.video) {
          throw new Error(payload.error ?? "Could not open the project.");
        }
        setProject(payload.video);
        const nextDocument = hydrateDocument(
          payload.video.annotations,
          payload.video.fps,
        );
        setDocument(nextDocument);
        setSelectedDeliveryId(nextDocument.deliveries[0]?.id ?? "");
        const nextRubric = getRubric(payload.video.discipline, payload.video.sex, {
          ageGroup: payload.video.ageGroup,
          battingMode: nextDocument.review.bowlerType || "pace",
          tier: ["foundation", "development", "performance"].includes(nextDocument.review.rubricTier)
            ? nextDocument.review.rubricTier as KpiTier
            : undefined,
          rubricVersion: payload.video.rubricVersion,
        });
        setSelectedKpiId(
          nextRubric.kpis.find((kpi) => supportsAngle(kpi, payload.video!.cameraAngle))?.id ?? "",
        );
        setStep(nextDocument.deliveries.length ? "label" : "segment");
        setCurrentMs(0);
        setPrecisionAnchorMs(0);
        setTimecodeDraft(null);
        setDirty(false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not open the project.");
      } finally {
        setIsLoading(false);
      }
    },
    [dirty],
  );

  function resetWorkspace() {
    if (dirty && !window.confirm("Discard unsaved changes and start a new project?")) return;
    setProject(null);
    setDocument(emptyDocument());
    setStep("setup");
    setSelectedDeliveryId("");
    setSelectedKpiId("");
    setCurrentMs(0);
    setPrecisionAnchorMs(0);
    setTimecodeDraft(null);
    setNotice("");
    setError("");
    setDirty(false);
  }

  function exitLab() {
    if (dirty && !window.confirm("Leave Label Lab with unsaved changes?")) return;
    void onExit?.();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 90 * 1024 * 1024) {
      setError("Please trim or compress the clip below 90 MB for this first version.");
      return;
    }
    if (localPreview) URL.revokeObjectURL(localPreview);
    setSelectedFile(file);
    setLocalPreview(URL.createObjectURL(file));
    setUploadDurationMs(0);
    setError("");
  }

  async function uploadVideo() {
    if (!selectedFile) return setError("Choose a video first.");
    if (!uploadForm.playerRef.trim()) return setError("Add a pseudonymous player reference.");
    if (!uploadForm.consentConfirmed) return setError("Confirm player consent before upload.");
    if (!uploadDurationMs) return setError("Wait for the video metadata to load.");

    setIsUploading(true);
    setError("");
    setNotice("Preparing a provenance hash…");
    try {
      const digest = await sha256(selectedFile);
      setNotice("Uploading the video securely…");
      const createResponse = await fetch("/labelling/api/videos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AMP-Lab-CSRF": "1",
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          mimeType: selectedFile.type || "video/mp4",
          sizeBytes: selectedFile.size,
          sha256: digest,
          durationMs: uploadDurationMs,
          fps: uploadForm.fps,
          playerRef: uploadForm.playerRef,
          discipline: uploadForm.discipline,
          sex: uploadForm.sex,
          ageGroup: uploadForm.ageGroup,
          bowlerType: uploadForm.discipline === "batting" ? uploadForm.battingMode : "",
          rubricTier: uploadForm.rubricTier,
          cameraAngle: uploadForm.cameraAngle,
          consentConfirmed: uploadForm.consentConfirmed,
          rubricVersion: RUBRIC_VERSION,
        }),
      });
      const created = (await createResponse.json()) as { video?: VideoProject; error?: string };
      if (!createResponse.ok || !created.video) {
        throw new Error(created.error ?? "Could not create the project.");
      }

      const mediaResponse = await fetch(`/labelling/api/videos/${created.video.id}/media`, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type || "video/mp4",
          "X-AMP-Lab-CSRF": "1",
        },
        body: selectedFile,
      });
      const mediaPayload = (await mediaResponse.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!mediaResponse.ok) {
        throw new Error(mediaPayload?.error ?? "Video upload failed.");
      }

      setSelectedFile(null);
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview("");
      setUploadForm(INITIAL_UPLOAD);
      await fetchProjects();
      setDirty(false);
      await loadProject(created.video.id);
      setStep("segment");
      setNotice("Video ready. Mark each delivery before labeling.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  function updateProject<K extends keyof VideoProject>(key: K, value: VideoProject[K]) {
    setProject((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
  }

  function updateDocument(updater: (current: AnnotationDocument) => AnnotationDocument) {
    setDocument((current) => updater(current));
    setDirty(true);
  }

  function updateReview(key: keyof ReviewState, value: string) {
    updateDocument((current) => ({
      ...current,
      review: { ...current.review, [key]: value },
    }));
  }

  function addDelivery() {
    if (!project) return;
    const anchor = Math.max(500, Math.min(currentMs || 1500, project.durationMs - 500));
    const delivery: Delivery = {
      id: crypto.randomUUID(),
      index: Math.max(0, ...document.deliveries.map((item) => item.index)) + 1,
      startMs: Math.max(0, Math.round(anchor - 1200)),
      eventMs: Math.round(anchor),
      endMs: Math.min(project.durationMs, Math.round(anchor + 1200)),
      outcome: "",
      note: "",
    };
    updateDocument((current) => ({
      ...current,
      deliveries: [...current.deliveries, delivery].sort((a, b) => a.startMs - b.startMs),
    }));
    setSelectedDeliveryId(delivery.id);
  }

  function updateDelivery(id: string, patch: Partial<Delivery>) {
    updateDocument((current) => ({
      ...current,
      deliveries: current.deliveries.map((delivery) =>
        delivery.id === id ? { ...delivery, ...patch } : delivery,
      ),
    }));
  }

  function updateDeliveryShotFootwork(id: string, shotFootwork: ShotFootwork) {
    updateDocument((current) => ({
      ...current,
      deliveries: current.deliveries.map((delivery) =>
        delivery.id === id ? { ...delivery, shotFootwork } : delivery,
      ),
    }));
  }

  function removeDelivery(delivery: Delivery) {
    if (!window.confirm(`Remove delivery ${delivery.index} and all of its labels?`)) return;
    updateDocument((current) => ({
      ...current,
      deliveries: current.deliveries.filter((item) => item.id !== delivery.id),
      labels: current.labels.filter((label) => label.deliveryId !== delivery.id),
    }));
    setSelectedDeliveryId(document.deliveries.find((item) => item.id !== delivery.id)?.id ?? "");
  }

  function seek(ms: number) {
    if (!videoRef.current || !project) return;
    const next = Math.max(0, Math.min(ms, project.durationMs));
    videoRef.current.currentTime = next / 1000;
    setCurrentMs(next);
    if (next < precisionStartMs || next > precisionEndMs) setPrecisionAnchorMs(next);
  }

  function stepFrames(frames: number) {
    if (!project) return;
    videoRef.current?.pause();
    seek(frameTimeMs(currentFrame + frames, project.fps));
  }

  function nudgeMilliseconds(milliseconds: number) {
    videoRef.current?.pause();
    seek(currentMs + milliseconds);
  }

  function commitTimecode(value: string) {
    const parsed = parseTimecode(value);
    if (parsed === null) {
      setTimecodeDraft(null);
      setError("Enter an exact time as MM:SS.mmm, HH:MM:SS.mmm or seconds.");
      return;
    }
    videoRef.current?.pause();
    seek(parsed);
    setPrecisionAnchorMs(Math.max(0, Math.min(parsed, project?.durationMs ?? parsed)));
    setTimecodeDraft(null);
  }

  function upsertLabel(kpi: KpiDefinition, patch: LabelPatch) {
    const targetId = kpi.scope === "clip" ? "clip" : activeDeliveryId;
    if (!targetId) return setError("Select a delivery first.");
    updateDocument((current) => {
      const existing = getLabel(current.labels, targetId, kpi.id) ?? makeLabel(targetId, kpi);
      const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      return {
        ...current,
        labels: [
          ...current.labels.filter(
            (label) => labelKey(label.deliveryId, label.kpiId) !== labelKey(targetId, kpi.id),
          ),
          next,
        ],
      };
    });
  }

  function setVisibility(kpi: KpiDefinition, visibility: Visibility) {
    upsertLabel(kpi, {
      visibility,
      ...(visibility === "visible"
        ? {}
        : { score: null, confidence: null, evidenceMs: null, evidenceFramesMs: [] }),
    });
  }

  function addCurrentEvidenceFrame(kpi: KpiDefinition) {
    if (!project || !selectedKpiAssessability.assessable) return;
    const targetId = kpi.scope === "clip" ? "clip" : activeDeliveryId;
    if (!targetId) return setError("Select a delivery first.");
    const existing = getLabel(document.labels, targetId, kpi.id);
    const frames = evidenceFramesFor(existing, project.fps);
    const snappedMs = Math.round(frameTimeMs(currentFrame, project.fps));
    setEvidenceCaptureError(null);
    if (
      kpi.scope === "delivery" &&
      (!selectedDelivery ||
        snappedMs < selectedDelivery.startMs ||
        snappedMs > selectedDelivery.endMs)
    ) {
      setEvidenceCaptureError({
        targetId,
        kpiId: kpi.id,
        message: selectedDelivery
          ? `Current frame ${formatTime(snappedMs)} is outside delivery D${selectedDelivery.index} (${formatTime(selectedDelivery.startMs)}–${formatTime(selectedDelivery.endMs)}). Move inside the delivery before tagging evidence.`
          : "Select a delivery before tagging delivery evidence.",
      });
      return;
    }
    const capturedFrame = frameIndexForMs(snappedMs, project.fps);
    const alreadyTagged = frames.some(
      (value) => frameIndexForMs(value, project.fps) === capturedFrame,
    );
    const nextFrames = alreadyTagged
      ? frames
      : [...frames, snappedMs].sort((left, right) => left - right);
    upsertLabel(kpi, {
      visibility: "visible",
      evidenceMs: nextFrames[0] ?? snappedMs,
      evidenceFramesMs: nextFrames,
      confidence: existing?.confidence ?? 3,
    });
    setNotice(alreadyTagged ? "That frame is already tagged." : "Evidence frame added.");
  }

  function removeEvidenceFrame(kpi: KpiDefinition, frameToRemove: number) {
    if (!project) return;
    setEvidenceCaptureError(null);
    const targetId = kpi.scope === "clip" ? "clip" : activeDeliveryId;
    if (!targetId) return;
    const existing = getLabel(document.labels, targetId, kpi.id);
    const removeIndex = frameIndexForMs(frameToRemove, project.fps);
    const nextFrames = evidenceFramesFor(existing, project.fps).filter(
      (value) => frameIndexForMs(value, project.fps) !== removeIndex,
    );
    upsertLabel(kpi, {
      evidenceMs: nextFrames[0] ?? null,
      evidenceFramesMs: nextFrames,
    });
  }

  function explicitlyExcludeForFootwork(kpi: KpiDefinition) {
    const footwork = shotFootworkFor(selectedDelivery);
    const requirementLabel = footworkRequirementFor(kpi) === "front_foot" ? "front-foot" : "back-foot";
    upsertLabel(kpi, {
      visibility: "not_applicable",
      score: null,
      confidence: null,
      evidenceMs: null,
      evidenceFramesMs: [],
      note:
        selectedLabel?.note ||
        `Explicitly excluded by annotator: ${requirementLabel}-only KPI; shot footwork marked ${shotFootworkLabel(footwork).toLowerCase()}.`,
    });
  }

  async function saveProject(
    status = project?.status === "complete" ? "complete" : "labeling",
    overrideDocument = document,
  ) {
    if (!project) return;
    setIsSaving(true);
    setError("");
    try {
      const documentToSave = hydrateDocument(overrideDocument, project.fps);
      const response = await fetch(`/labelling/api/videos/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-AMP-Lab-CSRF": "1",
        },
        body: JSON.stringify({
          revision: project.revision,
          durationMs: project.durationMs,
          fps: project.fps,
          playerRef: project.playerRef,
          discipline: project.discipline,
          sex: project.sex,
          ageGroup: project.ageGroup,
          cameraAngle: project.cameraAngle,
          status,
          annotations: documentToSave,
        }),
      });
      const payload = (await response.json()) as { video?: VideoProject; error?: string };
      if (!response.ok || !payload.video) {
        throw new Error(payload.error ?? "Could not save this project.");
      }
      setProject(payload.video);
      setDocument(hydrateDocument(payload.video.annotations, payload.video.fps));
      setProjects((current) => [
        payload.video!,
        ...current.filter((item) => item.id !== payload.video!.id),
      ]);
      setDirty(false);
      setNotice("Progress saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function finaliseProject() {
    if (!project) return;
    if (blockers.length) {
      setStep("review");
      setError(`Resolve ${blockers.length} blocking quality checks before finalising.`);
      return;
    }
    const nextDocument: AnnotationDocument = {
      ...document,
      review: { ...document.review, reviewedAt: new Date().toISOString() },
    };
    setDocument(nextDocument);
    await saveProject("complete", nextDocument);
  }

  function exportCsv(draft = false) {
    if (!project) return;
    if (!draft && blockers.length) {
      setError("Resolve the blocking quality checks before a final CSV export.");
      setStep("review");
      return;
    }
    const csv = buildLabelsCsv(project, document, rubric);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFilename(project.filename)}-${draft ? "draft-" : ""}training-labels-v2.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(draft ? "Draft CSV exported with incomplete rows marked." : "Validated CSV exported.");
  }

  function jumpToIssue(deliveryId?: string, kpiId?: string) {
    if (deliveryId && deliveryId !== "clip") setSelectedDeliveryId(deliveryId);
    if (kpiId) setSelectedKpiId(kpiId);
    setStep(kpiId ? "label" : deliveryId ? "segment" : "setup");
  }

  const videoWorkspace = (compact = false) => (
    <div className={`video-workspace ${compact ? "video-workspace--compact" : ""}`}>
      <div className="video-stage">
        <video
          ref={videoRef}
          src={project ? `/labelling/api/videos/${project.id}/media` : localPreview}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration * 1000;
            if (!project) setUploadDurationMs(Math.round(duration));
          }}
          onTimeUpdate={(event) => {
            const next = event.currentTarget.currentTime * 1000;
            setCurrentMs(next);
            if (next < precisionStartMs || next > precisionEndMs) setPrecisionAnchorMs(next);
          }}
          onSeeked={(event) => {
            const next = event.currentTarget.currentTime * 1000;
            setCurrentMs(next);
            if (next < precisionStartMs || next > precisionEndMs) setPrecisionAnchorMs(next);
          }}
        />
        <div className="video-overlay-top">
          <span>{project?.cameraAngle ?? uploadForm.cameraAngle} view</span>
          <span>{project?.fps ?? uploadForm.fps} fps</span>
        </div>
        <div className="timecode">{formatTime(currentMs)}</div>
      </div>
      {project && (
        <div className="precision-controls">
          <div className="frame-controls" aria-label="Frame controls">
            <button type="button" onClick={() => stepFrames(-10)} title="Shift + left arrow" aria-label="Go back 10 frames">−10f</button>
            <button type="button" onClick={() => stepFrames(-1)} title="Left arrow or comma" aria-label="Go back one frame">−1 frame</button>
            <div className="frame-readout" aria-live="polite">
              <strong>Frame {currentFrame}</strong>
              <span>{formatTime(currentMs)}</span>
            </div>
            <button type="button" onClick={() => stepFrames(1)} title="Right arrow or period" aria-label="Go forward one frame">+1 frame</button>
            <button type="button" onClick={() => stepFrames(10)} title="Shift + right arrow" aria-label="Go forward 10 frames">+10f</button>
          </div>
          <div className="precision-scrubber">
            <div className="precision-heading">
              <span><strong>Precision scrub</strong><small>2-second window · 1 ms steps</small></span>
              <label className="exact-time-field">
                <span>Exact time</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={timecodeDraft ?? formatTime(currentMs)}
                  aria-label="Exact video time"
                  aria-describedby="exact-time-help"
                  onFocus={() => setTimecodeDraft(formatTime(currentMs))}
                  onChange={(event) => setTimecodeDraft(event.target.value)}
                  onBlur={(event) => commitTimecode(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setTimecodeDraft(null);
                    }
                  }}
                />
              </label>
            </div>
            <div className="fine-scrub-row">
              <input
                className="fine-scrubber"
                type="range"
                min={Math.round(precisionStartMs)}
                max={Math.max(Math.round(precisionStartMs), Math.round(precisionEndMs))}
                step="1"
                value={Math.round(Math.max(precisionStartMs, Math.min(currentMs, precisionEndMs)))}
                aria-label="Fine video position"
                aria-valuetext={`${formatTime(currentMs)}, frame ${currentFrame}`}
                onChange={(event) => {
                  videoRef.current?.pause();
                  seek(Number(event.target.value));
                }}
              />
              <div className="fine-scrub-scale" aria-hidden="true">
                <span>{formatTime(precisionStartMs)}</span>
                <span>{formatTime(precisionEndMs)}</span>
              </div>
            </div>
            <div className="precision-actions">
              <div className="nudge-controls" aria-label="Millisecond controls">
                <button type="button" onClick={() => nudgeMilliseconds(-100)}>−100 ms</button>
                <button type="button" onClick={() => nudgeMilliseconds(-10)}>−10 ms</button>
                <button type="button" onClick={() => nudgeMilliseconds(10)}>+10 ms</button>
                <button type="button" onClick={() => nudgeMilliseconds(100)}>+100 ms</button>
                <button type="button" onClick={() => setPrecisionAnchorMs(currentMs)}>Centre window</button>
              </div>
              {selectedDelivery && (
                <div className="quick-marker-controls" aria-label={`Set delivery ${selectedDelivery.index} markers`}>
                  <span>Set current time as</span>
                  <button type="button" onClick={() => updateDelivery(selectedDelivery.id, { startMs: Math.round(currentMs) })}>Start</button>
                  <button type="button" onClick={() => updateDelivery(selectedDelivery.id, { eventMs: Math.round(currentMs) })}>{eventName(project.discipline)}</button>
                  <button type="button" onClick={() => updateDelivery(selectedDelivery.id, { endMs: Math.round(currentMs) })}>End</button>
                </div>
              )}
            </div>
            <small id="exact-time-help" className="precision-help">Type MM:SS.mmm for an exact time. Range arrows move 1 ms; video shortcuts move one frame.</small>
          </div>
        </div>
      )}
    </div>
  );

  const uploadView = (
    <section className="empty-workspace">
      <div className="empty-copy">
        <span className="eyebrow">Ground-truth workspace</span>
        <h1>Turn cricket footage into labels you can trust.</h1>
        <p>
          Segment every delivery, score only visible KPIs, attach frame evidence and export a clean long-form CSV for training and evaluation.
        </p>
        <div className="trust-row">
          <span>Versioned rubric</span>
          <span>Human verified</span>
          <span>Camera routed</span>
        </div>
      </div>
      <div className="upload-card">
        <div className="card-heading">
          <div>
            <span className="section-number">New project</span>
            <h2>Upload a short clip</h2>
          </div>
          <span className="limit-chip">≤ 90 MB</span>
        </div>
        <button
          type="button"
          className={`file-drop ${selectedFile ? "file-drop--selected" : ""}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={handleFileChange}
            hidden
          />
          <span className="upload-glyph">↗</span>
          {selectedFile ? (
            <>
              <strong>{selectedFile.name}</strong>
              <small>{formatBytes(selectedFile.size)} · {uploadDurationMs ? formatTime(uploadDurationMs) : "reading duration…"}</small>
            </>
          ) : (
            <>
              <strong>Choose MP4, MOV or WebM</strong>
              <small>Use one camera angle per project</small>
            </>
          )}
        </button>
        {selectedFile && <div className="upload-preview">{videoWorkspace(true)}</div>}
        <div className="form-grid form-grid--two">
          <label className="field field--wide">
            <span>Player reference <em>pseudonymous</em></span>
            <input
              value={uploadForm.playerRef}
              onChange={(event) => setUploadForm({ ...uploadForm, playerRef: event.target.value })}
              placeholder="e.g. academy07-p014"
            />
          </label>
          <label className="field">
            <span>Discipline</span>
            <select
              value={uploadForm.discipline}
              onChange={(event) => setUploadForm({ ...uploadForm, discipline: event.target.value as Discipline })}
            >
              <option value="batting">Batting</option>
              <option value="pace">Pace bowling</option>
              <option value="offspin">Off-spin bowling</option>
              <option value="legspin">Leg-spin bowling</option>
            </select>
          </label>
          {uploadForm.discipline === "batting" && (
            <label className="field">
              <span>Bowling faced</span>
              <select
                value={uploadForm.battingMode}
                onChange={(event) => setUploadForm({ ...uploadForm, battingMode: event.target.value as BattingMode })}
              >
                <option value="pace">Pace</option>
                <option value="spin">Spin</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>Camera angle</span>
            <select
              value={uploadForm.cameraAngle}
              onChange={(event) => setUploadForm({ ...uploadForm, cameraAngle: event.target.value as CameraAngle })}
            >
              <option value="side">Side</option>
              <option value="front">Front</option>
              <option value="behind">Behind</option>
            </select>
          </label>
          <label className="field">
            <span>Sex benchmark</span>
            <select
              value={uploadForm.sex}
              onChange={(event) => setUploadForm({ ...uploadForm, sex: event.target.value as AthleteSex })}
            >
              <option value="male">Male · attached tiered KPI set</option>
            </select>
          </label>
          <label className="field">
            <span>Age band</span>
            <select
              value={uploadForm.ageGroup}
              onChange={(event) => setUploadForm({ ...uploadForm, ageGroup: event.target.value })}
            >
              {AGE_OPTIONS.map((age) => (
                <option key={age.value} value={age.value}>{age.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Workbook tier <em>select explicitly</em></span>
            <select
              value={uploadForm.rubricTier}
              onChange={(event) => setUploadForm({ ...uploadForm, rubricTier: event.target.value as KpiTier })}
            >
              {TIER_OPTIONS.map((tier) => (
                <option key={tier.value} value={tier.value}>{tier.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Source frame rate</span>
            <select
              value={uploadForm.fps}
              onChange={(event) => setUploadForm({ ...uploadForm, fps: Number(event.target.value) })}
            >
              {[24, 25, 30, 50, 60].map((fps) => <option key={fps} value={fps}>{fps} fps</option>)}
            </select>
          </label>
        </div>
        <label className="consent-row">
          <input
            type="checkbox"
            checked={uploadForm.consentConfirmed}
            onChange={(event) => setUploadForm({ ...uploadForm, consentConfirmed: event.target.checked })}
          />
          <span>I confirm the player has consented to this footage being used for model training and review.</span>
        </label>
        <button className="primary-button primary-button--full" type="button" onClick={uploadVideo} disabled={isUploading}>
          {isUploading ? "Preparing project…" : "Create labeling project"}
        </button>
        <p className="form-footnote">Personal names are intentionally not collected. Raw video stays private to this workspace.</p>
      </div>
    </section>
  );

  const setupView = project && (
    <section className="setup-layout">
      <div className="setup-main">
        <span className="eyebrow">Capture contract</span>
        <h2>Lock the context before anyone labels.</h2>
        <p className="lead-copy">These fields become training-data features. Enter them from session records—never infer age, sex, handedness or maturity from the video.</p>
        <div className="form-grid form-grid--two setup-form">
          <label className="field field--wide">
            <span>Player reference</span>
            <input value={project.playerRef} onChange={(event) => updateProject("playerRef", event.target.value)} />
          </label>
          <label className="field">
            <span>Capture session ID</span>
            <input value={document.review.captureSession} onChange={(event) => updateReview("captureSession", event.target.value)} placeholder="session-2026-08-07-a" />
          </label>
          <label className="field">
            <span>Annotator</span>
            <input value={document.review.annotator} onChange={(event) => updateReview("annotator", event.target.value)} placeholder="Initials or team ID" />
          </label>
          <label className="field">
            <span>Discipline</span>
            <select value={project.discipline} onChange={(event) => updateProject("discipline", event.target.value as Discipline)}>
              <option value="batting">Batting</option>
              <option value="pace">Pace bowling</option>
              <option value="offspin">Off-spin bowling</option>
              <option value="legspin">Leg-spin bowling</option>
              {project.discipline === "spin" && <option value="spin">Spin bowling · legacy</option>}
            </select>
          </label>
          {project.discipline === "batting" && (
            <label className="field">
              <span>Bowling faced</span>
              <select
                value={document.review.bowlerType || "pace"}
                onChange={(event) => updateReview("bowlerType", event.target.value)}
              >
                <option value="pace">Pace</option>
                <option value="spin">Spin</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>Camera angle</span>
            <select value={project.cameraAngle} onChange={(event) => updateProject("cameraAngle", event.target.value as CameraAngle)}>
              <option value="side">Side</option>
              <option value="front">Front</option>
              <option value="behind">Behind</option>
            </select>
          </label>
          <label className="field">
            <span>Sex benchmark</span>
            <select value={project.sex} onChange={(event) => updateProject("sex", event.target.value as AthleteSex)}>
              <option value="male">Male · attached tiered KPI set</option>
              {project.sex === "female" && <option value="female">Female · legacy provisional KPI set</option>}
            </select>
          </label>
          <label className="field">
            <span>Age band</span>
            <select value={project.ageGroup} onChange={(event) => updateProject("ageGroup", event.target.value)}>
              {AGE_OPTIONS.map((age) => <option key={age.value} value={age.value}>{age.label}</option>)}
            </select>
          </label>
          {rubric.tier !== "legacy" && (
            <label className="field">
              <span>Workbook tier <em>not inferred from age</em></span>
              <select
                value={document.review.rubricTier || rubric.tier || "performance"}
                onChange={(event) => updateReview("rubricTier", event.target.value)}
              >
                {TIER_OPTIONS.map((tier) => (
                  <option key={tier.value} value={tier.value}>{tier.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Handedness</span>
            <select value={document.review.handedness} onChange={(event) => updateReview("handedness", event.target.value)}>
              <option value="">Select</option>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label className="field">
            <span>PHV stage <em>record only</em></span>
            <select value={document.review.phvStage} onChange={(event) => updateReview("phvStage", event.target.value)}>
              <option value="">Unknown / not recorded</option>
              <option value="pre">Pre-PHV</option>
              <option value="circa">Circa-PHV</option>
              <option value="post">Post-PHV</option>
            </select>
          </label>
          <label className="field">
            <span>Frame rate</span>
            <select value={project.fps} onChange={(event) => updateProject("fps", Number(event.target.value))}>
              {[24, 25, 30, 50, 60].map((fps) => <option key={fps} value={fps}>{fps} fps</option>)}
            </select>
          </label>
        </div>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={() => void saveProject()} disabled={isSaving}>{isSaving ? "Saving…" : "Save setup"}</button>
          <button className="primary-button" type="button" onClick={() => setStep("segment")}>Continue to segmentation →</button>
        </div>
      </div>
      <aside className="protocol-card">
        <span className="section-number">Active rubric</span>
        <h3>{rubric.label}</h3>
        <p>{rubric.source}</p>
        <div className="protocol-stat"><strong>{supportedKpis.length}</strong><span>KPIs observable from this {project.cameraAngle} view</span></div>
        <div className="protocol-stat"><strong>{supportedKpis.reduce((sum, kpi) => sum + kpi.weight, 0)}%</strong><span>maximum performance weight before occlusion</span></div>
        <div className="protocol-warning"><strong>Rubric routing</strong><span>{rubric.tier === "legacy" ? "This project is version-locked to AMP’s legacy rubric. Female tier workbooks were not included in this upload." : `Using the supplied male ${rubric.tier} workbook${rubric.variant ? ` · ${rubric.variant}` : ""}. Workbook tier and action type select the route; age and PHV remain metadata only.`}</span></div>
      </aside>
    </section>
  );

  const segmentView = project && (
    <section className="segment-layout">
      <div className="segment-video-column">
        <div className="workspace-section-heading">
          <div><span className="eyebrow">Delivery segmentation</span><h2>Mark the action, frame by frame.</h2></div>
          <button className="primary-button" type="button" onClick={addDelivery}>+ Add delivery here</button>
        </div>
        {videoWorkspace()}
        <p className="keyboard-hint"><kbd>Space</kbd> play / pause <kbd>←</kbd><kbd>→</kbd> or <kbd>,</kbd><kbd>.</kbd> one frame <kbd>Shift</kbd> + arrow ten frames</p>
      </div>
      <aside className="delivery-panel">
        <div className="panel-heading"><div><span className="section-number">Segments</span><h3>{document.deliveries.length} deliveries</h3></div><span className="status-dot status-dot--amber" /></div>
        <div className="delivery-list">
          {document.deliveries.length === 0 && (
            <div className="empty-list"><strong>No deliveries yet</strong><span>Seek to contact or release, then add a delivery.</span></div>
          )}
          {document.deliveries.map((delivery) => {
            const segmentIssue = issues.some((issue) => issue.deliveryId === delivery.id && issue.id.startsWith("segment"));
            return (
              <button
                type="button"
                key={delivery.id}
                className={`delivery-item ${activeDeliveryId === delivery.id ? "delivery-item--active" : ""}`}
                onClick={() => { setSelectedDeliveryId(delivery.id); seek(delivery.eventMs); }}
              >
                <span className="delivery-index">D{String(delivery.index).padStart(2, "0")}</span>
                <span>
                  <strong>{formatTime(delivery.startMs)} → {formatTime(delivery.endMs)}</strong>
                  <small>{eventName(project.discipline)} at {formatTime(delivery.eventMs)}</small>
                  {project.discipline === "batting" && rubricHasFootworkSpecificKpis && (
                    <small className={shotFootworkFor(delivery) ? "footwork-recorded" : "footwork-missing"}>
                      Footwork: {shotFootworkLabel(shotFootworkFor(delivery))}
                    </small>
                  )}
                </span>
                <i className={segmentIssue ? "quality-bad" : "quality-good"}>{segmentIssue ? "!" : "✓"}</i>
              </button>
            );
          })}
        </div>
        {selectedDelivery ? (
          <div className="marker-editor">
            <div className="marker-title"><strong>Delivery {selectedDelivery.index}</strong><button type="button" onClick={() => removeDelivery(selectedDelivery)}>Remove</button></div>
            {([
              ["startMs", "Start"],
              ["eventMs", eventName(project.discipline)],
              ["endMs", "End"],
            ] as const).map(([field, label]) => (
              <div className="marker-row" key={field}>
                <span><small>{label}</small><strong>{formatTime(selectedDelivery[field])}</strong></span>
                <button type="button" onClick={() => updateDelivery(selectedDelivery.id, { [field]: Math.round(currentMs) })}>Set to current frame</button>
                <button type="button" className="seek-button" onClick={() => seek(selectedDelivery[field])}>↗</button>
              </div>
            ))}
            {project.discipline === "batting" && rubricHasFootworkSpecificKpis && (
              <ShotFootworkField
                delivery={selectedDelivery}
                onChange={(value) => updateDeliveryShotFootwork(selectedDelivery.id, value)}
              />
            )}
            <label className="field"><span>Outcome / delivery note</span><input value={selectedDelivery.outcome} onChange={(event) => updateDelivery(selectedDelivery.id, { outcome: event.target.value })} placeholder="e.g. cover drive, good length" /></label>
          </div>
        ) : null}
        <div className="panel-footer">
          <button className="secondary-button" type="button" onClick={() => void saveProject()} disabled={isSaving}>{isSaving ? "Saving…" : "Save segments"}</button>
          <button className="primary-button" type="button" onClick={() => setStep("label")} disabled={!document.deliveries.length}>Start labeling →</button>
        </div>
      </aside>
    </section>
  );

  const labelView = project && (
    <section className="label-layout">
      <div className="label-video-column">
        {videoWorkspace(true)}
        <div className="delivery-strip">
          <span>Delivery</span>
          {document.deliveries.map((delivery) => (
            <button
              type="button"
              key={delivery.id}
              className={activeDeliveryId === delivery.id ? "active" : ""}
              onClick={() => { setSelectedDeliveryId(delivery.id); seek(delivery.eventMs); }}
            >D{delivery.index}</button>
          ))}
          <button type="button" className="edit-segments" onClick={() => setStep("segment")}>Edit</button>
        </div>
        {selectedDelivery && project.discipline === "batting" && rubricHasFootworkSpecificKpis && (
          <ShotFootworkField
            delivery={selectedDelivery}
            compact
            onChange={(value) => updateDeliveryShotFootwork(selectedDelivery.id, value)}
          />
        )}
        <div className="score-summary-card">
          <div><span>Technique score</span><strong>{score.activeWeight >= MIN_RATING_WEIGHT_PCT && score.score10 !== null ? score.score10.toFixed(1) : "—"}<small>/10</small></strong></div>
          <div><span>Label coverage</span><strong>{score.coveragePct.toFixed(0)}<small>%</small></strong></div>
          <div><span>Scored weight</span><strong>{score.activeWeight}<small>%</small></strong></div>
        </div>
        {score.activeWeight < MIN_RATING_WEIGHT_PCT && <p className="suppressed-note">Overall rating is suppressed below {MIN_RATING_WEIGHT_PCT}% visible, scored KPI weight. The individual labels can still be exported.</p>}
      </div>
      <div className="kpi-browser">
        <div className="kpi-browser-heading">
          <span className="section-number">{rubric.label}</span>
          <h3>Observable KPIs</h3>
          {selectedDelivery && rubricHasFootworkSpecificKpis && (
            <p className="kpi-applicability-summary">
              <strong>{assessableKpiCount}</strong> of {supportedKpis.length} assessable for D{selectedDelivery.index} · {shotFootworkLabel(shotFootworkFor(selectedDelivery))}
            </p>
          )}
          <input value={kpiSearch} onChange={(event) => setKpiSearch(event.target.value)} placeholder="Find a KPI" aria-label="Find a KPI" />
        </div>
        <div className="kpi-list">
          {filteredKpis.map((kpi) => {
            const targetId = kpi.scope === "clip" ? "clip" : activeDeliveryId;
            const label = getLabel(document.labels, targetId, kpi.id);
            const applicability = kpiFootworkAssessability(
              kpi,
              selectedDelivery,
              activeDiscipline,
            );
            return (
              <button
                type="button"
                key={kpi.id}
                className={`kpi-item ${selectedKpi?.id === kpi.id ? "kpi-item--active" : ""} ${applicability.assessable ? "" : "kpi-item--excluded"}`}
                onClick={() => setSelectedKpiId(kpi.id)}
              >
                <span
                  className={`label-state ${applicability.assessable
                    ? label ? `label-state--${label.visibility}` : ""
                    : "label-state--excluded"}`}
                  aria-label={applicability.assessable
                    ? undefined
                    : "Excluded by shot-footwork applicability"}
                >
                  {applicability.assessable
                    ? label ? (label.visibility === "visible" ? label.score ?? "·" : "×") : ""
                    : "⊘"}
                </span>
                <span>
                  <strong>{kpi.name}{kpi.master ? " ★" : ""}</strong>
                  <small>{kpi.group} · {kpi.weight}% {kpi.scope === "clip" ? "· clip-level" : ""}</small>
                  {!applicability.assessable && <small className="kpi-excluded-reason">Excluded · {applicability.state.replaceAll("_", " ")}</small>}
                </span>
                <i>›</i>
              </button>
            );
          })}
        </div>
        <div className="kpi-browser-footer"><span>{score.visibleCells} / {score.expectedCells} required cells labelled</span><div><i style={{ width: `${Math.min(100, score.coveragePct)}%` }} /></div></div>
      </div>
      {selectedKpi && (
        <aside className="annotation-panel">
          <div className="annotation-scroll">
            <div className="annotation-heading">
              <span className="kpi-code">{selectedKpi.id}</span>
              <h2>{selectedKpi.name}</h2>
              <p>{selectedKpi.meaning}</p>
              <div className="kpi-meta"><span>{selectedKpi.group}</span><span>{selectedKpi.weight}% weight</span><span>{selectedKpi.evidenceType.replaceAll("_", " ")}</span></div>
            </div>
            {selectedKpi.scope === "clip" && (
              <div className="clip-scope-note"><strong>Clip-level comparison</strong><span>Use all {document.deliveries.length} deliveries. This score is exported once, not copied onto every ball.</span></div>
            )}
            {!selectedKpiAssessability.assessable && (
              <div className="applicability-callout" role="status">
                <strong>KPI excluded for this delivery</strong>
                <span>{selectedKpiAssessability.reason}</span>
                {selectedLabel && <span>Any existing label remains visible below for audit and has not been deleted.</span>}
                {canExplicitlyExcludeSelectedKpi && (
                  <button type="button" onClick={() => explicitlyExcludeForFootwork(selectedKpi)}>
                    Explicitly mark not applicable
                  </button>
                )}
              </div>
            )}
            <div className="rubric-callout rubric-callout--good"><span>{selectedKpi.tier === "foundation" ? "0 / 5 / 10 anchors" : selectedKpi.tier === "legacy" ? "10 / benchmark" : "Green / Amber / Red scoring guide"}</span><p>{selectedKpi.benchmark}</p></div>
            {selectedKpi.offCondition && <div className="rubric-callout rubric-callout--bad"><span>Lowest anchor</span><p>{selectedKpi.offCondition}</p></div>}
            <div className="rubric-observation"><strong>How to observe</strong><p>{selectedKpi.observation}</p></div>
            {selectedKpi.whyItMatters && <div className="rubric-observation"><strong>Workbook note</strong><p>{selectedKpi.whyItMatters}</p></div>}
            <div className="annotation-section">
              <label className="annotation-label">1 · Visibility</label>
              <div className="visibility-grid">
                {VISIBILITY_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={selectedLabel?.visibility === option.value ? "active" : ""}
                    disabled={
                      !selectedKpiAssessability.assessable &&
                      !(canExplicitlyExcludeSelectedKpi && option.value === "not_applicable")
                    }
                    onClick={() => setVisibility(selectedKpi, option.value)}
                  ><strong>{option.label}</strong><small>{option.helper}</small></button>
                ))}
              </div>
            </div>
            {(selectedLabel?.visibility ?? "visible") === "visible" ? (
              <>
                <div className="annotation-section">
                  <label className="annotation-label">2 · Expert score <span>0–10</span></label>
                  <div className="score-grid">
                    {Array.from({ length: 11 }, (_, index) => index).map((value) => (
                      <button
                        type="button"
                        key={value}
                        className={selectedLabel?.score === value ? "active" : ""}
                        disabled={!selectedKpiAssessability.assessable}
                        onClick={() => upsertLabel(selectedKpi, { visibility: "visible", score: value })}
                      >{value}</button>
                    ))}
                  </div>
                  {selectedKpi.scoringSystem === "green_amber_red_with_expert_0_10" && (
                    <>
                      <label className="annotation-label annotation-label--nested">Anchor bucket <span>source-defined</span></label>
                      <div className="bucket-grid">
                        {["red", "amber", "green"].map((value) => (
                          <button
                            type="button"
                            key={value}
                            className={selectedLabel?.categoricalBucket === value ? `active bucket-${value}` : ""}
                            disabled={!selectedKpiAssessability.assessable}
                            onClick={() => upsertLabel(selectedKpi, { categoricalBucket: value })}
                          >{value}</button>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="field-help">{selectedKpi.tier === "foundation" ? "Use the workbook’s explicit 0, 5 and 10 anchors; intermediate values remain an expert judgement." : "The workbook defines Green, Amber and Red descriptions but does not state a numeric mapping. Record both the source bucket and your 0–10 expert score."}</p>
                </div>
                <div className="annotation-section">
                  <label className="annotation-label">3 · Evidence frames <span>{selectedEvidenceFrames.length} tagged</span></label>
                  <div className="evidence-toolbar">
                    <button
                      type="button"
                      className="evidence-capture"
                      disabled={!selectedKpiAssessability.assessable}
                      onClick={() => addCurrentEvidenceFrame(selectedKpi)}
                    >
                      + Add current frame
                    </button>
                    <span>Frame-snapped · duplicates removed · earliest is primary</span>
                  </div>
                  {evidenceCaptureError?.targetId === selectedTargetId &&
                    evidenceCaptureError.kpiId === selectedKpi.id && (
                      <p className="evidence-inline-error" role="alert">
                        {evidenceCaptureError.message}
                      </p>
                    )}
                  {selectedEvidenceFrames.length ? (
                    <ul className="evidence-tag-list" aria-label={`Tagged evidence frames for ${selectedKpi.name}`}>
                      {selectedEvidenceFrames.map((timestampMs, index) => {
                        const frame = frameIndexForMs(timestampMs, project.fps);
                        return (
                          <li key={frame}>
                            <button
                              type="button"
                              className="evidence-jump"
                              onClick={() => seek(timestampMs)}
                              aria-label={`Jump to evidence frame ${frame} at ${formatTime(timestampMs)}`}
                            >
                              <strong>{formatTime(timestampMs)}</strong>
                              <small>Frame {frame}</small>
                            </button>
                            {index === 0 && <span className="primary-evidence">Primary</span>}
                            <button
                              type="button"
                              className="remove-evidence"
                              disabled={!selectedKpiAssessability.assessable}
                              onClick={() => removeEvidenceFrame(selectedKpi, timestampMs)}
                              aria-label={`Remove evidence frame ${frame} at ${formatTime(timestampMs)}`}
                            >
                              ×
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="evidence-empty">No evidence frames tagged. Add at least one for a visible score.</p>
                  )}
                </div>
                <div className="annotation-section">
                  <label className="annotation-label">4 · Confidence</label>
                  <div className="confidence-row">
                    {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={selectedLabel?.confidence === value ? "active" : ""} disabled={!selectedKpiAssessability.assessable} onClick={() => upsertLabel(selectedKpi, { confidence: value })}>{value}<small>{value === 1 ? "low" : value === 5 ? "high" : ""}</small></button>)}
                  </div>
                </div>
              </>
            ) : (
              <div className="null-explanation"><strong>No score will be exported.</strong><span>Add a concrete reason below so missing data is never interpreted as a safe or good result.</span></div>
            )}
            <div className="annotation-section">
              <label className="field"><span>Observable bucket</span><input value={selectedLabel?.categoricalBucket ?? ""} disabled={!selectedKpiAssessability.assessable} onChange={(event) => upsertLabel(selectedKpi, { categoricalBucket: event.target.value })} placeholder="e.g. narrow / good / wide" /></label>
              <label className="field"><span>{selectedLabel && selectedLabel.visibility !== "visible" ? "Null reason" : "Evidence note"}</span><textarea value={selectedLabel?.note ?? ""} disabled={!selectedKpiAssessability.assessable && selectedLabel?.visibility !== "not_applicable"} onChange={(event) => upsertLabel(selectedKpi, { note: event.target.value })} placeholder="Record only what is visible…" rows={3} /></label>
            </div>
            <details className="model-compare">
              <summary>Compare a model prelabel <span>optional, never ground truth</span></summary>
              <div className="form-grid form-grid--two">
                <label className="field"><span>Model score</span><input type="number" min="0" max="10" step="0.1" value={selectedLabel?.modelScore ?? ""} disabled={!selectedKpiAssessability.assessable} onChange={(event) => upsertLabel(selectedKpi, { modelScore: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                <label className="field"><span>Model version</span><input value={selectedLabel?.modelVersion ?? ""} disabled={!selectedKpiAssessability.assessable} onChange={(event) => upsertLabel(selectedKpi, { modelVersion: event.target.value })} placeholder="model-2026-08-a" /></label>
              </div>
              {selectedLabel?.modelScore !== null && selectedLabel?.modelScore !== undefined && selectedLabel.score !== null && <p>Absolute error: <strong>{Math.abs(selectedLabel.score - selectedLabel.modelScore).toFixed(1)}</strong></p>}
            </details>
          </div>
          <div className="annotation-footer">
            <button className="secondary-button" type="button" onClick={() => void saveProject()} disabled={isSaving}>{isSaving ? "Saving…" : dirty ? "Save progress" : "Saved"}</button>
            <button className="primary-button" type="button" onClick={() => setStep("review")}>Review dataset →</button>
          </div>
        </aside>
      )}
    </section>
  );

  const reviewView = project && (
    <section className="review-layout">
      <div className="review-main">
        <div className="workspace-section-heading">
          <div><span className="eyebrow">Quality control</span><h2>Review the data, not just the rating.</h2></div>
          <span className={`review-badge ${blockers.length ? "review-badge--blocked" : "review-badge--ready"}`}>{blockers.length ? `${blockers.length} blockers` : "Ready to finalise"}</span>
        </div>
        <div className="metric-grid">
          <div className="metric-card metric-card--hero"><span>Derived technique score</span><strong>{score.activeWeight >= MIN_RATING_WEIGHT_PCT && score.score10 !== null ? score.score10.toFixed(2) : "Suppressed"}</strong><small>{score.activeWeight >= MIN_RATING_WEIGHT_PCT ? "out of 10 · deterministic weighted mean" : "low-confidence coverage below workbook threshold"}</small></div>
          <div className="metric-card"><span>Label coverage</span><strong>{score.coveragePct.toFixed(0)}%</strong><small>{score.visibleCells} of {score.expectedCells} cells assessed</small></div>
          <div className="metric-card"><span>Observable weight</span><strong>{score.activeWeight}%</strong><small>after visibility decisions</small></div>
          <div className="metric-card"><span>Deliveries</span><strong>{document.deliveries.length}</strong><small>{document.deliveries.length >= 3 ? "consistency eligible" : "minimum 3 for consistency"}</small></div>
        </div>
        <div className="qa-card">
          <div className="qa-heading"><div><span className="section-number">Dataset gates</span><h3>{issues.length ? "Items that need attention" : "All checks passed"}</h3></div><div className="qa-counts"><span>{blockers.length} blockers</span><span>{warnings.length} warnings</span></div></div>
          <div className="issue-list">
            {issues.length === 0 && <div className="all-clear"><i>✓</i><span><strong>Clean label set</strong><small>Every observable KPI has a visibility decision, evidence and confidence.</small></span></div>}
            {issues.slice(0, 80).map((issue) => (
              <button type="button" key={issue.id} className={`issue-row issue-row--${issue.severity}`} onClick={() => jumpToIssue(issue.deliveryId, issue.kpiId)}>
                <i>{issue.severity === "blocker" ? "!" : "·"}</i><span><strong>{issue.message}</strong><small>{issue.severity === "blocker" ? "Required for final export" : "Expert review recommended"}</small></span><em>Fix →</em>
              </button>
            ))}
            {issues.length > 80 && <p className="more-issues">Showing the first 80 of {issues.length} issues. Complete one delivery at a time to reduce the queue.</p>}
          </div>
        </div>
      </div>
      <aside className="export-panel">
        <span className="section-number">Export contract</span>
        <h3>Long-form CSV</h3>
        <p>One row per delivery × KPI, with millisecond and zero-based frame timing, explicit null states, human/model separation, and source workbook provenance. Clip-level KPIs export once.</p>
        <ul>
          <li><span>Schema</span><strong>{LABELS_CSV_SCHEMA_VERSION}</strong></li>
          <li><span>Rubric</span><strong>{rubric.id}</strong></li>
          <li><span>Route</span><strong>{rubric.routeKey ?? "legacy"}</strong></li>
          <li><span>Split key</span><strong>player + capture session</strong></li>
          <li><span>Ground truth</span><strong>human labels only</strong></li>
        </ul>
        <label className="field"><span>Reviewer <em>recommended</em></span><input value={document.review.reviewer} onChange={(event) => updateReview("reviewer", event.target.value)} placeholder="Second expert ID" /></label>
        <div className="export-actions">
          <button className="secondary-button secondary-button--full" type="button" onClick={() => exportCsv(true)}>Export draft CSV</button>
          <button className="primary-button primary-button--full" type="button" onClick={() => void finaliseProject()} disabled={Boolean(blockers.length) || isSaving}>{isSaving ? "Finalising…" : "Finalise project"}</button>
          <button className="primary-button primary-button--full primary-button--light" type="button" onClick={() => exportCsv(false)} disabled={Boolean(blockers.length)}>Export validated CSV</button>
        </div>
        <div className="safety-note"><strong>Not a medical diagnosis</strong><span>Injury markers belong in a separate dual-reviewed screen and must never be interpreted as clearance to play.</span></div>
      </aside>
    </section>
  );

  return (
    <div className="lab-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={resetWorkspace} aria-label="AMP Label Lab home"><span>amp</span><i>label lab</i></button>
        <div className="topbar-context">Human ground truth · Accuracy-first rubric</div>
        <div className="topbar-actions">
          {project && <span className={`save-state ${dirty ? "save-state--dirty" : ""}`}>{isSaving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</span>}
          <button type="button" className="new-project-button" onClick={resetWorkspace}>+ New project</button>
          {onExit && <button type="button" className="exit-lab-button" onClick={exitLab}>Exit lab</button>}
        </div>
      </header>
      <div className="app-body">
        <aside className="project-rail">
          <div className="rail-heading"><span>Projects</span><small>{projects.length}</small></div>
          <div className="project-list">
            {isLoading && projects.length === 0 && <div className="rail-loading">Loading projects…</div>}
            {!isLoading && projects.length === 0 && <div className="rail-empty">Your uploaded clips will appear here.</div>}
            {projects.map((item) => (
              <button type="button" key={item.id} className={`project-card ${project?.id === item.id ? "project-card--active" : ""}`} onClick={() => void loadProject(item.id)}>
                <span className="project-thumb"><i>{item.discipline === "batting" ? "BT" : item.discipline === "pace" ? "PC" : item.discipline === "legspin" ? "LS" : item.discipline === "offspin" ? "OS" : "SP"}</i></span>
                <span><strong>{item.playerRef}</strong><small>{item.filename}</small><em>{item.cameraAngle} · {item.status}</em></span>
              </button>
            ))}
          </div>
          <div className="rail-footer"><span className="privacy-mark">◉</span><span><strong>Private workspace</strong><small>Videos are not publicly accessible</small></span></div>
        </aside>
        <main className="workspace">
          {project && (
            <div className="workflow-bar">
              <div className="project-identity"><span className="video-type">{project.discipline.slice(0, 2).toUpperCase()}</span><span><strong>{project.playerRef}</strong><small>{project.filename} · {formatBytes(project.sizeBytes)}</small></span></div>
              <nav aria-label="Labeling workflow">
                {STEPS.map((item) => (
                  <button type="button" key={item.id} className={step === item.id ? "active" : ""} onClick={() => setStep(item.id)}><small>{item.number}</small><span>{item.label}</span></button>
                ))}
              </nav>
              <div className="project-score"><small>Score</small><strong>{score.activeWeight >= MIN_RATING_WEIGHT_PCT && score.score10 !== null ? score.score10.toFixed(1) : "—"}</strong></div>
            </div>
          )}
          {(error || notice) && (
            <div className={`notice-bar ${error ? "notice-bar--error" : ""}`}><span>{error || notice}</span><button type="button" onClick={() => { setError(""); setNotice(""); }}>×</button></div>
          )}
          {!project && uploadView}
          {project && step === "setup" && setupView}
          {project && step === "segment" && segmentView}
          {project && step === "label" && labelView}
          {project && step === "review" && reviewView}
        </main>
      </div>
    </div>
  );
}
