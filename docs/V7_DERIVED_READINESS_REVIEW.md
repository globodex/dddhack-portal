# Derive operational readiness from actual data

Scope: remove old operational setup/enable acknowledgments and their backend/database enforcement. This review does not decide scoring weights, rubric contents, penalties, eligibility or publication.

`lib/derived-readiness.ts` supplies pure read-only derivation. Check-in is operationally ready; existing staff authorization and individual portal Going approval remain authoritative. Submissions require a finite configured open/close window with close after open, and the current time inside that window. Historical `active`, `operationScopes`, settings version and confirmation arrays are not prerequisites. No helper creates settings, changes flags or invents policy values.

Scoring uses actual configured rules, windows, rubric, fallback, tie handling, qualification, finite nonnegative explicit weights and nonempty scoring criteria/weightage. Acknowledgment arrays and boolean acknowledgments do not substitute for these contents. Missing/unconfirmed actual decisions remain blockers. AI score publication should use its own current-version finalized provider-report/data gates; an unrelated unconfigured final-scoring rubric must not masquerade as an operational readiness error. Explicit staged publication confirmations remain action safeguards.

## Required database migration

Append migrations to both the local `db/migrations/` and hosted Drizzle streams. Do not edit already-applied migrations. Drop `submissions_operational_scope` and `checkin_operational_scope`, which currently enforce `active` and `operationScopes`. Recreate only the active-dependent `submission_guard`; preserve every separate approval, attendance, leader, membership, immutable-attempt/history, removal and frozen-result guard.

Suggested bounded replacement:

```sql
DROP TRIGGER IF EXISTS submissions_operational_scope;
DROP TRIGGER IF EXISTS checkin_operational_scope;
DROP TRIGGER IF EXISTS submission_guard;
CREATE TRIGGER submission_guard BEFORE INSERT ON submission_versions BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM event_settings
    WHERE id=1
      AND julianday(json_extract(policy,'$.submissionOpen')) IS NOT NULL
      AND julianday(json_extract(policy,'$.submissionClose')) IS NOT NULL
      AND julianday(json_extract(policy,'$.submissionClose')) > julianday(json_extract(policy,'$.submissionOpen'))
      AND julianday(NEW.created_at) >= julianday(json_extract(policy,'$.submissionOpen'))
      AND julianday(NEW.created_at) < julianday(json_extract(policy,'$.submissionClose'))
  ) THEN RAISE(ABORT,'SUBMISSIONS_CLOSED') END;
END;
```

This fails closed for absent/invalid persisted dates and preserves the inclusive open/exclusive close boundary. Existing schema `CHECK(json_valid(policy))` protects JSON parsing. The latest existing `checkin_guard` already enforces individual portal Going and ignores Luma confirmation, so it should remain unchanged. Service-layer defaults without a persisted settings row are not a reason to silently write settings; an actual persisted submission window remains required by the database.

## Regression scope

`tests/derived-readiness.test.ts` verifies pure derivation, finite windows and boundaries, ignored old acknowledgment fields, and unresolved actual scoring configuration. `tests/derived-readiness-flow.test.ts` is the shared integration contract: existing settings with `active=0`, empty scopes and empty confirmations permit legitimate check-in/draft/three commits while preserving Going/leader/personal attendance, owner-only versioned date edits, provider-report requirements, score coverage, frozen snapshots and deliberate staged publication. Integration tests require the root-owned policy/service/migration wiring; they are not claimed passed before that wiring is tested.
