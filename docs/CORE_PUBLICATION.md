Current: public version5 is published. See [PARALLEL_CORE_PUBLICATION.md](PARALLEL_CORE_PUBLICATION.md). The version4 checkpoint below is historical.

# Reviewed core release published

**Version 4 succeeded** at https://dddhack-portal.param3021.chatgpt.site with public access preserved.

- Project: `appgprj_6ad9ec4bea6c8191b2bb155de7fe00ed`
- Published source: `3b5c7251b43afdbab9abd1b6fc40468dde85e70d`
- Saved version: `appgprj_6ad9ec4bea6c8191b2bb155de7fe00ed~appgver_26bf9d391bb48191944268955928c4c5`
- Deployment: `appgdep_6adb58cb35f4819190925caa4e33e298`
- Runtime configuration: revision **3**, preserving the user-added OPENAI_API_KEY secret and existing managed Sites identity settings.
- Native terminal result: `succeeded`, 23 October 2026 at 12:53:40 UTC. Archive contains 131 files.

This publishes the revised core plus managed-route logout, mutation confirmations, staged admin reveals, owner deadline-extension/global-weight previews and the latest confirmed event defaults. See SESSION_AND_REVEALS.md for behavior and limits. Plain green New Delhi remains; no generated art or unavailable host photo was substituted.

## Verification

41 regression tests, TypeScript, official Sites production build/artifact gate and compiled Worker smoke checks passed before publishing. Source was committed and pushed to GitHub, then pushed/verified by the official helper to the existing Site repository. The exact built archive/source was saved and deployed.

Post-deployment native reads confirm public version 4 and all **45 expected application tables**, including new profile/project/review, event content, policy history and reveal structures. Event settings, AI runs, score releases, winner reveals and policy history are empty. Publication did not initialize/activate an event, reveal scores, modify roles, import data, create a credit key or call AI. Schema migration application is supported by the successful deployment plus table inventory; native tools do not expose the hosted migration ledger/trigger definitions for direct inspection. Local D1 migration/constraint parity tests passed.

The approved short-lived source credential was used through hidden stdin and discarded after publication and verification. It was not logged, committed, saved in a remote URL or persisted to plaintext. No supported secure persistence mechanism was available.

## Limits and next work

Interactive ChatGPT sign-in/logout/session longevity, visual comparison and device QA are **not verified** on this local executor; it exposes no browser surface. Production HTTP checks are represented separately by the isolated compiled Worker harness. Earlier denied executor HTTP routes were not retried or bypassed. Native deployment success verifies publication, not an interactive login.

Event activation/final scoring still requires the remaining documented rubric/normalization/operating-window confirmations. The five newly supplied choices are implemented: no strict participant cap; roster and whole-idea lock together October 29 at 23:59 IST; November 1 at 16:00 IST with owner extension; manual top-five reveal order; base maximum 105 with global owner weight controls. Their defaults remain inactive until explicit event setup; do not infer approval of unrelated decisions.

AI evaluation remains Not configured. There is no verified durable queue/cron consumer and no provider call was made. Stage buttons fail closed without the required persisted evaluations, confirmed policy, current frozen snapshot and explicit intent. During manual unveiling, other final positions stay undisclosed until all top-five awards are public, to avoid identifying hidden winners by elimination.

Existing inherited dependency findings remain 6 high and 4 moderate in build tooling; the 131-file artifact reachability gate passed. See DEPENDENCY_REACHABILITY.md. Host image downloads remain blocked by 403 and Shivay’s full surname remains unverified. Those follow-ups and unapproved artwork did not block this authorized core release.

Native evidence: evidence/core-publication-v4.json. Local checks: evidence/stages-*.log and evidence/sites-production-smoke.json.
