import { createHash } from "node:crypto";
import {
  applyPortalMigrations,
  loadPortalMigrations,
} from "../neon/db/migrate";
import { loadMigrationPlan } from "../neon/migration-plan";
import { batch, rows } from "../lib/db";
import { seedLocal } from "../scripts/fixtures";
import { createPGliteFixture } from "./neon-db-fixture";

/** Fresh disposable PostgreSQL schema only. Never opens a filesystem DB or URL. */
export async function legacyLedgerIndependentFixture(
  encoding: "lf" | "crlf" = "crlf",
) {
  const f = await createPGliteFixture({
    excludeMigrations: (await loadPortalMigrations()).map((m) => m.name),
  });
  const plan = await loadMigrationPlan();
  await applyPortalMigrations(
    f.pool,
    plan
      .filter((m) => m.name < "0102")
      .map((m) => {
        const sql = encoding === "crlf" ? m.sql.replace(/\n/g, "\r\n") : m.sql;
        return {
          ...m,
          sql,
          checksum: createHash("sha256").update(sql).digest("hex"),
        };
      }),
  );
  await seedLocal(f.db);
  const at = "2026-10-22T08:00:00.000Z";
  await batch(f.db, [
    ["INSERT INTO check_ins VALUES('fake_alice','fake_admin',?)", at],
    [
      "INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email) VALUES('fake_item_0','fake_credit','fake_alice',?,'alice@portal.test')",
      at,
    ],
    [
      "INSERT INTO auth_users(id,email,name,email_verified_at) VALUES('fake_alice','alice@portal.test','Synthetic Alice',?)",
      at,
    ],
    [
      "INSERT INTO auth_sessions(token_hash,auth_user_id,expires_at) VALUES('synthetic-independent-session-hash','fake_alice',1900000000000)",
    ],
    [
      "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES('synthetic-independent-version','fake_team1',1,?,'2026-11-01T04:30:00.000Z')",
      JSON.stringify({
        projectName: "Synthetic preserved project",
        description: "Independent local upgrade fixture",
        attestation: true,
      }),
    ],
    [
      "INSERT INTO projects(id,team_id,slug,draft,revision,published_version_id,updated_at) VALUES('synthetic-independent-project','fake_team1','synthetic-independent-project','{}',1,'synthetic-independent-version',?)",
      at,
    ],
    [
      "INSERT INTO approved_evaluation_snapshots(version_id,commit_sha,snapshot_json,snapshot_sha256,approved_by,approved_at) VALUES('synthetic-independent-version',?,'{\"synthetic\":true}',?,'fake_owner',?)",
      "b".repeat(40),
      createHash("sha256").update('{"synthetic":true}').digest("hex"),
      at,
    ],
    [
      `INSERT INTO portal_media_uploads
       (id,actor_id,team_id,revision,kind,bucket,staging_key,content_type,byte_length,expires_at,state,
        object_key,image_content_type,image_byte_length,width,height,sha256,finalized_at)
       VALUES('synthetic-independent-ready','fake_alice','fake_team1',0,'banner','synthetic-bucket',
        'synthetic/staging','image/png',100,'2030-01-01T00:00:00.000Z','ready','synthetic/saved',
        'image/png',100,64,64,?,?)`,
      "a".repeat(64),
      at,
    ],
  ]);
  const identity = (
    await f.engine.query<{ database: string; role: string }>(
      "SELECT current_database() database,current_user role",
    )
  ).rows[0];
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of [
      "users",
      "registrations",
      "profiles",
      "participant_profiles",
      "profile_details",
      "teams",
      "memberships",
      "ideas",
      "projects",
      "submission_versions",
      "approved_evaluation_snapshots",
      "credit_types",
      "credit_inventory",
      "credit_allocations",
      "credit_batches",
      "credit_batch_columns",
      "portal_media_uploads",
      "auth_users",
      "auth_sessions",
      "portal_schema_migrations",
    ])
      result[table] = await rows(f.db, `SELECT * FROM ${table} ORDER BY 1,2`);
    return result;
  };
  return { ...f, plan, identity, snapshot };
}
