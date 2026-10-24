import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import {
  createPostgresDatabase,
  type PostgresPool,
  type PostgresResult,
} from "../neon/db/adapter";
import {
  loadPortalMigrations,
  applyPortalMigrations,
} from "../neon/db/migrate";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { attend, rehearsalPolicy, submission } from "./helpers";
import { PortalService } from "../lib/service";
import { batch, one, rows } from "../lib/db";
import { projectImageByteLimit } from "../lib/project-media-policy";

test("additive media upgrade preserves old pending/ready/consumed rows and enforces kind-specific bounds atomically", async () => {
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
  const db = createPostgresDatabase(pool);
  try {
    // Scope this historical media-limit proof to the migration it verifies.
    const migrations = (await loadPortalMigrations()).filter(
      (m) => m.name <= "0103_project_media_limits.sql",
    );
    const before = migrations.filter(
      (m) => m.name < "0103_project_media_limits",
    );
    await applyPortalMigrations(pool, before);
    await seedLocal(db);
    await batch(db, [
      [
        "UPDATE event_settings SET policy=?,active=1 WHERE id=1",
        JSON.stringify(rehearsalPolicy),
      ],
    ]);
    await attend(db, "fake_alice");
    const service = new PortalService(
      db,
      fixtures.alice,
      LOCAL_CREDIT_KEY,
      () => "2026-11-01T04:30:00.000Z",
    );
    const committed = (await service.command("submit-project", {
      revision: 0,
      project: {
        projectName: submission.projectName,
        problemSolution: submission.problemSolution,
        description: submission.description,
        logo: submission.logo,
        banner: submission.banner,
        github: submission.github,
        demo: "",
        tools: submission.tools,
        attestation: true,
      },
    })) as { versionId: string };
    for (const state of ["pending", "ready", "consumed"]) {
      const complete = state !== "pending";
      await db
        .prepare(
          `INSERT INTO portal_media_uploads
    (id,actor_id,team_id,revision,kind,bucket,staging_key,content_type,byte_length,expires_at,state,
    object_key,image_content_type,image_byte_length,width,height,sha256,finalized_at,consumed_at,version_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          `old-${state}`,
          "fake_alice",
          "fake_team1",
          0,
          "logo",
          "project-media",
          `old/${state}`,
          "image/png",
          100,
          "2030-01-01T00:00:00.000Z",
          state,
          complete ? `old-object/${state}` : null,
          complete ? "image/png" : null,
          complete ? 100 : null,
          complete ? 64 : null,
          complete ? 64 : null,
          complete ? "a".repeat(64) : null,
          complete ? "2026-11-01T04:30:00.000Z" : null,
          state === "consumed" ? "2026-11-01T04:30:00.000Z" : null,
          state === "consumed" ? committed.versionId : null,
        )
        .all();
    }
    const old = await rows(
      db,
      "SELECT * FROM portal_media_uploads ORDER BY id",
    );
    await assert.rejects(
      db
        .prepare(
          "UPDATE portal_media_uploads SET byte_length=1000000 WHERE id='old-pending'",
        )
        .all(),
      /check constraint/,
    );
    const applied = await applyPortalMigrations(pool, migrations);
    assert.equal(applied.length, 1);
    assert.deepEqual(
      await rows(db, "SELECT * FROM portal_media_uploads ORDER BY id"),
      old,
    );
    assert.deepEqual(await applyPortalMigrations(pool, migrations), []);
    for (const kind of ["logo", "banner"] as const) {
      await db
        .prepare(
          "UPDATE portal_media_uploads SET kind=?,byte_length=?,image_byte_length=?,width=1,height=4096 WHERE id='old-ready'",
        )
        .bind(
          kind,
          projectImageByteLimit(kind, "source"),
          projectImageByteLimit(kind),
        )
        .all();
      for (const [field, value] of [
        ["byte_length", projectImageByteLimit(kind, "source") + 1],
        ["image_byte_length", projectImageByteLimit(kind) + 1],
        ["width", 0],
        ["height", 4097],
      ] as const) {
        await assert.rejects(
          db
            .prepare(
              `UPDATE portal_media_uploads SET ${field}=? WHERE id='old-ready'`,
            )
            .bind(value)
            .all(),
          /check constraint/,
        );
      }
    }
    const beforeRollback = await one(
      db,
      "SELECT * FROM portal_media_uploads WHERE id='old-ready'",
    );
    await assert.rejects(
      batch(db, [
        [
          "UPDATE portal_media_uploads SET bucket='rollback-marker' WHERE id='old-pending'",
        ],
        [
          "UPDATE portal_media_uploads SET image_byte_length=393217 WHERE id='old-ready'",
        ],
      ]),
      /check constraint/,
    );
    assert.equal(
      (
        await one<{ bucket: string }>(
          db,
          "SELECT bucket FROM portal_media_uploads WHERE id='old-pending'",
        )
      )?.bucket,
      "project-media",
    );
    assert.deepEqual(
      await one(db, "SELECT * FROM portal_media_uploads WHERE id='old-ready'"),
      beforeRollback,
    );
    assert.deepEqual(
      (
        await rows<{ state: string }>(
          db,
          "SELECT state FROM portal_media_uploads ORDER BY id",
        )
      ).map((row) => row.state),
      ["consumed", "pending", "ready"],
    );
  } finally {
    await db.close();
  }
});
