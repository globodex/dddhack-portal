import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { one, rows, batch, type Database } from "../lib/db";
import {
  requiresActionConfirmation,
  revealConfirmation,
} from "../lib/action-confirmation";

const time = "2026-10-22T08:00:00.000Z";
const intent = { confirmation: "CHECK_IN_PARTICIPANTS" };
async function fixture(engine: "sqlite" | "postgres") {
  if (engine === "sqlite") return setup();
  const { db } = await createPGliteFixture();
  await seedLocal(db);
  return {
    db,
    service: (name = "alice") =>
      new PortalService(db, fixtures[name], LOCAL_CREDIT_KEY, () => time),
  };
}
async function count(db: Database, table: string, action?: string) {
  return (await one<{ n: number }>(
    db,
    `SELECT count(*) n FROM ${table}${action ? " WHERE action=?" : ""}`,
    ...(action ? [action] : []),
  ))!.n;
}
async function absent(
  service: (name?: string) => PortalService,
  userId: string,
) {
  await service("admin").command("admin-status", {
    kind: "person",
    targetId: userId,
    status: "Absent",
    confirmation: "CHANGE_STATUS",
  });
}

test("quick and bulk have distinct confirmation contracts even for one selected checkbox", () => {
  assert.equal(requiresActionConfirmation("quick-check-in"), false);
  assert.equal(requiresActionConfirmation("bulk-check-in"), true);
  assert.equal(revealConfirmation("quick-check-in", {}), undefined);
  assert.equal(
    revealConfirmation("bulk-check-in", {}),
    "CHECK_IN_PARTICIPANTS",
  );
});

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: staff roles, normalized single/bulk contracts and denied participants`, async () => {
    const { db, service } = await fixture(engine);
    try {
      for (const name of ["alice", "judge", "judge2", "pending", "stranger"])
        await assert.rejects(
          service(name).command("quick-check-in", {
            emails: ["alice@portal.test"],
          }),
          (error) =>
            ["CHECKIN_OPERATOR_REQUIRED", "VIEWER_READ_ONLY"].includes(
              (error as any).code,
            ),
        );
      await assert.rejects(
        service("admin").command("bulk-check-in", {
          emails: ["alice@portal.test"],
        }),
      );
      await assert.rejects(
        service("admin").command("quick-check-in", {
          emails: ["alice@portal.test", "bob@portal.test"],
        }),
      );
      assert.equal(await count(db, "check_ins"), 0);
      const bulk = await service("admin").command("bulk-check-in", {
        emails: [" ALICE@portal.test ", "alice@portal.test", "bob@portal.test"],
        ...intent,
      });
      assert.equal(bulk.checkedIn, 2);
      assert.deepEqual(bulk.userIds, ["fake_alice", "fake_bob"]);
      assert.equal(await count(db, "audit_logs", "bulk-check-in"), 1);
      await batch(db, [
        [
          "INSERT INTO portal_roles VALUES('fake_judge','volunteer','fake_owner',?)",
          time,
        ],
      ]);
      assert.equal(
        (
          await service("judge").command("quick-check-in", {
            emails: ["carol@portal.test"],
          })
        ).checkedIn,
        1,
      );
      assert.equal(
        (
          await service("owner").command("quick-check-in", {
            emails: ["dave@portal.test"],
          })
        ).checkedIn,
        1,
      );
      assert.equal(
        (
          await service("admin").command("bulk-check-in", {
            emails: ["eve@portal.test"],
            ...intent,
          })
        ).checkedIn,
        1,
      );
      assert.equal(await count(db, "check_ins"), 5);
      await batch(db, [
        [
          "INSERT INTO registrations(email,status) VALUES('unsigned@portal.test','approved')",
        ],
      ]);
      await assert.rejects(
        service("admin").command("quick-check-in", {
          emails: ["unsigned@portal.test"],
        }),
        { code: "PARTICIPANT_NOT_SIGNED_IN" },
      );
    } finally {
      await db.close();
    }
  });

  test(`${engine}: Registered, Absent and already Checked in never succeed; manual override remains available`, async () => {
    const { db, service } = await fixture(engine);
    try {
      await assert.rejects(
        service("admin").command("quick-check-in", {
          emails: ["pending@portal.test"],
        }),
        { code: "PORTAL_GOING_REQUIRED" },
      );
      await absent(service, "fake_bob");
      await assert.rejects(
        service("admin").command("quick-check-in", {
          emails: ["bob@portal.test"],
        }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      await assert.rejects(
        service("admin").command("participant-bulk", {
          emails: ["bob@portal.test"],
          checkIn: true,
        }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      await service("admin").command("quick-check-in", {
        emails: ["alice@portal.test"],
      });
      await assert.rejects(
        service("admin").command("quick-check-in", {
          emails: ["alice@portal.test"],
        }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      assert.equal(await count(db, "check_ins"), 1);
      assert.equal(await count(db, "audit_logs", "quick-check-in"), 1);
      assert.equal(await count(db, "audit_logs", "participant-bulk"), 0);
      await service("admin").command("admin-status", {
        kind: "person",
        targetId: "fake_pending",
        status: "Checked in",
        confirmation: "CHANGE_STATUS",
      });
      assert.equal(
        (
          await one(
            db,
            "SELECT status FROM participant_status_overrides WHERE user_id='fake_pending'",
          )
        )?.status,
        "Checked in",
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*) n FROM manual_checkins WHERE user_id='fake_pending'",
          )
        )?.n,
        1,
      );
    } finally {
      await db.close();
    }
  });

  test(`${engine}: current Going is rechecked inside the transaction and mixed bulk rolls back entirely`, async () => {
    const { db, service } = await fixture(engine);
    try {
      const admin = service("admin"),
        original = admin.mutate.bind(admin);
      let injected = false;
      admin.mutate = async (...args) => {
        if (args[1] === "bulk-check-in" && !injected) {
          injected = true;
          await absent(service, "fake_bob");
        }
        return original(...args);
      };
      await assert.rejects(
        admin.command("bulk-check-in", {
          emails: ["alice@portal.test", "bob@portal.test"],
          ...intent,
        }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      assert.equal(
        await count(db, "check_ins"),
        0,
        "first participant and every later mutation roll back",
      );
      assert.equal(await count(db, "audit_logs", "bulk-check-in"), 0);
      assert.equal(
        (
          await one(
            db,
            "SELECT status FROM participant_status_overrides WHERE user_id='fake_bob'",
          )
        )?.status,
        "Absent",
      );
      const quick = service("admin"),
        mutate = quick.mutate.bind(quick);
      quick.mutate = async (...args) => {
        if (args[1] === "quick-check-in")
          await batch(db, [
            [
              "INSERT INTO automatic_absences VALUES('fake_alice',?,'synthetic-cutoff')",
              "2026-10-22T08:01:00.000Z",
            ],
          ]);
        return mutate(...args);
      };
      await assert.rejects(
        quick.command("quick-check-in", { emails: ["alice@portal.test"] }),
        { code: "CHECKIN_STATE_CHANGED" },
      );
      assert.equal(await count(db, "check_ins"), 0);
      assert.equal(await count(db, "audit_logs", "quick-check-in"), 0);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: concurrent check-ins commit once and produce one attendance audit`, async () => {
    const { db, service } = await fixture(engine);
    try {
      const results = await Promise.allSettled([
        service("admin").command("quick-check-in", {
          emails: ["alice@portal.test"],
        }),
        service("owner").command("quick-check-in", {
          emails: ["alice@portal.test"],
        }),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        results.filter((result) => result.status === "rejected").length,
        1,
      );
      assert.equal(await count(db, "check_ins"), 1);
      assert.equal(await count(db, "audit_logs", "quick-check-in"), 1);
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await db.close();
    }
  });
}
