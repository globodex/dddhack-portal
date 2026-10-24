import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, rows } from "../lib/db";

async function fixture(engine: "sqlite" | "postgres") {
  if (engine === "sqlite") return setup();
  const { db } = await createPGliteFixture();
  await seedLocal(db);
  return {
    db,
    service: (name = "alice") =>
      new PortalService(
        db,
        fixtures[name],
        LOCAL_CREDIT_KEY,
        () => "2026-10-22T08:00:00.000Z",
      ),
  };
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: declined invitation can be reissued with a fresh ID, preserved audit history and stale-ID rejection`, async () => {
    const ctx =
      engine === "sqlite"
        ? await setup()
        : await (async () => {
            const { db } = await createPGliteFixture();
            await seedLocal(db);
            return {
              db,
              service: (name = "alice") =>
                new PortalService(
                  db,
                  fixtures[name],
                  LOCAL_CREDIT_KEY,
                  () => "2026-10-22T08:00:00.000Z",
                ),
            };
          })();
    const { db, service } = ctx;
    try {
      await batch(db, [
        [
          "UPDATE registrations SET status='approved' WHERE email='pending@portal.test'",
        ],
      ]);
      const first = await service("alice").command("team-invite", {
        teamId: "fake_team1",
        email: "pending@portal.test",
      });
      await assert.rejects(
        service("bob").command("team-invite", {
          teamId: "fake_team1",
          email: "pending@portal.test",
        }),
        { code: "LEADER_REQUIRED" },
      );
      await assert.rejects(
        service("alice").command("team-invite", {
          teamId: "fake_team1",
          email: "pending@portal.test",
        }),
        { code: "INVITATION_ALREADY_PENDING" },
      );
      await service("pending").command("team-respond", {
        id: first.id,
        decision: "declined",
      });
      const second = await service("alice").command("team-invite", {
        teamId: "fake_team1",
        email: "pending@portal.test",
      });
      assert.notEqual(second.id, first.id);
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM team_actions WHERE user_id='fake_pending'",
          )
        ).length,
        1,
      );
      await assert.rejects(
        service("pending").command("team-respond", {
          id: first.id,
          decision: "accepted",
        }),
        { code: "REQUEST_NOT_PENDING" },
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM memberships WHERE user_id='fake_pending'",
          )
        ).length,
        0,
      );
      const history = await rows<{ detail: string }>(
        db,
        "SELECT detail FROM audit_logs WHERE action='team-invite'",
      );
      assert.equal(history.length, 2);
      assert.ok(
        history.some(
          (row) => JSON.parse(row.detail).previousInvitation?.id === first.id,
        ),
      );
      assert.ok(
        history.some(
          (row) => JSON.parse(row.detail).invitationId === second.id,
        ),
      );
      await service("pending").command("team-respond", {
        id: second.id,
        decision: "accepted",
      });
      await assert.rejects(
        service("pending").command("team-respond", {
          id: second.id,
          decision: "accepted",
        }),
        { code: "REQUEST_NOT_PENDING" },
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM memberships WHERE user_id='fake_pending'",
          )
        ).length,
        1,
      );
      assert.equal(
        (await rows(db, "SELECT * FROM audit_logs WHERE action='team-respond'"))
          .length,
        2,
      );
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: re-invites preserve approval, locked-team and five-member acceptance guards`, async () => {
    const { db, service } = await fixture(engine);
    try {
      await batch(db, [
        [
          "UPDATE registrations SET status='approved' WHERE email='pending@portal.test'",
        ],
      ]);
      const first = await service("eve").command("team-invite", {
        teamId: "fake_team5",
        email: "pending@portal.test",
      });
      await service("pending").command("team-respond", {
        id: first.id,
        decision: "declined",
      });
      const second = await service("eve").command("team-invite", {
        teamId: "fake_team5",
        email: "pending@portal.test",
      });
      await assert.rejects(
        service("pending").command("team-respond", {
          id: second.id,
          decision: "accepted",
        }),
        /TEAM_FULL/,
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT status FROM team_actions WHERE id=?",
            second.id,
          )
        )[0].status,
        "pending",
      );
      assert.equal(
        (await rows(db, "SELECT * FROM memberships WHERE team_id='fake_team5'"))
          .length,
        5,
      );
      await service("pending").command("team-respond", {
        id: second.id,
        decision: "declined",
      });
      await batch(db, [
        [
          "UPDATE registrations SET status='pending' WHERE email='pending@portal.test'",
        ],
      ]);
      await assert.rejects(
        service("eve").command("team-invite", {
          teamId: "fake_team5",
          email: "pending@portal.test",
        }),
        { code: "REGISTERED_ACCOUNT_REQUIRED" },
      );
      await batch(db, [
        [
          "UPDATE registrations SET status='approved' WHERE email='pending@portal.test'",
        ],
        [
          "INSERT INTO team_locks VALUES('fake_team5','fake_eve','2026-10-22T08:00:00.000Z')",
        ],
      ]);
      await assert.rejects(
        service("eve").command("team-invite", {
          teamId: "fake_team5",
          email: "pending@portal.test",
        }),
        /TEAM_LOCKED/,
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT status FROM team_actions WHERE id=?",
            second.id,
          )
        )[0].status,
        "declined",
      );
      assert.equal(
        (await rows(db, "SELECT * FROM audit_logs WHERE action='team-invite'"))
          .length,
        2,
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM memberships WHERE user_id='fake_pending'",
          )
        ).length,
        0,
      );
    } finally {
      await db.close();
    }
  });

  test(`${engine}: concurrent re-invites and responses each commit once without duplicate audit or membership`, async () => {
    const { db, service } = await fixture(engine);
    try {
      await batch(db, [
        [
          "UPDATE registrations SET status='approved' WHERE email='pending@portal.test'",
        ],
      ]);
      const first = await service("alice").command("team-invite", {
        teamId: "fake_team1",
        email: "pending@portal.test",
      });
      await service("pending").command("team-respond", {
        id: first.id,
        decision: "declined",
      });
      const invitations = await Promise.allSettled([
        service("alice").command("team-invite", {
          teamId: "fake_team1",
          email: "pending@portal.test",
        }),
        service("alice").command("team-invite", {
          teamId: "fake_team1",
          email: "pending@portal.test",
        }),
      ]);
      assert.equal(
        invitations.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const active = (
        await rows<{ id: string }>(
          db,
          "SELECT id FROM team_actions WHERE user_id='fake_pending'",
        )
      )[0];
      assert.notEqual(active.id, first.id);
      const responses = await Promise.allSettled([
        service("pending").command("team-respond", {
          id: active.id,
          decision: "accepted",
        }),
        service("pending").command("team-respond", {
          id: active.id,
          decision: "accepted",
        }),
      ]);
      assert.equal(
        responses.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        (await rows(db, "SELECT * FROM audit_logs WHERE action='team-invite'"))
          .length,
        2,
      );
      assert.equal(
        (await rows(db, "SELECT * FROM audit_logs WHERE action='team-respond'"))
          .length,
        2,
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM memberships WHERE user_id='fake_pending'",
          )
        ).length,
        1,
      );
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await db.close();
    }
  });
}
