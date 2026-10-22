---
name: Result and snapshot integrity
description: Simple result lifecycle and historical report snapshot rules.
---

Keep results to two states: Draft and Completed. Drafts are editable; completion validates the values and stores the report snapshot in the same operation. Do not add intermediate result states, verifier/releaser steps, patient codes, contexts, or result comments.

**Why:** the user asked for result entry to stay simple, with no stages or extra statuses, and explicitly removed patient code and context from result entry.

**How to apply:** Keep the result form and worklist limited to Draft/Completed. Completed results are locked and printable only from their stored snapshot.

Drafts read the live catalog. There is no captured-configuration store: a parameter's reference lines live on `test_parameter.normal_ranges`, and a completed report is built from `report_snapshot` and `report_line` at the moment it is completed.

**Why:** the versioned reference-interval feature, with its contexts, thresholds, effective dates and approval step, was removed in favour of lines of text on the parameter. A saved copy of a catalog that can no longer change would be dead weight.

**How to apply:** Drafts, new and existing, are evaluated against the current catalog. Never re-render a completed report from the live catalog.

One parameter prints one or more reference lines, stored on the parameter itself in `normal_ranges` as a JSON array of strings (for example `["Male: 65-176 ug/dL", "Female: 26-170 ug/dL"]`). All of `result_value`, `report_line` and `test_parameter` use the same column name and shape. Nothing compares a result against those lines, so no table carries a flag. Never infer, invent or silently widen a medical range.
