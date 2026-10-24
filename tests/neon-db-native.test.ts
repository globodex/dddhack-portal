import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { createPostgresDatabase, type PostgresPool } from "../neon/db/adapter";
import {
  applyPortalMigrations,
  loadPortalMigrations,
} from "../neon/db/migrate";
import { seedLocal } from "../scripts/fixtures";
import { batch, assertPreviousWrite, one } from "../lib/db";
import { draftPolicy } from "../lib/policy";

const configured = process.env.PORTAL_TEST_POSTGRES_URL;
// This opt-in test creates/drops an isolated schema only in a loopback test DB.
// Never point it at a tunnel or a production database.
if (
  configured &&
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(configured).hostname)
)
  throw new Error("POSTGRES_TEST_REQUIRES_LOOPBACK");

test(
  "native PostgreSQL concurrent connections preserve guards, member/vote caps, three attempts, and frozen snapshots",
  { skip: !configured },
  async () => {
    const admin = new Pool({ connectionString: configured, max: 1 });
    const schema = "portal_synthetic_test_" + randomUUID().replaceAll("-", "");
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: configured,
      max: 12,
      options: `-c search_path=${schema},public`,
    });
    const db = createPostgresDatabase(pool as unknown as PostgresPool, {
      retries: 10,
    });
    try {
      await applyPortalMigrations(
        pool as unknown as PostgresPool,
        await loadPortalMigrations(),
      );
      await seedLocal(db);
      const time = "2026-11-01T06:00:00.000Z";
      await db
        .prepare("UPDATE event_settings SET active=1,policy=? WHERE id=1")
        .bind(JSON.stringify(draftPolicy))
        .all();
      const [left, right] = await Promise.allSettled(
        [0, 1].map((i) =>
          batch(db, [
            [
              "UPDATE event_settings SET version=version+1 WHERE id=1 AND version=1",
            ],
            ...assertPreviousWrite(),
            [
              "INSERT INTO audit_logs VALUES(?,?,'race','fixture','{}','Synthetic test',?)",
              "race_" + i,
              "fake_admin",
              time,
            ],
          ]),
        ),
      );
      assert.equal(
        [left, right].filter((r) => r.status === "fulfilled").length,
        1,
      );
      assert.equal(
        (await one(db, "SELECT count(*) n FROM audit_logs WHERE action='race'"))
          ?.n,
        1,
      );

      // Three existing members plus seven simultaneous additions: exactly two fit.
      const candidates = Array.from(
        { length: 7 },
        (_, i) => "race_member_" + i,
      );
      await batch(
        db,
        candidates.flatMap((id) => [
          [
            "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)",
            id,
            id + "@portal.test",
            id,
            time,
          ],
        ]),
      );
      const members = await Promise.allSettled(
        candidates.map((id) =>
          db
            .prepare("INSERT INTO memberships VALUES(?,?,?)")
            .bind(id, "fake_team3", "2026-10-22T08:00:00Z")
            .all(),
        ),
      );
      assert.equal(members.filter((r) => r.status === "fulfilled").length, 2);
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*) n FROM memberships WHERE team_id='fake_team3'",
          )
        )?.n,
        5,
      );
      await db
        .prepare("INSERT INTO check_ins VALUES(?,?,?)")
        .bind("fake_alice", "fake_admin", time)
        .all();
      let arrivals = 0;
      let unblock!: () => void;
      const barrier = new Promise<void>((resolve) => {
        unblock = resolve;
      });
      const synchronizedPool: PostgresPool = {
        async connect() {
          const client = await pool.connect();
          return {
            async query(text, values) {
              const result = await client.query(text, values);
              // All ten transactions hold a snapshot before attempting MAX+1.
              if (text.startsWith("SELECT MAX ( attempt )")) {
                arrivals++;
                if (arrivals <= 10) {
                  if (arrivals === 10) unblock();
                  await barrier;
                }
              }
              return result;
            },
            release() {
              client.release();
            },
          };
        },
        async end() {},
      };
      const synchronized = createPostgresDatabase(synchronizedPool, {
        retries: 10,
      });
      const submissions = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          batch(synchronized, [
            [
              "SELECT MAX(attempt) FROM submission_versions WHERE team_id=?",
              "fake_team1",
            ],
            [
              "INSERT INTO submission_versions SELECT ?,?,COALESCE(MAX(attempt),0)+1,?,? FROM submission_versions WHERE team_id=?",
              "race_version_" + i,
              "fake_team1",
              "{}",
              time,
              "fake_team1",
            ],
          ]),
        ),
      );
      assert.equal(
        submissions.filter((r) => r.status === "fulfilled").length,
        3,
      );
      assert.equal(
        (await one(db, "SELECT count(*) n FROM submission_versions"))?.n,
        3,
      );

      await db
        .prepare("INSERT INTO check_ins VALUES(?,?,?)")
        .bind("fake_owner", "fake_admin", time)
        .all();
      await batch(
        db,
        candidates.map((id, i) => [
          "INSERT INTO teams VALUES(?,?,?,?,?)",
          "vote_team_" + i,
          "Vote team " + i,
          id,
          "",
          time,
        ]),
      );
      const votes = await Promise.allSettled(
        candidates.map((_, i) =>
          db
            .prepare("INSERT INTO votes VALUES(?,?,?)")
            .bind("fake_owner", "vote_team_" + i, "2026-11-01T11:00:00Z")
            .all(),
        ),
      );
      assert.equal(votes.filter((r) => r.status === "fulfilled").length, 3);
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*) n FROM votes WHERE voter_id='fake_owner'",
          )
        )?.n,
        3,
      );

      // Both snapshots see the same source revision; serializable conflict retry
      // rechecks existence and permits exactly one immutable frozen result.
      const revision = (await one<{ version: number }>(
        db,
        "SELECT version FROM scoring_revision WHERE id=1",
      ))!.version;
      const freezes = await Promise.allSettled(
        [0, 1].map((i) =>
          db
            .prepare("INSERT INTO result_snapshots VALUES(?,?,?,?,?,?)")
            .bind("race_snapshot_" + i, 1, revision, "[]", time, "fake_owner")
            .all(),
        ),
      );
      assert.equal(freezes.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (await one(db, "SELECT count(*) n FROM result_snapshots"))?.n,
        1,
      );
      assert.equal(
        (await one(db, "SELECT count(*) n FROM write_guards"))?.n,
        0,
      );
    } finally {
      await db.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
