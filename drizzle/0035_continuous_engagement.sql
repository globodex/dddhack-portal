-- Voting has no calendar window. Existing vote_guard and frozen-score guards remain.
DROP TRIGGER vote_window;
--> statement-breakpoint
DROP TRIGGER feedback_guard;
--> statement-breakpoint
CREATE TRIGGER feedback_guard BEFORE INSERT ON feedback BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE user_id=NEW.author_id AND team_id=NEW.team_id) THEN RAISE(ABORT,'OWN_TEAM') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards WHERE token='staff-feedback:'||json_array(NEW.author_id,NEW.team_id,NEW.updated_at) AND valid=1) AND NOT EXISTS(SELECT 1 FROM check_ins c JOIN users u ON u.id=c.user_id JOIN registrations r ON r.email=u.email WHERE c.user_id=NEW.author_id AND r.status='approved') THEN RAISE(ABORT,'CHECKIN_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM write_guards WHERE token='staff-feedback:'||json_array(NEW.author_id,NEW.team_id,NEW.updated_at) AND valid=1) AND ((SELECT active FROM event_settings WHERE id=1)<>1 OR NEW.updated_at<(SELECT json_extract(policy,'$.engagementOpen') FROM event_settings) OR NEW.updated_at>=(SELECT json_extract(policy,'$.engagementClose') FROM event_settings)) THEN RAISE(ABORT,'ENGAGEMENT_CLOSED') END;
END;
--> statement-breakpoint

DROP TRIGGER community_voting_paused;
--> statement-breakpoint
DROP TRIGGER legacy_voting_paused;
--> statement-breakpoint
DROP TRIGGER community_feedback_paused;
--> statement-breakpoint
CREATE TRIGGER community_feedback_paused BEFORE INSERT ON project_comments WHEN (SELECT feedback_paused FROM engagement_controls WHERE id=1)=1 AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='staff-comment:'||json_array(NEW.author_id,NEW.project_id,NEW.created_at) AND valid=1) BEGIN SELECT RAISE(ABORT,'ENGAGEMENT_PAUSED'); END;
--> statement-breakpoint
DROP TRIGGER legacy_feedback_paused;
--> statement-breakpoint
CREATE TRIGGER legacy_feedback_paused BEFORE INSERT ON feedback WHEN (SELECT feedback_paused FROM engagement_controls WHERE id=1)=1 AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='staff-feedback:'||json_array(NEW.author_id,NEW.team_id,NEW.updated_at) AND valid=1) BEGIN SELECT RAISE(ABORT,'ENGAGEMENT_PAUSED'); END;
--> statement-breakpoint
