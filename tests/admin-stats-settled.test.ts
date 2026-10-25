import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { readAdminStats } from "../lib/admin-stats";
import { batch, rows } from "../lib/db";
import { PortalService } from "../lib/service";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { authenticatedRequestEvidenceStatement } from "../lib/sign-in-evidence";
import { createPGliteFixture } from "./neon-db-fixture";
import { attend } from "./helpers";
const time = "2026-10-25T08:00:00.000Z";
for (const engine of ["sqlite", "postgres"] as const)
  test(`${engine}: settled roster, approval and durable sign-in counts never invent history or attendance`, async () => {
    const local = engine === "sqlite" ? new LocalDatabase(":memory:") : null;
    local?.migrate();
    if (local)
      local.raw.exec(
        readFileSync(
          new URL("../neon/auth-migrations/0001_auth.sql", import.meta.url),
          "utf8",
        ),
      );
    const pg = engine === "postgres" ? await createPGliteFixture() : null;
    if (pg)
      await pg.engine.exec(
        readFileSync(
          new URL("../neon/auth-migrations/0001_auth.sql", import.meta.url),
          "utf8",
        ),
      );
    const db = pg?.db || local!;
    const service = new PortalService(
      db,
      fixtures.owner,
      LOCAL_CREDIT_KEY,
      () => time,
    );
    const get = async (kind: "participants" | "teams") =>
      readAdminStats(service, kind);
    const vals = async (kind: "participants" | "teams") =>
      Object.fromEntries((await get(kind)).cards.map((c) => [c.key, c.value]));
    try {
      assert.deepEqual(
        Object.fromEntries(
          (
            await readAdminStats(
              { db, staff: async () => ({}) as any },
              "participants",
            )
          ).cards.map((c) => [c.key, c.value]),
        ),
        {
          roster: 0,
          signed_in: 0,
          going: 0,
          checked_in: 0,
          pending: 0,
        },
      );
      await seedLocal(db);
      assert.equal(
        (await vals("participants")).signed_in,
        null,
        "Unproven preexisting users are unknown, not fake zero",
      );
      await batch(db, [
        [
          "INSERT INTO registrations(email,status) VALUES('new-roster-only@example.test','pending')",
        ],
        [
          "INSERT INTO luma_roster VALUES('new-roster-only@example.test','fake_owner',?)",
          time,
        ],
        [
          "INSERT INTO luma_roster VALUES('ALICE@portal.test','fake_owner',?)",
          time,
        ],
      ]);
      assert.equal(
        (await vals("participants")).roster,
        15,
        "Combined manual/import roster is normalized and deduplicated",
      );
      assert.equal((await vals("teams")).pending, 0);
      await batch(db, [
        [
          "UPDATE registrations SET status='pending' WHERE email='bob@portal.test'",
        ],
        [
          "INSERT INTO participant_status_overrides VALUES('fake_dave','Absent','Synthetic absence','fake_owner',?)",
          time,
        ],
      ]);
      assert.equal(
        (await vals("teams")).pending,
        1,
        "Unlocked incomplete team is pending",
      );
      assert.equal(
        (await vals("participants")).pending,
        1,
        "Only unapproved Bob counts; approved teammates and teamless pending people do not",
      );
      await batch(db, [
        ["INSERT INTO team_locks VALUES('fake_team3','fake_bob',?)", time],
      ]);
      assert.equal(
        (await vals("teams")).pending,
        1,
        "Lock does not change approval",
      );
      await batch(db, [
        [
          "UPDATE registrations SET status='approved' WHERE email='bob@portal.test'",
        ],
      ]);
      assert.equal(
        (await vals("teams")).approved,
        3,
        "Approved Absent Dave does not revoke existing registration approval",
      );
      assert.equal((await vals("teams")).pending, 0);
      assert.equal((await vals("participants")).pending, 0);
      await batch(db, [
        [
          "INSERT INTO teams VALUES('empty-stats-team','Empty team','fake_judge','',?)",
          time,
        ],
      ]);
      const team = await vals("teams");
      assert.equal(team.formed, 4);
      assert.equal(team.approved, 3);
      assert.equal(team.pending, 1, "Empty team is not approved");
      assert.equal(
        (await get("teams")).teamSizes!.reduce((n, s) => n + s.value, 0),
        3,
        "Empty team excluded from sizes",
      );
      const before = await vals("participants");
      await attend(db, "fake_alice");
      const after = await vals("participants");
      assert.equal(after.checked_in, Number(before.checked_in) + 1);
      assert.equal(
        after.going,
        Number(before.going) - 1,
        "Going excludes checked-in",
      );
      const mark = authenticatedRequestEvidenceStatement(
        { ...fixtures.alice, source: "neon", emailVerified: true },
        time,
      )!;
      await batch(db, [mark, mark]);
      let sign = (await get("participants")).cards.find(
        (c) => c.key === "signed_in",
      )!;
      assert.equal(sign.value, 1);
      assert.equal(sign.lowerBound, true);
      await batch(db, [
        [
          "UPDATE participant_profiles SET gender_confirmed=0 WHERE user_id='fake_alice'",
        ],
      ]);
      assert.equal(
        (await vals("participants")).signed_in,
        1,
        "Incomplete profile still signed in",
      );
      // Auth identity resolution alone is not session issuance. Retained sessions are actual historical issuance evidence.
      await batch(db, [
        [
          "INSERT INTO auth_users VALUES('fake_bob','bob@portal.test','Bob',?)",
          time,
        ],
      ]);
      const neonReader = {
        db,
        identity: {
          ...fixtures.owner,
          source: "neon" as const,
          emailVerified: true,
        },
        staff: () => service.staff(),
      };
      assert.equal(
        (await readAdminStats(neonReader, "participants")).cards[1].value,
        1,
      );
      await batch(db, [
        [
          "INSERT INTO auth_sessions VALUES('synthetic-retained-session-hash','fake_bob',1)",
        ],
      ]);
      assert.equal(
        (await readAdminStats(neonReader, "participants")).cards[1].value,
        2,
        "Expired retained session still proves past issuance",
      );
      // Record synthetic proven authenticated requests; Viewers are part of the admin people collection.
      const people = await rows<{ id: string; email: string; name: string }>(
        db,
        "SELECT u.id,u.email,u.name FROM users u WHERE EXISTS(SELECT 1 FROM registrations r WHERE r.email=u.email) OR EXISTS(SELECT 1 FROM luma_roster l WHERE l.email=u.email)",
      );
      for (const p of people)
        await batch(db, [
          authenticatedRequestEvidenceStatement(
            { ...p, source: "neon", emailVerified: true },
            time,
          )!,
        ]);
      sign = (await get("participants")).cards.find(
        (c) => c.key === "signed_in",
      )!;
      assert.equal(sign.value, 14);
      assert.equal(sign.lowerBound, true, "Unproven Viewer remains unknown");
      await batch(db, [
        authenticatedRequestEvidenceStatement(
          { ...fixtures.stranger, source: "neon", emailVerified: true },
          time,
        )!,
      ]);
      assert.equal(
        (await vals("participants")).signed_in,
        15,
        "Signed-in includes active Viewers without granting registration",
      );
      await batch(db, [
        [
          "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('participant','fake_alice',1,'Synthetic removal','fake_owner',?)",
          time,
        ],
      ]);
      assert.equal(
        (await vals("participants")).signed_in,
        14,
        "Removed people excluded despite preserved evidence",
      );
      const prior = await get("participants");
      const filtered = (await service.view("/admin/participants", {
        search: "no-such-person",
        page: 9,
      })) as any;
      assert.deepEqual(filtered.stats, prior);
      assert.doesNotMatch(
        JSON.stringify(prior),
        /@|token_hash|fake_|provider_subject|phone/,
      );
    } finally {
      if (pg) await pg.pool.end();
      else local!.close();
    }
  });
