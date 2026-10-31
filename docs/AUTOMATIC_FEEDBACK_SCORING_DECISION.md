# Feedback scoring decision — read-only proposal, not implemented

A fixed posting-length check and scoring qualification are different rules. Removing staff qualification is feasible without changing saved numeric weights or normalization targets, but it changes which feedback earns points and therefore can change live totals. It needs explicit owner approval, not a silent bug fix.

## Existing rules

- Current public path: `comment-project` → `project_comments`. Non-staff must pass existing roster/profile authorization. Project must have an eligible committed version. Participant posting begins at submission close; active admins/owner bypass timing. Public posting uses trimmed code-point minimum30 and existing maximum1500. This minimum remains the retained provisional numeric interpretation.
- Current scored public feedback additionally requires the saved `engagementQualification`: audience `all-signed-in`, `other-team`, or `approved-checked-in-other-team`; current submission version, rule version and exact comment body hash; positive staff review; declared scoring length bounds (currently at least30 and policy maximum up to500).
- Self-team comments are permitted publicly; their scoring depends on audience. `other-team` and `approved-checked-in-other-team` exclude current own-team members; `all-signed-in` does not. Do not conflate own-team vote check-in rules with comment rules.
- Count distinct qualifying authors per project/current version, not every comment. Multiple comments by one author cannot multiply their feedback credit.
- Duplicate mode `staff-reviewed` has no extra automatic copy exclusion; staff makes the recorded decision. `exclude-exact-normalized-copies` lowercases, trims and collapses whitespace, hashes the result and excludes a previously counted identical normalized body, in stable comment order. This does not detect paraphrases or coordinated accounts.
- Scored time cohort is [submission close, min(calculation time, owner freeze)), upper bound exclusive. Staff posts outside that cohort stay public without earning feedback points.
- The separate legacy `feedback` table/action retains its existing validation/valid flags and frozen-input guards. It is not automatically converted by this proposal.

## Minimal prospective implementation if approved

Add an explicit supported automatic rule/version to the policy schema, validation, private owner UI and scorer. Under that rule, deterministically count eligible authors using the approved length, audience, duplicate, distinct-author and time rules without requiring a fabricated staff review. Preserve numeric weights/targets and existing frozen snapshots. Bind fresh calculation provenance to the rule/version, current project version and exact input/body hashes; identify automatic checks honestly, never write fake staff approvals. Review current-versus-historical live treatment and explicit negative staff exclusions before switching a populated event. Keep authorization, rate limiting, length maximum, immutable freeze and public/private projection guards.

The owner must decide whether valid posting lengths up to1500 also earn credit or whether the existing stricter scoring maximum remains. Posting30 characters alone does not establish useful feedback. Roster/profile checks, one author per project and optional exact-copy exclusion limit simple spam but do not prevent Sybil/coordinated accounts, padded prose or paraphrased copies. No model/paid assessment or sensitive demographic scoring is implied.

Alternative preserving the current policy: implement the missing private admin/owner Approve/Exclude UI over existing `qualify-project-feedback`, with required reason and current-version/body refresh. Neither alternative is implemented/approved by this report. Frozen historical marks and qualification/audit records must never be rewritten to simulate either workflow.
