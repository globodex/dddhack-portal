-- A transaction-bound admin capability bypasses only participant lock prerequisites.
-- API code rechecks staff authority and the reviewed team/member/idea snapshot.
DROP TRIGGER complete_team_lock;
--> statement-breakpoint
CREATE TRIGGER complete_team_lock BEFORE INSERT ON team_locks
WHEN NOT EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-lock:'||json_array(NEW.team_id,NEW.locked_by,NEW.locked_at) AND valid=1)
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM teams WHERE id=NEW.team_id AND leader_id=NEW.locked_by) THEN RAISE(ABORT,'LEADER_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id AND length(trim(title))>0 AND length(trim(core))>0) THEN RAISE(ABORT,'TEAM_IDEA_REQUIRED') END;
 SELECT CASE WHEN (SELECT count(*) FROM memberships WHERE team_id=NEW.team_id) NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM memberships m LEFT JOIN participant_profiles p ON p.user_id=m.user_id WHERE m.team_id=NEW.team_id AND (p.completed_at IS NULL OR p.gender_confirmed<>1)) THEN RAISE(ABORT,'MEMBER_PROFILE_REQUIRED') END;
END;
--> statement-breakpoint
CREATE TRIGGER admin_complete_team_lock BEFORE INSERT ON team_locks
WHEN EXISTS(SELECT 1 FROM write_guards WHERE token='admin-team-lock:'||json_array(NEW.team_id,NEW.locked_by,NEW.locked_at) AND valid=1)
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM result_snapshots) THEN RAISE(ABORT,'RESULTS_FROZEN') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM submission_versions WHERE team_id=NEW.team_id) OR EXISTS(SELECT 1 FROM submission_attempt_ledger WHERE team_id=NEW.team_id AND attempts>0) THEN RAISE(ABORT,'TEAM_HAS_SUBMISSIONS') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM teams t JOIN memberships m ON m.team_id=t.id AND m.user_id=t.leader_id WHERE t.id=NEW.team_id AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=t.id AND r.active=1) AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=t.id)) THEN RAISE(ABORT,'TEAM_LEADER_CHANGED') END;
 SELECT CASE WHEN (SELECT count(*) FROM memberships WHERE team_id=NEW.team_id) NOT BETWEEN 1 AND 5 THEN RAISE(ABORT,'TEAM_MEMBERS_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.team_id=NEW.team_id AND (NOT (EXISTS(SELECT 1 FROM registrations r WHERE r.email=u.email) OR EXISTS(SELECT 1 FROM luma_roster l WHERE l.email=u.email)) OR EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='participant' AND r.target_id=u.id AND r.active=1) OR EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='participant' AND d.target_id=u.id))) THEN RAISE(ABORT,'REGISTERED_ACCOUNT_REQUIRED') END;
END;
