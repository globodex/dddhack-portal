import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows, type Database, type SQL } from "../lib/db";
import { personStatus } from "../lib/portal-status";

const now = "2026-10-22T08:00:00.000Z";
const old = "2026-10-22T07:00:00.000Z";
const intent = { confirmation: "CHECK_IN_PARTICIPANTS" };
async function fixture(engine: "sqlite" | "postgres") {
  if (engine === "sqlite") return setup();
  const { db } = await createPGliteFixture();
  await seedLocal(db);
  return {
    db,
    service: (name = "alice") =>
      new PortalService(db, fixtures[name], LOCAL_CREDIT_KEY, () => now),
  };
}
async function count(db: Database, table: string, action?: string) {
  return (await one<{ n: number }>(
    db,
    `SELECT count(*) n FROM ${table}${action ? " WHERE action=?" : ""}`,
    ...(action ? [action] : []),
  ))!.n;
}
const removed = (id: string): SQL => [
  "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) VALUES('participant',?,1,'Synthetic independent audit','fake_owner',?,'{}')",
  id,
  now,
];
async function status(
  service: (name?: string) => PortalService,
  id: string,
  value: string,
) {
  await service("admin").command("admin-status", {
    kind: "person",
    targetId: id,
    status: value,
    confirmation: "CHANGE_STATUS",
  });
}
function beforeMutation(
  service: PortalService,
  action: string,
  work: () => Promise<unknown>,
) {
  const mutate = service.mutate.bind(service);
  let injected = false;
  service.mutate = async (...args) => {
    if (args[1] === action && !injected) {
      injected = true;
      await work();
    }
    return mutate(...args);
  };
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: independent case1 removed and stale approval/registration absence are rejected atomically`, async () => {
    const { db, service } = await fixture(engine);
    try {
      await batch(db, [removed("fake_alice")]);
      await assert.rejects(
        service("admin").command("quick-check-in", {
          emails: ["alice@portal.test"],
        }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      await batch(db, [
        ["UPDATE record_removals SET active=0 WHERE target_id='fake_alice'"],
      ]);
      const admin = service("admin");
      beforeMutation(admin, "quick-check-in", () =>
        batch(db, [
          [
            "UPDATE registrations SET status='cancelled' WHERE email='alice@portal.test'",
          ],
        ]),
      );
      await assert.rejects(
        admin.command("quick-check-in", { emails: ["alice@portal.test"] }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      await batch(db, [
        [
          "UPDATE registrations SET status='approved' WHERE email='alice@portal.test'",
        ],
      ]);
      const race = service("owner");
      beforeMutation(race, "quick-check-in", () =>
        batch(db, [
          [
            "INSERT INTO registration_absences VALUES('alice@portal.test',?,'synthetic')",
            now,
          ],
        ]),
      );
      await assert.rejects(
        race.command("quick-check-in", { emails: ["alice@portal.test"] }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      assert.equal(await count(db, "check_ins"), 0);
      assert.equal(await count(db, "audit_logs", "quick-check-in"), 0);
      assert.equal(await count(db, "write_guards"), 0);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: independent case2 resolved absence remains Checked in through legacy allocation retry`, async () => {
    const { db, service } = await fixture(engine);
    try {
      await batch(db, [
        [
          "INSERT INTO automatic_absences VALUES('fake_alice',?,'synthetic')",
          old,
        ],
      ]);
      await status(service, "fake_alice", "Going");
      assert.equal(
        (await personStatus(service("admin"), "fake_alice")).status,
        "Going",
      );
      await service("admin").command("quick-check-in", {
        emails: ["alice@portal.test"],
      });
      assert.equal(
        (await personStatus(service("admin"), "fake_alice")).status,
        "Checked in",
      );
      // Existing staff check-in is also the documented idempotent allocation retry path.
      await service("admin").command("check-in", {
        userId: "fake_alice",
        reason: "Synthetic allocation retry",
      });
      assert.equal(await count(db, "automatic_absences"), 1);
      assert.equal(await count(db, "credit_allocations"), 1);
      await service("admin").command("check-in", {
        userId: "fake_alice",
        reason: "Synthetic second retry",
      });
      assert.equal(await count(db, "credit_allocations"), 1);
      const current = await personStatus(service("admin"), "fake_alice");
      assert.deepEqual(
        { status: current.status, checkedIn: current.checkedIn },
        { status: "Checked in", checkedIn: true },
      );
    } finally {
      await db.close();
    }
  });

  test(`${engine}: independent case3 role boundaries and explicit manual Checked in remain separate`, async () => {
    const { db, service } = await fixture(engine);
    try {
      for (const actor of ["alice", "judge", "pending", "stranger"]) {
        await assert.rejects(
          service(actor).command("quick-check-in", {
            emails: ["bob@portal.test"],
          }),
          (error) =>
            ["CHECKIN_OPERATOR_REQUIRED", "VIEWER_READ_ONLY"].includes(
              (error as any).code,
            ),
        );
      }
      await batch(db, [
        [
          "INSERT INTO portal_roles VALUES('fake_judge2','volunteer','fake_owner',?)",
          now,
        ],
      ]);
      for (const [actor, email] of [
        ["admin", "alice@portal.test"],
        ["owner", "bob@portal.test"],
        ["judge2", "carol@portal.test"],
      ])
        assert.equal(
          (await service(actor).command("quick-check-in", { emails: [email] }))
            .checkedIn,
          1,
        );
      await status(service, "fake_pending", "Checked in");
      await assert.rejects(
        service("admin").command("quick-check-in", {
          emails: ["pending@portal.test"],
        }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      assert.equal(
        (await personStatus(service("admin"), "fake_pending")).checkedIn,
        true,
      );
      assert.equal(await count(db, "manual_checkins"), 1);
      assert.equal(await count(db, "audit_logs", "quick-check-in"), 3);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: independent case4 bulk deduplicates normalized250 input and rolls back earlier override updates`, async () => {
    const { db, service } = await fixture(engine);
    try {
      await status(service, "fake_alice", "Going");
      const admin = service("admin");
      beforeMutation(admin, "bulk-check-in", () =>
        batch(db, [removed("fake_bob")]),
      );
      await assert.rejects(
        admin.command("bulk-check-in", {
          emails: [
            " ALICE@portal.test ",
            "alice@portal.test",
            "bob@portal.test",
          ],
          ...intent,
        }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      assert.equal(await count(db, "check_ins"), 0);
      assert.equal(
        (
          await one(
            db,
            "SELECT status FROM participant_status_overrides WHERE user_id='fake_alice'",
          )
        )?.status,
        "Going",
      );
      assert.equal(await count(db, "audit_logs", "bulk-check-in"), 0);
      await batch(db, [
        ["UPDATE record_removals SET active=0 WHERE target_id='fake_bob'"],
      ]);
      const emails = Array.from({ length: 250 }, (_, i) =>
        i % 2 ? " BOB@portal.test " : "ALICE@portal.test",
      );
      const result = await service("admin").command("bulk-check-in", {
        emails,
        ...intent,
      });
      assert.equal(result.checkedIn, 2);
      assert.deepEqual(result.emails, ["alice@portal.test", "bob@portal.test"]);
      assert.equal(await count(db, "check_ins"), 2);
      assert.equal(await count(db, "audit_logs", "bulk-check-in"), 1);
      assert.equal(await count(db, "write_guards"), 0);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: independent case5 re-invite stale IDs/role checks and intervening lock preserve declined history`, async () => {
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
      for (const actor of ["admin", "owner", "bob"])
        await assert.rejects(
          service(actor).command("team-invite", {
            teamId: "fake_team1",
            email: "pending@portal.test",
          }),
          { code: "LEADER_REQUIRED" },
        );
      const second = await service("alice").command("team-invite", {
        teamId: "fake_team1",
        email: "pending@portal.test",
      });
      await assert.rejects(
        service("pending").command("team-respond", {
          id: first.id,
          decision: "accepted",
        }),
        { code: "REQUEST_NOT_PENDING" },
      );
      await service("pending").command("team-respond", {
        id: second.id,
        decision: "declined",
      });
      const leader = service("alice");
      beforeMutation(leader, "team-invite", () =>
        batch(db, [
          ["INSERT INTO team_locks VALUES('fake_team1','fake_alice',?)", now],
        ]),
      );
      await assert.rejects(
        leader.command("team-invite", {
          teamId: "fake_team1",
          email: "pending@portal.test",
        }),
        /TEAM_LOCKED/,
      );
      const preserved = await rows<{ id: string; status: string }>(
        db,
        "SELECT id,status FROM team_actions WHERE user_id='fake_pending'",
      );
      assert.deepEqual(
        preserved.map(({ id, status }) => ({ id, status })),
        [{ id: second.id, status: "declined" }],
      );
      assert.equal(await count(db, "audit_logs", "team-invite"), 2);
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

  test(`${engine}: independent case6 fifth-seat race rolls invitation acceptance back to pending`, async () => {
    const { db, service } = await fixture(engine);
    try {
      await batch(db, [
        [
          "UPDATE registrations SET status='approved' WHERE email='pending@portal.test'",
        ],
      ]);
      const first = await service("bob").command("team-invite", {
        teamId: "fake_team3",
        email: "pending@portal.test",
      });
      await service("pending").command("team-respond", {
        id: first.id,
        decision: "declined",
      });
      const second = await service("bob").command("team-invite", {
        teamId: "fake_team3",
        email: "pending@portal.test",
      });
      const target = service("pending");
      beforeMutation(target, "team-respond", async () => {
        for (const id of ["one", "two"])
          await batch(db, [
            [
              "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)",
              `seat_${id}`,
              `seat_${id}@portal.test`,
              `Synthetic seat ${id}`,
              now,
            ],
            [
              "INSERT INTO registrations(email,status) VALUES(?,'approved')",
              `seat_${id}@portal.test`,
            ],
            [
              "INSERT INTO memberships VALUES(?,'fake_team3',?)",
              `seat_${id}`,
              now,
            ],
          ]);
      });
      await assert.rejects(
        target.command("team-respond", { id: second.id, decision: "accepted" }),
        /TEAM_FULL/,
      );
      assert.equal(
        (await one(db, "SELECT status FROM team_actions WHERE id=?", second.id))
          ?.status,
        "pending",
      );
      assert.equal(
        (await rows(db, "SELECT * FROM memberships WHERE team_id='fake_team3'"))
          .length,
        5,
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
      assert.equal(await count(db, "audit_logs", "team-respond"), 1);
      assert.equal(await count(db, "write_guards"), 0);
    } finally {
      await db.close();
    }
  });
}
