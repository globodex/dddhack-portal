DROP TRIGGER IF EXISTS locked_teams_update;
CREATE TRIGGER locked_teams_update BEFORE UPDATE ON teams
WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.id)
AND NOT (
 NEW.id=OLD.id AND NEW.name COLLATE BINARY=OLD.name COLLATE BINARY
 AND NEW.bio=OLD.bio AND NEW.created_at=OLD.created_at
 AND NEW.leader_id<>OLD.leader_id
 AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-leader-transfer:'||json_array(OLD.id,OLD.leader_id,NEW.leader_id) AND valid=1)
 AND EXISTS(SELECT 1 FROM memberships WHERE team_id=OLD.id AND user_id=NEW.leader_id)
 AND NOT EXISTS(SELECT 1 FROM record_removals WHERE active=1 AND ((kind='team' AND target_id=OLD.id) OR (kind='participant' AND target_id=NEW.leader_id)))
)
BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;
