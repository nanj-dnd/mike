import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(path, dependencies = {}) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: path,
    }).outputText;
    const loadedModule = { exports: {} };
    const localRequire = (specifier) => {
        if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
        throw new Error(`Unexpected test dependency: ${specifier}`);
    };
    Function("require", "module", "exports", output)(
        localRequire,
        loadedModule,
        loadedModule.exports,
    );
    return loadedModule.exports;
}

const contract = await loadTypeScriptModule(
    "../src/app/labelling/lib/training-contract.ts",
);
const labels = await loadTypeScriptModule(
    "../src/app/labelling/lib/labels.ts",
    {
        "./rubric": {
            eventName: (discipline) =>
                discipline === "batting" ? "Contact" : "Release",
            supportsAngle: (kpi, angle) =>
                kpi.angles.includes("any") || kpi.angles.includes(angle),
        },
        "./training-contract": contract,
    },
);

function parseCsv(csv) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < csv.length; index += 1) {
        const character = csv[index];
        if (quoted) {
            if (character === '"' && csv[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                cell += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ",") {
            row.push(cell);
            cell = "";
        } else if (character === "\r" && csv[index + 1] === "\n") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            index += 1;
        } else {
            cell += character;
        }
    }
    row.push(cell);
    rows.push(row);
    return rows;
}

function csvRecords(csv) {
    const [headers, ...rows] = parseCsv(csv);
    return rows.map((row) =>
        Object.fromEntries(headers.map((header, index) => [header, row[index]])),
    );
}

function kpi(id, appliesTo) {
    return {
        id,
        name: id,
        group: "Footwork",
        weight: 50,
        angles: ["side"],
        scope: "delivery",
        evidenceType: "frames",
        meaning: "meaning",
        benchmark: "benchmark",
        offCondition: "off",
        observation: "observe",
        whyItMatters: "why",
        master: false,
        tier: "performance",
        variant: "pace",
        appliesTo,
        scoringSystem: "green_amber_red_plus_expert_0_10",
        scoringGuide: "guide",
    };
}

const frontOnly = kpi("front-only", "Front-Foot Only");
const unrestricted = kpi("all-shots", "Both");
const rubric = {
    id: "rubric-a",
    label: "Batting",
    source: "test",
    routeKey: "batting.performance.pace",
    kpis: [frontOnly, unrestricted],
};
const deliveries = [
    {
        id: "d-front",
        index: 1,
        startMs: 0,
        eventMs: 500,
        endMs: 1000,
        outcome: "",
        note: "",
        shotFootwork: "front_foot",
    },
    {
        id: "d-back",
        index: 2,
        startMs: 1100,
        eventMs: 1500,
        endMs: 2000,
        outcome: "",
        note: "",
        shotFootwork: "back_foot",
    },
    {
        id: "d-both",
        index: 3,
        startMs: 2100,
        eventMs: 2500,
        endMs: 3000,
        outcome: "",
        note: "",
        shotFootwork: "both",
    },
    {
        id: "d-unclear",
        index: 4,
        startMs: 3100,
        eventMs: 3500,
        endMs: 4000,
        outcome: "",
        note: "",
        shotFootwork: "unclear",
    },
    {
        id: "d-missing",
        index: 5,
        startMs: 4100,
        eventMs: 4500,
        endMs: 5000,
        outcome: "",
        note: "",
    },
];

function label(deliveryId, kpiId, evidenceMs, evidenceFramesMs = undefined) {
    return {
        id: `${deliveryId}-${kpiId}`,
        deliveryId,
        kpiId,
        visibility: "visible",
        score: 8,
        confidence: 4,
        evidenceMs,
        evidenceFramesMs,
        categoricalBucket: "GREEN",
        note: "human note",
        modelScore: 7,
        modelVersion: "model-a",
        updatedAt: "2026-08-10T00:00:00.000Z",
    };
}

function documentForTest() {
    const document = labels.emptyDocument();
    document.deliveries = deliveries.map((delivery) => ({ ...delivery }));
    document.review = {
        ...document.review,
        annotator: "expert-a",
        captureSession: "session-a",
    };
    document.labels = deliveries.flatMap((delivery) => [
        label(
            delivery.id,
            frontOnly.id,
            delivery.eventMs,
            delivery.id === "d-front"
                ? [760, 501, 759, delivery.eventMs]
                : undefined,
        ),
        label(delivery.id, unrestricted.id, delivery.eventMs),
    ]);
    return document;
}

const project = {
    id: "video-a",
    filename: "video.mp4",
    sha256: "abc",
    playerRef: "player-a",
    discipline: "batting",
    sex: "male",
    ageGroup: "adult",
    cameraAngle: "side",
    fps: 25,
    status: "complete",
    rubricVersion: "rubric-a",
    createdAt: "2026-08-10T00:00:00.000Z",
};

test("exact workbook footwork rules cover front, back, both, mismatch, unclear and unset", () => {
    const backOnly = kpi("back-only", "Back-Foot Only");
    assert.equal(contract.footworkApplicability(frontOnly, "front_foot"), "applicable");
    assert.equal(contract.footworkApplicability(frontOnly, "both"), "applicable");
    assert.equal(
        contract.footworkApplicability(frontOnly, "back_foot"),
        "excluded_mismatch",
    );
    assert.equal(
        contract.footworkApplicability(frontOnly, "unclear"),
        "excluded_unclear",
    );
    assert.equal(contract.footworkApplicability(frontOnly, null), "unresolved_missing");
    assert.equal(contract.footworkApplicability(backOnly, "back_foot"), "applicable");
    assert.equal(contract.footworkApplicability(unrestricted, null), "not_restricted");
    assert.equal(
        contract.footworkApplicability(
            kpi("conditional", "Conditional — only if a sweep appears"),
            null,
        ),
        "not_restricted",
    );
});

test("foundation batting and every bowling route have no exact footwork requirement", async () => {
    const catalog = JSON.parse(
        await readFile(
            new URL(
                "../src/app/labelling/data/amp-tiered-kpi-catalog.json",
                import.meta.url,
            ),
            "utf8",
        ),
    );
    const routes = catalog.routes.filter(
        (route) =>
            route.id === "batting.foundation.all" ||
            route.discipline === "bowling",
    );
    assert.ok(routes.length > 1);
    assert.ok(
        routes
            .flatMap((route) => route.kpis)
            .every((entry) => !contract.isFootworkRestrictedKpi({
                scope: entry.scope,
                appliesTo: entry.applies_to,
            })),
    );
});

test("multi-evidence is frame-snapped, sorted and de-duplicated with earliest primary", () => {
    const canonical = contract.canonicalEvidenceTimestamps(
        {
            evidenceMs: 1050,
            evidenceFramesMs: [1035, 1001, 1201, 1205],
        },
        25,
    );
    assert.deepEqual(canonical, [1000, 1040, 1200]);
    assert.deepEqual(contract.evidenceFrameIndices(canonical, 25), [25, 26, 30]);
    assert.deepEqual(
        contract.canonicalEvidenceTimestamps({ evidenceMs: 19.6 }, 25),
        [0],
    );
    assert.deepEqual(
        contract.canonicalEvidenceTimestamps({ evidenceMs: 500 }),
        [500],
    );
});

test("CSV appends compatible footwork and multi-evidence fields while preserving all rows", () => {
    const document = documentForTest();
    const clipKpi = {
        ...unrestricted,
        id: "clip-consistency",
        name: "clip-consistency",
        scope: "clip",
    };
    const exportRubric = { ...rubric, kpis: [...rubric.kpis, clipKpi] };
    document.labels.push(label("clip", clipKpi.id, 1000, [1200]));
    const csv = labels.buildLabelsCsv(project, document, exportRubric);
    const records = csvRecords(csv);
    const originalLastColumn = labels.LABELS_CSV_COLUMNS.indexOf("project_created_at");

    assert.equal(records.length, deliveries.length * rubric.kpis.length + 1);
    assert.deepEqual(
        labels.LABELS_CSV_COLUMNS.slice(originalLastColumn + 1),
        [
            "human_shot_footwork",
            "kpi_footwork_applicability_state",
            "human_evidence_timestamps_ms_json",
            "human_evidence_frames_0based_json",
            "human_evidence_count",
        ],
    );

    const front = records.find(
        (record) => record.delivery_id === "d-front" && record.kpi_id === frontOnly.id,
    );
    assert.equal(front.human_shot_footwork, "front_foot");
    assert.equal(front.kpi_footwork_applicability_state, "applicable");
    assert.equal(front.human_evidence_timestamps_ms_json, "[520,760]");
    assert.equal(front.human_evidence_frames_0based_json, "[13,19]");
    assert.equal(front.human_evidence_count, "2");
    assert.equal(front.human_evidence_timestamp_ms, "520");
    assert.equal(front.human_evidence_frame_0based, "13");

    const legacy = records.find(
        (record) => record.delivery_id === "d-front" && record.kpi_id === unrestricted.id,
    );
    assert.equal(legacy.human_evidence_timestamps_ms_json, "[520]");
    assert.equal(legacy.human_evidence_count, "1");
    assert.equal(legacy.human_evidence_timestamp_ms, "520");

    const mismatch = records.find(
        (record) => record.delivery_id === "d-back" && record.kpi_id === frontOnly.id,
    );
    assert.equal(mismatch.label_id, "d-back-front-only");
    assert.equal(mismatch.human_label_state, "excluded_footwork_mismatch");
    assert.equal(mismatch.training_row_status, "exclude_footwork_mismatch");
    assert.equal(mismatch.training_score_eligible, "false");
    assert.equal(mismatch.human_confidence_1_5, "");
    assert.equal(mismatch.human_categorical_bucket, "");
    assert.equal(mismatch.human_note, "");
    assert.equal(mismatch.human_score_0_10, "");
    assert.equal(mismatch.human_evidence_timestamps_ms_json, "[]");
    assert.equal(
        document.labels.find((entry) => entry.id === mismatch.label_id).score,
        8,
    );

    const unclear = records.find(
        (record) => record.delivery_id === "d-unclear" && record.kpi_id === frontOnly.id,
    );
    assert.equal(unclear.human_label_state, "excluded_footwork_unclear");
    const missing = records.find(
        (record) => record.delivery_id === "d-missing" && record.kpi_id === frontOnly.id,
    );
    assert.equal(missing.human_label_state, "unresolved_footwork_missing");

    const clip = records.find((record) => record.kpi_id === clipKpi.id);
    assert.equal(clip.target_scope, "clip");
    assert.equal(clip.human_shot_footwork, "");
    assert.equal(clip.kpi_footwork_applicability_state, "not_restricted");
});

test("scoring ignores stale labels on mismatched, unclear and missing footwork", () => {
    const document = documentForTest();
    for (const entry of document.labels) {
        if (entry.kpiId === frontOnly.id) {
            entry.score = ["d-front", "d-both"].includes(entry.deliveryId) ? 10 : 0;
        }
    }
    const summary = labels.scoreDocument(document, rubric, "side");
    assert.equal(summary.score10, 9);
    assert.equal(summary.activeWeight, 100);
    assert.equal(summary.expectedCells, 7);
});

test("validation blocks missing footwork, warns on unclear and rejects any out-of-segment evidence", () => {
    const document = documentForTest();
    document.labels = document.labels.filter(
        (entry) =>
            entry.kpiId !== frontOnly.id ||
            ["d-front", "d-both"].includes(entry.deliveryId),
    );
    const issues = labels.validateDocument(document, rubric, "side", 5000, 25);
    assert.ok(issues.some((issue) => issue.id === "shot-footwork-d-missing"));
    assert.ok(issues.some((issue) => issue.id === "shot-footwork-unclear-d-unclear"));
    assert.ok(
        !issues.some(
            (issue) =>
                issue.id === `missing-d-back-${frontOnly.id}` ||
                issue.id === `missing-d-unclear-${frontOnly.id}`,
        ),
    );

    const frontLabel = document.labels.find(
        (entry) => entry.deliveryId === "d-front" && entry.kpiId === frontOnly.id,
    );
    frontLabel.evidenceFramesMs = [500, 1041];
    assert.ok(
        labels
            .validateDocument(document, rubric, "side", 5000, 25)
            .some((issue) => issue.id === `evidence-range-d-front-${frontOnly.id}`),
    );
    const outsideRecord = csvRecords(
        labels.buildLabelsCsv(project, document, rubric),
    ).find(
        (record) =>
            record.delivery_id === "d-front" && record.kpi_id === frontOnly.id,
    );
    assert.equal(outsideRecord.training_score_eligible, "false");
    assert.equal(outsideRecord.training_row_status, "exclude_incomplete");

    const unrestrictedRubric = { ...rubric, kpis: [unrestricted] };
    assert.ok(
        !labels
            .validateDocument(document, unrestrictedRubric, "side", 5000, 25)
            .some((issue) => issue.id.startsWith("shot-footwork-")),
    );
});
