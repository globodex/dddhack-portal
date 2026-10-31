# Post-close feedback and backend-first review — final validation

Unpublished branch `review/backend-first-compat`. Runtime `5eff3da382f734ac9e47a8ea68976710b5a13fe7`; matching package commit `2b627e8262e34c005ae7fdc717e6cd8396cd6203`. All later changes are reports/artifacts, not tested application edits.

- Fresh final aggregate: **1,130 total; 1,123 passed; 0 failed; 0 cancelled; 7 skipped**. Duration757755.343619ms. Optional native PostgreSQL multi-connection tests were skipped; PostgreSQL SQL/transaction tests ran on PGlite.
- Previous baseline:1,129 total;1,107 passed;15 failed;7 skipped. The15 were outdated migration count/suffix expectations(8), a bulk-comment fixture(1), and deletion-enrichment feedback fixtures(6). They were corrected to create data in valid phases and expect the exact append-only20-entry plan; assertions on data preservation, transactions, permissions and counts remain. This earlier run is not represented as passing.
- New stale-settings fence and affected backend tests:37passed. Typecheck and final production Webpack build passed; no lint script exists.
- Actual synthetic browser checks1440/390/320: participant pre-close composer absent and API409, fresh server boundary/focus refresh opens feedback, Ctrl+Enter saves with no popup, staff can post beforeclose; no horizontal overflow or page errors. Project media serving is not part of the fixture: missing media icons are not hosted evidence.
- Additional canonical-owner check passes in SQLite and PGlite with participant DBrole/no admin override. No real person, login/provider, production DB or paid evaluation used.
- Rebuilt archive/source graph exact:116application inputs, no fixture/env/app inputs; all93 payload hashes/lengths verified,92 dependency entries unchanged. Both native dependencies are LinuxARM64ELF; host smoke uses unchanged JS with x86 dependency substitution, so ARM64 execution is NOT verified. Health200/untrusted403/unconfigured503; zero outbound attempts.
- Incremental Git bundle round-trip verified from published0ab8d31 base to exact package commit. Windows guide Node blocks executed on Linux; native PowerShell/.NET commands syntax-reviewed, not executed. No main/review push, hosted deployment/migration, credential change, provider call, automatic qualification or live data repair.

## Artifacts

ZIP `698f74cbcc72cabc9b998b31e85791dc1ccd5952f1df14243ac0430106df5831`; entry `b966eecbad19df0052eaa45e3ae0e7497b7d9da7ee2bab922e114486e01a6a57`; receipt `d881e5fe0210be25c66deab6df006282e9452ea00c78a69e12c530cfcc18ba03`; verification `bfb0418e40b512fc33926eea5426e6f62ddf189530676d9d236ecb1d86a3ea5f`.

Source bundle `2452d44021f548123a6fa0bf8021f27e82005221e92b9e4015e0aae76d547519`,2,283,784bytes. New0114 SHA `3fde80ab7f197b0d7851210ec2ec3530eb70e3026b188c6b066a05e245771958`;20-entry plan `7237ebe292938f17c8e51373b700cc12e4e8ce01f611e329ba76fc140305c92c`. All19 earlier SQL files and seven historical aliases preserved.

## Unresolved release/operation gates

No unrestricted zero-downtime compatibility claim: new frontend is incompatible with old backend; source acquisition uses local Git bundle before any main publication. Stale old-client policy/pause/reveal/freeze writes fail closed on the new backend. A coordinated quiet window or separately approved enforced maintenance gate is still required. Partially unveiled legacy results need owner review; no historical expansion of public visibility.

Scored feedback has an existing manual qualification rule but no wired review UI; an in-window unresolved author can block freeze/reveal with `ENGAGEMENT_REVIEW_INCOMPLETE`. Proposed existing-rule review UI and alternative automatic scoring are decisions, not implemented. Questions scoring weight/formulas/caps/overlap remain unresolved; saved weights stay. Feedback30-character minimum is retained provisional behavior. Provider/GitHub/native scheduler owner setup and hosted verification remain pending; no credentials configured. See the decision report and guarded Windows guide.
