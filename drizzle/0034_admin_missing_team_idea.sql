-- Only the admin create-if-absent capability can bypass team/deadline insert locks.

DROP TRIGGER idea_insert_lock;

CREATE TRIGGER idea_insert_lock BEFORE INSERT ON ideas WHEN NOT (EXISTS(SELECT 1 FROM teams add_team WHERE add_team.id=NEW.team_id
 AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-add-idea:'||json_array(NEW.team_id,NEW.hash,NEW.updated_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=NEW.team_id AND r.active=1)
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=NEW.team_id))) AND NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id) AND NEW.updated_at >= (SELECT json_extract(policy,'$.ideaLock') FROM event_settings WHERE id=1) BEGIN SELECT RAISE(ABORT,'IDEA_LOCKED'); END;

DROP TRIGGER locked_ideas_insert;

CREATE TRIGGER locked_ideas_insert BEFORE INSERT ON ideas WHEN NOT (EXISTS(SELECT 1 FROM teams add_team WHERE add_team.id=NEW.team_id
 AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-add-idea:'||json_array(NEW.team_id,NEW.hash,NEW.updated_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=NEW.team_id AND r.active=1)
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=NEW.team_id))) AND EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;
