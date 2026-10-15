---
name: Result and snapshot integrity
description: Simple result lifecycle and historical report snapshot rules.
---

Keep results to two states: Draft and Completed. Drafts are editable; completion validates values and captures the report snapshot in one operation. Do not add intermediate result states, verifier/releaser steps, patient codes, contexts, or result comments.

**Why:** the user asked for result entry to stay simple, with no stages or extra statuses, and explicitly removed patient code and context from result entry.

**How to apply:** Keep the result form and worklist limited to Draft/Completed. Completed results are locked and printable only from their captured snapshot.

Review existing results against the configuration captured with that result, not the live test catalog.

**Why:** Laboratories can change labels, units, types, options and approved references. Rendering live metadata can misrepresent the values evaluated when the result was completed.

**How to apply:** New drafts use the current catalog; existing drafts use captured configuration; completed reports use only their saved snapshot.

For configured Decision Value flags, describe whether a threshold is an abnormal trigger rather than assuming it represents a normal condition. Keep displayed flags aligned with server evaluation.

**Why:** “Above” can mean “flag values above this threshold,” not “normal values should be above this threshold.” Confusing these meanings reverses the interpretation without changing the numeric configuration.

**How to apply:** Preserve the explicit decision semantics in editor help, previews and reports. Never infer medical ranges or normality.