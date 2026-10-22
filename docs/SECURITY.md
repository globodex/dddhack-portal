# Security verification and release limits

The app has not been deployed. The supported Sites Worker, auth helpers, D1 declaration, migrations and production build are integrated and locally exercised; actual hosted ChatGPT authentication, Dispatch provenance and hosted D1 remain unverified. The production Worker returns **503** for protected data when trusted runtime configuration is absent. The local fake identity runtime is compiled out of that build; setting an environment variable on the production build does not enable it.

## Verified controls

- Owner status is computed from the verified server identity, not a client email, role field or submitted user ID. The raw identity-header adapter refuses unconfigured Dispatch trust. Same-origin relative auth return paths are enforced; platform auth routes are not recreated.
- Registration approval, owner/admin/judge checks and assigned-team checks live in the service, independent of frontend navigation. Participants cannot export staff lists, promote themselves, read another recipient's credits or publish results. Judges cannot access credit metadata or inventory, even their own.
- Local SQLite and local D1 tests exercise atomic batch rollback, team cap/single membership, idea lock, idempotent credit allocation and exactly-three committed submissions under concurrency. WAL worker threads additionally contend for the last team spot.
- A 200-distinct-session loopback HTTP rehearsal validates concurrent reads, deadline-side submissions, votes, check-ins and exhaustion. These measurements are not a hosted performance guarantee.
- AES-256-GCM protects stored fake values, with unique inventory fingerprints and unique recipient/type allocation constraints. Wrong ciphertext fails decryption. Secret values are absent from audit payloads, frontend code and safe exports. Production keys are neither created nor configured.
- Mutations require same-origin JSON and have a 600 KB streamed request bound plus per-account rate limits. CSV upload content is bounded and validated; imports require an actor-bound, expiring preview. CSV exports neutralize leading formula/control characters. UI content is escaped by React; no raw HTML renderer is used.
- Policies start unconfirmed. Scoring/publication requires explicit owner decisions. Unknown/failed AI evidence cannot make a deduction or an automatic zero. Staff approval is tied to a submission version; false-claim deductions require an actual claimed provider, evidence, named reviewer and approved policy.
- Result computation checks eligibility, minimum independent judge coverage, confirmed policy, feedback/vote eligibility and ties. Owner tie resolutions apply only to the exact tied score breakdown. Freeze checks the scoring revision atomically; snapshots and audit rows are immutable. Public APIs read only the published frozen snapshot.
- Historical v1 automated browser checks covered landing viewport fit, reduced motion, navigation, profile persistence, recipient reveal, role denials and safe export. Axe checks on the landing and guide return zero automated WCAG A/AA violations. This is not a full manual accessibility certification or physical-device performance test.

## Current Sites integration checks

`evidence/sites-production-smoke.json` distinguishes standalone rejection of forged headers/local cookies from an explicit synthetic Dispatch harness. It exercises the compiled Worker, D1-backed participant data, anonymous sign-in redirects, admin/export/credit permission denials and `no-store` responses. It does not verify real hosted sign-in. The unit suite also checks concurrent binding/identity isolation, migration trigger parity and owner-only draft initialization. URL slash aliases retain owner-only settings/permissions checks.

Browser QA and reference screenshots were unavailable in this turn: the computer tool exposes no browsers/apps and IAB launch reports unavailable. Prior v1 browser evidence remains historical; no new screenshot or visual-verification claim is made.

## Dependency audit: unresolved release blocker

`evidence/sites-dependency-audit.json` records the latest full dependency audit after supported Sites integration. The older `evidence/dependency-audit.json` is the v1 production-only audit and should not be treated as the current complete tree. The final complete tree reports **6 high, 4 moderate, 2 low, 0 critical** package-chain findings. The six high findings still propagate from the inherited `braces` chain; the moderate/low findings are in the Drizzle/esbuild/Wrangler toolchain.

The inherited `braces` stack-exhaustion chain remains unresolved; npm's suggested forced Vinext downgrade would abandon the current framework path and was not applied. Available `fflate` and same-major `sharp`, `undici` and `ws` fixes are pinned and retested. The supported starter's older build-tool dependencies still need a maintained patched path. No `npm audit fix --force` or unsupported downgrade was used.

The portal does not intentionally accept user-provided glob patterns or expose development tooling publicly. That limits the intended input surface, but full dependency reachability is not audited; remaining findings continue to block live release.

## Remaining integration/security work

- The supported starter/plugin is restored. Concurrent request-scope isolation, dynamic protected pages, permission denials and local D1 are tested. Verify real Dispatch header stripping/sole ingress, ChatGPT sign-in, revocation and hosted storage with authorized test identities. Never expose a header-trusting adapter directly on a public Worker origin. The trust flags are explicit server configuration, not cryptographic proof.
- Resolve all policy confirmations, including privacy/contact/retention and the final IST cutoff. Verify announced rules against settings before activation.
- Use a new production encryption key through Sites secrets only after explicit authorization. Rehearse secret backup, rotation and revocation. The zero-byte local key is clearly synthetic and must never be reused.
- Real AI/GitHub integrations are absent: add bounded safe fetches, DNS/IP/redirect SSRF defenses, prompt-injection handling, job leases/crash recovery, budgets and human approvals before enabling any network evaluator. The current application does not fetch submitted URLs or run uploaded code.
- Implement/rehearse exceptional check-in reversal, credit reissue, frozen roster corrections, active deadline extensions and result retraction before live operations that may need them. They are intentionally unavailable; direct SQL edits are not a substitute.
- Establish authorized hosted backups, restoration drills, observability, data deletion/retention tooling and operational ownership. The included backup helper accepts synthetic `.test` local databases only.

No actual credentials, external API spending, emails, production role grants or production-data imports were used. No hosted Site, Vercel project or Neon database was created.
