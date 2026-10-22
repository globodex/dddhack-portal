-- Schema guards and the single internal revision counter; no user/event seed data.
CREATE TRIGGER membership_guard BEFORE INSERT ON memberships BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM memberships WHERE team_id=NEW.team_id)>=5 THEN RAISE(ABORT,'TEAM_FULL') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u JOIN registrations r ON r.email=u.email WHERE u.id=NEW.user_id AND r.status='approved') THEN RAISE(ABORT,'APPROVAL_REQUIRED') END;
 SELECT CASE WHEN NEW.joined_at >= (SELECT json_extract(policy,'$.membershipFreeze') FROM event_settings WHERE id=1) THEN RAISE(ABORT,'MEMBERSHIP_FROZEN') END;
END;
--> statement-breakpoint
CREATE TRIGGER idea_lock BEFORE UPDATE ON ideas WHEN (NEW.title<>OLD.title OR NEW.core<>OLD.core) AND NEW.updated_at >= (SELECT json_extract(policy,'$.ideaLock') FROM event_settings WHERE id=1) BEGIN SELECT RAISE(ABORT,'IDEA_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER idea_insert_lock BEFORE INSERT ON ideas WHEN NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id) AND NEW.updated_at >= (SELECT json_extract(policy,'$.ideaLock') FROM event_settings WHERE id=1) BEGIN SELECT RAISE(ABORT,'IDEA_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER checkin_guard BEFORE INSERT ON check_ins BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u JOIN registrations r ON r.email=u.email WHERE u.id=NEW.user_id AND r.status='approved' AND ((SELECT json_extract(policy,'$.lumaRequired') FROM event_settings WHERE id=1)=0 OR r.luma_confirmed=1)) THEN RAISE(ABORT,'APPROVAL_REQUIRED') END; END;
--> statement-breakpoint
CREATE TRIGGER allocation_guard BEFORE INSERT ON credit_allocations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM credit_inventory WHERE id=NEW.inventory_id AND type_id=NEW.type_id) THEN RAISE(ABORT,'CREDIT_TYPE_MISMATCH') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM check_ins WHERE user_id=NEW.user_id) THEN RAISE(ABORT,'CHECKIN_REQUIRED') END;
END;
--> statement-breakpoint
CREATE TRIGGER submission_guard BEFORE INSERT ON submission_versions BEGIN
 SELECT CASE WHEN (SELECT active FROM event_settings WHERE id=1)<>1 THEN RAISE(ABORT,'EVENT_DRAFT') END;
 SELECT CASE WHEN (SELECT json_extract(policy,'$.submissionClose') FROM event_settings WHERE id=1) IS NULL OR NEW.created_at < (SELECT json_extract(policy,'$.submissionOpen') FROM event_settings WHERE id=1) OR NEW.created_at >= (SELECT json_extract(policy,'$.submissionClose') FROM event_settings WHERE id=1) THEN RAISE(ABORT,'SUBMISSIONS_CLOSED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN registrations r ON r.email=u.email WHERE m.team_id=NEW.team_id AND (r.status IS NULL OR r.status<>'approved')) THEN RAISE(ABORT,'APPROVAL_REQUIRED') END;
END;
--> statement-breakpoint
CREATE TRIGGER submission_immutable BEFORE UPDATE ON submission_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER submission_no_delete BEFORE DELETE ON submission_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER vote_guard BEFORE INSERT ON votes BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM votes WHERE voter_id=NEW.voter_id)>=3 THEN RAISE(ABORT,'VOTE_LIMIT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE user_id=NEW.voter_id AND team_id=NEW.team_id) THEN RAISE(ABORT,'OWN_TEAM') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM check_ins c JOIN users u ON u.id=c.user_id JOIN registrations r ON r.email=u.email WHERE c.user_id=NEW.voter_id AND r.status='approved') THEN RAISE(ABORT,'CHECKIN_REQUIRED') END;
END;
--> statement-breakpoint
CREATE TRIGGER snapshot_immutable BEFORE UPDATE ON result_snapshots BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER snapshot_no_delete BEFORE DELETE ON result_snapshots BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER audit_immutable BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
INSERT INTO scoring_revision VALUES(1,0);
--> statement-breakpoint
CREATE TRIGGER snapshot_consistency BEFORE INSERT ON result_snapshots BEGIN
 SELECT CASE WHEN NEW.source_revision<>(SELECT version FROM scoring_revision WHERE id=1) THEN RAISE(ABORT,'SCORING_CHANGED_RETRY') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM result_snapshots) THEN RAISE(ABORT,'RESULTS_FROZEN') END;
END;
--> statement-breakpoint
CREATE TRIGGER frozen_submission_versions_insert BEFORE INSERT ON submission_versions WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_submission_versions_update BEFORE UPDATE ON submission_versions WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_submission_versions_delete BEFORE DELETE ON submission_versions WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_human_scores_insert BEFORE INSERT ON human_scores WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_human_scores_update BEFORE UPDATE ON human_scores WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_human_scores_delete BEFORE DELETE ON human_scores WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_reviews_insert BEFORE INSERT ON reviews WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_reviews_update BEFORE UPDATE ON reviews WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_reviews_delete BEFORE DELETE ON reviews WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_votes_insert BEFORE INSERT ON votes WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_votes_update BEFORE UPDATE ON votes WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_votes_delete BEFORE DELETE ON votes WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_feedback_insert BEFORE INSERT ON feedback WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_feedback_update BEFORE UPDATE ON feedback WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_feedback_delete BEFORE DELETE ON feedback WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_judge_assignments_insert BEFORE INSERT ON judge_assignments WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_judge_assignments_update BEFORE UPDATE ON judge_assignments WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_judge_assignments_delete BEFORE DELETE ON judge_assignments WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revision_users_insert AFTER INSERT ON users BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_users_update AFTER UPDATE ON users BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_users_delete AFTER DELETE ON users BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_registrations_insert AFTER INSERT ON registrations BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_registrations_update AFTER UPDATE ON registrations BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_registrations_delete AFTER DELETE ON registrations BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_memberships_insert AFTER INSERT ON memberships BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_memberships_update AFTER UPDATE ON memberships BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_memberships_delete AFTER DELETE ON memberships BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_submission_versions_insert AFTER INSERT ON submission_versions BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_submission_versions_update AFTER UPDATE ON submission_versions BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_submission_versions_delete AFTER DELETE ON submission_versions BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_human_scores_insert AFTER INSERT ON human_scores BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_human_scores_update AFTER UPDATE ON human_scores BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_human_scores_delete AFTER DELETE ON human_scores BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_reviews_insert AFTER INSERT ON reviews BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_reviews_update AFTER UPDATE ON reviews BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_reviews_delete AFTER DELETE ON reviews BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_votes_insert AFTER INSERT ON votes BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_votes_update AFTER UPDATE ON votes BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_votes_delete AFTER DELETE ON votes BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_feedback_insert AFTER INSERT ON feedback BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_feedback_update AFTER UPDATE ON feedback BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_feedback_delete AFTER DELETE ON feedback BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_judge_assignments_insert AFTER INSERT ON judge_assignments BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_judge_assignments_update AFTER UPDATE ON judge_assignments BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_judge_assignments_delete AFTER DELETE ON judge_assignments BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_event_settings_insert AFTER INSERT ON event_settings BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_event_settings_update AFTER UPDATE ON event_settings BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revision_event_settings_delete AFTER DELETE ON event_settings BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER vote_window BEFORE INSERT ON votes BEGIN
 SELECT CASE WHEN (SELECT active FROM event_settings WHERE id=1)<>1 OR NEW.created_at<(SELECT json_extract(policy,'$.engagementOpen') FROM event_settings) OR NEW.created_at>=(SELECT json_extract(policy,'$.engagementClose') FROM event_settings) THEN RAISE(ABORT,'ENGAGEMENT_CLOSED') END;
END;
--> statement-breakpoint
CREATE TRIGGER feedback_guard BEFORE INSERT ON feedback BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE user_id=NEW.author_id AND team_id=NEW.team_id) THEN RAISE(ABORT,'OWN_TEAM') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM check_ins c JOIN users u ON u.id=c.user_id JOIN registrations r ON r.email=u.email WHERE c.user_id=NEW.author_id AND r.status='approved') THEN RAISE(ABORT,'CHECKIN_REQUIRED') END;
 SELECT CASE WHEN (SELECT active FROM event_settings WHERE id=1)<>1 OR NEW.updated_at<(SELECT json_extract(policy,'$.engagementOpen') FROM event_settings) OR NEW.updated_at>=(SELECT json_extract(policy,'$.engagementClose') FROM event_settings) THEN RAISE(ABORT,'ENGAGEMENT_CLOSED') END;
END;
--> statement-breakpoint
CREATE TRIGGER review_version_guard BEFORE INSERT ON reviews WHEN NEW.version_id<>(SELECT id FROM submission_versions WHERE team_id=NEW.team_id ORDER BY attempt DESC LIMIT 1) BEGIN SELECT RAISE(ABORT,'STALE_SUBMISSION'); END;
--> statement-breakpoint
CREATE TRIGGER score_assignment_guard BEFORE INSERT ON human_scores BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM judge_assignments a JOIN users u ON u.id=a.judge_id WHERE a.judge_id=NEW.judge_id AND a.team_id=NEW.team_id AND u.role='judge') THEN RAISE(ABORT,'ASSIGNMENT_REQUIRED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE user_id=NEW.judge_id AND team_id=NEW.team_id) THEN RAISE(ABORT,'JUDGE_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER frozen_tie_insert BEFORE INSERT ON tie_resolutions WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revision_tie_insert AFTER INSERT ON tie_resolutions BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER frozen_tie_update BEFORE UPDATE ON tie_resolutions WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revision_tie_update AFTER UPDATE ON tie_resolutions BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER frozen_tie_delete BEFORE DELETE ON tie_resolutions WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revision_tie_delete AFTER DELETE ON tie_resolutions BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
