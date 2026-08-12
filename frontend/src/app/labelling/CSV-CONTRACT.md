# AMP training labels CSV v2

`amp-training-labels-long-v2` is the handoff contract produced by AMP Label Lab.

## Row grain

Each row represents one video × target × KPI observation:

- delivery-scoped KPIs produce one row per marked delivery;
- session-scoped KPIs produce one `target_scope=clip` row; and
- KPIs unsupported by the selected camera view remain present as explicit excluded rows.

`record_id` is the stable compound key `video_id::delivery_id::kpi_id`. If duplicate human labels exist in a saved annotation document, export selects the label with the newest `label_updated_at`, then uses `label_id` as a deterministic tie-breaker.

## Rows to use for training

- Supervised score training: `training_score_eligible=true` and `training_row_status=ready_scored_label`.
- Visibility/null training: include `training_row_status=ready_null_label` as explicit non-scored observations.
- Exclude `exclude_wrong_angle`, `exclude_incomplete`, and every `exclude_footwork_*` status from score training.
- Use `dataset_group_key` to keep every row for the same player and capture session in one train/validation/test split.

The human ground-truth fields begin with `human_`. Model suggestions begin with `model_` and must never replace the human fields.

## Timing

All timestamp fields ending in `_ms` are integer milliseconds from the beginning of the source video. Frame fields ending in `_frame_0based` are zero-based indices calculated from `video_fps` using nearest-frame rounding. The source video hash is in `video_sha256`.

`human_evidence_timestamps_ms_json` is a JSON array of every human evidence point, snapped to the nearest video frame, sorted chronologically, and de-duplicated by zero-based frame index. `human_evidence_frames_0based_json` is the parallel JSON array of frame indices, and `human_evidence_count` is their shared length. The earliest canonical point is mirrored into the backward-compatible singular `human_evidence_timestamp_ms` and `human_evidence_frame_0based` columns. Rows without usable human evidence export `[]`, `[]`, and `0`.

A legacy annotation containing only `evidenceMs` therefore exports a one-item multi-evidence array. New writers may also persist `evidenceFramesMs`; they should keep `evidenceMs` equal to the earliest canonical timestamp. Every evidence point for a delivery-scoped label must fall inside that delivery segment or the label is incomplete and ineligible for score training.

## Human shot-footwork and KPI applicability

`human_shot_footwork` is an explicit delivery-level human judgement with one of `front_foot`, `back_foot`, `both`, or `unclear`. Clip-scoped rows leave it blank. Existing annotations are not backfilled or inferred from KPI scores, delivery outcome, or video metadata.

Only two exact workbook applicability values alter scoring:

- `kpi_applies_to=Front-Foot Only` applies to `front_foot` and `both` deliveries;
- `kpi_applies_to=Back-Foot Only` applies to `back_foot` and `both` deliveries.

`kpi_applies_to=Both` means the KPI is usable for either front- or back-foot shots; it is not the same semantic as a human `human_shot_footwork=both` judgement. All other conditional applicability prose remains in scope because the catalog does not provide enough structured information to infer those conditions safely.

`kpi_footwork_applicability_state` is one of:

- `not_restricted` — no exact front/back-only rule applies;
- `applicable` — the human footwork matches the exact restriction, including `both`;
- `excluded_mismatch` — known front/back footwork does not match;
- `excluded_unclear` — the annotator explicitly selected `unclear`; or
- `unresolved_missing` — required shot-footwork has not been labelled.

Missing footwork is a review blocker only when the active rubric and camera angle contain front/back-only delivery KPIs. `unclear` is a valid exportable human judgement and produces a warning, but its restricted KPI rows are excluded from scoring. Known mismatches are explicit excluded rows and do not require a KPI label. Stale labels remain in the saved annotation JSON for auditability, but their human score, confidence, bucket, evidence, and note are suppressed from training CSV fields whenever the row is excluded by footwork.

## Human subject focus

The project-level focus contract is repeated on every CSV row:

- `human_multiple_people_visible` is `true` only when the annotator explicitly records that multiple people are visible;
- `human_subject_focus_role` is one of `batter`, `bowler`, `non_striker`, `wicketkeeper`, `fielder`, `umpire`, `other`, or `unclear`; and
- `human_subject_focus_description` is the annotator's concrete visual description of the target person.

When multiple people are visible, both the role and a non-empty description are required. `unclear` is a valid explicit role choice, but it still needs a description so the footage remains tied to one target. Missing either field blocks review and gives every CSV row `training_row_status=exclude_incomplete` with `training_score_eligible=false`. When multiple people are not visible, role and description export blank. Legacy annotations without these fields safely normalize to `false`, blank, and blank.

## Human batting shot type

Every batting delivery requires an explicit `human_shot_type`. This follows the existing delivery-level validation pattern: shot type changes how footage should be grouped and interpreted, so silently leaving it absent would make otherwise complete KPI rows ambiguous. The allowed codes are:

`defensive`, `straight_drive`, `cover_drive`, `on_drive`, `square_drive`, `cut`, `pull`, `hook`, `flick`, `leg_glance`, `sweep`, `reverse_sweep`, `paddle_scoop`, `lofted_shot`, `leave`, `other`, and `unclear`.

`unclear` is a valid explicit human choice and remains training-eligible when the rest of the row is complete. `other` requires a non-empty `human_shot_type_other` description; the custom field is blank for every other code. Missing shot type, or missing custom text for `other`, blocks review and makes every KPI row for that delivery `exclude_incomplete`. Clip-scoped and non-batting rows leave both shot fields blank. Legacy batting deliveries without shot type still export safely, but remain incomplete until a human labels them. Legacy callers of validation that do not supply a discipline retain the earlier validation behavior.

## Null and uncertainty semantics

- `visibility_status=visible` requires `human_score_0_10`, `human_confidence_1_5`, and evidence time/frame.
- `occluded`, `low_quality`, `uncertain`, and `not_applicable` are intentional null labels and require `null_reason`.
- `wrong_angle` is generated when the selected camera view is outside the normalized views inferred from workbook prose.
- Empty/null never means safe or good. A numeric zero means the KPI was visible and matched the lowest source anchor.

The source camera wording is retained in `camera_view_source_text`. `normalized_camera_views` is an app routing aid, while `camera_view_logic=ambiguous_multiple_views` explicitly warns that the workbook did not define whether multiple mentioned views are alternatives or jointly required.

## KPI and rubric provenance

Every source-backed row includes:

- `route_key`, `catalog_version`, `rubric_id`, `rubric_tier`, and `rubric_variant`;
- `source_workbook`, `source_workbook_sha256`, `source_sheet`, and `source_row`; and
- the source applicability, scoring system, scoring guide, observation text, and normalized view metadata.

The catalog has nine male routes and 131 unique KPI IDs. Foundation uses explicit 0/5/10 anchors. Development and Performance use Green/Amber/Red descriptions but the workbooks do not specify a numeric conversion, so `human_categorical_bucket` and `human_score_0_10` are separate fields.

## Derived values

`derived_video_score_0_10` is calculated deterministically:

1. average non-null delivery scores within each KPI;
2. multiply each KPI mean by its source weight; and
3. divide by the sum of weights for KPIs with a score.

`derived_scored_weight_pct` is the workbook-style coverage measure used for confidence. Scores below 50% are suppressed in the UI. `label_completion_pct` measures completion of expected label cells and is separate from scored weight.

## File format

The browser download is UTF-8 with a BOM for spreadsheet compatibility. Records use RFC-4180 quoting and CRLF row endings; embedded commas, quotes, and line breaks are escaped. Column order is version-locked in `LABELS_CSV_COLUMNS` for v2. The five shot-footwork/multi-evidence fields and the five subject-focus/shot-type fields were appended after the original v2 columns, so every pre-existing column retains its name and ordinal position.
