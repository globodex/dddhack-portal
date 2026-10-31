# Automatic evaluation: local implementation and owner-operated setup

This is an implementation checkpoint, not a hosted deployment or paid-evaluation receipt. Synthetic injected transports were used; no real repository/provider evaluation or hosted trigger configuration was performed.

## Current flow

1. A successful submission commits an immutable version and durable pending job, with three total committed attempts. The current browser then makes a separate authenticated own-project start request. Commit success does not depend on that request completing.
2. The shared processor authorizes the exact current active leader/member and version, atomically leases work, checks removal/freeze/current-version state around network work, bounds retries and recovers expired leases. Superseded results cannot replace the current version. Project-level votes/comments survive version updates.
3. Fixed-host bounded GitHub metadata checks compare creation/oldest observed commit dates with **1 November 2026, 08:00 IST (02:30 UTC)**. Known older dates reject; unavailable/private/rate-limited evidence remains pending. Equality is allowed. API errors do not establish ineligibility.
4. A deterministic bounded selection of safe UTF-8 source files is pinned to the observed commit and verified blob hashes. Credential-shaped text is excluded. An immutable separately recorded selected-file snapshot binds provider input to the version and commit. Participant contact/demographic fields are not sent.
5. Provider results are accepted only with existing validated report/rubric/snapshot provenance. A real zero is valid. No offline placeholder becomes a provider grade. Repository-negative outcomes do not call the provider. Revoked snapshots are not silently reselected.
6. Pending/running/retry/old-repository/completed states are shown without scores. AI and total scores remain server-filtered until explicit owner combined reveal. Submission close does not reveal scores.
7. The owner previews current readiness, then confirms one capture/reveal operation. It rechecks policy, revision, coverage, version bindings, expiry and ties and atomically captures/releases the canonical result set. Failure rolls back; repeat confirmation is idempotent. Unfinished jobs stop at that immutable boundary.

## Durable recovery setup — owner operation after approved publication

The backend also handles **POST `/api/evaluation/automatic-tick`** through native Neon scheduled Function Triggers. Configure a scheduled trigger for the existing function with this path, then configure **PORTAL_EVALUATION_TRIGGER_ID** to that trigger's exact ID. Existing provider configuration and **PORTAL_OPENAI_EVALUATION_APPROVED=true** remain required; this work changes none of them. Use a minute-level schedule supported by the provider and review actual usage/cost before enabling.

The handler is Neon-entrypoint-only: it relies on Neon's documented stripping of client-set `X-Neon-*` headers. It additionally validates the platform invocation ID, configured trigger ID, versioned schedule envelope, bounded request size and owner setup. It records a durable per-occurrence receipt, selects current jobs only, respects retry backoff/expired leases, and attempts at most three jobs per invocation, counting direct failures toward that bound. It does not start a process daemon or trust that header on arbitrary HTTP hosting. Native ingress attestation and actual hosted scheduling have not been tested locally.

The authenticated browser start can process jobs without a schedule, but a schedule is necessary for reliable recovery when a browser closes or its request is lost. No schedule was created or enabled here. No new worker-specific SQL migration is required; existing job/evidence/snapshot/audit tables are reused. This combined revision also retains the separate appended **0113_submission_vote_window.sql** migration; previous migration files/checksums stay unchanged.

## Scoring and approval decisions still outstanding

- Automatic source evaluation produces the existing AI rubric grade. It does **not** fabricate separate collaboration/Codex marks from missing evidence or demographic composition. Those canonical categories still require existing valid assessments before full-score readiness. A nondemographic collaboration rubric/source-attribution policy needs an explicit agreed rule before replacing those assessments.
- Questions responses is a separate intended category; its weight, scorer, per-question caps, aggregation/missing-answer and overlap rules remain unspecified. Existing weights/formulas are retained.
- Feedback minimum 30 remains a provisional interpretation, not a claimed explicit numeric approval.
- No protected-trait scoring or demographic counts are sent to the provider.

Official references checked during implementation:
- https://neon.com/docs/compute/functions/triggers/schedule
- https://neon.com/blog/neon-functions-backend-logic-next-to-your-data
- https://docs.github.com/en/enterprise-cloud%40latest/rest/commits/commits
- https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api

Ready prior comment/share checkpoint `ed80cc5372be94bab46c491e0295dc343e271e71` remains in ancestry. Older provisional packages do not include this worker. A matching package must be generated only after final revision validation. Nothing in this note authorizes publication, hosted configuration or live data changes.
