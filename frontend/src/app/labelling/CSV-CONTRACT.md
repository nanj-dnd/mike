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
- Exclude `exclude_wrong_angle` and `exclude_incomplete` from score training.
- Use `dataset_group_key` to keep every row for the same player and capture session in one train/validation/test split.

The human ground-truth fields begin with `human_`. Model suggestions begin with `model_` and must never replace the human fields.

## Timing

All timestamp fields ending in `_ms` are integer milliseconds from the beginning of the source video. Frame fields ending in `_frame_0based` are zero-based indices calculated from `video_fps` using nearest-frame rounding. The source video hash is in `video_sha256`.

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

The browser download is UTF-8 with a BOM for spreadsheet compatibility. Records use RFC-4180 quoting and CRLF row endings; embedded commas, quotes, and line breaks are escaped. Column order is version-locked in `LABELS_CSV_COLUMNS` for v2.
