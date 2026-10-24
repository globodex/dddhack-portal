-- Approved revision-scoped upload receipts; private object keys stay backend-only.
CREATE TABLE portal_media_uploads (
  id text PRIMARY KEY,
  actor_id text NOT NULL REFERENCES users(id),
  team_id text NOT NULL REFERENCES teams(id),
  revision integer NOT NULL CHECK (revision >= 0),
  kind text NOT NULL CHECK (kind IN ('logo','banner')),
  bucket text NOT NULL,
  staging_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg')),
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 32 AND 131072),
  expires_at text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','finalizing','ready','consumed')),
  claim_token text,
  claim_expires_at text,
  object_key text UNIQUE,
  image_content_type text CHECK (image_content_type IN ('image/png','image/jpeg')),
  image_byte_length integer CHECK (image_byte_length BETWEEN 32 AND 131072),
  width integer CHECK (width BETWEEN 64 AND 4096),
  height integer CHECK (height BETWEEN 64 AND 4096),
  sha256 text,
  finalized_at text,
  consumed_at text,
  version_id text REFERENCES submission_versions(id),
  CHECK (state NOT IN ('ready','consumed') OR
    (object_key IS NOT NULL AND image_content_type IS NOT NULL AND image_byte_length IS NOT NULL
     AND width IS NOT NULL AND height IS NOT NULL AND sha256 IS NOT NULL AND finalized_at IS NOT NULL)),
  CHECK (state <> 'consumed' OR (version_id IS NOT NULL AND consumed_at IS NOT NULL)),
  CHECK (state <> 'finalizing' OR (claim_token IS NOT NULL AND claim_expires_at IS NOT NULL))
);
CREATE INDEX portal_media_uploads_expiry ON portal_media_uploads(state, expires_at);
CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON portal_media_uploads
 FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable();
