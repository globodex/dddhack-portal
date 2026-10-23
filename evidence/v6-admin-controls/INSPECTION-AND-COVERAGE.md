# Frozen admin control audit

Source `8e90450443fd3dc61ddad88448ca4cec8395d494`; Worker `901580c960143319604987bfb37f67e336b5bd228c0d6d8244dcd87515daea13`.

Actual compiled loopback preview, disposable rich synthetic D1, Chromium sandbox enabled. Desktop1440×1000 uses mouse; portrait390×844 sets isMobile and hasTouch and uses tap for pointer activation. No confirming writes, external requests, or page errors.

## Results

- Initial matrix:313 scenarios,301 passed;12 runner-only failures (8 implicit-submit selector mismatches,4 incorrect assigned-reviewer route expectations).
- Corrected targeted rerun:91/91 passed. It verifies actual score/advice confirmation cancellation and assigned-only submissions for owner/admin/judge/mentor with mouse and touch.
- Initial visible-control inventory:1,225 entries;345 checked,872 untested,8 external skipped. Each entry records route,role,input mode,status,result,reason. Dynamic remounts may produce repeated inventory entries; counts are not unique control contracts and are not exhaustive interaction coverage.
- No claim that every visible control was exercised. Navigation/logout, unselected per-row actions, advanced operational/scoring/content edit controls, enabled reveal/grant flows, many public links and dynamic draft fields remain untested in this pass.

## Initial role coverage

| Role | Entries | Checked | Untested | Skipped |
|---|---:|---:|---:|---:|
| owner | 603 | 160 | 441 | 2 |
| admin | 457 | 130 | 325 | 2 |
| volunteer | 39 | 12 | 27 | 0 |
| judge | 77 | 32 | 43 | 2 |
| mentor | 49 | 11 | 36 | 2 |

## Actual visual inspection

Compared original actual captures with shared05-admin-management,07-owner-settings-project-review and08-team-rules-owner-logs boards. Opened original desktop Participants/Settings/Logs and mobile Participants/Teams/Submissions/Settings/Review/Logs.

- Desktop Participants search magnifier overlaps placeholder. Prepared source correction eba5467, not yet verified against rebuilt artifact.
- Mobile Admin access email input collapses and Add overlays it. Prepared source correction eba5467, not yet verified against rebuilt artifact.
- Mobile Submissions badge,content,chevron stack vertically because inherited grid-column spans all columns. Prepared source correction b88aaa6, not yet verified against rebuilt artifact.
- Review header falls through to solid synthetic project logo because review projection lacks teamName/teamPalette. Root backend lane informed; no local backend edit.
- Desktop admin hamburger instead of reference avatar belongs to root shared header lane; root is correcting.
- Numeric review uses44px five-by-two radio targets on mobile for reliable touch access; no scoring/AI enablement. Private score1–10 drafts selected; mentor has no numeric score.

Captures marked clean mean undimmed initial route state before local controls on that page. Logs already include synthetic preview-import events from preceding read/preview scenarios; these are not pristine audit-log fixture screenshots. No primary data was committed.

## Write phase

Prepared scripts/qa-admin-synthetic-writes.mjs. Requires explicit root-reset manifest and matching source/Worker after fresh disposable preview reset. It cannot run through the normal --preview-ready flag. Positive write execution remains pending root authorization for the reset artifact. Single/list/CSV import, individual status/rollback, credit Markdown save/restore, named Ivy removal and locked Carol guard, judge/mentor private saves are narrowly allowlisted. No admin grants, secret/voucher reveal, AI/scoring/reveal activation, or external writes.

The first-pass and corrected receipts remain separate; failed first-pass evidence was preserved.
