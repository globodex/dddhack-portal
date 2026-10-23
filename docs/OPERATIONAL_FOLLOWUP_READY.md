# Tested operational setup follow-up

Candidate runtime source: `811890d`, with the compiled Worker regression added alongside this checkpoint. This follow-up contains the reviewed filtered participant export (`a2c7dd7`), owner operational setup (`01c6101`), and verified content (`811890d`). It has not been deployed. Public version 5 remains source `f1a4b3db83e2263170e8b5fb4738b18f0e218b8d` using runtime configuration revision 3.

## Included

- Owner Settings can preview and save explicit submission/check-in rules and indefinite-retention confirmations. Fresh setup is inactive; separate confirmed enablement is required for each scope. Unresolved judging definitions stay unconfirmed and do not block registration, profile, teams or operational readiness.
- Participant CSV matches the combined status/team/search filters and table ordering, supports explicit bounded pagination or all matches, protects staff access and excludes private fields and credit secrets. Spreadsheet cells are formula-safe.
- Profile description uses the six verified Luma choices. Saved legacy values remain preserved without becoming invented dropdown options; all socials remain optional.
- Three verified organizer photos are local public assets. Shivay Lamba has his confirmed name and a labelled photo placeholder. Private venue values have not entered source, artifacts or live settings.

## Verification

- Full regression suite: **126/126 passed**, no skips or failures.
- TypeScript: passed.
- Official production build and artifact review: passed, **173 files**, no unresolved imports or dynamic import expressions. The previously documented dead React development import remains guarded by a production-false function and is recorded in the artifact report.
- Compiled Worker HTTP regression: owner preview/save **200**, unchecked privacy **422**, participant setup **403**; setup does not enable either operation. A valid operational submission succeeds while judging is incomplete; scoring remains **409**. Check-in remains **409** until separately enabled, then succeeds in the disposable local harness.
- Independent bounded audit: no new findings, **14/14 focused tests**, including concurrent save rejection and scope isolation. See `PARALLEL_SECURITY_AUDIT.md`.

All runtime tests use disposable synthetic local D1 records and synthetic managed-ingress identity headers. They are not evidence of an interactive ChatGPT login, browser visuals, mobile-device behavior or live owner configuration. No supported browser is available in this executor.

## Owner setup after publication

Follow `OWNER_OPERATIONAL_SETUP.md`: Settings → Operational setup → choose operation → explicitly acknowledge both statements and supply a reason → Preview → Review and save confirmations → confirm the custom dialog. Then use the separate Enable control for that scope, with its own reason and confirmation. Repeat for the other scope. Saving configuration alone never enables operations.

Private arrival details require the existing authenticated owner or specifically authorized operational venue admin to save and publish the private draft. Use the already supplied private values and floor correction from the trusted conversation; no values need to be supplied again. A source-write credential cannot substitute for that application session.

No live policy, role, roster, private venue, credit allocation, scoring reveal or API evaluation was changed. Another publication requires fresh action-time approval for one short-lived credential restricted to the existing Site source repository; no credential was created for this follow-up. Preserve the existing secret configuration revision when publishing.
