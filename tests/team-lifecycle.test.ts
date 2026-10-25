import { test } from "node:test";
import assert from "node:assert/strict";
import {
  teamLifecycle,
  submissionWindowHasOpened,
} from "../lib/team-lifecycle";
import { setup } from "./helpers";
import { batch, one } from "../lib/db";
import { teamFacts } from "../lib/directory-facts";
import { teamStatus } from "../lib/portal-status";

test("lifecycle derives approved and window-open reminder without changing attendance or saved times", async () => {
  const { db, service, clock } = await setup();
  try {
    const open = "2026-11-01T02:30:00.000Z",
      close = "2026-11-01T14:30:00.000Z";
    const settings = await service("owner").settings(true);
    await batch(db, [
      [
        "UPDATE event_settings SET policy=? WHERE id=1",
        JSON.stringify({
          ...settings.policy,
          submissionOpen: open,
          submissionClose: close,
        }),
      ],
    ]);
    clock("2026-10-25T08:00:00.000Z");
    const fact = async () =>
      (
        await teamFacts(db, ["fake_team3"], undefined, service("bob").now())
      ).get("fake_team3")!;
    assert.equal(
      (await fact()).status,
      "Forming",
      "Approved people do not lock an unlocked team",
    );
    await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
    assert.equal((await fact()).status, "Approved");
    assert.equal(
      (await teamStatus(service("bob"), "fake_team3")).status,
      "Approved",
    );
    await batch(db, [
      [
        "INSERT INTO participant_status_overrides VALUES('fake_dave','Absent','Synthetic absence','fake_admin',?)",
        service("bob").now(),
      ],
    ]);
    assert.equal(
      (await fact()).status,
      "Approved",
      "Approved attendance absence does not revoke approval",
    );
    const lock = await one<any>(
      db,
      "SELECT * FROM team_locks WHERE team_id='fake_team3'",
    );
    await service("admin").command("admin-unlock-team", {
      teamId: "fake_team3",
      expectedLockedAt: lock.locked_at,
      confirmation: "UNLOCK_TEAM",
    });
    assert.equal((await fact()).status, "Forming");
    assert.equal(
      (await one<any>(
        db,
        "SELECT status FROM registrations WHERE email='dave@portal.test'",
      ))!.status,
      "approved",
    );
    await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
    clock("2026-11-01T02:29:59.999Z");
    assert.equal((await fact()).status, "Approved");
    clock(open);
    assert.equal((await fact()).status, "Yet to submit");
    clock("2026-11-02T08:00:00.000Z");
    assert.equal(
      (await fact()).status,
      "Yet to submit",
      "Closing a window does not manufacture a submission",
    );
    await batch(db, [
      [
        "UPDATE registrations SET status='pending' WHERE email='carol@portal.test'",
      ],
    ]);
    assert.equal(
      (await fact()).status,
      "Locked",
      "Loss of actual approval removes the derived approval state",
    );
    await assert.rejects(
      service("admin").command("admin-status", {
        kind: "team",
        targetId: "fake_team3",
        status: "Approved",
        reason: "",
        confirmation: "CHANGE_STATUS",
      }),
      { code: "TEAM_APPROVAL_ACTION_REQUIRED" },
    );
    const after = await service("owner").settings(true);
    assert.equal(after.policy.submissionOpen, open);
    assert.equal(after.policy.submissionClose, close);
  } finally {
    db.close();
  }
});

test("committed history always remains Submitted and invalid/unpublished windows never advance", () => {
  for (const windowOpened of [false, true])
    assert.equal(
      teamLifecycle({
        locked: true,
        attempts: 1,
        total: 3,
        approved: 0,
        windowOpened,
      }),
      "Submitted",
    );
  assert.equal(
    teamLifecycle({
      locked: true,
      attempts: 0,
      total: 0,
      approved: 0,
      windowOpened: true,
    }),
    "Locked",
  );
  for (const p of [
    {},
    { submissionOpen: "bad", submissionClose: "bad" },
    { submissionOpen: "2026-11-01T02:30:00Z", submissionClose: null },
    {
      submissionOpen: "2026-11-01T02:30:00Z",
      submissionClose: "2026-10-01T02:30:00Z",
    },
  ])
    assert.equal(submissionWindowHasOpened(p, "2026-11-02T08:00:00Z"), false);
});
