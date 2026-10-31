-- Votes follow the participant submission window; public comments remain open.
CREATE TRIGGER community_submission_vote_window BEFORE INSERT ON project_upvotes WHEN NOT EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND active=1 AND julianday(NEW.created_at)>=julianday(json_extract(policy,'$.submissionOpen')) AND julianday(NEW.created_at)<julianday(json_extract(policy,'$.submissionClose'))) BEGIN SELECT RAISE(ABORT,'VOTING_CLOSED'); END;
CREATE TRIGGER legacy_submission_vote_window BEFORE INSERT ON votes WHEN NOT EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND active=1 AND julianday(NEW.created_at)>=julianday(json_extract(policy,'$.submissionOpen')) AND julianday(NEW.created_at)<julianday(json_extract(policy,'$.submissionClose'))) BEGIN SELECT RAISE(ABORT,'VOTING_CLOSED'); END;
DROP TRIGGER community_feedback_paused;
DROP TRIGGER legacy_feedback_paused;
