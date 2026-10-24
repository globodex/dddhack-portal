-- Narrow staff corrections only. Historical SQL and stored ledger hashes are unchanged.
CREATE OR REPLACE FUNCTION portal_trigger_locked_memberships_insert() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id)
 AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-add:'||portal_json_array(NEW.team_id,NEW.user_id) AND valid=1) THEN
  RAISE EXCEPTION 'TEAM_LOCKED' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_membership_guard() RETURNS trigger LANGUAGE plpgsql AS $portal$
DECLARE staff_correction boolean;
BEGIN
 staff_correction := EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-add:'||portal_json_array(NEW.team_id,NEW.user_id) AND valid=1);
 IF staff_correction THEN
  -- Serialize corrections for the target team and person. SERIALIZABLE retries
  -- plus the unique user membership remain authoritative across concurrent adds.
  PERFORM id FROM teams WHERE id=NEW.team_id FOR UPDATE;
  PERFORM id FROM users WHERE id=NEW.user_id FOR UPDATE;
 END IF;
 IF (SELECT count(*) FROM memberships WHERE team_id=NEW.team_id)>=5 THEN RAISE EXCEPTION 'TEAM_FULL' USING ERRCODE = '23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users u LEFT JOIN registrations r ON r.email=u.email WHERE u.id=NEW.user_id AND COALESCE(r.status,'pending') NOT IN ('rejected','cancelled')) THEN RAISE EXCEPTION 'REGISTRATION_REQUIRED' USING ERRCODE = '23514'; END IF;
 IF EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND active=1 AND NEW.joined_at >= portal_json_extract(policy,'$.membershipFreeze')) AND NOT staff_correction THEN RAISE EXCEPTION 'MEMBERSHIP_FROZEN' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_locked_teams_update() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.id)
 AND NOT (
  (NEW.id=OLD.id AND NEW.name::text COLLATE "C"=OLD.name::text COLLATE "C"
   AND NEW.bio=OLD.bio AND NEW.created_at=OLD.created_at AND NEW.leader_id<>OLD.leader_id
   AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-leader-transfer:'||portal_json_array(OLD.id,OLD.leader_id,NEW.leader_id) AND valid=1)
   AND EXISTS(SELECT 1 FROM memberships WHERE team_id=OLD.id AND user_id=NEW.leader_id)
   AND NOT EXISTS(SELECT 1 FROM record_removals WHERE active=1 AND ((kind='team' AND target_id=OLD.id) OR (kind='participant' AND target_id=NEW.leader_id))))
  OR
  (NEW.id=OLD.id AND NEW.leader_id=OLD.leader_id AND NEW.bio=OLD.bio AND NEW.created_at=OLD.created_at
   AND NEW.name::text COLLATE "C"<>OLD.name::text COLLATE "C"
   AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-rename:'||portal_json_array(OLD.id,OLD.name,NEW.name) AND valid=1)
   AND NOT EXISTS(SELECT 1 FROM record_removals WHERE kind='team' AND target_id=OLD.id AND active=1))
 ) THEN
  RAISE EXCEPTION 'TEAM_LOCKED' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$portal$;
