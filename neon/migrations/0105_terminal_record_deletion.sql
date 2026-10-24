-- Irreversible admin deletion is additive; historical SQL/checksums are unchanged.
-- Only opaque IDs, a monotonic attempt count and deletion time survive payload removal.
CREATE TABLE terminal_record_deletions (
 kind text NOT NULL CHECK(kind IN ('participant','team')),
 target_id text NOT NULL,
 deleted_at text NOT NULL,
 PRIMARY KEY(kind,target_id)
);
CREATE TABLE submission_attempt_ledger (
 team_id text PRIMARY KEY,
 attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 3)
);
INSERT INTO submission_attempt_ledger SELECT team_id,MAX(attempt) FROM submission_versions GROUP BY team_id;

CREATE OR REPLACE FUNCTION portal_trigger_submission_no_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_project_review_no_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD.project_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(p.team_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_feedback_review_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF ((EXISTS(SELECT 1 FROM submission_versions v WHERE v.id=OLD.version_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(v.team_id) AND valid=1)) OR EXISTS(SELECT 1 FROM project_comments c WHERE c.id=OLD.comment_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||portal_json_array(c.author_id) AND valid=1)))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_locked_memberships_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1) OR EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||portal_json_array(OLD.user_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id) THEN
RAISE EXCEPTION 'TEAM_LOCKED' USING ERRCODE = '23514';
END IF;
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_locked_team_styles_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id) THEN
RAISE EXCEPTION 'TEAM_LOCKED' USING ERRCODE = '23514';
END IF;
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_locked_ideas_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id) THEN
RAISE EXCEPTION 'TEAM_LOCKED' USING ERRCODE = '23514';
END IF;
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_locked_team_actions_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF ((EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1) OR EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||portal_json_array(OLD.user_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id) THEN
RAISE EXCEPTION 'TEAM_LOCKED' USING ERRCODE = '23514';
END IF;
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_locked_teams_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.id) THEN
RAISE EXCEPTION 'TEAM_LOCKED' USING ERRCODE = '23514';
END IF;
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_team_locks_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_project_commit_receipts_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_final_project_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(OLD.team_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 IF (SELECT count(*) FROM submission_versions WHERE team_id=OLD.team_id)>=3 THEN
RAISE EXCEPTION 'PROJECT_LOCKED_AFTER_THIRD_SUBMISSION' USING ERRCODE = '23514';
END IF;
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_manual_checkins_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||portal_json_array(OLD.user_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_repository_evidence_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD.project_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(p.team_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_eligibility_history_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD.project_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(p.team_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_luma_roster_no_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM users u WHERE lower(u.email)=lower(OLD.email) AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||portal_json_array(u.id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'ROSTER_ADD_ONLY' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_automatic_absences_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||portal_json_array(OLD.user_id) AND valid=1)) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_registration_absences_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM users u WHERE lower(u.email)=lower(OLD.email) AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||portal_json_array(u.id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE OR REPLACE FUNCTION portal_trigger_winner_reveals_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF (EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD.project_id AND EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-team:'||portal_json_array(p.team_id) AND valid=1))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 RETURN OLD;
END;
$portal$;

CREATE FUNCTION portal_terminal_immutable() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN RAISE EXCEPTION 'TERMINAL_DELETION_IMMUTABLE' USING ERRCODE='23514'; END;
$portal$;
CREATE TRIGGER terminal_delete_no_update BEFORE UPDATE ON terminal_record_deletions FOR EACH ROW EXECUTE FUNCTION portal_terminal_immutable();
CREATE TRIGGER terminal_delete_no_delete BEFORE DELETE ON terminal_record_deletions FOR EACH ROW EXECUTE FUNCTION portal_terminal_immutable();
CREATE FUNCTION portal_terminal_authority() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM result_snapshots) OR NOT EXISTS(SELECT 1 FROM write_guards WHERE token=('cascade-'||NEW.kind||':'||portal_json_array(NEW.target_id)) AND valid=1) THEN RAISE EXCEPTION 'TERMINAL_DELETION_CONTEXT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$portal$;
CREATE TRIGGER terminal_delete_authority BEFORE INSERT ON terminal_record_deletions FOR EACH ROW EXECUTE FUNCTION portal_terminal_authority();
CREATE FUNCTION portal_terminal_no_restore() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM terminal_record_deletions t WHERE t.kind=OLD.kind AND t.target_id=OLD.target_id) AND (NEW.active<>1 OR NEW.kind<>OLD.kind OR NEW.target_id<>OLD.target_id) THEN RAISE EXCEPTION 'RECORD_PERMANENTLY_DELETED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$portal$;
CREATE TRIGGER terminal_no_restore BEFORE UPDATE ON record_removals FOR EACH ROW EXECUTE FUNCTION portal_terminal_no_restore();
CREATE FUNCTION portal_terminal_team_no_reuse() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN IF EXISTS(SELECT 1 FROM terminal_record_deletions WHERE kind='team' AND target_id=NEW.id) THEN RAISE EXCEPTION 'RECORD_PERMANENTLY_DELETED' USING ERRCODE='23514'; END IF; RETURN NEW; END;
$portal$;
CREATE TRIGGER terminal_team_no_reuse BEFORE INSERT ON teams FOR EACH ROW EXECUTE FUNCTION portal_terminal_team_no_reuse();
CREATE FUNCTION portal_terminal_profile_no_reuse() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN IF EXISTS(SELECT 1 FROM terminal_record_deletions WHERE kind='participant' AND target_id=NEW.user_id) THEN RAISE EXCEPTION 'RECORD_PERMANENTLY_DELETED' USING ERRCODE='23514'; END IF; RETURN NEW; END;
$portal$;
CREATE TRIGGER terminal_participant_no_profile BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION portal_terminal_profile_no_reuse();
CREATE FUNCTION portal_attempt_immutable() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN IF TG_OP='DELETE' OR NEW.team_id<>OLD.team_id OR NEW.attempts<OLD.attempts THEN RAISE EXCEPTION 'SUBMISSION_ATTEMPTS_IMMUTABLE' USING ERRCODE='23514'; END IF; RETURN NEW; END;
$portal$;
CREATE TRIGGER attempt_ledger_no_decrease BEFORE UPDATE ON submission_attempt_ledger FOR EACH ROW EXECUTE FUNCTION portal_attempt_immutable();
CREATE TRIGGER attempt_ledger_no_delete BEFORE DELETE ON submission_attempt_ledger FOR EACH ROW EXECUTE FUNCTION portal_attempt_immutable();
CREATE FUNCTION portal_durable_submission_attempt() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NEW.attempt<>COALESCE((SELECT attempts FROM submission_attempt_ledger WHERE team_id=NEW.team_id),0)+1 OR EXISTS(SELECT 1 FROM terminal_record_deletions WHERE kind='team' AND target_id=NEW.team_id) THEN RAISE EXCEPTION 'SUBMISSION_ATTEMPT_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$portal$;
CREATE TRIGGER durable_submission_attempt BEFORE INSERT ON submission_versions FOR EACH ROW EXECUTE FUNCTION portal_durable_submission_attempt();
CREATE FUNCTION portal_durable_submission_record() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN INSERT INTO submission_attempt_ledger VALUES(NEW.team_id,NEW.attempt) ON CONFLICT(team_id) DO UPDATE SET attempts=excluded.attempts; RETURN NEW; END;
$portal$;
CREATE TRIGGER durable_submission_record AFTER INSERT ON submission_versions FOR EACH ROW EXECUTE FUNCTION portal_durable_submission_record();
CREATE FUNCTION portal_terminal_credit_retire() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM write_guards WHERE token='cascade-participant:'||portal_json_array(OLD.user_id) AND valid=1) THEN DELETE FROM credit_inventory WHERE id=OLD.inventory_id; END IF;
 RETURN OLD;
END;
$portal$;
CREATE TRIGGER terminal_credit_retire AFTER DELETE ON credit_allocations FOR EACH ROW EXECUTE FUNCTION portal_terminal_credit_retire();
-- Auth/evaluation belongs to a separate published migration stream. The full
-- production plan has this table; portal-only test fixtures may omit it.
CREATE OR REPLACE FUNCTION portal_approved_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM submission_versions v JOIN write_guards w ON w.token='cascade-team:'||portal_json_array(v.team_id) AND w.valid=1 WHERE v.id=OLD.version_id) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' OR OLD.version_id<>NEW.version_id OR OLD.commit_sha<>NEW.commit_sha OR OLD.snapshot_json<>NEW.snapshot_json OR OLD.snapshot_sha256<>NEW.snapshot_sha256 OR OLD.approved_by<>NEW.approved_by OR OLD.approved_at<>NEW.approved_at OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$portal$;
CREATE FUNCTION portal_terminal_private_metadata() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NEW.kind='team' THEN
  DELETE FROM portal_media_uploads WHERE team_id=NEW.target_id;
  IF to_regclass('approved_evaluation_snapshots') IS NOT NULL THEN EXECUTE 'DELETE FROM approved_evaluation_snapshots WHERE version_id IN (SELECT id FROM submission_versions WHERE team_id=$1)' USING NEW.target_id; END IF;
 END IF;
 RETURN NEW;
END;
$portal$;
CREATE TRIGGER terminal_private_metadata AFTER INSERT ON terminal_record_deletions FOR EACH ROW EXECUTE FUNCTION portal_terminal_private_metadata();
CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON terminal_record_deletions FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable();
CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON submission_attempt_ledger FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable();
