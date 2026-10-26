-- Preserve participant prerequisites; a server-authorized, exact admin lock
-- capability can seal an existing team without fabricating idea/profile content.
CREATE OR REPLACE FUNCTION portal_trigger_complete_team_lock() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-lock:'||portal_json_array(NEW.team_id,NEW.locked_by,NEW.locked_at) AND valid=1) THEN
  IF EXISTS(SELECT 1 FROM result_snapshots) THEN RAISE EXCEPTION 'RESULTS_FROZEN' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM submission_versions WHERE team_id=NEW.team_id) OR EXISTS(SELECT 1 FROM submission_attempt_ledger WHERE team_id=NEW.team_id AND attempts>0) THEN RAISE EXCEPTION 'TEAM_HAS_SUBMISSIONS' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM teams t JOIN memberships m ON m.team_id=t.id AND m.user_id=t.leader_id WHERE t.id=NEW.team_id AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=t.id AND r.active=1) AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=t.id)) THEN RAISE EXCEPTION 'TEAM_LEADER_CHANGED' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM memberships WHERE team_id=NEW.team_id) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'TEAM_MEMBERS_INVALID' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.team_id=NEW.team_id AND (NOT (EXISTS(SELECT 1 FROM registrations r WHERE r.email=u.email) OR EXISTS(SELECT 1 FROM luma_roster l WHERE l.email=u.email)) OR EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='participant' AND r.target_id=u.id AND r.active=1) OR EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='participant' AND d.target_id=u.id))) THEN RAISE EXCEPTION 'REGISTERED_ACCOUNT_REQUIRED' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM teams WHERE id=NEW.team_id AND leader_id=NEW.locked_by) THEN RAISE EXCEPTION 'LEADER_REQUIRED' USING ERRCODE = '23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id AND length(trim(title))>0 AND length(trim(core))>0) THEN RAISE EXCEPTION 'TEAM_IDEA_REQUIRED' USING ERRCODE = '23514'; END IF;
 IF (SELECT count(*) FROM memberships WHERE team_id=NEW.team_id) NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM memberships m LEFT JOIN participant_profiles p ON p.user_id=m.user_id WHERE m.team_id=NEW.team_id AND (p.completed_at IS NULL OR p.gender_confirmed<>1)) THEN RAISE EXCEPTION 'MEMBER_PROFILE_REQUIRED' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$portal$;
