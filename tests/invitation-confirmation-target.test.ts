import { test } from "node:test";
import assert from "node:assert/strict";
import { portalTargetName } from "../app/portal";

test("invitation decisions identify the selected team rather than the recipient", () => {
  const view = {
    me: { id: "fake_recipient", name: "Recipient", email: "recipient@portal.test", role: "participant", owner: false },
    actions: [
      { id: "invite-one", kind: "invite", team_name: "Common Ground" },
      { id: "invite-two", kind: "invite", team_name: "Other Team" },
    ],
  };
  for (const decision of ["accepted", "declined"]) {
    assert.equal(portalTargetName(view, { id: "invite-one", decision }), "Common Ground");
    assert.equal(portalTargetName(view, { id: "invite-two", decision }), "Other Team");
  }
  assert.equal(portalTargetName(view, { id: "stale-id", decision: "accepted" }), "Recipient");
});
