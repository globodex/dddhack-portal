-- Exact server-created capabilities waive time/lock gates only. Other invariants remain enforced.
CREATE OR REPLACE FUNCTION portal_trigger_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM teams t JOIN memberships m ON m.team_id=t.id AND m.user_id=t.leader_id
  WHERE t.id=NEW.team_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-test-submission:'||portal_json_array(NEW.team_id,t.leader_id,NEW.id,NEW.created_at) AND valid=1)
  AND NOT EXISTS(SELECT 1 FROM result_snapshots)
  AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=t.id) OR (r.kind='participant' AND r.target_id=t.leader_id)))
  AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='team' AND d.target_id=t.id) OR (d.kind='participant' AND d.target_id=t.leader_id)))) AND NOT EXISTS (
  SELECT 1 FROM event_settings WHERE id=1
   AND portal_instant(portal_json_extract(policy,'$.submissionOpen')) IS NOT NULL
   AND portal_instant(portal_json_extract(policy,'$.submissionClose')) IS NOT NULL
   AND portal_instant(portal_json_extract(policy,'$.submissionClose')) > portal_instant(portal_json_extract(policy,'$.submissionOpen'))
   AND portal_instant(NEW.created_at) >= portal_instant(portal_json_extract(policy,'$.submissionOpen'))
   AND portal_instant(NEW.created_at) < portal_instant(portal_json_extract(policy,'$.submissionClose'))
 ) THEN RAISE EXCEPTION 'SUBMISSIONS_CLOSED' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$portal$;
CREATE OR REPLACE FUNCTION portal_trigger_locked_memberships_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-remove:'||portal_json_array(OLD.team_id,OLD.user_id,OLD.joined_at) AND valid=1)
  AND EXISTS(SELECT 1 FROM teams t WHERE t.id=OLD.team_id AND t.leader_id<>OLD.user_id)
  AND NOT EXISTS(SELECT 1 FROM result_snapshots)) THEN RETURN OLD; END IF;
 IF ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1) OR EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||portal_json_array(OLD.user_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id) THEN
RAISE EXCEPTION 'TEAM_LOCKED' USING ERRCODE = '23514';
END IF;
 RETURN OLD;
END;
$portal$;

