-- Exact transaction-scoped staff guards. Existing lock rows remain immutable.
DROP TRIGGER locked_memberships_insert;
CREATE TRIGGER locked_memberships_insert BEFORE INSERT ON memberships
WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id)
AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-add:'||json_array(NEW.team_id,NEW.user_id) AND valid=1)
BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

DROP TRIGGER membership_guard;
CREATE TRIGGER membership_guard BEFORE INSERT ON memberships BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM memberships WHERE team_id=NEW.team_id)>=5 THEN RAISE(ABORT,'TEAM_FULL') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u LEFT JOIN registrations r ON r.email=u.email WHERE u.id=NEW.user_id AND COALESCE(r.status,'pending') NOT IN ('rejected','cancelled')) THEN RAISE(ABORT,'REGISTRATION_REQUIRED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND active=1 AND NEW.joined_at >= json_extract(policy,'$.membershipFreeze')) AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-add:'||json_array(NEW.team_id,NEW.user_id) AND valid=1) THEN RAISE(ABORT,'MEMBERSHIP_FROZEN') END;
END;

DROP TRIGGER locked_teams_update;
CREATE TRIGGER locked_teams_update BEFORE UPDATE ON teams
WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.id)
AND NOT (
 (NEW.id=OLD.id AND NEW.name COLLATE BINARY=OLD.name COLLATE BINARY
  AND NEW.bio=OLD.bio AND NEW.created_at=OLD.created_at AND NEW.leader_id<>OLD.leader_id
  AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-leader-transfer:'||json_array(OLD.id,OLD.leader_id,NEW.leader_id) AND valid=1)
  AND EXISTS(SELECT 1 FROM memberships WHERE team_id=OLD.id AND user_id=NEW.leader_id)
  AND NOT EXISTS(SELECT 1 FROM record_removals WHERE active=1 AND ((kind='team' AND target_id=OLD.id) OR (kind='participant' AND target_id=NEW.leader_id))))
 OR
 (NEW.id=OLD.id AND NEW.leader_id=OLD.leader_id AND NEW.bio=OLD.bio AND NEW.created_at=OLD.created_at
  AND NEW.name COLLATE BINARY<>OLD.name COLLATE BINARY
  AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-rename:'||json_array(OLD.id,OLD.name,NEW.name) AND valid=1)
  AND NOT EXISTS(SELECT 1 FROM record_removals WHERE kind='team' AND target_id=OLD.id AND active=1))
)
BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;
