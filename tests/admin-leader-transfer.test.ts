import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminLeaderTransfer from "../app/admin-leader-transfer";

const team = {
  id: "fake_team",
  name: "Synthetic Team",
  leader_id: "fake_leader",
};
const member = { id: "fake_member", name: "Synthetic Teammate" };
const run = async () => {
  throw new Error("Rendering cannot mutate data");
};
test("admin crown action identifies the actual teammate and is hidden for unavailable targets", () => {
  const render = (overrides = {}) =>
    renderToStaticMarkup(
      createElement(AdminLeaderTransfer, {
        team,
        member,
        canTransfer: true,
        run,
        ...overrides,
      }),
    );
  const html = render();
  assert.match(html, /Make Synthetic Teammate team leader for Synthetic Team/);
  assert.match(html, /lucide-crown/);
  assert.match(html, /type="button"/);
  assert.equal(render({ canTransfer: false }), "");
  assert.equal(render({ member: { ...member, removed: true } }), "");
  assert.equal(
    render({ member: { id: "fake_leader", name: "Current leader" } }),
    "",
  );
});
