# Projects and submission control coverage

The browser runner is `scripts/qa-projects-controls-v6.mjs`. It is prepared, not an exhaustive passing result. The existing 17 focused source tests were not full control coverage. The later composition checks increase that focused set to 19; compiled control outcomes must be recorded separately.

## Actual baseline evidence

Source `8e90450443fd3dc61ddad88448ca4cec8395d494`, Worker SHA-256 `901580c960143319604987bfb37f67e336b5bd228c0d6d8244dcd87515daea13`.

Read-only Projects run: `evidence/v6-projects-submission/8e904504-jx2SNc/report.json`, 12 role/viewport checks and 24 list/detail captures at 1440 × 900, 834 × 1194, 390 × 844 and 320 × 740 for Bob, Viewer and anonymous. No page errors, mutations or external destinations. This baseline used normal browser contexts; it does not establish touch coverage.

Representative desktop and mobile captures were inspected beside board 04. Confirmed problems were legacy CSS suppressing team bylines below the desktop breakpoint and stacking tablet interaction controls. Fix `f843cc7` needs matching-build screenshots.

Wizard entry is Dashboard → Project → Update project. `/submission` is an intentional legacy alias to Dashboard, not the primary entry. Source `8e904504` produced clean desktop wizard steps 1 and 2 in `evidence/v6-projects-submission/8e904504-dpldXG/`. Clicking step-two Next then opened the Update project draft confirmation and disabled the editor. A separate loopback-only diagnostic confirmed step 3, that dialog and zero POSTs; it was cancelled. Fix `eb2a3c3` cancels native activation and gives Next a distinct key. Full wizard flow was blocked at this defect, not passed.

Those wizard captures also show redundant outer Dashboard content compared with board 06. Composition correction `bdba736` and nonleader draft-read follow-up `46c50be` require fresh matching screenshots. Browser checks were stopped while root integrates and rebuilds.

## Inventory and role ownership

| Surface                  | Controls and states                                                                                                                     | Required role or fixture                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Projects list            | Search matching/empty/clear; row/detail; comments anchor; Previous disabled/positive; Next disabled/positive                            | Public, Viewer and member; more than 24 eligible entries for positive paging              |
| Project detail           | Back; GitHub; optional deployment; upvote unvoted/pending/error/voted; comment empty/short/valid/error                                  | Member target initially unvoted; Viewer must remain read-only                             |
| Wizard entry/exit        | Project tab; Update project; first Back/close; later Back; restored focus; first-submission return to Team                              | Eligible leader; additional unpublished leader fixture for first-submission browser check |
| Wizard essentials        | Name, summary, description; invalid required fields; Next                                                                               | Eligible leader                                                                           |
| Wizard integrations      | GitHub validation; optional deployment blank; exactly six optional ecosystem checkboxes; independent mutually exclusive Cerebras radios | Eligible leader                                                                           |
| Wizard media             | Logo and banner change/remove; invalid MIME/size; valid original raster bytes; wrong logo/banner ratios rejected by server              | Eligible leader; synthetic writes enabled for server validation                           |
| Wizard final actions     | Accuracy disabled path; Save draft; final confirmation Cancel/Escape/commit; maximum three; exact retry                                 | Eligible leader with fewer than three commits                                             |
| Read-only project access | No enabled mutation action; existing saved unpublished fields retained; committed history Close/Escape                                  | Nonleader and third-attempt leader                                                        |
| Public privacy           | No private draft, team feedback, credentials, venue or hidden evaluation fields; score stage unchanged                                  | Anonymous and Viewer                                                                      |

The runner reports 29 case groups with per-device results, discovered control inventories, screenshots, denied requests and explicit `passed`, `partial`, `failed`, `blocked` or `unavailable` states. Missing roles, positive pagination or optional deployment are not grounds to claim those controls passed. Physical device testing is not claimed.

Five modes are available: `desktop-mouse`, `tablet-touch`, `mobile-touch`, `narrow-touch`, and `desktop-keyboard`. Touch contexts set both `hasTouch: true` and `isMobile: true`, and activate controls with `tap()`. Keyboard mode uses actual Tab traversal plus Enter/Space, verifies visible focus and types through keyboard events. File selection uses Playwright's file chooser input API with original valid fixture image bytes. No operating-system file picker or physical-device claim is made.

## Matching preview manifest

Root supplies a local JSON manifest after the timed load run and reset. Example structure, with hashes and reset token filled by root:

```json
{
  "disposable": true,
  "syntheticOnly": true,
  "origin": "http://127.0.0.1:4173",
  "source": "<40-character source SHA>",
  "worker": "<64-character Worker SHA-256>",
  "artifactRoot": "/home/param302/Dev/DDEHack-portal/.worktrees/visual-integration",
  "project": {
    "id": "visual_project_alice",
    "slug": "synthetic-alice",
    "name": "Small Wonder"
  },
  "mutationProject": {
    "id": "fake_control_project_00",
    "slug": "synthetic-control-00"
  },
  "actors": {
    "viewer": { "id": "fake_stranger", "email": "stranger@portal.test" },
    "member": { "id": "fake_bob", "email": "bob@portal.test" },
    "leader": { "id": "fake_alice", "email": "alice@portal.test" },
    "nonleader": { "id": "fake_review_one", "email": "review_one@portal.test" },
    "attempt3": { "id": "fake_eve", "email": "eve@portal.test" },
    "firstLeader": {
      "id": "fake_first_leader",
      "email": "first_leader@portal.test"
    }
  },
  "rootConfirmedReset": false,
  "resetToken": "<fresh root coordination token>"
}
```

The member must be eligible to engage and must not have voted on `mutationProject`; Bob already voted on Alice's rich fixture. `seedControlProjects(db)` from `scripts/control-project-fixtures.ts` adds 25 synthetic eligible entries, so `fake_control_project_00` is an unvoted target and positive paging is available. It never changes Alice, Eve or policy/windows. It copies the source team's pre-freeze timestamp for new memberships and the existing committed version timestamp for synthetic versions; it does not relax triggers. The helper requires rich seed and rejects reuse. Two in-memory SQLite regressions pass, including 24-plus-1 paging, source/settings preservation, an unvoted Bob target and missing-rich/reseed guards.

Read-only execution requires `V6_CONTROL_MANIFEST` and `--preview-ready`. All non-read requests remain blocked. Synthetic mutation execution additionally requires `--mutations`, `rootConfirmedReset: true`, and `V6_RESET_TOKEN` equal to the manifest token. Only loopback POST `/api/portal` actions `upvote-project`, `comment-project`, `save-project` and `submit-project` are allowlisted, restricted to the named member/project or leader. External links are activated only in an explicit link check and aborted before reaching their destination. Draft/media values and reset tokens are never serialized into the report.

Each mutation run uses the first selected device. Run `--device=desktop-keyboard`, `--device=mobile-touch`, etc. against a **fresh reset fixture per mode** to establish positive writes in every mode without treating an already-used vote or third-attempt lock as a new positive test. A default multi-device run performs all clean captures and read-only interactions but performs durable writes only in desktop-mouse mode. Optional `actorsByDevice` and `mutationProjects` manifest maps can identify separate synthetic fixtures, but they do not replace reset coordination.

Before any durable mutation, all selected clean role references are captured. The mutation phase holds and rejects one upvote locally to check single pending action and rollback, then exercises an actual vote and duplicate uniqueness, a short-comment rejection and literal-markup escaping, wrong image ratios, a draft save, remaining UI commits through attempt three, locked edit rejection and exact commit retry. Immutable payload hashes and attempts are checked through authorized local projections. The public score stage must remain unchanged. No AI or scoring action is allowlisted, and no production or external API request is permitted.

Remaining limitations must stay visible: real hosted identity is outside this local fixture; optional deployment needs a populated link; unpublished-leader exit needs an eligible first-submission fixture; physical touch and assistive technology are not established by browser emulation. Inspect matching screenshots individually before any visual acceptance or release claim.

## Matching 418f6311 read-only checkpoint

Source `418f6311c1e5a01831897b36f181eeda799c7911`, Worker `6e77794a8831ccb2594f3383171244b1dd9f4ec07c56633f1357ad101b4cfaf5`. Every browser was closed before root resumed integration. No mutation flag was used, and the manifest reset permission did not override the write hold.

Clean baseline: `evidence/v6-projects-submission/418f6311-LsHkx4/report.json`, 16 checks, 40 captures, zero page errors, zero write/external requests. The Next native-activation fix and focused wizard composition work across all four sizes. Clean wizard delivery originals are in `418f6311-DI2bUj`: step 3 was captured before the local validation exercise. The matching error-state screenshot is separately labelled, not offered as a clean reference. Readable viewport list originals and full detail originals are in `418f6311-6i09BT`, 12 checks and 24 captures. Representative desktop, mobile and tablet images were opened and compared with boards 04/06. Synthetic solid rasters remain fixture uploads rather than illustrations copied from the mockup.

Full read-only control report: `evidence/v6-project-controls/418f6311-VHCsa6/report.json`, 90 captures and 190 per-case records. Sixteen groups passed, optional deployment was partial because its field was blank, eight durable-write groups stayed blocked, and the unpublished nonleader browser path was unavailable because the supplied nonleader has a published project. Existing published nonleader content was checked against its authorized projection. There were zero page errors and zero writes; five deliberate GitHub activations were aborted before external navigation. Source tests separately cover the unpublished nonleader read-access regression.

Three groups failed in that bounded run. Stale client validation reproduced for essentials, GitHub and accuracy in all five modes; source correction `1b4543b` is prepared, and actual recovery assertions now await its matching build. Keyboard Cerebras selection used an incorrect harness assumption that every native radio is reachable by Tab; the runner now Tabs to the checked group member and uses Arrow keys. First-submission Back incorrectly asserted DOM removal, although the authorized draft intentionally remains inside the hidden Project panel; the assertion now checks visibility and eventual Team focus.

A separate corrected actual check in `evidence/v6-first-back/418f6311/report.json` passed first-submission entry and Back-to-Team focus in desktop mouse, mobile emulated touch and desktop keyboard, with zero errors or writes. Its mobile before/after originals were opened and inspected. Tablet and narrow first-Back assertions remain in the corrected full runner for the next matching build. None of these results establish durable vote/comment/save/commit coverage, hosted identity, physical touch or overall release acceptance.

## Targeted recovery and sequenced durable phase

`scripts/qa-projects-recovery-v6.mjs` is the short follow-up for the next hash-matched artifact. It runs six checks in each of the five modes, for 30 checks total: essentials recovery, GitHub recovery, native radio selection and Back state, accuracy recovery, published first Back/focus, and unpublished first Back/focus. It captures clean states before corresponding local validation exercises. It requires both named synthetic leaders and the matching manifest, and **rejects `--mutations`**. The manifest's reset flag cannot enable writes in this runner. Syntax and prepared-only guard were checked; no browser was started while root builds.

The durable full runner remains separately gated and starts only after root explicitly releases a fresh reset. Current fixture scope is Bob (`fake_bob`) engaging with `fake_control_project_00`, and Alice (`fake_alice`) saving/committing `visual_project_alice`, initially at two attempts. Before any write, read-only preflights confirm the target is unvoted and engageable, and that the authenticated leader's server-owned project ID and attempts match the expected fixture. An unexpected project/attempt stops the phase before writes. The default expected leader fixture is Alice/two; an explicit `leaderProject` (or per-mode `leaderProjects`) manifest entry is required for a different bound project/attempt.

Only POST `/api/portal` at the fixed loopback origin may pass, and only the four named actions: `upvote-project`, `comment-project`, `save-project`, `submit-project`. Read-only contexts retain their own blocked-write policy even during a durable run. No firstLeader, Viewer, nonleader, Eve, admin, review, scoring, AI, eligibility, credential or external action is allowlisted. Locally injected rejection requests and actual loopback-backend requests are distinguished in the report. Unexpected JavaScript alert/confirm dialogs are dismissed and reported as failures, preventing an escaped-comment regression from hanging the run.

The durable phase executes only the first selected device. With no device flag that is desktop mouse. Use a new root reset/release and matching reset token for each later touch or keyboard mode, so a previous vote or locked third attempt cannot substitute for a fresh positive test. Root must sequence admin review and project commits; Alice's final commit changes her current version and may remove that version from public eligibility until reviewed. This is not permission to test or change eligibility.

## Cloud V7 continuation, 23 October 2026

The preserved recovery/durable patch has been reviewed against the cloud checkout. Both project runners now resolve the locked local `@playwright/test` package and `/usr/bin/chromium` (or explicit `CHROMIUM_PATH`), and accept only a manifest-bound `http://127.0.0.1` origin with a nonprivileged port. Source HEAD and compiled Worker digest checks, exact synthetic actors/targets, reset token, action allowlist and one durable device per reset remain required. `visual-preview.mjs --port=<port>` creates an independent disposable database for each preview process.

Syntax checks and prepared-only exits pass. **Cloud browser recovery and positive project interaction runs remain unexecuted:** the supported Chromium sandbox is unavailable in this environment. No `--no-sandbox` workaround was used. Previous local recovery30/30 is historical evidence, not a matching cloud result. New `tests/combined-flow-v7.test.ts` covers a combined synthetic service/HTTP journey; those tests do not establish pointer, keyboard, touch, visual or physical-device coverage.

## Cloud browser continuation after approved sandbox execution

The initial browser blocker above was resolved by approved execution outside the nested executor namespace, with **Chromium's own sandbox still enabled**. No sandbox-disabling flag was used. The resulting evidence is scoped to the testing lane, not the final integrated release: build source `6e5e8432b4fff84895982a3396b59f7280bdd9ee`, reviewed185-file artifact, Worker SHA-256 `6ab766fc3843fec865504b9643b207c16cf56421877c7aad155021fce1d75d2b`. Later lane commits changed QA scripts/fixtures only.

- Recovery:30/30 checks passed across desktop mouse, desktop keyboard, tablet touch, mobile touch and narrow touch;40 actual captures, no page errors or blocked requests. Report: `evidence/v6-project-recovery/6e5e8432-xyLb4j/report.json`.
- Full guarded project matrix: desktop mouse26passed groups/1partial/2unavailable; desktop keyboard27/1/1; mobile touch26/1/2; zero failed groups in accepted runs, zero unexpected page errors or denied requests. The exact reports and source commits are listed in `evidence/v7-project-cloud-summary.json`. Each mode used a new disposable database/reset token. Actual writes exercised vote persistence/uniqueness/rollback, comments with literal escaped markup, draft persistence/stale rejection, the third commit, fourth-edit rejection and exact commit retry. Only the four documented actions and exact fake targets were permitted.
- One earlier keyboard run had an immediate hash assertion race, preserved in `evidence/v6-project-controls/6e5e8432-TYUQbw/report.json`. The read-only diagnostic confirmed Enter reaches `#comments`; QA correction `bca6211` waits for navigation. A full fresh-reset keyboard rerun passed. This was a harness timing failure, not a confirmed product defect.
- Separate optional synthetic fixtures close the full matrix's fixture gaps:6/6 GET-only checks passed for an optional deployment link and an unpublished authorized nonleader draft, across mouse/keyboard/mobile touch. The three reserved `.test` deployment destinations were blocked before external network; no write request occurred. Report: `evidence/v7-project-extra/473c1c1f-3VL5cm/report.json`.

These counts describe scoped interaction groups, not exhaustive product coverage or code coverage. Keyboard-specific groups are unavailable by design in pointer-only runs and are covered by the keyboard run. Physical devices, managed sign-in, hosted capacity, selected-board comparison and publication remain distinct. Only five captured originals were opened in this lane; their report entries are marked inspected. Screenshot binaries are ignored and preserved locally for Library delivery by the integration owner.
