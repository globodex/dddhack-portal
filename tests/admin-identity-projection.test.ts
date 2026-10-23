import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { portalTargetName, portalConfirmationFor } from "../app/portal";

test("privileged team and audit rows use selected display names with safe avatar fields", async () => {
  const { db, service } = await setup();
  try {
    await db
      .prepare(
        "INSERT INTO participant_profiles(user_id,display_name,skills,completed_at) VALUES('fake_alice','Selected Alice','','2026-10-22T08:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name",
      )
      .all();
    await db
      .prepare(
        "UPDATE users SET name='transport@example.invalid' WHERE id='fake_alice'",
      )
      .all();
    await db
      .prepare(
        "INSERT INTO audit_logs VALUES('identity-audit','fake_alice','team-style','fake_team1','{}','Synthetic projection check','2026-10-22T09:00:00.000Z')",
      )
      .all();
    const teams = (await service("admin").view("/admin/teams")) as any;
    const member = teams.items
      .flatMap((team: any) => team.members)
      .find((row: any) => row.id === "fake_alice");
    assert.equal(member.name, "Selected Alice");
    const logs = (await service("owner").adminList("audit")) as any[];
    const log = logs.find((row) => row.id === "identity-audit");
    assert.equal(log.actorName, "Selected Alice");
    assert.equal(log.actor_id, "fake_alice");
    assert.deepEqual(
      Object.keys(log).sort(),
      [
        "id",
        "actor_id",
        "action",
        "entity_id",
        "detail",
        "reason",
        "created_at",
        "actorName",
        "avatarColor",
        "avatarExpression",
      ].sort(),
    );
    assert.ok(!JSON.stringify(log).includes("transport@example.invalid"));
    await assert.rejects(service("admin").adminList("audit"), {
      code: "OWNER_REQUIRED",
    });
    await assert.rejects(service("alice").view("/admin/teams"), {
      code: "ADMIN_REQUIRED",
    });
  } finally {
    db.close();
  }
});

test("membership confirmations distinguish applicant and accept versus decline", () => {
  const data = {
    team: { name: "Team One" },
    actions: [
      {
        id: "request-one",
        person_name: "Applicant One",
        team_name: "Team One",
      },
      {
        id: "request-two",
        person_name: "Applicant Two",
        team_name: "Team One",
      },
    ],
  };
  for (const accept of [true, false]) {
    const values = { requestId: "request-two", accept };
    const target = portalTargetName(data, values);
    assert.equal(target, "Applicant Two · Team One");
    const confirmation = portalConfirmationFor("respond-team", values, target);
    assert.equal(confirmation.target, target);
    assert.equal(
      confirmation.title,
      accept ? "Accept membership request?" : "Decline membership request?",
    );
    assert.equal(confirmation.confirmLabel, accept ? "Accept" : "Decline");
  }
});
