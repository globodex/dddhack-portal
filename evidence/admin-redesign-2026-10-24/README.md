# Admin redesign evidence, 24 October 2026

Runtime source: `5f6777678fb8812ddf2a20b1c5113983d9441aee` on `feat/admin-experience`.
All source commits use author and committer **Parampreet Singh <rubercuber.30@gmail.com>**.
No main push, merge, deployment, provider setting, credential, production database, or production storage changes occurred.

This is the real Next.js portal, tested against an isolated synthetic SQLite fixture backend. Real Google login, hosted cutover, and hosted performance are outside this evidence. Root integration owns the final build, complete test suite, shared-component verification, and performance matrix.

## Changes

- Settings has Event, Results, Access, and Content panels. Keyboard tabs preserve unsaved form state and make no additional portal requests. Agenda, FAQ, and Rules use a separate content switch and entry disclosures.
- Participants has a deliberate search/filter/action header, meaningful populated defaults, compact contextual empty states, responsive table/cards, existing filtered export, and native import/status dialogs.
- Teams has member/crown controls and private saved-idea overrides using the existing staff-authorized contract. Idea title, 500-character description, lock checks, exact-target confirmation, and permissions remain intact.
- Submissions retains version history, private scoring and feedback, eligibility, exact project/version removal targets, restoration controls, and existing scoring. Ineligible evidence fields appear when relevant; disabled scoring keeps its actionable reason.
- Credits has direct CSV upload/paste, a two-column desktop editor, compact mobile editor, real published batches, instructions, inventory/recipient counts, and guarded deletion. Duplicate headings remain refused with an actionable recovery message.
- Owner Logs retain export, filters, details, exact records, and owner-only API access.
- Every directly owned admin form declares POST and is inert before hydration. Native fallback cannot put email, CSV, voucher, or review fields into a URL.

## Screenshots and checks

All four viewports are covered: **1440 x 900**, **768 x 1024**, **390 x 844**, and **390 x 480**. Full-page captures keep their original pixels. Open modal captures use the viewport so the native backdrop is represented correctly. The local fixture badge and fake media are intentional test content.

| Evidence                                                                             | Source    | Result                                                                                                                    |
| ------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Initial redesigned states](../redesign-admin-6b66023/report.json)                   | `6b66023` | 62 screenshots; 16 interaction groups; no uncaught page errors                                                            |
| [Rich populated admin matrix](../redesign-admin-10bf102/report.json)                 | `10bf102` | 64 screenshots; 5 groups; no interaction failures                                                                         |
| [Final touch, keyboard, native controls](../redesign-admin-4166f69/report.json)      | `4166f69` | 17 screenshots; 14 groups; 6 preview calls; no errors                                                                     |
| [JavaScript-disabled fallback](../redesign-admin-hydration-final/report.json)        | `fa2b184` | 48 forms across four routes; all POST and inert; no private query parameters or mutations                                 |
| [Positive team/review controls](../redesign-admin-controls/report-teams-review.json) | `6b66023` | Crown changed and restored; voting paused and reopened; private score persisted; content retained across panels           |
| [Positive participant subset](../redesign-admin-controls/report-participants.json)   | `6b66023` | Two statuses and one exact synthetic import persisted; report covers the successful subset before the old harness stopped |

Final source `4166f69` was rendered in detached QA commit `4e5933b`; `git diff 4166f69 4e5933b -- app` was empty. The final `5f67776` CSS correction has no separate child runtime capture: root must verify it in its integrated matrix. It makes the submission management panel own its summary and child-form padding without a negative-margin dependency on legacy panel CSS.

Representative actual files:

- [Accepted reference, baseline, and Settings comparison](../redesign-admin-6b66023/settings-source-before-after.png). The accepted board is a 1536 x 1024 composite; baseline and rendered app both use 1440 CSS pixels. This documents hierarchy and task density, not a claim of pixel equivalence.
- [Settings Event desktop](../redesign-admin-6b66023/settings-event-1440x900.png), [Access mobile](../redesign-admin-6b66023/settings-access-390x844.png), [scoring tablet](../redesign-admin-10bf102/settings-scoring-768x1024.png).
- [Participants desktop](../redesign-admin-6b66023/participants-populated-1440x900.png), [filters mobile](../redesign-admin-6b66023/participants-filters-390x844.png), [status short mobile](../redesign-admin-6b66023/participants-status-dialog-390x480.png).
- [Locked team and private idea desktop](../redesign-admin-10bf102/team-locked-idea-1440x900.png).
- [Eligibility mobile](../redesign-admin-10bf102/review-eligibility-evidence-390x844.png), [submission management mobile](../redesign-admin-4166f69/project-management-390x844.png).
- [Credit editor mobile](../redesign-admin-10bf102/credits-editor-390x844.png), [published credits desktop](../redesign-admin-10bf102/credits-published-1440x900.png), [actionable duplicate-heading refusal](../redesign-admin-4166f69/credit-existing-heading-error.png).
- [Native nested CSV confirmation](../redesign-admin-4166f69/import-csv-confirmation.png), [credit deletion confirmation](../redesign-admin-4166f69/credit-column-delete-confirmation.png).
- [Populated owner Logs, short mobile](../redesign-admin-10bf102/log-expanded-390x480.png).

Only screenshots actually opened and viewed have `inspected: true` in the JSON manifests. Automated geometry assertions do not imply that every capture has had human-equivalent visual review.

## Validation detail and limits

- Typecheck passed at `fa2b184` and `4166f69`.
- 48 focused tests passed at `fa2b184`; 27 relevant tests passed after the final JSX/count changes at `4166f69`. The last correction `5f67776` changes only scoped CSS. [Test output](tests-fa2b184.txt), [latest relevant output](tests-4166f69.txt), [typecheck](typecheck-4166f69.txt).
- Escape and browser Back dismiss import/status/confirmation dialogs; focus returns to the opener. Nested import cancellation returns to the import dialog. Native file choosers, CSV reads, keyboard traversal, filtered CSV downloads, and touch-emulated actions were exercised.
- File/import/credit destructive actions in the final supplement were previewed and cancelled. No deletion was committed. Positive writes elsewhere used only synthetic records in `/tmp/ddd-admin-experience.sqlite`.
- Owner Logs returned 403 without record data to the non-owner admin fixture. Published synthetic credit columns were visible to the checked-in personal recipient fixture. Existing authorization and privacy tests remain in the focused suite.
- Native pre-hydration tests used JavaScript disabled, not simulated slow JavaScript. All 48 rendered forms remained inert and outside the keyboard focus path, with only GET navigation requests.
- The rich `10bf102` matrix recorded three React console warnings caused by Playwright temporarily setting input caret colors before delayed hydration. This is verified in installed Playwright screenshot code; current scripts use `caret: "initial"`. These historical captures are not a zero-console claim. No uncaught application errors occurred.
- Earlier local 127.0.0.1 write attempts were refused by the unmodified origin guard because Next dev Request.url normalized to localhost. No mutations occurred. All positive writes used matching localhost frontend/backend APP_ORIGIN. No origin guard was bypassed.
- The historical review captures show the old shared ProjectBody fallback caption and stored-zero Field behavior. Root reports these shared fixes in integrated `0f5f823`; they are not claimed fixed in earlier screenshot sources.
- Final root review should verify the new submission disclosure padding at 390 and 1440, shared singular `1 participants` confirmation wording, and the faint inherited inventory-card outline. Those observations were sent to the central owner.
- Chromium used Linux headless touch emulation with sandbox disabled because this executor's SUID helper is unavailable. This is not a physical-device, real-account, or hosted-performance claim.

## Reproduction

Use the existing local synthetic fixture backend and `scripts/visual-rich-fixtures.ts` as needed. Match **localhost** for the frontend browser URL and backend APP_ORIGIN. Scripts reject external origins and block external browser requests.

```sh
ADMIN_QA_ORIGIN=http://localhost:3013 ADMIN_QA_OUTPUT=evidence/new-admin-read node scripts/qa-admin-experience.mjs
ADMIN_QA_ORIGIN=http://localhost:3013 ADMIN_QA_SOURCE_ROOT="$PWD" ADMIN_QA_OUTPUT=evidence/new-admin-rich node scripts/qa-admin-populated.mjs
ADMIN_QA_ORIGIN=http://localhost:3013 ADMIN_QA_OUTPUT=evidence/new-admin-controls node scripts/qa-admin-controls.mjs
ADMIN_QA_ORIGIN=http://localhost:3013 ADMIN_QA_OUTPUT=evidence/new-admin-hydration node scripts/qa-admin-hydration.mjs
```

The populated and native-control scripts expect the rich synthetic project/credit fixture. The populated script may persist/restore a synthetic idea and publish synthetic credits if missing. Never point these at a real dataset. The native-control supplement permits only preview mutation actions and cancels all destructive confirmations.

The isolated frontend 3013 and fixture backend 8813 were stopped after the reports were saved to release resources for root's final validation.
