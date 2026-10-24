-- Every portal mutation must use SERIALIZABLE, including direct/Drizzle writes.
-- This closes count/predicate races that SQLite's single-writer model prevented.
CREATE FUNCTION portal_require_serializable() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF current_setting('transaction_isolation') <> 'serializable' THEN
  RAISE EXCEPTION 'SERIALIZABLE_TRANSACTION_REQUIRED' USING ERRCODE = '25001';
 END IF;
 RETURN NULL;
END;
$portal$;

DO $portal$
DECLARE table_name text;
BEGIN
 FOR table_name IN
  SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
   AND tablename IN (
    'astra_jobs','audit_logs','automatic_absences','check_ins','credit_allocations',
    'credit_batch_columns','credit_batches','credit_inventory','credit_types',
    'eligibility_history','engagement_controls','evaluation_runs','event_content',
    'event_content_history','event_policy_history','event_settings','feedback',
    'human_scores','idea_revisions','ideas','import_previews','judge_assignments',
    'luma_roster','manual_checkins','memberships','participant_profiles',
    'participant_status_overrides','portal_roles','private_venue',
    'private_venue_managers','profile_details','profile_photos','profiles',
    'project_assignments','project_comments','project_commit_receipts',
    'project_eligibility','project_feedback_reviews','project_review_history',
    'project_upvotes','projects','record_removals','registration_absences',
    'registrations','repository_evidence','request_buckets','result_publication',
    'result_snapshots','reviews','roster_prefills','score_releases','scoring_revision',
    'submission_versions','team_actions','team_locks','team_status_overrides',
    'team_styles','teams','tie_resolutions','users','votes','winner_reveals','write_guards'
   )
 LOOP
  EXECUTE format('CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable()', table_name);
 END LOOP;
END;
$portal$;
