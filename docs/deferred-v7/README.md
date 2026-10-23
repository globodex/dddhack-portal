# Paused V7 drafts

These are inert recovery patches, not shipped code and not completed features. Preserve them when moving to Cloud. Review against the actual checkout before applying.

- discover-pagination-UNTESTED.patch: backend-only draft; no frontend cards/loader exists. No tests run. Known HTTP route regex typo must be corrected. Contract documented in CLOUD_HANDOFF_V7.md.
- admin-writes-UNRUN.patch: static runner corrections only; uncommitted in old lane and never executed. Fresh disposable reset and allowlist audit required.
- team-write-guard-PREPARED.patch: reset manifest binding and prepared input checks; no positive write run. Local absolute paths and browser imports must be adapted to the actual cloud environment.
- project-recovery-and-writes-PREPARED.patch: targeted recovery runner passed30/30 on0e07 snapshot; durable write groups remain unrun. Cloud must not assume prior /tmp fixtures/caches exist.

No credentials, production database exports or dependency/build caches are included. Do not apply all patches automatically or infer tests passed from filenames.
