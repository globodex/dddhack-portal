-- Replace only the existing lock-delete function. Terminal cascade authority is
-- preserved, while admin unlock is exact to one persisted lock with no attempts.
CREATE OR REPLACE FUNCTION portal_trigger_team_locks_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM result_snapshots) THEN
  RAISE EXCEPTION 'RESULTS_FROZEN' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1) THEN
  RETURN OLD;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-unlock:'||portal_json_array(OLD.team_id,OLD.locked_at) AND valid=1) THEN
  RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM submission_versions WHERE team_id=OLD.team_id)
  OR EXISTS(SELECT 1 FROM submission_attempt_ledger WHERE team_id=OLD.team_id AND attempts>0) THEN
  RAISE EXCEPTION 'TEAM_HAS_COMMITTED_SUBMISSIONS' USING ERRCODE='23514';
 END IF;
 RETURN OLD;
END;
$portal$;
