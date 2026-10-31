# Backend-first compatibility and feedback phase — unpublished review

Published client reference: `0ab8d31bbfd5d3770f41d3a490fa22b615e91c35`. This is local source/mock verification, not proof of the deployed frontend, backend, schema or real submissions. No push/deploy is authorized for this checkpoint.

## Fresh calculation rules

- Votes: submission opening inclusive through the earlier of submission closing, calculation timestamp or owner freeze, exclusive.
- Scored feedback: submission closing inclusive through the earlier of calculation timestamp or owner freeze, exclusive.
- Participant feedback posting opens at the configured submission closing instant. Active admins/owner retain the timing exception. Missing/invalid submission windows deny participant posting.
- Public Showcase Comments uses `comment-project` / `project_comments`. The separate legacy `feedback` / `feedback` path retains its existing approved/check-in/other-team and immutable-score guards. Private `review-project` judging remains independent of the submission window until freeze.
- Comments after freeze can remain public but cannot change frozen marks. Previously stored policy fields, saved weights and frozen snapshots are not rewritten. Retired engagement dates/active flags do not secretly gate fresh scoring or the new phase.

## Preserved qualification; not a new points rule

Published source already implements `qualify-project-feedback`: authorized staff, before result freeze, records a current-version comment decision with a reason. `project_feedback_reviews` contains comment/version/rule identifiers, qualified flag, exact body hash, reviewer, reason and timestamp. Scoring accepts the matching latest review, applies the configured author audience and duplicate rules, and counts distinct qualifying authors. A changed comment, stale version/rule or unreviewed comment does not silently earn points. A negative review excludes it. No qualification control was found wired into the current app UI: this remains an operational gap, not authorization to invent auto-qualification. The 30-character posting minimum is retained provisional behavior; no new numeric decision is claimed.

## Old frontend → new backend

| Surface | Verified behavior / limitation |
| --- | --- |
| Draft/save/three committed attempts | Old payload accepted; current membership, ownership, removed/frozen integrity retained. Commit enqueues evaluation; an old client does not initiate the new follow-up action, so unattended processing requires configured native scheduler. |
| Votes | Old `{projectId}` remains accepted/idempotent. Database enforces actual submission window. New explicit toggle-off UI requires new frontend. |
| Judge marks | Old 1–10 payload remains accepted with explicit legacy default; new 0–100 clients send their scale. |
| Public comments | Old post payload accepted after close; staff timing bypass retained. Before close the new response disables commenting and mutation rejects. Old UI may call this paused and requires refresh at opening. |
| Team/admin reads | Existing DTOs and actual old Dashboard SSR covered by compatibility tests; no broader public/private profile permission granted. |
| Eligibility/auth | Existing approval/evidence/privacy and auth checks retained; no held public-eligibility bypass included. |
| Settings/Results | Retired pause/staged reveal actions fail closed. Old UI is NOT an unrestricted administrative bridge during staging. Do not use old Settings/Results controls in the transition. |
| Historical released results | Old hidden top-five positions remain hidden unless actually unveiled; already unveiled rows remain visible. A new combined-release audit establishes combined consent. Partial historical releases require explicit owner review; no automatic migration to all-public visibility. |
| New frontend → old backend | Unsafe: new vote fields, 100-scale judge contract and combined reveal actions are unsupported. Do not switch frontend first. |

## Migration and rollback limits

New append-only Neon `0114_post_submission_feedback.sql` follows existing `0112` and `0113`. Local SQLite `0035` and Sites Drizzle `0037` are parity migrations. The 19 prior Neon migrations/checksums remain byte-identical. The 20-entry plan digest is `7237ebe292938f17c8e51373b700cc12e4e8ce01f611e329ba76fc140305c92c`; 0114 SHA-256 is `3fde80ab7f197b0d7851210ec2ec3530eb70e3026b188c6b066a05e245771958`.

Migration changes DB vote/feedback guards immediately, even while an old backend is active. Therefore require a coordinated quiet window: guarded fresh target/ledger inspection and recovery checkpoint; apply only pending migrations with the current strict helper; deploy the matching verified backend; switch the matching frontend; verify role/phase/reveal paths before ordinary use. This is a conditional plan, not permission to execute it.

Rolling back backend code does not undo append-only migrations or trigger behavior. Never edit ledger/checksums, run downgrade SQL or use the old 17/19-entry migration helper against the 20-entry schema. Historical partially unveiled results need a separate owner decision before release. Existing real deployment/schema and GitHub/provider/scheduler configuration remain unverified.
