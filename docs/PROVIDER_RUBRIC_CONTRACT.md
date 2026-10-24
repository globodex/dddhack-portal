# Provider rubric contract

The provider receives the existing approved snapshot only: version, commit, selected descriptions and explicitly selected source files. Participant payloads, contacts, credentials, voucher values and unrelated profiles stay excluded.

The strict `portal_project_rubric_v2` response requires exactly ten unique area observations. Each observation has a nullable score, status, concise explanation and bounded citations. Numeric scores require `SCORED` and valid approved evidence. `UNKNOWN` and `NEEDS_MANUAL_REVIEW` require `score: null`; missing evidence never becomes zero.

The existing dimension caps remain functionality 6, complexity 5, OpenAI 4, Cerebras 2, UX 3, docs 2, contributors 2, deployment 2, readiness 3 and SEO 1, totaling 30. Global result weights are unchanged. All ten validated numeric areas produce a local `finalized` report; incomplete or legacy evidence-only output remains `needs_review` with null dimensions. Public score release, eligibility and penalties remain separate server decisions.

The mapper revalidates snapshot approval, selected-file digests and exact version/commit binding. It rejects unknown fields, duplicate or missing numeric areas, nonfinite/out-of-range scores, unapproved citations, sensitive text and substantial source copying. Tools remain disabled, `store` remains false, and payload/output limits, retry rules and timeouts remain unchanged.

The schema follows the official Structured Outputs requirements for required fields, nullable values and closed objects, using supported nested `anyOf` area branches. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Verification uses injected mock responses and synthetic credentials only. No live provider request was made. The local environment has no `OPENAI_MODEL`; model configuration remains required before live evaluation. No key or environment setting was changed.
