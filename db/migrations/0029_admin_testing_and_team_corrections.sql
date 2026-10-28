-- Preserve ordinary submission and membership guards; exact authorized admin capabilities only.
DROP TRIGGER IF EXISTS submission_guard;
CREATE TRIGGER submission_guard BEFORE INSERT ON submission_versions BEGIN
 SELECT CASE WHEN NOT (EXISTS(SELECT 1 FROM teams t JOIN memberships m ON m.team_id=t.id AND m.user_id=t.leader_id
  WHERE t.id=NEW.team_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-test-submission:'||json_array(NEW.team_id,t.leader_id,NEW.id,NEW.created_at) AND valid=1)
  AND NOT EXISTS(SELECT 1 FROM result_snapshots)
  AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=t.id) OR (r.kind='participant' AND r.target_id=t.leader_id)))
  AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='team' AND d.target_id=t.id) OR (d.kind='participant' AND d.target_id=t.leader_id)))) AND NOT EXISTS (
  SELECT 1 FROM event_settings WHERE id=1
   AND julianday(json_extract(policy,'$.submissionOpen')) IS NOT NULL
   AND julianday(json_extract(policy,'$.submissionClose')) IS NOT NULL
   AND julianday(json_extract(policy,'$.submissionClose')) > julianday(json_extract(policy,'$.submissionOpen'))
   AND julianday(NEW.created_at) >= julianday(json_extract(policy,'$.submissionOpen'))
   AND julianday(NEW.created_at) < julianday(json_extract(policy,'$.submissionClose'))
 ) THEN RAISE(ABORT,'SUBMISSIONS_CLOSED') END;
END;

DROP TRIGGER locked_memberships_delete;
CREATE TRIGGER locked_memberships_delete BEFORE DELETE ON memberships
WHEN NOT (EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-remove:'||json_array(OLD.team_id,OLD.user_id,OLD.joined_at) AND valid=1)
  AND EXISTS(SELECT 1 FROM teams t WHERE t.id=OLD.team_id AND t.leader_id<>OLD.user_id)
  AND NOT EXISTS(SELECT 1 FROM result_snapshots)) AND (EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id)) AND NOT (((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1) OR EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||json_array(OLD.user_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

