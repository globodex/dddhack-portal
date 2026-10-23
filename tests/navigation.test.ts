import { test } from "node:test";
import assert from "node:assert/strict";
import { portalNavigation } from "../lib/navigation";
test("participant primary navigation stays focused and admin discovery retains management context", () => {
  assert.deepEqual(
    portalNavigation("/dashboard", { role: "participant" }).items.map(
      (x) => x[1],
    ),
    ["Dashboard", "Discover", "Projects", "Rules"],
  );
  const management = portalNavigation("/discover/teams", { role: "admin" });
  assert.equal(management.admin, true);
  assert.ok(management.items.some((x) => x[1] === "Participants"));
  assert.ok(!management.items.some((x) => x[1] === "Logs"));
  assert.ok(
    portalNavigation("/discover/participants", { owner: true }).items.some(
      (x) => x[1] === "Logs",
    ),
  );
  for (const role of ["judge", "mentor"]) {
    const nav = portalNavigation("/review", { role });
    assert.ok(nav.items.some((x) => x[1] === "Assigned projects"));
    assert.ok(!nav.items.some((x) => x[0].startsWith("/admin")));
  }
  assert.deepEqual(
    portalNavigation("/admin/participants", { role: "volunteer" }).items.map(
      (x) => x[1],
    ),
    ["Participants", "Discover", "Rules"],
  );
});

test("locked team idea is a concise read-only view while unlocked leader retains editor", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { TeamWorkspace } = await import("../app/portal");
  const data: any = {
    me: {
      id: "fake_bob",
      name: "Bob",
      email: "bob@portal.test",
      role: "participant",
      owner: false,
      canParticipate: true,
    },
    team: {
      id: "fake_team3",
      name: "Common Ground",
      leader_id: "fake_bob",
      locked: true,
    },
    idea: {
      title: "Synthetic idea",
      description: "Private synthetic description",
    },
    members: [],
  };
  const locked = renderToStaticMarkup(
    createElement(TeamWorkspace, { data, run: async () => ({}) }),
  );
  assert.match(locked, /Synthetic idea/);
  assert.match(locked, /Private synthetic description/);
  assert.doesNotMatch(locked, /Save team idea|name="title"|<textarea/);
  const unlocked = renderToStaticMarkup(
    createElement(TeamWorkspace, {
      data: { ...data, team: { ...data.team, locked: false } },
      run: async () => ({}),
    }),
  );
  assert.match(unlocked, /Save team idea/);
  assert.match(unlocked, /name="title"/);
});
