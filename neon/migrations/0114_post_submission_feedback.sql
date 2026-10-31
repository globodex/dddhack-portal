-- Participant feedback follows the actual submission closing time, never hidden engagement dates.
-- No rows, historical settings, score payloads or weights are changed.
CREATE OR REPLACE FUNCTION portal_trigger_submission_vote_window() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND portal_instant(portal_json_extract(policy,'$.submissionClose'))>portal_instant(portal_json_extract(policy,'$.submissionOpen')) AND portal_instant(NEW.created_at)>=portal_instant(portal_json_extract(policy,'$.submissionOpen')) AND portal_instant(NEW.created_at)<portal_instant(portal_json_extract(policy,'$.submissionClose'))) THEN RAISE EXCEPTION 'VOTING_CLOSED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$portal$;
CREATE OR REPLACE FUNCTION portal_trigger_feedback_guard() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM memberships WHERE user_id=NEW.author_id AND team_id=NEW.team_id) THEN RAISE EXCEPTION 'OWN_TEAM' USING ERRCODE='23514'; END IF;
 IF NOT (EXISTS(SELECT 1 FROM write_guards g JOIN users u ON u.id=NEW.author_id LEFT JOIN portal_roles r ON r.user_id=u.id WHERE g.token='staff-feedback:'||portal_json_array(NEW.author_id,NEW.team_id,NEW.updated_at) AND g.valid=1 AND (lower(u.email)='connectwithparam.30@gmail.com' OR COALESCE(r.role,u.role)='admin') AND NOT EXISTS(SELECT 1 FROM record_removals x WHERE x.kind='participant' AND x.target_id=u.id AND x.active=1))) THEN
  IF NOT EXISTS(SELECT 1 FROM check_ins c JOIN users u ON u.id=c.user_id JOIN registrations r ON r.email=u.email WHERE c.user_id=NEW.author_id AND r.status='approved') THEN RAISE EXCEPTION 'CHECKIN_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NOT (EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND portal_instant(portal_json_extract(policy,'$.submissionClose'))>portal_instant(portal_json_extract(policy,'$.submissionOpen')) AND portal_instant(NEW.updated_at)>=portal_instant(portal_json_extract(policy,'$.submissionClose')))) THEN RAISE EXCEPTION 'FEEDBACK_NOT_OPEN' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$portal$;
CREATE TRIGGER feedback_guard_update BEFORE UPDATE OF text,updated_at ON feedback FOR EACH ROW EXECUTE FUNCTION portal_trigger_feedback_guard();
CREATE FUNCTION portal_trigger_community_feedback_after_close() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM write_guards g JOIN users u ON u.id=NEW.author_id LEFT JOIN portal_roles r ON r.user_id=u.id WHERE g.token='staff-comment:'||portal_json_array(NEW.author_id,NEW.project_id,NEW.created_at) AND g.valid=1 AND (lower(u.email)='connectwithparam.30@gmail.com' OR COALESCE(r.role,u.role)='admin') AND NOT EXISTS(SELECT 1 FROM record_removals x WHERE x.kind='participant' AND x.target_id=u.id AND x.active=1))) AND NOT (EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND portal_instant(portal_json_extract(policy,'$.submissionClose'))>portal_instant(portal_json_extract(policy,'$.submissionOpen')) AND portal_instant(NEW.created_at)>=portal_instant(portal_json_extract(policy,'$.submissionClose')))) THEN RAISE EXCEPTION 'FEEDBACK_NOT_OPEN' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$portal$;
CREATE TRIGGER community_feedback_after_close BEFORE INSERT ON project_comments FOR EACH ROW EXECUTE FUNCTION portal_trigger_community_feedback_after_close();
CREATE TRIGGER community_feedback_after_close_update BEFORE UPDATE OF body,created_at ON project_comments FOR EACH ROW EXECUTE FUNCTION portal_trigger_community_feedback_after_close();
