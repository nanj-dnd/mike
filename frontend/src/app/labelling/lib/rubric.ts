import legacyCatalogJson from "../data/amp-kpi-catalog.json";
import tieredCatalogJson from "../data/amp-tiered-kpi-catalog.json";

export type Discipline = "batting" | "pace" | "spin" | "offspin" | "legspin";
export type CameraAngle = "side" | "front" | "behind";
export type AthleteSex = "male" | "female";
export type KpiScope = "delivery" | "clip";
export type KpiTier = "foundation" | "development" | "performance";
export type BattingMode = "pace" | "spin";
export type BattingModeRubrics = Record<BattingMode, Rubric>;

interface LegacySourceKpi {
  id: string;
  number: number;
  name: string;
  master_fundamental?: boolean;
  stage: string;
  weight_pct: number;
  camera_angles: string[];
  evidence_type: string;
  meaning: string;
  benchmark_10: string;
  off_condition: string;
  observable_check: string;
  why_it_matters: string;
  sex_variants?: {
    women?: Partial<
      Pick<LegacySourceKpi, "benchmark_10" | "observable_check" | "why_it_matters">
    >;
  };
}

interface LegacyCatalog {
  catalog_version: string;
  definitions: {
    batting: { kpis: LegacySourceKpi[] };
    pace_men: { kpis: LegacySourceKpi[] };
    pace_women: { kpis: LegacySourceKpi[] };
    spin: { kpis: LegacySourceKpi[] };
    injury: unknown;
  };
}

interface TieredSourceKpi {
  id: string;
  number: number;
  name: string;
  group: string;
  tier: KpiTier;
  variant: string;
  weight_pct: number;
  applies_to: string;
  camera_angles: string[];
  view_requirement: {
    source_text: string;
    logic: string;
    normalized_app_views: string[];
    nonstandard_source_views: string[];
    capture_quality_requirements: string[];
  };
  scope: KpiScope;
  evidence_type: string;
  analysis_instruction: string;
  scoring_system: string;
  scoring_guide: string;
  red_or_zero_anchor: string;
  notes: string;
  source: {
    workbook: string;
    workbook_sha256: string;
    sheet: string;
    row: number;
  };
}

interface TieredRoute {
  id: string;
  discipline: string;
  sex_benchmark: string;
  tier: KpiTier;
  variant: string;
  age_bands: string[];
  label: string;
  source_workbook: string;
  source_workbook_sha256: string;
  source_sheet: string;
  kpi_count: number;
  total_weight_pct: number;
  kpis: TieredSourceKpi[];
}

interface TieredCatalog {
  schema_version: string;
  catalog_version: string;
  routes: TieredRoute[];
}

export interface KpiDefinition {
  id: string;
  name: string;
  group: string;
  weight: number;
  angles: (CameraAngle | "any")[];
  scope: KpiScope;
  evidenceType: string;
  meaning: string;
  benchmark: string;
  offCondition: string;
  observation: string;
  whyItMatters: string;
  master: boolean;
  tier?: KpiTier | "legacy";
  variant?: string;
  appliesTo?: string;
  scoringSystem?: string;
  scoringGuide?: string;
  sourceWorkbook?: string;
  sourceWorkbookSha256?: string;
  sourceSheet?: string;
  sourceRow?: number;
  viewLogic?: string;
  viewSourceText?: string;
  nonstandardSourceViews?: string[];
  captureQualityRequirements?: string[];
}

export interface Rubric {
  id: string;
  label: string;
  source: string;
  catalogVersion?: string;
  tier?: KpiTier | "legacy";
  variant?: string;
  routeKey?: string;
  sourceWorkbook?: string;
  sourceWorkbookSha256?: string;
  sourceSheet?: string;
  kpis: KpiDefinition[];
}

export interface RubricOptions {
  ageGroup?: string;
  battingMode?: string;
  tier?: KpiTier;
  rubricVersion?: string;
}

const legacyCatalog = legacyCatalogJson as unknown as LegacyCatalog;
const tieredCatalog = tieredCatalogJson as unknown as TieredCatalog;

export const LEGACY_RUBRIC_VERSION = `amp-${legacyCatalog.catalog_version}`;
export const RUBRIC_VERSION = `amp-${tieredCatalog.catalog_version}`;

function stablePrefix(discipline: Discipline) {
  return discipline === "batting" ? "bat" : discipline;
}

function isClipScope(kpi: LegacySourceKpi) {
  return (
    kpi.id.includes("consistency") ||
    kpi.id.startsWith("same_") ||
    kpi.evidence_type.toLowerCase().includes("multi_delivery") ||
    kpi.evidence_type.toLowerCase().includes("computed")
  );
}

function normalizeAngles(values: string[]) {
  const angles = values
    .map((value) => value.toLowerCase().trim())
    .filter((value) => ["side", "front", "behind", "any"].includes(value));
  return (angles.length ? angles : ["any"]) as (CameraAngle | "any")[];
}

function convertLegacy(
  discipline: Discipline,
  source: LegacySourceKpi[],
  sex: AthleteSex,
): KpiDefinition[] {
  return source.map((item) => {
    const variant = discipline === "batting" && sex === "female"
      ? item.sex_variants?.women
      : undefined;
    return {
      id: `${stablePrefix(discipline)}.${item.id}.v1`,
      name: item.name,
      group: item.stage,
      weight: item.weight_pct,
      angles: normalizeAngles(item.camera_angles),
      scope: isClipScope(item) ? "clip" : "delivery",
      evidenceType: item.evidence_type,
      meaning: item.meaning,
      benchmark: variant?.benchmark_10 ?? item.benchmark_10,
      offCondition: item.off_condition,
      observation: variant?.observable_check ?? item.observable_check,
      whyItMatters: variant?.why_it_matters ?? item.why_it_matters,
      master: Boolean(item.master_fundamental),
      tier: "legacy",
      variant: discipline === "spin" ? "generic_spin" : discipline,
      scoringSystem: "expert_0_10",
      scoringGuide: variant?.benchmark_10 ?? item.benchmark_10,
      sourceWorkbook: "latest kpi scoring.xlsx",
    };
  });
}

function legacyRubric(discipline: Discipline, sex: AthleteSex): Rubric {
  if (discipline === "batting") {
    return {
      id: `${LEGACY_RUBRIC_VERSION}-batting-${sex}`,
      label: "Batting · legacy 17 KPIs",
      source: "latest kpi scoring.xlsx · legacy accuracy-first branch",
      catalogVersion: legacyCatalog.catalog_version,
      tier: "legacy",
      variant: "batting",
      routeKey: `legacy.batting.${sex}`,
      sourceWorkbook: "latest kpi scoring.xlsx",
      kpis: convertLegacy(discipline, legacyCatalog.definitions.batting.kpis, sex),
    };
  }
  if (discipline === "pace") {
    return {
      id: `${LEGACY_RUBRIC_VERSION}-pace-${sex}`,
      label: `Pace bowling · legacy ${sex === "female" ? "women" : "men"} · 13 KPIs`,
      source: "latest kpi scoring.xlsx · legacy accuracy-first branch",
      catalogVersion: legacyCatalog.catalog_version,
      tier: "legacy",
      variant: "pace",
      routeKey: `legacy.pace.${sex}`,
      sourceWorkbook: "latest kpi scoring.xlsx",
      kpis: convertLegacy(
        discipline,
        sex === "female"
          ? legacyCatalog.definitions.pace_women.kpis
          : legacyCatalog.definitions.pace_men.kpis,
        sex,
      ),
    };
  }
  const legacyDiscipline: Discipline = "spin";
  return {
    id: `${LEGACY_RUBRIC_VERSION}-spin-${sex}`,
    label: "Spin bowling · legacy 11 KPIs",
    source: "latest kpi scoring.xlsx · legacy accuracy-first branch",
    catalogVersion: legacyCatalog.catalog_version,
    tier: "legacy",
    variant: discipline === "legspin" ? "legspin" : "offspin",
    routeKey: `legacy.spin.${sex}`,
    sourceWorkbook: "latest kpi scoring.xlsx",
    kpis: convertLegacy(legacyDiscipline, legacyCatalog.definitions.spin.kpis, sex),
  };
}

export function tierForAgeGroup(ageGroup: string): KpiTier {
  if (ageGroup === "u9") return "foundation";
  if (ageGroup === "u11" || ageGroup === "u13") return "development";
  return "performance";
}

function convertTiered(source: TieredSourceKpi[]): KpiDefinition[] {
  return source.map((item) => ({
    id: item.id,
    name: item.name,
    group: item.group,
    weight: item.weight_pct,
    angles: normalizeAngles(item.camera_angles),
    scope: item.scope,
    evidenceType: item.evidence_type,
    meaning: item.analysis_instruction,
    benchmark: item.scoring_guide,
    offCondition: item.red_or_zero_anchor,
    observation: `Applies to: ${item.applies_to || "Any delivery context"}.`,
    whyItMatters: item.notes,
    master: false,
    tier: item.tier,
    variant: item.variant,
    appliesTo: item.applies_to,
    scoringSystem: item.scoring_system,
    scoringGuide: item.scoring_guide,
    sourceWorkbook: item.source.workbook,
    sourceWorkbookSha256: item.source.workbook_sha256,
    sourceSheet: item.source.sheet,
    sourceRow: item.source.row,
    viewLogic: item.view_requirement.logic,
    viewSourceText: item.view_requirement.source_text,
    nonstandardSourceViews: item.view_requirement.nonstandard_source_views,
    captureQualityRequirements: item.view_requirement.capture_quality_requirements,
  }));
}

export function getRubric(
  discipline: Discipline,
  sex: AthleteSex,
  options: RubricOptions = {},
): Rubric {
  const useLegacy =
    sex === "female" ||
    options.rubricVersion === LEGACY_RUBRIC_VERSION ||
    options.rubricVersion?.startsWith(`${LEGACY_RUBRIC_VERSION}-`);
  if (useLegacy) return legacyRubric(discipline, sex);

  const normalizedDiscipline = discipline === "spin" ? "offspin" : discipline;
  const tier = options.tier ?? tierForAgeGroup(options.ageGroup ?? "adult");
  const variant =
    normalizedDiscipline === "batting"
      ? tier === "performance"
        ? options.battingMode === "spin"
          ? "spin"
          : "pace"
        : "all"
      : tier === "performance"
        ? normalizedDiscipline === "offspin"
          ? "off_spin"
          : normalizedDiscipline === "legspin"
            ? "leg_spin"
            : "pace"
        : "generic";
  const routedDiscipline =
    normalizedDiscipline === "batting" ? "batting" : "bowling";
  const route = tieredCatalog.routes.find(
    (candidate) =>
      candidate.discipline === routedDiscipline &&
      candidate.tier === tier &&
      candidate.variant === variant,
  );

  if (!route) return legacyRubric(discipline, sex);

  const disciplineLabel =
    normalizedDiscipline === "batting"
      ? tier === "performance"
        ? `Batting vs ${variant}`
        : "Batting"
      : normalizedDiscipline === "pace"
        ? "Pace bowling"
        : normalizedDiscipline === "offspin"
          ? "Off-spin bowling"
          : "Leg-spin bowling";

  return {
    id: `${RUBRIC_VERSION}-${route.id}-male`,
    label: `${disciplineLabel} · ${route.label} · ${route.kpi_count} KPIs`,
    source: `${route.source_workbook} · ${route.source_sheet}`,
    catalogVersion: tieredCatalog.catalog_version,
    tier: route.tier,
    variant: route.variant,
    routeKey: route.id,
    sourceWorkbook: route.source_workbook,
    sourceWorkbookSha256: route.source_workbook_sha256,
    sourceSheet: route.source_sheet,
    kpis: convertTiered(route.kpis),
  };
}

export function getBattingModeRubrics(
  sex: AthleteSex,
  options: Omit<RubricOptions, "battingMode"> = {},
): BattingModeRubrics {
  return {
    pace: getRubric("batting", sex, { ...options, battingMode: "pace" }),
    spin: getRubric("batting", sex, { ...options, battingMode: "spin" }),
  };
}

export function supportsAngle(kpi: KpiDefinition, angle: CameraAngle) {
  return kpi.angles.includes("any") || kpi.angles.includes(angle);
}

export function eventName(discipline: Discipline) {
  return discipline === "batting" ? "Contact" : "Release";
}
