---
name: Result review integrity
description: Why entry review must use captured metadata and why entry edits invalidate verification.
---

Review existing results against the configuration captured with that result, not the live test catalog.

**Why:** Laboratories can change labels, units, types, options and approved references while an entry awaits verification. Rendering live metadata can misrepresent the values the server evaluated, even before report release.

**How to apply:** New result forms use the current catalog; saved-result forms use their captured configuration. Released reports use only their released report snapshot.

Treat edits to an Entered result as a return to Draft. Verification must transition the persisted Entered record directly, without first saving it again.

**Why:** A frontend that saves before every transition silently returns Entered to Draft and makes verification fail. More importantly, changed values must be entered again before verification.

**How to apply:** Keep explicit edit-to-draft and verify actions separate. Do not shortcut status transitions to compensate for saving.

For configured Decision Value flags, describe whether a threshold is an abnormal trigger rather than assuming it represents a normal condition. Keep displayed flags aligned with server evaluation.

**Why:** “Above” can mean “flag values above this threshold,” not “normal values should be above this threshold.” Confusing these meanings reverses the interpretation without changing the numeric configuration.

**How to apply:** Preserve the explicit decision semantics in editor help, previews and reports. Never infer medical ranges or normality.