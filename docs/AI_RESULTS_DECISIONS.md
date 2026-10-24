# AI and results decisions after the design release

This is a decision inventory for the owner after the tested design push. It does not configure a provider, evaluate a real project, reveal results or change scoring policy.

## Already decided

- Reuse the existing portal OpenAI key. The selected model identifier is `gpt-6-astra`; no replacement key or model is proposed.
- Existing scoring weights remain unchanged. Submission eligibility, community upvotes, AI grading and private human judging are separate records.
- All authorized admins can judge. The reviewer-assignment UI and the long private final-rubric editor are removed as requested; their existing records are preserved.
- AI results remain private until explicitly revealed. Final scores come from a frozen snapshot. Top-five positions remain individually revealable in any order.
- The team has three committed submissions, with drafts consuming no attempt. Provider evaluation retries are a different limit.
- Saved gender chips are public within the existing authenticated discovery audience. Organization ID remains admin-only; phone/WhatsApp remain current-team/admin only.

## Configuration and verified limits

The new Neon `portalapi` runtime checks `OPENAI_API_KEY`, explicit `OPENAI_MODEL` and `PORTAL_OPENAI_EVALUATION_APPROVED=true`. These are backend Function variables; setting a frontend variable does not configure the evaluator. Preserve the existing key. The previous deployed source hardcoded the evaluation readiness label off, so that label alone did not diagnose the hosted credentials.

The implementation uses Responses API structured output with ten bounded rubric areas totaling30. It validates evidence, approved version/commit/digests, numeric bounds and the complete result before recording a score. Unknown or missing evidence leaves the score unavailable for review, rather than filling zero. No real paid evaluation was run. Local model configuration is absent and a read-only model-access check could not complete through this executor's network; account access remains unverified. Official model documentation supports the selected identifier, but does not establish this account's access.

## Remaining choices

| Choice | Actual current behavior | Recommendation |
| --- | --- | --- |
| Judging, feedback and appeal windows | Owner settings require real complete dates. None are invented by this release. | Choose actual event windows in Settings, save once, then verify the reloaded IST values. |
| Codex and collaboration marks | Final calculation still expects recorded Codex0–5 and collaboration0–10 marks. Removing their editor does not produce replacements. The remaining judge score is1–10. | Decide one compact way to record the two existing marks before freezing results. Preserve the current weights and distinguish submitted claims from verified evidence. |
| Failed or uncertain AI | An incomplete provider result has no numeric score. Existing authorized manual grading remains possible with its provenance. | Keep missing AI visible to admins and use explicit human review; never manufacture a score or treat missing evidence as zero. Confirm whether finals should wait for AI or allow that manual path. |
| AI reveal versus final freeze | The stage presentation suggests a sequence, but the backend also supports the existing manual final path without first revealing AI. | Keep AI reveal optional for manual finals unless the owner explicitly chooses a strict sequence. Do not silently tighten this policy. |
| Public project eligibility | A committed submission can exist before its repository eligibility is approved. The fixed event cutoff can reject earlier test repositories. Pending/ineligible entries are absent from public listings and have no Share/View success actions. | Retain eligibility protection and review actual repository evidence or use the existing explicit admin override. Do not auto-publish simply to make a link appear. |
| Live provider activation | Numeric integration and mocked tests are complete; hosted model access and a real authorized evaluation remain unverified. | After backend deployment, confirm model access and explicitly authorize one bounded real evaluation before running a batch. Preserve submitted data/version boundaries. |

No answer is needed to publish the bounded visual changes. These choices are required before claiming an operational AI/final-results workflow is complete. See [the private review UI specification](RESULTS_REVIEW_UI_SPEC.md) and [the Windows backend handoff](DESIGN_RELEASE_WINDOWS_DEPLOY.md).
