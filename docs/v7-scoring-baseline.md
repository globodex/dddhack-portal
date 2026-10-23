# Current scoring code baseline

Source baseline: `7fd4016ce9a2156d13de4d600818ae0aad9e7ff5`. The user accepted the current scoring implementation as the v7 baseline after the original handoff. This records that implementation without changing weights or activating scoring. Read the event's current versioned policy before an actual calculation; saved global weights may differ from these defaults. Missing configuration or review data remains explicit rather than being invented here.

The defaults in [`lib/policy.ts`](../lib/policy.ts) are:

| Component | Default weight | Input used by the calculation |
| --- | ---: | --- |
| Human | 50 | Average included reviewer mark, out of 10 |
| AI / Astra | 30 | Reviewed AI component, out of 30 |
| Votes | 5 | Qualified vote count with configured normalization |
| Diversity | 10 | Reviewed component, out of 10 |
| Codex | 5 | Reviewed component, out of 5 |
| Feedback bonus | 5 | Qualified feedback count with configured target |

The first five components total **100**. Feedback can add **5**, so the maximum before penalties is **105**. The function does not automatically rescale that total to 100.

[`score()` in `lib/evaluation.ts`](../lib/evaluation.ts) calculates human points as `average(mark) / 10 × human weight`, AI points as `astra / 30 × AI weight`, diversity as `diversity / 10 × diversity weight`, and Codex as `codex / 5 × Codex weight`. Included reviewers have equal weight in that average.

With `sqrt-relative`, voting is `vote weight × sqrt(qualified votes / maximum qualified votes among eligible teams)`; it is zero when that maximum is zero. With `fixed-target`, it is `vote weight × min(1, qualified votes / vote target)`. This document does not choose a new formula or target.

Feedback adds `feedback weight × min(1, qualified feedback / feedback target)`. The draft defaults contain vote target **10** and feedback target **10**. These numbers are code defaults, not evidence that all engagement policy decisions have been finalized.

The final calculation subtracts **5 points per confirmed false claim**, with a supported count from 0 to 2, and floors the total at zero. An inaccessible repository, an unavailable AI service or an unverified claim is not itself a confirmed false claim. The command path requires the applicable human evidence and penalty policy.

Ineligible teams receive no ranked score. Eligible entries require a completed version-specific eligibility/review state and the required component/reviewer coverage. Missing required data can block calculation; it is not permission to manufacture a component value.

For current projects, [`PortalService.compute()`](../lib/service.ts) includes the latest scored review per reviewer for the current version, checks staff/assigned-judge authority, and excludes a reviewer who belongs to the team. It averages the included marks. The current review UI offers **1 through 10**; the lower-level calculation accepts finite marks from **0 through 10**. Offline collection should follow the UI's 1–10 scale.

Public upvotes and comments do not automatically become scored engagement. Current project counts contribute only through the configured `score-with-approved-normalization` path and confirmed qualification rules. [`qualifiedEngagement()`](../lib/engagement-scoring.ts) applies the configured audience/window and staff feedback qualification, counts qualified feedback authors, and applies the selected duplicate rule. Pending qualification can block final calculation.

Tied final totals require the owner's recorded ordering of that exact tied group and score breakdown. Do not silently choose an alphabetical order or invent a tie breaker. [`lib/score-release.ts`](../lib/score-release.ts) controls staged public release; an internal calculation, manual ledger or AI report is not itself a public result.

Use [HACKATHON_FALLBACK.md](HACKATHON_FALLBACK.md) during an outage. Record manual marks against the same immutable version, preserve timestamps and history, and keep results private until the announced policy and actual result prerequisites are satisfied.
