import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import {
  createPostgresDatabase,
  type PostgresPool,
  type PostgresResult,
} from "../neon/db/adapter";
import {
  applyPortalMigrations,
  type PortalMigration,
} from "../neon/db/migrate";
import { loadMigrationPlan } from "../neon/migration-plan";
import { batch, rows, one, type Database } from "../lib/db";
import { seedLocal } from "../scripts/fixtures";

// Pinned independently before the rename, at cf8de0b. A filename-only repair
// must preserve all historical bytes and both previously unapplied SQL bodies.
const checksums = {
  "0000_compatibility.sql":
    "5e5f7c29d376532f6a32771f556f965aaed666c3bd8bf6fc32d2f00bd9f0ac66",
  "0001_portal.sql":
    "f9e5a1379f598c6c7bc86c771148f16c4c7d5767c773dffbcb14e50e7285b031",
  "0002_invariants.sql":
    "abdea4e04ea373c8a86ba2848d10a0122ab09308f52c1e51d439d138a8670928",
  "0003_transaction_safety.sql":
    "9e3e440b4d0a14d1fee077a3a4c9ab92fd972d61e377931f602f46d0f5bbed24",
  "0004_media_uploads.sql":
    "32cf9496df32661e65299f846359da306b8efca2a15f4c6070b8f0f8a1cab8e7",
  "0100_auth.sql":
    "d7a7d26116c1cf892f129edfbbf70ee4a7b3014165667e5b4b7cda8a916d6bbf",
  "0101_approved_evaluation.sql":
    "21929ac1cf790d34644b385fa4506c69db6df9be3d5ddaae00db9ee2bccb5797",
  "0102_credit_stock.sql":
    "74bf8549edbecb753424a86e692844e962be02c0faeddda8f0b2dd3ffaacb72e",
  "0103_project_media_limits.sql":
    "3f42da160787977b7655fe74647655bd656f4c55467c2a42b3dd1627859f462c",
} as const;
const historicalNames = Object.keys(checksums).slice(0, 7);
const expectedNames = Object.keys(checksums);
const time = "2026-10-22T08:00:00.000Z";
// Preserve the original nine-entry ordering/byte proof; 0104 has its own current-plan upgrade tests.
const legacyPlan = async () =>
  (await loadMigrationPlan()).filter((m) => expectedNames.includes(m.name));

async function fixture() {
  const engine = new PGlite({ extensions: { citext } });
  const pool: PostgresPool = {
    async connect() {
      return {
        async query(sql, values) {
          if (values)
            return (await engine.query(
              sql,
              values,
            )) as unknown as PostgresResult;
          const results = await engine.exec(sql);
          return (results.at(-1) as unknown as PostgresResult) ?? { rows: [] };
        },
        release() {},
      };
    },
    async end() {
      await engine.close();
    },
  };
  return { engine, pool, db: createPostgresDatabase(pool) };
}

async function ledger(db: Database) {
  return rows<{ name: string; checksum: string; applied_at: unknown }>(
    db,
    "SELECT name,checksum,applied_at FROM portal_schema_migrations ORDER BY name",
  );
}

async function seedExisting(db: Database) {
  await seedLocal(db);
  await batch(db, [
    ["INSERT INTO check_ins VALUES('fake_alice','fake_admin',?)", time],
    [
      "INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email) VALUES('fake_item_0','fake_credit','fake_alice',?,'alice@portal.test')",
      time,
    ],
    [
      "INSERT INTO auth_users(id,email,name,email_verified_at) VALUES('fake_alice','alice@portal.test','Synthetic Alice',?)",
      time,
    ],
    [
      "INSERT INTO auth_sessions(token_hash,auth_user_id,expires_at) VALUES('synthetic-not-a-real-session-hash','fake_alice',1900000000000)",
    ],
    [
      "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES('synthetic-old-version','fake_team1',1,?,'2026-11-01T04:30:00.000Z')",
      JSON.stringify({
        projectName: "Synthetic existing project",
        problemSolution: "Synthetic migration preservation evidence only.",
        description:
          "This committed payload must survive the additive upgrade.",
        github: "https://github.com/example/synthetic-project",
        attestation: true,
      }),
    ],
    [
      "INSERT INTO projects(id,team_id,slug,draft,revision,published_version_id,updated_at) VALUES('synthetic-old-project','fake_team1','synthetic-old-project','{}',1,'synthetic-old-version',?)",
      time,
    ],
    [
      "INSERT INTO approved_evaluation_snapshots(version_id,commit_sha,snapshot_json,snapshot_sha256,approved_by,approved_at) VALUES('synthetic-old-version',?,'{\"synthetic\":true}',?,'fake_owner',?)",
      "b".repeat(40),
      createHash("sha256").update('{"synthetic":true}').digest("hex"),
      time,
    ],
    [
      `INSERT INTO portal_media_uploads
      (id,actor_id,team_id,revision,kind,bucket,staging_key,content_type,byte_length,
       expires_at,state,object_key,image_content_type,image_byte_length,width,height,sha256,finalized_at)
      VALUES('synthetic-old-ready','fake_alice','fake_team1',0,'banner','synthetic-bucket',
       'synthetic/staging','image/png',100,'2030-01-01T00:00:00.000Z','ready','synthetic/saved',
       'image/png',100,64,64,?,?)`,
      "a".repeat(64),
      time,
    ],
  ]);
}

async function snapshot(db: Database) {
  const entries: [string, Record<string, unknown>[]][] = [];
  // PGlite has one connection. Keep adapter transactions sequential rather
  // than pretending that this harness provides a native PostgreSQL pool.
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
  ])
    entries.push([
      table,
      await rows(db, `SELECT * FROM ${table} ORDER BY 1,2`),
    ]);
  return Object.fromEntries(entries);
}

async function existing() {
  const f = await fixture();
  const plan = await legacyPlan();
  const baseline = plan.filter((m) => historicalNames.includes(m.name));
  assert.deepEqual(
    baseline.map((m) => m.name),
    historicalNames,
  );
  assert.deepEqual(
    await applyPortalMigrations(f.pool, baseline),
    historicalNames,
  );
  await seedExisting(f.db);
  return { ...f, plan };
}

function formerPlan(plan: PortalMigration[]) {
  return plan
    .map((m) => ({
      ...m,
      name: m.name
        .replace(/^0102_credit_stock/, "0005_credit_stock")
        .replace(/^0103_project_media_limits/, "0006_project_media_limits"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

test("combined upgrade: old 0005 stock plan rejects an existing 0101 ledger without partial writes", async (t) => {
  const f = await existing();
  try {
    const before = await snapshot(f.db),
      journal = await ledger(f.db);
    await assert.rejects(
      applyPortalMigrations(f.pool, formerPlan(f.plan)),
      /MIGRATION_OUT_OF_ORDER: 0005_credit_stock\.sql/,
    );
    assert.deepEqual(await ledger(f.db), journal);
    assert.deepEqual(await snapshot(f.db), before);
    await assert.rejects(one(f.db, "SELECT * FROM credit_category_keys"));
    await assert.rejects(one(f.db, "SELECT * FROM credit_code_history"));
    t.diagnostic(
      "Reproduced MIGRATION_OUT_OF_ORDER: 0005_credit_stock.sql against the real seven-entry combined ledger ending0101; ledger/data unchanged",
    );
  } finally {
    await f.db.close();
  }
});

test("combined upgrade: production loader preserves the nine-entry historical ordered prefix with unchanged SQL checksums", async () => {
  const plan = await legacyPlan();
  assert.deepEqual(
    plan.map((m) => m.name),
    expectedNames,
  );
  for (const migration of plan) {
    assert.equal(
      migration.checksum,
      checksums[migration.name as keyof typeof checksums],
    );
    assert.equal(
      createHash("sha256").update(migration.sql).digest("hex"),
      migration.checksum,
    );
  }
});

test("combined upgrade: append exactly0102/0103 to existing auth/evaluation ledger, preserve stock/assignment/media/auth rows, repeat[]", async (t) => {
  const f = await existing();
  try {
    const before = await snapshot(f.db),
      journal = await ledger(f.db);
    assert.equal(journal.length, 7);
    assert.deepEqual(await applyPortalMigrations(f.pool, f.plan), [
      "0102_credit_stock.sql",
      "0103_project_media_limits.sql",
    ]);
    assert.deepEqual(await snapshot(f.db), before);
    const upgraded = await ledger(f.db);
    assert.equal(upgraded.length, 9);
    assert.deepEqual(upgraded.slice(0, 7), journal);
    assert.deepEqual(
      upgraded.map((m) => m.name),
      expectedNames,
    );
    assert.equal(
      (await rows(f.db, "SELECT * FROM credit_code_history")).length,
      20,
    );
    assert.equal(
      (await rows(f.db, "SELECT * FROM credit_allocations")).length,
      1,
    );
    assert.equal(
      (await rows(f.db, "SELECT * FROM submission_versions")).length,
      1,
    );
    assert.equal((await rows(f.db, "SELECT * FROM projects")).length, 1);
    assert.equal(
      (await rows(f.db, "SELECT * FROM approved_evaluation_snapshots")).length,
      1,
    );
    assert.equal(
      (
        await one(
          f.db,
          "SELECT assigned FROM credit_code_history WHERE inventory_id='fake_item_0'",
        )
      )?.assigned,
      1,
    );
    const history = await rows(
      f.db,
      "SELECT * FROM credit_code_history ORDER BY inventory_id",
    );
    await batch(f.db, [
      [
        "UPDATE portal_media_uploads SET byte_length=5000000,image_byte_length=393216,width=1 WHERE id='synthetic-old-ready'",
      ],
    ]);
    await assert.rejects(
      batch(f.db, [
        [
          "UPDATE portal_media_uploads SET byte_length=5000001 WHERE id='synthetic-old-ready'",
        ],
      ]),
      /check constraint/,
    );
    const upgradedRows = await snapshot(f.db);
    assert.deepEqual(await applyPortalMigrations(f.pool, f.plan), []);
    assert.deepEqual(await ledger(f.db), upgraded);
    assert.deepEqual(await snapshot(f.db), upgradedRows);
    assert.deepEqual(
      await rows(
        f.db,
        "SELECT * FROM credit_code_history ORDER BY inventory_id",
      ),
      history,
    );
    t.diagnostic(
      "Applied[0102_credit_stock.sql,0103_project_media_limits.sql]; ledger7→9; repeat[]; existing participants/profiles/3teams/1project/1committed submission/approved evaluation/1assignment/20inventory/ready media/auth session preserved; media limits enforced",
    );
  } finally {
    await f.db.close();
  }
});

test("combined upgrade: fresh install uses the same real ordered loader and repeats without writes", async () => {
  const f = await fixture();
  try {
    const plan = await legacyPlan();
    assert.deepEqual(await applyPortalMigrations(f.pool, plan), expectedNames);
    const journal = await ledger(f.db);
    assert.equal(journal.length, 9);
    assert.deepEqual(await applyPortalMigrations(f.pool, plan), []);
    assert.deepEqual(await ledger(f.db), journal);
    await seedExisting(f.db);
    assert.equal(
      (await rows(f.db, "SELECT * FROM credit_code_history")).length,
      20,
    );
  } finally {
    await f.db.close();
  }
});

for (const collision of ["source header", "global fingerprint"] as const) {
  test(`combined upgrade: ${collision} collision rolls both new migrations and ledger back, preserving old data`, async (t) => {
    const f = await existing();
    try {
      if (collision === "source header")
        await batch(f.db, [
          [
            "INSERT INTO credit_types VALUES('synthetic-collision','  BUILDER BOOST (FAKE)  ','Synthetic conflicting header',1)",
          ],
        ]);
      else
        await batch(f.db, [
          [
            "INSERT INTO credit_types VALUES('synthetic-collision','Different synthetic category','Synthetic conflicting code',1)",
          ],
          [
            "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) SELECT 'synthetic-collision-item','synthetic-collision',ciphertext,fingerprint,created_at,voucher_value FROM credit_inventory WHERE id='fake_item_0'",
          ],
        ]);
      const before = await snapshot(f.db),
        journal = await ledger(f.db);
      await assert.rejects(
        applyPortalMigrations(f.pool, f.plan),
        (error) => (error as { code?: string }).code === "23505",
      );
      assert.deepEqual(await ledger(f.db), journal);
      assert.deepEqual(await snapshot(f.db), before);
      await assert.rejects(one(f.db, "SELECT * FROM credit_category_keys"));
      await assert.rejects(one(f.db, "SELECT * FROM credit_code_history"));
      // The second migration must also remain unapplied, not merely unjournaled.
      await assert.rejects(
        batch(f.db, [
          [
            "UPDATE portal_media_uploads SET byte_length=5000000 WHERE id='synthetic-old-ready'",
          ],
        ]),
        /check constraint/,
      );
      t.diagnostic(
        `Collision ${collision}:23505; prior7 ledger entries+rows unchanged; both new tables absent; old media bounds retained`,
      );
    } finally {
      await f.db.close();
    }
  });
}
