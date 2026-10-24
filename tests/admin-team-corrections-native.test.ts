import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { createPostgresDatabase, type PostgresPool } from "../neon/db/adapter";
import { applyPortalMigrations } from "../neon/db/migrate";
import { loadMigrationPlan } from "../neon/migration-plan";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows } from "../lib/db";

const configured = process.env.PORTAL_TEST_POSTGRES_URL;
if (
  configured &&
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(configured).hostname)
)
  throw new Error("POSTGRES_TEST_REQUIRES_LOOPBACK");

test(
  "native PostgreSQL: concurrent guarded admin corrections retain max5, one team per person, rename CAS and empty guards",
  { skip: !configured },
  async () => {
    const admin = new Pool({ connectionString: configured, max: 1 });
    const schema = "portal_admin_team_test_" + randomUUID().replaceAll("-", "");
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: configured,
      max: 12,
      options: `-c search_path=${schema},public`,
    });
    const db = createPostgresDatabase(pool as unknown as PostgresPool, {
      retries: 10,
    });
    const at = "2026-10-22T08:00:00.000Z";
    const service = (who = "admin") =>
      new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => at);
    try {
      await applyPortalMigrations(
        pool as unknown as PostgresPool,
        await loadMigrationPlan(),
      );
      await seedLocal(db);
      await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
      await batch(
        db,
        Array.from({ length: 7 }, (_, i) => [
          [
            "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)",
            `native_candidate_${i}`,
            `native-candidate${i}@example.invalid`,
            `Native candidate ${i}`,
            at,
          ],
          [
            "INSERT INTO registrations(email,status) VALUES(?,'pending')",
            `native-candidate${i}@example.invalid`,
          ],
        ]).flat() as any,
      );
      const additions = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          service().command("admin-add-team-member", {
            teamId: "fake_team3",
            email: `native-candidate${i}@example.invalid`,
            confirmation: "ADD_TEAM_MEMBER",
          }),
        ),
      );
      assert.equal(additions.filter((r) => r.status === "fulfilled").length, 2);
      assert.equal(
        (
          await one<any>(
            db,
            "SELECT count(*) n FROM memberships WHERE team_id='fake_team3'",
          )
        )?.n,
        5,
      );
      await batch(db, [
        [
          "INSERT INTO teams VALUES('native_other_team','Native other team','fake_admin','',?)",
          at,
        ],
        [
          "INSERT INTO memberships VALUES('fake_admin','native_other_team',?)",
          at,
        ],
      ]);
      const global = await Promise.allSettled(
        ["fake_team1", "native_other_team"].map((teamId) =>
          service().command("admin-add-team-member", {
            teamId,
            email: "native-candidate6@example.invalid",
            confirmation: "ADD_TEAM_MEMBER",
          }),
        ),
      );
      assert.equal(global.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await one<any>(
            db,
            "SELECT count(*) n FROM memberships WHERE user_id='native_candidate_6'",
          )
        )?.n,
        1,
      );
      const names = await Promise.allSettled(
        ["COMMON GROUND", "Common ground"].map((name) =>
          service().command("admin-rename-team", {
            teamId: "fake_team3",
            name,
            expectedName: "Common Ground",
            confirmation: "RENAME_TEAM",
          }),
        ),
      );
      assert.equal(names.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
      assert.equal(
        (
          await one<any>(
            db,
            "SELECT leader_id FROM teams WHERE id='fake_team3'",
          )
        )?.leader_id,
        "fake_bob",
      );
      assert.equal(
        (await rows(db, "SELECT * FROM team_locks WHERE team_id='fake_team3'"))
          .length,
        1,
      );
    } finally {
      await db.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
