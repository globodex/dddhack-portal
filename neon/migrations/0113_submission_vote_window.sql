-- Windowed votes supersede 0112's open-calendar behavior. No stored votes/comments are deleted.
CREATE OR REPLACE FUNCTION portal_trigger_submission_vote_window() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND active=1 AND NEW.created_at::timestamptz>=(portal_json_extract(policy,'$.submissionOpen'))::timestamptz AND NEW.created_at::timestamptz<(portal_json_extract(policy,'$.submissionClose'))::timestamptz) THEN RAISE EXCEPTION 'VOTING_CLOSED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$portal$;
CREATE TRIGGER community_submission_vote_window BEFORE INSERT ON project_upvotes FOR EACH ROW EXECUTE FUNCTION portal_trigger_submission_vote_window();
CREATE TRIGGER legacy_submission_vote_window BEFORE INSERT ON votes FOR EACH ROW EXECUTE FUNCTION portal_trigger_submission_vote_window();
DROP TRIGGER community_feedback_paused ON project_comments;
DROP TRIGGER legacy_feedback_paused ON feedback;
