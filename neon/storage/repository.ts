import {
  assertPreviousWrite,
  one,
  type Database,
  type SQL,
} from "../../lib/db";
import { attendancePredicate } from "../../lib/portal-status";
import { demand } from "../../lib/security";
import type { MediaRepository, MediaUpload, ValidatedImage } from "./types";

/** Reference DDL for the numbered Postgres migration owner; never run implicitly. */
export const mediaTableDDL = `CREATE TABLE portal_media_uploads (
  id text PRIMARY KEY,
  actor_id text NOT NULL REFERENCES users(id),
  team_id text NOT NULL REFERENCES teams(id),
  revision integer NOT NULL CHECK (revision >= 0),
  kind text NOT NULL CHECK (kind IN ('logo','banner')),
  bucket text NOT NULL,
  staging_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg')),
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 32 AND CASE kind WHEN 'logo' THEN 1000000 ELSE 5000000 END),
  expires_at text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','finalizing','ready','consumed')),
  claim_token text,
  claim_expires_at text,
  object_key text UNIQUE,
  image_content_type text CHECK (image_content_type IN ('image/png','image/jpeg')),
  image_byte_length integer CHECK (image_byte_length BETWEEN 32 AND CASE kind WHEN 'logo' THEN 131072 ELSE 393216 END),
  width integer CHECK (width BETWEEN 1 AND 4096),
  height integer CHECK (height BETWEEN 1 AND 4096),
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
CREATE INDEX portal_media_uploads_expiry ON portal_media_uploads(state, expires_at);`;

type Row = {
  id: string;
  actor_id: string;
  team_id: string;
  revision: number;
  kind: MediaUpload["kind"];
  bucket: string;
  staging_key: string;
  content_type: MediaUpload["contentType"];
  byte_length: number;
  expires_at: string;
  state: MediaUpload["state"];
  claim_token: string | null;
  claim_expires_at: string | null;
  object_key: string | null;
  image_content_type: MediaUpload["contentType"] | null;
  image_byte_length: number | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
  version_id: string | null;
};
const fromRow = (row: Row): MediaUpload => ({
  id: row.id,
  actorId: row.actor_id,
  teamId: row.team_id,
  revision: row.revision,
  kind: row.kind,
  bucket: row.bucket,
  stagingKey: row.staging_key,
  contentType: row.content_type,
  byteLength: row.byte_length,
  expiresAt: row.expires_at,
  state: row.state,
  claimToken: row.claim_token,
  claimExpiresAt: row.claim_expires_at,
  objectKey: row.object_key,
  versionId: row.version_id,
  image:
    row.image_content_type &&
    row.sha256 &&
    row.image_byte_length &&
    row.width &&
    row.height
      ? {
          contentType: row.image_content_type,
          byteLength: row.image_byte_length,
          width: row.width,
          height: row.height,
          sha256: row.sha256,
        }
      : null,
});

export function createDatabaseMediaRepository(db: Database): MediaRepository {
  return {
    async insert(upload) {
      await db
        .prepare(
          `INSERT INTO portal_media_uploads
        (id,actor_id,team_id,revision,kind,bucket,staging_key,content_type,byte_length,expires_at,state)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          upload.id,
          upload.actorId,
          upload.teamId,
          upload.revision,
          upload.kind,
          upload.bucket,
          upload.stagingKey,
          upload.contentType,
          upload.byteLength,
          upload.expiresAt,
          "pending",
        )
        .all();
    },
    async find(id) {
      const row = await one<Row>(
        db,
        "SELECT * FROM portal_media_uploads WHERE id=?",
        id,
      );
      return row ? fromRow(row) : undefined;
    },
    async claim(id, token, now, until) {
      return !!(await one(
        db,
        `UPDATE portal_media_uploads SET state='finalizing',claim_token=?,claim_expires_at=?
        WHERE id=? AND expires_at>? AND (state='pending' OR (state='finalizing' AND claim_expires_at<=?)) RETURNING id`,
        token,
        until,
        id,
        now,
        now,
      ));
    },
    async complete(id, token, objectKey, image, now, expiresAt) {
      return !!(await one(
        db,
        `UPDATE portal_media_uploads SET state='ready',object_key=?,image_content_type=?,
        image_byte_length=?,width=?,height=?,sha256=?,finalized_at=?,expires_at=?,claim_token=NULL,claim_expires_at=NULL
        WHERE id=? AND state='finalizing' AND claim_token=? AND claim_expires_at>? AND expires_at>? RETURNING id`,
        objectKey,
        image.contentType,
        image.byteLength,
        image.width,
        image.height,
        image.sha256,
        now,
        expiresAt,
        id,
        token,
        now,
        now,
      ));
    },
    async release(id, token) {
      await db
        .prepare(
          `UPDATE portal_media_uploads SET state='pending',claim_token=NULL,claim_expires_at=NULL
        WHERE id=? AND state='finalizing' AND claim_token=?`,
        )
        .bind(id, token)
        .all();
    },
  };
}

/**
 * Append after the new submission_versions INSERT and project revision increment,
 * inside that same PortalService.mutate transaction. A stale/replayed/foreign receipt
 * rolls back the submission. Call requireSubmissionAccess and validate payload first.
 */
export function mediaConsumeStatements(input: {
  actorId: string;
  teamId: string;
  revision: number;
  versionId: string;
  receipts: { receiptId: string; kind: MediaUpload["kind"] }[];
  now: string;
}): SQL[] {
  demand(
    input.receipts.length >= 1 &&
      input.receipts.length <= 2 &&
      new Set(input.receipts.map((r) => r.kind)).size ===
        input.receipts.length &&
      new Set(input.receipts.map((r) => r.receiptId)).size ===
        input.receipts.length,
    422,
    "INVALID_MEDIA_RECEIPTS",
  );
  const statements: SQL[] = [];
  for (const item of input.receipts) {
    statements.push([
      `UPDATE portal_media_uploads SET state='consumed',version_id=?,consumed_at=?
      WHERE id=? AND actor_id=? AND team_id=? AND revision=? AND kind=? AND state='ready' AND version_id IS NULL AND expires_at>?
      AND EXISTS(SELECT 1 FROM submission_versions v WHERE v.id=? AND v.team_id=portal_media_uploads.team_id)
      AND EXISTS(SELECT 1 FROM projects p WHERE p.team_id=portal_media_uploads.team_id AND p.revision=?)
      AND EXISTS(SELECT 1 FROM teams t JOIN memberships m ON m.team_id=t.id JOIN users authority_actor ON authority_actor.id=m.user_id
        WHERE t.id=portal_media_uploads.team_id AND t.leader_id=portal_media_uploads.actor_id
          AND authority_actor.id=portal_media_uploads.actor_id AND ${attendancePredicate("authority_actor.id")})
      AND NOT EXISTS(SELECT 1 FROM result_snapshots)
      AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND
        ((rr.kind='team' AND rr.target_id=portal_media_uploads.team_id)
         OR (rr.kind='submission' AND rr.target_id=?)
         OR (rr.kind='project' AND rr.target_id IN (SELECT p.id FROM projects p WHERE p.team_id=portal_media_uploads.team_id))))`,
      input.versionId,
      input.now,
      item.receiptId,
      input.actorId,
      input.teamId,
      input.revision,
      item.kind,
      input.now,
      input.versionId,
      input.revision + 1,
      input.versionId,
    ]);
    statements.push(...assertPreviousWrite());
  }
  return statements;
}
