# Automatic evaluation: remaining implementation and operator setup

This is a plan, not a completed worker or deployment receipt. No real repository or provider evaluation was invoked in this review.

The committed submission already creates a durable pending job. The new timing collector performs only bounded public GitHub metadata reads through an injected transport: fixed GitHub API host, no redirects or credentials, head-pinned history, size/time limits, and old-date versus pending classification. It is not connected to submission processing yet. The existing provider still needs an approved immutable selected-file snapshot. The existing bounded processor is an explicit staff request, not an unattended queue drainer.

## Safe processing design

1. Keep submission commits fast and durable; show saved/pending immediately. Process only the current committed version, retaining older history and project-level votes/comments.
2. Implement one shared, narrowly scoped processor with atomic leases, bounded attempts/backoff and current-version/removal/freeze checks before and after network work. Do not give arbitrary nonleaders authority or impersonate an interactive owner action. Record automation provenance and the originating commit separately in audit data.
3. Bind repository timing evidence and conservatively selected safe text files to the observed immutable SHA and version. Provider/repository errors stay pending/retry; only verified old creation/first-commit dates reject. Never send member gender/sex counts to a model or use them for eligibility/prize ranking.
4. A post-commit authenticated own-project request can start work without blocking the submission response. A durable scheduled fallback must recover missed browser requests; a browser-only fire-and-forget request is insufficient.
5. Native Neon scheduled Function Triggers are a supported operator option. Current official docs say their invocation header is platform-attested because client-set X-Neon headers are stripped at ingress. The worker must still bind the configured trigger, validate its envelope, deduplicate occurrences and preserve job leases; generic HTTP routes must not trust a user-supplied header. Trigger setup, enabling and actual paid provider runs remain owner-operated after tested publication. None have been configured here.

Official references checked during this review:
- https://neon.com/docs/compute/functions/triggers/schedule
- https://neon.com/blog/neon-functions-backend-logic-next-to-your-data
- https://docs.github.com/en/enterprise-cloud%40latest/rest/commits/commits
- https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api

## Product decisions still needed

- Combined owner capture/reveal is now implemented with unchanged coverage checks and an explicit warning that confirmation locks judging/evaluation/submission edits. It does not automatically reveal at submission close.
- Questions responses is a separate intended category; its weight, scorer, per-question caps, aggregation/missing-answer and overlap rules remain unspecified. Existing weights/formulas are retained.
- Feedback minimum30 remains provisional interpretation, not a claimed explicit numeric approval.

The old staged AI-only reveal and top-five UI are removed in the local revision. This does not authorize publishing the unfinished replacement or changing hosted settings.
