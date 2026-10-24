# Results and private review UI

Source baseline: cde3ce4e5a69158eaf5a2b0f7ae489800740982c. Before evidence is in `evidence/results-ui/before/` and was captured and viewed before editing, with owner-only synthetic fixtures at 1440×900 and 390×844.

The audit found a large decorative project banner, repeated project description, separate mobile tabs hiding the answers while scoring, duplicated Eligibility labels, a private final-rubric editor and reviewer assignment that the user asked to remove. Results had release buttons but no owner control for the missing judging policy and an empty snapshot selector.

Use the existing warm surface, ink, typography, navigation and actual media. The private review has a compact icon Back header, one answer column and one action column, stacked on mobile. Repository and deployment links display the recorded targets. Each persisted question is shown once; legacy missing answers are unavailable, never inferred. The admin/judge score is 1–10 with optional private feedback and one Save. Keep one eligibility section, actual AI state and explicit evaluation, versions and private review history. Historical versions are read-only.

Results shows the real server-controlled AI, snapshot and final stages. The sequence is visual, not an invented requirement that AI must precede manual final grading. Only actual current-policy snapshots are selectable. Awards stay individually selectable in any order. Owner-only native Judging setup edits existing policy values with IST inputs, inline errors and one Save. It preserves unrelated policy fields and saved weights. Missing rules remain empty until chosen. No readiness checkboxes, reason fields, generated dates or additional preview page.

The requested removal of the final-rubric UI leaves no score-record editor for Codex and collaboration/diversity values. Existing final computation still requires those recorded values. This UI change does not invent replacements or relax scoring rules.
