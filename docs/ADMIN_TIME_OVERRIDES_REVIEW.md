# Local admin testing, team corrections and dashboard arrival review

Unpublished review batch. No hosted database, function deployment, settings, credentials or participant data were changed.

## Implemented behavior

- Team Sizes offers Total, Locked, Approved, Submitted and Not yet submitted distributions over the entire active authorized collection. Categories overlap and do not follow list filters. Approved means all current members have approved registrations; attendance does not revoke approval. Submitted means at least one committed attempt, including preserved hidden history. Not yet submitted is its complement, including forming teams.
- Dashboard personal attendance appears once above the team content. The arrival card uses only the existing authenticated server projection. Private venue remains limited to approved Going/Checked-in participants and admins/owner; Registered, Absent, Viewer and anonymous audiences do not receive it. Team approval alone grants nothing.
- A current, active admin/owner who is the actual member-leader of their own team can view the submission form and save/commit outside a correctly configured submission window. This exception changes time gating only. Profile completion, check-in, media validation, eligibility, frozen results and the three-attempt cap remain in force. The UI labels the exception explicitly rather than claiming that the window is open.
- The same admin leader can remove their own test project outside the window with confirmation. This uses recoverable project removal: committed history and attempts remain unchanged. It is not a permanent deletion or an attempt reset. Existing explicit admin restore is required to edit a removed project again.
- Admin unlock no longer uses participant deadlines. Submitted/consumed-attempt and frozen-result barriers remain. Unlocking after the deadline does not reopen participant editing. Admin lock, add-member and status corrections retain their existing independent admin checks.
- Admin member removal has a dedicated endpoint and confirmation, including for locked teams after cutoff. It removes only a nonleader membership. The participant account, roster, idea, lock and history are preserved. Leaders require an explicit leadership transfer first.
- Post-event absence reconciliation now uses conditional idempotent audit inserts supported by PostgreSQL instead of SQLite-only `changes()` expressions. No attendance policy or cutoff changed.

## Schema and deployment implications

Append-only `0108_admin_testing_and_team_corrections.sql` updates two trigger functions for exact, transaction-bound admin capabilities. No tables or stored participant data are changed. All published SQL through0107 and the seven historical Windows checksum aliases stay unchanged. SQLite/D1 and Drizzle mirrors are included.

The guarded upgrade accepts the exact canonical fourteen-entry source plan and existing LF or proven historical CRLF prefixes. A fresh populated inspection and truthful verified-recovery checkpoint remain required. Never paste raw DDL while bypassing the migration ledger.

The complete batch requires the frontend, matching backend code, and0108 plus the later0109 owner-model follow-up. Team-size analytics requires backend code but no separate migration; the arrival layout is frontend-only and reuses existing privacy filtering. Nothing in this branch deploys automatically: publication is held.

## Evidence locations

Screenshots are synthetic and outside Git:

- `/workspace/team-size-review/screens/`: all five selections at1440px and390px; browser assertions also cover768px and320px.
- `/workspace/dashboard-top-review/screens/`: Going, Checked-in, Registered, Absent and admin dashboard variants at1440px and390px; assertions also cover320×480, Viewer, and logout/account switching.
- `/workspace/admin-time-review/screens/`: actual admin/ordinary participant submission comparison (final browser report records completion).

No screenshot files or real private venue details are included in Git. Native Library delivery is blocked by the previously denied prepared-upload helper authentication route (HTTP401 at tools/list); no retry, alternate upload or public hosting is authorized in this batch.

Final test/build/package receipts will be recorded after completion. PGlite validates real PostgreSQL SQL/trigger behavior with one connection; it is not evidence of native multi-connection concurrency.

## Owner-only AI model and prospective usage follow-up

Owner access: Administration → Settings → Results → AI model. Only the owner receives this configuration and its statistics. Other administrators retain evaluation controls and numeric/evidence access, but model names and model-bearing evaluation config keys are stripped from their project/job response projections.

The owner can save a syntactically valid OpenAI API model ID with a revision-checked confirmation. This takes precedence over the unchanged `OPENAI_MODEL` backend default for subsequent evaluation requests. Saving does not call the provider, verify account/model support, alter credentials, change existing scores or change reveal policy. An in-flight evaluation retains its captured selection. Existing explicit provider enablement and approved-source requirements remain.

Append-only0109 creates `ai_model_settings` and `ai_provider_usage`. Every PostgreSQL mutation retains the SERIALIZABLE guard. Usage rows contain provider response ID, opaque version reference, requested/actual model IDs and optional integer token fields—never prompts, outputs, participant contacts, source text, API credentials or credit codes. The opaque version reference intentionally outlives project deletion as an accounting reference, without a foreign key blocking existing terminal deletion.

The section counts returned provider telemetry for the selected requested model, not all account/project billing. It includes recorded incomplete/invalid rubric responses, because those can still consume tokens, and deduplicates response IDs. Missing values stay unavailable; actual reported zero stays0. Partial fields show their response coverage. Cached input is a subset of input and is never added again to total tokens. Historical usage was not recorded and is not reconstructed. Failed requests without returned telemetry and telemetry storage outages are not complete billing records. A statistics write failure does not cause another paid request.

Charged cost stays unavailable: no verified account-cost data or versioned pricing receipt exists in the current integration. No price estimate or fabricated0 is displayed. [OpenAI Responses usage reference](https://developers.openai.com/api/reference/python/resources/responses/methods/create/) documents the provider token fields.

The combined plan has fifteen entries, digest `129ae4bc6c20a817b883d68229ee51a73a41998140b9bead2f4309a1c1b7b227`. A target already through0107 should inspect as exactly0108 and0109 pending; an already applied migration must not be replayed. Owner-run guarded inspection/recovery verification/apply and matching backend deployment remain future actions after publication approval. There was no hosted inspection/apply or paid provider call by this agent.

Actual synthetic owner-settings screenshots: `/workspace/owner-ai-review/screens/owner-model-1440.png`, `owner-model-390.png` and their `owner-settings-*` viewport variants. Browser assertions cover1440×1000,390×844 and320×480, model changes with confirmation, unknown versus recorded counts and account switching to a nonowner administrator.

## Final local validation

Runtime source `63075adf6e309877803af1d66fa0d4273b29be88`; later package/test-fixture/receipt commits leave all application, API, schema and migration CLI inputs unchanged. The final clean full run completed1008 tests:1001 passed,7 skipped,0 failed/cancelled/todo. Production build and typecheck exited0. Native multi-connection PostgreSQL remains skipped; PGlite is single-connection evidence.

All changed interfaces have actual desktop/mobile synthetic browser captures; Team Sizes additionally covers768px, and all changed surfaces are checked at320px.28 originals, manifest and screenshot ZIP remain outside Git at `/workspace/portal-review-20261028/`. No image upload or native LibraryID is claimed.

See [structured validation receipt](../evidence/admin-time-override-api-release/validation.json) and [future Windows rollout](ADMIN_OPERATIONS_AI_WINDOWS_ROLLOUT.md). The packaged API has93 entries,98 exact application inputs and all92 dependency/native files unchanged from the published archive. ZIP SHA256: `a63f43009afc8df75f7d29783ed8e44759740aaf4ea4d003034bed59bf4834a0`. No agent hosted migration/deployment, paid evaluation, credential change or publication occurred.
