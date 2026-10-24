-- Irreversible admin deletion is additive; historical SQL/checksums are unchanged.
-- Only opaque IDs, a monotonic attempt count and deletion time survive payload removal.
CREATE TABLE terminal_record_deletions (
 kind TEXT NOT NULL CHECK(kind IN ('participant','team')),
 target_id TEXT NOT NULL,
 deleted_at TEXT NOT NULL,
 PRIMARY KEY(kind,target_id)
);
CREATE TABLE submission_attempt_ledger (
 team_id TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 3)
);
INSERT INTO submission_attempt_ledger SELECT team_id,MAX(attempt) FROM submission_versions GROUP BY team_id;

DROP TRIGGER submission_no_delete;
CREATE TRIGGER submission_no_delete BEFORE DELETE ON submission_versions
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER project_review_no_delete;
CREATE TRIGGER project_review_no_delete BEFORE DELETE ON project_review_history
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD.project_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(p.team_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER feedback_review_immutable_delete;
CREATE TRIGGER feedback_review_immutable_delete BEFORE DELETE ON project_feedback_reviews
WHEN (1) AND NOT (((EXISTS(SELECT 1 FROM submission_versions v WHERE v.id=OLD.version_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(v.team_id) AND valid=1)) OR EXISTS(SELECT 1 FROM project_comments c WHERE c.id=OLD.comment_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||json_array(c.author_id) AND valid=1)))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER locked_memberships_delete;
CREATE TRIGGER locked_memberships_delete BEFORE DELETE ON memberships
WHEN (EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id)) AND NOT (((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1) OR EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||json_array(OLD.user_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

DROP TRIGGER locked_team_styles_delete;
CREATE TRIGGER locked_team_styles_delete BEFORE DELETE ON team_styles
WHEN (EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id)) AND NOT ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

DROP TRIGGER locked_ideas_delete;
CREATE TRIGGER locked_ideas_delete BEFORE DELETE ON ideas
WHEN (EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id)) AND NOT ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

DROP TRIGGER locked_team_actions_delete;
CREATE TRIGGER locked_team_actions_delete BEFORE DELETE ON team_actions
WHEN (EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id)) AND NOT (((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1) OR EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||json_array(OLD.user_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

DROP TRIGGER locked_teams_delete;
CREATE TRIGGER locked_teams_delete BEFORE DELETE ON teams
WHEN (EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.id)) AND NOT ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

DROP TRIGGER team_locks_immutable_delete;
CREATE TRIGGER team_locks_immutable_delete BEFORE DELETE ON team_locks
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER project_commit_receipts_immutable_delete;
CREATE TRIGGER project_commit_receipts_immutable_delete BEFORE DELETE ON project_commit_receipts
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER final_project_delete;
CREATE TRIGGER final_project_delete BEFORE DELETE ON projects
WHEN ((SELECT count(*) FROM submission_versions WHERE team_id=OLD.team_id)>=3) AND NOT ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'PROJECT_LOCKED_AFTER_THIRD_SUBMISSION'); END;

DROP TRIGGER manual_checkins_immutable_delete;
CREATE TRIGGER manual_checkins_immutable_delete BEFORE DELETE ON manual_checkins
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||json_array(OLD.user_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER repository_evidence_immutable_delete;
CREATE TRIGGER repository_evidence_immutable_delete BEFORE DELETE ON repository_evidence
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD.project_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(p.team_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER eligibility_history_immutable_delete;
CREATE TRIGGER eligibility_history_immutable_delete BEFORE DELETE ON eligibility_history
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD.project_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(p.team_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER luma_roster_no_delete;
CREATE TRIGGER luma_roster_no_delete BEFORE DELETE ON luma_roster
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM users u WHERE lower(u.email)=lower(OLD.email) AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||json_array(u.id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'ROSTER_ADD_ONLY'); END;

DROP TRIGGER automatic_absences_immutable_delete;
CREATE TRIGGER automatic_absences_immutable_delete BEFORE DELETE ON automatic_absences
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||json_array(OLD.user_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER registration_absences_immutable_delete;
CREATE TRIGGER registration_absences_immutable_delete BEFORE DELETE ON registration_absences
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM users u WHERE lower(u.email)=lower(OLD.email) AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||json_array(u.id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

DROP TRIGGER winner_reveals_immutable_delete;
CREATE TRIGGER winner_reveals_immutable_delete BEFORE DELETE ON winner_reveals
WHEN (1) AND NOT ((EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD.project_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||json_array(p.team_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

CREATE TRIGGER terminal_delete_authority BEFORE INSERT ON terminal_record_deletions
WHEN EXISTS(SELECT 1 FROM result_snapshots) OR NOT EXISTS(SELECT 1 FROM write_guards WHERE token=('cascade-'||NEW.kind||':'||json_array(NEW.target_id)) AND valid=1)
BEGIN SELECT RAISE(ABORT,'TERMINAL_DELETION_CONTEXT_REQUIRED'); END;
CREATE TRIGGER terminal_delete_no_update BEFORE UPDATE ON terminal_record_deletions BEGIN SELECT RAISE(ABORT,'TERMINAL_DELETION_IMMUTABLE'); END;
CREATE TRIGGER terminal_delete_no_delete BEFORE DELETE ON terminal_record_deletions BEGIN SELECT RAISE(ABORT,'TERMINAL_DELETION_IMMUTABLE'); END;
CREATE TRIGGER terminal_no_restore BEFORE UPDATE ON record_removals
WHEN EXISTS(SELECT 1 FROM terminal_record_deletions t WHERE t.kind=OLD.kind AND t.target_id=OLD.target_id) AND (NEW.active<>1 OR NEW.kind<>OLD.kind OR NEW.target_id<>OLD.target_id)
BEGIN SELECT RAISE(ABORT,'RECORD_PERMANENTLY_DELETED'); END;
CREATE TRIGGER terminal_team_no_reuse BEFORE INSERT ON teams WHEN EXISTS(SELECT 1 FROM terminal_record_deletions WHERE kind='team' AND target_id=NEW.id) BEGIN SELECT RAISE(ABORT,'RECORD_PERMANENTLY_DELETED'); END;
CREATE TRIGGER terminal_participant_no_profile BEFORE INSERT ON profiles WHEN EXISTS(SELECT 1 FROM terminal_record_deletions WHERE kind='participant' AND target_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'RECORD_PERMANENTLY_DELETED'); END;
CREATE TRIGGER attempt_ledger_no_decrease BEFORE UPDATE ON submission_attempt_ledger WHEN NEW.team_id<>OLD.team_id OR NEW.attempts<OLD.attempts BEGIN SELECT RAISE(ABORT,'SUBMISSION_ATTEMPTS_IMMUTABLE'); END;
CREATE TRIGGER attempt_ledger_no_delete BEFORE DELETE ON submission_attempt_ledger BEGIN SELECT RAISE(ABORT,'SUBMISSION_ATTEMPTS_IMMUTABLE'); END;
CREATE TRIGGER durable_submission_attempt BEFORE INSERT ON submission_versions
WHEN NEW.attempt<>COALESCE((SELECT attempts FROM submission_attempt_ledger WHERE team_id=NEW.team_id),0)+1 OR EXISTS(SELECT 1 FROM terminal_record_deletions WHERE kind='team' AND target_id=NEW.team_id)
BEGIN SELECT RAISE(ABORT,'SUBMISSION_ATTEMPT_INVALID'); END;
CREATE TRIGGER durable_submission_record AFTER INSERT ON submission_versions BEGIN
 INSERT INTO submission_attempt_ledger VALUES(NEW.team_id,NEW.attempt) ON CONFLICT(team_id) DO UPDATE SET attempts=excluded.attempts;
END;
CREATE TRIGGER terminal_credit_retire AFTER DELETE ON credit_allocations
WHEN EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||json_array(OLD.user_id) AND valid=1)
BEGIN DELETE FROM credit_inventory WHERE id=OLD.inventory_id; END;
