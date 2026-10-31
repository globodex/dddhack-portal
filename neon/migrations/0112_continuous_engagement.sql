-- Remove only the legacy vote calendar gate; vote/security/frozen guards remain.
DROP TRIGGER vote_window ON votes;
CREATE OR REPLACE FUNCTION portal_trigger_feedback_guard() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM memberships WHERE user_id=NEW.author_id AND team_id=NEW.team_id) THEN RAISE EXCEPTION 'OWN_TEAM' USING ERRCODE = '23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM write_guards WHERE token='staff-feedback:'||portal_json_array(NEW.author_id,NEW.team_id,NEW.updated_at) AND valid=1) THEN
  IF NOT EXISTS(SELECT 1 FROM check_ins c JOIN users u ON u.id=c.user_id JOIN registrations r ON r.email=u.email WHERE c.user_id=NEW.author_id AND r.status='approved') THEN RAISE EXCEPTION 'CHECKIN_REQUIRED' USING ERRCODE = '23514'; END IF;
  IF (SELECT active FROM event_settings WHERE id=1)<>1 OR NEW.updated_at<(SELECT portal_json_extract(policy,'$.engagementOpen') FROM event_settings) OR NEW.updated_at>=(SELECT portal_json_extract(policy,'$.engagementClose') FROM event_settings) THEN RAISE EXCEPTION 'ENGAGEMENT_CLOSED' USING ERRCODE = '23514'; END IF;
 END IF;
 RETURN NEW;
END;
$portal$;

DROP TRIGGER community_voting_paused ON project_upvotes;
DROP TRIGGER legacy_voting_paused ON votes;
CREATE OR REPLACE FUNCTION portal_trigger_community_feedback_paused() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (SELECT feedback_paused FROM engagement_controls WHERE id=1)=1 AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='staff-comment:'||portal_json_array(NEW.author_id,NEW.project_id,NEW.created_at) AND valid=1) THEN RAISE EXCEPTION 'ENGAGEMENT_PAUSED' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$portal$;
CREATE OR REPLACE FUNCTION portal_trigger_legacy_feedback_paused() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (SELECT feedback_paused FROM engagement_controls WHERE id=1)=1 AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='staff-feedback:'||portal_json_array(NEW.author_id,NEW.team_id,NEW.updated_at) AND valid=1) THEN RAISE EXCEPTION 'ENGAGEMENT_PAUSED' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$portal$;
