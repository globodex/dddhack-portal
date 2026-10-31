-- Admin-only row-bound creation of a missing idea; existing ideas are never updated.

CREATE OR REPLACE FUNCTION portal_trigger_idea_insert_lock() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM teams add_team WHERE add_team.id=NEW.team_id
 AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-add-idea:'||portal_json_array(NEW.team_id,NEW.hash,NEW.updated_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=NEW.team_id AND r.active=1)
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=NEW.team_id))) AND NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id) AND NEW.updated_at >= (SELECT portal_json_extract(policy,'$.ideaLock') FROM event_settings WHERE id=1) THEN
RAISE EXCEPTION 'IDEA_LOCKED' USING ERRCODE = '23514';
END IF;
 RETURN NEW;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_locked_ideas_insert() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM teams add_team WHERE add_team.id=NEW.team_id
 AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-add-idea:'||portal_json_array(NEW.team_id,NEW.hash,NEW.updated_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=NEW.team_id AND r.active=1)
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=NEW.team_id))) AND EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id) THEN
RAISE EXCEPTION 'TEAM_LOCKED' USING ERRCODE = '23514';
END IF;
 RETURN NEW;
END;
$portal$;
