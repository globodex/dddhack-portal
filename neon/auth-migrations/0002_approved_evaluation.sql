-- Empty table only. Approved source contents are never checked into Git.
CREATE TABLE approved_evaluation_snapshots (
  version_id text PRIMARY KEY REFERENCES submission_versions(id),
  commit_sha text NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{40}$'),
  snapshot_json text NOT NULL CHECK (octet_length(snapshot_json) <= 196608),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  approved_by text NOT NULL REFERENCES users(id),
  approved_at text NOT NULL,
  revoked_at text
);
CREATE FUNCTION portal_approved_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF TG_OP = 'DELETE' OR OLD.version_id <> NEW.version_id OR OLD.commit_sha <> NEW.commit_sha
  OR OLD.snapshot_json <> NEW.snapshot_json OR OLD.snapshot_sha256 <> NEW.snapshot_sha256
  OR OLD.approved_by <> NEW.approved_by OR OLD.approved_at <> NEW.approved_at
  OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
  RAISE EXCEPTION 'IMMUTABLE' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$portal$;
CREATE TRIGGER approved_snapshot_immutable BEFORE UPDATE OR DELETE ON approved_evaluation_snapshots
 FOR EACH ROW EXECUTE FUNCTION portal_approved_snapshot_immutable();
CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON approved_evaluation_snapshots
 FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable();
