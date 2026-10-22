# Security verification and release limits

The tested app is local-only. It must not be described as fully functional in production: hosted ChatGPT authentication, Dispatch provenance, D1 wiring and Sites packaging remain unverified. The production build returns **503** for unwired APIs. The local fake identity runtime is compiled out of that build; setting an environment variable on the production build does not enable it.

## Verified controls

- Owner status is computed from the verified server identity, not a client email, role field or submitted user ID. The raw identity-header adapter refuses unconfigured Dispatch trust. Same-origin relative auth return paths are enforced; platform auth routes are not recreated.
- Registration approval, owner/admin/judge checks and assigned-team checks live in the service, independent of frontend navigation. Participants cannot export staff lists, promote themselves, read another recipient's credits or publish results. Judges cannot access credit metadata or inventory, even their own.
- Local SQLite and local D1 tests exercise atomic batch rollback, team cap/single membership, idea lock, idempotent credit allocation and exactly-three committed submissions under concurrency. WAL worker threads additionally contend for the last team spot.
- A 200-distinct-session loopback HTTP rehearsal validates concurrent reads, deadline-side submissions, votes, check-ins and exhaustion. These measurements are not a hosted performance guarantee.
- AES-256-GCM protects stored fake values, with unique inventory fingerprints and unique recipient/type allocation constraints. Wrong ciphertext fails decryption. Secret values are absent from audit payloads, frontend code and safe exports. Production keys are neither created nor configured.
- Mutations require same-origin JSON and have a 600 KB streamed request bound plus per-account rate limits. CSV upload content is bounded and validated; imports require an actor-bound, expiring preview. CSV exports neutralize leading formula/control characters. UI content is escaped by React; no raw HTML renderer is used.
- Policies start unconfirmed. Scoring/publication requires explicit owner decisions. Unknown/failed AI evidence cannot make a deduction or an automatic zero. Staff approval is tied to a submission version; false-claim deductions require an actual claimed provider, evidence, named reviewer and approved policy.
- Result computation checks eligibility, minimum independent judge coverage, confirmed policy, feedback/vote eligibility and ties. Owner tie resolutions apply only to the exact tied score breakdown. Freeze checks the scoring revision atomically; snapshots and audit rows are immutable. Public APIs read only the published frozen snapshot.
- Automated browser checks cover landing viewport fit, reduced motion, navigation, profile persistence, recipient reveal, role denials and safe export. Axe checks on the landing and guide return zero automated WCAG A/AA violations. This is not a full manual accessibility certification or physical-device performance test.

## Dependency audit: unresolved release blocker

`evidence/dependency-audit.json` records the current `npm audit --omit=dev` result: **6 high, 0 critical, 0 moderate** package-chain findings. They propagate from a `braces` stack-exhaustion advisory through `micromatch`, `fast-glob`, Vinext's dynamic-import/CommonJS plugins and `vinext`. npm reported `braces@3.0.3` as the latest available version at inspection; the advisory includes it. The suggested forced Vinext downgrade would abandon the current supported framework path and was not applied.

The affected chain is used by framework build tooling; the portal does not intentionally pass user-provided glob patterns to it. Full framework reachability was not audited, so these findings remain a live-release blocker rather than being dismissed. A separate patchable `fflate` advisory was removed using a pinned `0.8.3` override; the resulting app tests and build pass. No `npm audit fix --force` or unreviewed version downgrade was used.

## Remaining integration/security work

- Restore the current supported Sites starter/plugin and verify its auth/header boundary, dynamic protected pages, no shared identity cache and hosted D1 behavior with authorized fake identities. Never expose a header-trusting adapter directly on a public Worker origin.
- Resolve all policy confirmations, including privacy/contact/retention and the final IST cutoff. Verify announced rules against settings before activation.
- Use a new production encryption key through Sites secrets only after explicit authorization. Rehearse secret backup, rotation and revocation. The zero-byte local key is clearly synthetic and must never be reused.
- Real AI/GitHub integrations are absent: add bounded safe fetches, DNS/IP/redirect SSRF defenses, prompt-injection handling, job leases/crash recovery, budgets and human approvals before enabling any network evaluator. The current application does not fetch submitted URLs or run uploaded code.
- Implement/rehearse exceptional check-in reversal, credit reissue, frozen roster corrections, active deadline extensions and result retraction before live operations that may need them. They are intentionally unavailable; direct SQL edits are not a substitute.
- Establish authorized hosted backups, restoration drills, observability, data deletion/retention tooling and operational ownership. The included backup helper accepts synthetic `.test` local databases only.

No actual credentials, external API spending, emails, production role grants or production-data imports were used. No hosted Site, Vercel project or Neon database was created.
