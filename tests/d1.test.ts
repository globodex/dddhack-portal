import { attend } from "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, rows, type Database } from "../lib/db";
import { rehearsalPolicy, submission } from "./helpers";
test(
  "actual local D1 binding: schema, trigger rollback, batch atomicity and concurrent credit/submission commands",
  // This integration case performs 1,023+ local D1 RPCs, including migrations
  // and concurrent rollback/limit assertions. Budget the complete local harness.
  // Paired phase evidence: evidence/viewer-d1-timeout/summary.json.
  { timeout: 120000 },
  async () => {
    const mf = new Miniflare({
      modules: true,
      script:
        'export default {fetch(){return new Response("local D1 rehearsal")}}',
      compatibilityDate: "2026-07-01",
      cf: false,
      d1Databases: { DB: "portal-test" },
    });
    try {
      const db: Database = await mf.getD1Database("DB");
      const directory = new URL("../db/migrations/", import.meta.url);
      const sql = readdirSync(directory)
        .filter((n) => n.endsWith(".sql"))
        .sort()
        .map((n) => readFileSync(new URL(n, directory), "utf8"))
        .join("\n");
      let buffer = "";
      for (const line of sql.split("\n")) {
        buffer += line + "\n";
        if (
          line.trim().endsWith(";") &&
          (!buffer.trim().startsWith("CREATE TRIGGER") ||
            line.trim() === "END;" ||
            (line.trim().startsWith("BEGIN ") && /\bEND;$/.test(line.trim())) ||
            line.trim().startsWith("CREATE TRIGGER"))
        ) {
          await db.prepare(buffer).all();
          buffer = "";
        }
      }
      assert.equal(buffer.trim(), "");
      await seedLocal(db);
      await batch(db, [
        [
          "UPDATE event_settings SET policy=?,active=0 WHERE id=1",
          JSON.stringify({ ...rehearsalPolicy, operationScopes: [] }),
        ],
      ]);
      let now = "2026-10-22T08:00:00.000Z";
      const admin = new PortalService(
        db,
        fixtures.admin,
        LOCAL_CREDIT_KEY,
        () => now,
      );
      const owner = new PortalService(
        db,
        fixtures.owner,
        LOCAL_CREDIT_KEY,
        () => now,
      );
      // No manual activation is required for existing actual policy data.
      assert.equal((await owner.settings()).active, 0);
      assert.equal(
        ((await owner.view("/admin/settings")).readiness as any).checkin
          .allowed,
        true,
      );
      const roster =
        "email\n" +
        Array.from({ length: 200 }, (_, i) => `bulk${i}@portal.test`).join(
          "\n",
        );
      const preview = await admin.command("preview-import", {
        kind: "roster",
        csv: roster,
      });
      await admin.command("commit-import", {
        kind: "roster",
        csv: roster,
        digest: preview.digest,
      });
      assert.equal(
        (
          await rows(
            db,
            "SELECT email FROM registrations WHERE email LIKE 'bulk%@portal.test'",
          )
        ).length,
        200,
      );
      await Promise.all(
        Array.from({ length: 12 }, () =>
          admin.command("check-in", {
            userId: "fake_alice",
            reason: "Local D1 repeated check-in",
          }),
        ),
      );
      assert.equal(
        (await rows(db, "SELECT * FROM credit_allocations")).length,
        1,
      );
      await assert.rejects(
        batch(db, [
          [
            "INSERT INTO teams VALUES(?,?,?,?,?)",
            "bad-team",
            "Should roll back",
            "fake_alice",
            "",
            "2026-10-22T08:00:00.000Z",
          ],
          [
            "INSERT INTO memberships VALUES(?,?,?)",
            "fake_alice",
            "bad-team",
            "2026-10-22T08:00:00.000Z",
          ],
        ]),
      );
      assert.equal(
        (await rows(db, "SELECT * FROM teams WHERE id='bad-team'")).length,
        0,
      );
      await batch(db, [
        [
          "UPDATE event_settings SET policy=?,active=0 WHERE id=1",
          JSON.stringify(rehearsalPolicy),
        ],
      ]);
      now = "2026-11-01T06:00:00.000Z";
      const leader = new PortalService(
        db,
        fixtures.alice,
        LOCAL_CREDIT_KEY,
        () => now,
      );
      const outcomes = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          leader.command("submit", {
            ...submission,
            projectName: "Attempt " + i,
          }),
        ),
      );
      assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 3);
      assert.equal(
        (await rows(db, "SELECT * FROM submission_versions")).length,
        3,
      );
      assert.equal((await rows(db, "SELECT * FROM astra_jobs")).length, 3);
    } finally {
      await mf.dispose();
    }
  },
);
