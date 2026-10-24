import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { submission_versions, users } from "../db/schema";

// One-way revocation and mutation isolation are enforced by the reviewed0101 SQL
// triggers; never replace the migration runner with drizzle-kit push.
export const approvedEvaluationSnapshots = pgTable(
  "approved_evaluation_snapshots",
  {
    versionId: text("version_id")
      .primaryKey()
      .references(() => submission_versions.id),
    commitSha: text("commit_sha").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    snapshotSha256: text("snapshot_sha256").notNull(),
    approvedBy: text("approved_by")
      .notNull()
      .references(() => users.id),
    approvedAt: text("approved_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => [
    check("approved_commit_sha", sql`${t.commitSha} ~ '^[a-f0-9]{40}$'`),
    check(
      "approved_snapshot_size",
      sql`octet_length(${t.snapshotJson})<=196608`,
    ),
    check(
      "approved_snapshot_sha256",
      sql`${t.snapshotSha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
