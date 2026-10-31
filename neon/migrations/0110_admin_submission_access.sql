-- Scoped server-created admin-leader testing capabilities; ordinary check-in predicates remain unchanged.

CREATE OR REPLACE FUNCTION portal_trigger_leader_draft_checkin_insert() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM teams test_team JOIN memberships test_member ON test_member.team_id=test_team.id AND test_member.user_id=test_team.leader_id
 WHERE test_team.id=NEW.team_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-test-project:'||portal_json_array(NEW.team_id,test_team.leader_id,NEW.id,NEW.updated_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=test_team.id) OR (r.kind='participant' AND r.target_id=test_team.leader_id) OR (r.kind='project' AND r.target_id=NEW.id)))
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='team' AND d.target_id=test_team.id) OR (d.kind='participant' AND d.target_id=test_team.leader_id)))) AND NOT EXISTS(SELECT 1 FROM teams lt JOIN users lu ON lu.id=lt.leader_id JOIN memberships lm ON lm.user_id=lu.id AND lm.team_id=lt.id JOIN registrations lr ON lr.email=lu.email AND lr.status='approved' WHERE lt.id=NEW.team_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=lu.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=lu.id) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=lu.id AND mc.verified_email=lower(lu.email)))) THEN
RAISE EXCEPTION 'LEADER_CHECKIN_REQUIRED' USING ERRCODE = '23514';
END IF;
 RETURN NEW;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_leader_draft_checkin_update() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM teams test_team JOIN memberships test_member ON test_member.team_id=test_team.id AND test_member.user_id=test_team.leader_id
 WHERE test_team.id=NEW.team_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-test-project:'||portal_json_array(NEW.team_id,test_team.leader_id,NEW.id,NEW.updated_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=test_team.id) OR (r.kind='participant' AND r.target_id=test_team.leader_id) OR (r.kind='project' AND r.target_id=NEW.id)))
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='team' AND d.target_id=test_team.id) OR (d.kind='participant' AND d.target_id=test_team.leader_id)))) AND NOT EXISTS(SELECT 1 FROM teams lt JOIN users lu ON lu.id=lt.leader_id JOIN memberships lm ON lm.user_id=lu.id AND lm.team_id=lt.id JOIN registrations lr ON lr.email=lu.email AND lr.status='approved' WHERE lt.id=NEW.team_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=lu.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=lu.id) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=lu.id AND mc.verified_email=lower(lu.email)))) THEN
RAISE EXCEPTION 'LEADER_CHECKIN_REQUIRED' USING ERRCODE = '23514';
END IF;
 RETURN NEW;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_leader_submission_checkin() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM teams test_team JOIN memberships test_member ON test_member.team_id=test_team.id AND test_member.user_id=test_team.leader_id
 WHERE test_team.id=NEW.team_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-test-submission:'||portal_json_array(NEW.team_id,test_team.leader_id,NEW.id,NEW.created_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=test_team.id) OR (r.kind='participant' AND r.target_id=test_team.leader_id)))
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='team' AND d.target_id=test_team.id) OR (d.kind='participant' AND d.target_id=test_team.leader_id)))) AND NOT EXISTS(SELECT 1 FROM teams lt JOIN users lu ON lu.id=lt.leader_id JOIN memberships lm ON lm.user_id=lu.id AND lm.team_id=lt.id JOIN registrations lr ON lr.email=lu.email AND lr.status='approved' WHERE lt.id=NEW.team_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=lu.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=lu.id) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=lu.id AND mc.verified_email=lower(lu.email)))) THEN
RAISE EXCEPTION 'LEADER_CHECKIN_REQUIRED' USING ERRCODE = '23514';
END IF;
 RETURN NEW;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_draft_team_checkin_insert() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM teams test_team JOIN memberships test_member ON test_member.team_id=test_team.id AND test_member.user_id=test_team.leader_id
 WHERE test_team.id=NEW.team_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-test-project:'||portal_json_array(NEW.team_id,test_team.leader_id,NEW.id,NEW.updated_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=test_team.id) OR (r.kind='participant' AND r.target_id=test_team.leader_id) OR (r.kind='project' AND r.target_id=NEW.id)))
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='team' AND d.target_id=test_team.id) OR (d.kind='participant' AND d.target_id=test_team.leader_id)))) AND NOT EXISTS(SELECT 1 FROM memberships m JOIN users au ON au.id=m.user_id JOIN registrations ar ON ar.email=au.email AND ar.status='approved' WHERE m.team_id=NEW.team_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=au.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=au.id) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=au.id AND mc.verified_email=lower(au.email)))) THEN
RAISE EXCEPTION 'TEAM_CHECKIN_REQUIRED' USING ERRCODE = '23514';
END IF;
 RETURN NEW;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_draft_team_checkin_update() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM teams test_team JOIN memberships test_member ON test_member.team_id=test_team.id AND test_member.user_id=test_team.leader_id
 WHERE test_team.id=NEW.team_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-test-project:'||portal_json_array(NEW.team_id,test_team.leader_id,NEW.id,NEW.updated_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=test_team.id) OR (r.kind='participant' AND r.target_id=test_team.leader_id) OR (r.kind='project' AND r.target_id=NEW.id)))
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='team' AND d.target_id=test_team.id) OR (d.kind='participant' AND d.target_id=test_team.leader_id)))) AND NOT EXISTS(SELECT 1 FROM memberships m JOIN users au ON au.id=m.user_id JOIN registrations ar ON ar.email=au.email AND ar.status='approved' WHERE m.team_id=NEW.team_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=au.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=au.id) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=au.id AND mc.verified_email=lower(au.email)))) THEN
RAISE EXCEPTION 'TEAM_CHECKIN_REQUIRED' USING ERRCODE = '23514';
END IF;
 RETURN NEW;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_submission_team_checkin() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM teams test_team JOIN memberships test_member ON test_member.team_id=test_team.id AND test_member.user_id=test_team.leader_id
 WHERE test_team.id=NEW.team_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='admin-test-submission:'||portal_json_array(NEW.team_id,test_team.leader_id,NEW.id,NEW.created_at) AND valid=1)
 AND NOT EXISTS(SELECT 1 FROM result_snapshots)
 AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=test_team.id) OR (r.kind='participant' AND r.target_id=test_team.leader_id)))
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='team' AND d.target_id=test_team.id) OR (d.kind='participant' AND d.target_id=test_team.leader_id)))) AND NOT EXISTS(SELECT 1 FROM memberships m JOIN users au ON au.id=m.user_id JOIN registrations ar ON ar.email=au.email AND ar.status='approved' WHERE m.team_id=NEW.team_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=au.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=au.id) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=au.id AND mc.verified_email=lower(au.email)))) THEN
RAISE EXCEPTION 'TEAM_CHECKIN_REQUIRED' USING ERRCODE = '23514';
END IF;
 RETURN NEW;
END;
$portal$;
