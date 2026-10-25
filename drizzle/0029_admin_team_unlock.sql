-- Removing the actual lock restores existing pre-lock behavior. This exception
-- is exact to one persisted lock and cannot erase committed submission history.
DROP TRIGGER team_locks_immutable_delete;
--> statement-breakpoint
CREATE TRIGGER team_locks_immutable_delete BEFORE DELETE ON team_locks
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM result_snapshots) THEN RAISE(ABORT,'RESULTS_FROZEN') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1)
  AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-unlock:'||json_array(OLD.team_id,OLD.locked_at) AND valid=1)
  THEN RAISE(ABORT,'IMMUTABLE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1)
  AND (EXISTS(SELECT 1 FROM submission_versions WHERE team_id=OLD.team_id)
   OR EXISTS(SELECT 1 FROM submission_attempt_ledger WHERE team_id=OLD.team_id AND attempts>0))
  THEN RAISE(ABORT,'TEAM_HAS_COMMITTED_SUBMISSIONS') END;
END;
