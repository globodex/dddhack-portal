DROP TRIGGER IF EXISTS submissions_operational_scope;
DROP TRIGGER IF EXISTS checkin_operational_scope;
DROP TRIGGER IF EXISTS submission_guard;
CREATE TRIGGER submission_guard BEFORE INSERT ON submission_versions BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM event_settings WHERE id=1
   AND julianday(json_extract(policy,'$.submissionOpen')) IS NOT NULL
   AND julianday(json_extract(policy,'$.submissionClose')) IS NOT NULL
   AND julianday(json_extract(policy,'$.submissionClose')) > julianday(json_extract(policy,'$.submissionOpen'))
   AND julianday(NEW.created_at) >= julianday(json_extract(policy,'$.submissionOpen'))
   AND julianday(NEW.created_at) < julianday(json_extract(policy,'$.submissionClose'))
 ) THEN RAISE(ABORT,'SUBMISSIONS_CLOSED') END;
END;
