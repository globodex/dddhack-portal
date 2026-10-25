import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Discover, DiscoverTeamDialog, AdminList } from "../app/portal";
import { setup } from "./helpers";
import { one, rows } from "../lib/db";

const noop = async () => ({});
const render = (data: any) =>
  renderToStaticMarkup(
    createElement(Discover, { data, path: "/discover/teams", run: noop }),
  );
test("locked team cannot masquerade as Forming after an admin display-status override", async () => {
  const { db, service } = await setup();
  try {
    const before = await rows(
      db,
      "SELECT * FROM ideas WHERE team_id='fake_team1'",
    );
    const members = await rows(
      db,
      "SELECT * FROM memberships WHERE team_id='fake_team1'",
    );
    await service("alice").command("lock-team", { confirmation: "LOCK_TEAM" });
    await service("admin").command("admin-status", {
      kind: "team",
      targetId: "fake_team1",
      status: "Forming",
      confirmation: "CHANGE_STATUS",
    });
    const view = (await service("pending").view("/discover/teams")) as any;
    const item = view.items.find((row: any) => row.id === "fake_team1");
    assert.equal(item.locked, true);
    assert.equal(item.status, "Approved"); // Approval lifecycle wins; the historical override row remains preserved.
    assert.equal((await one<any>(db, "SELECT status FROM team_status_overrides WHERE team_id='fake_team1'"))?.status, "Forming");
    assert.equal(view.me.canParticipate, true);
    const html = render({ ...view, items: [item] });
    assert.match(html, /discover-state locked">Approved</);
    assert.doesNotMatch(html, /Request to join/);
    const dialog = renderToStaticMarkup(
      createElement(DiscoverTeamDialog, { team: item, onClose() {} }),
    );
    assert.match(dialog, /discover-state locked">Approved</);
    const admin = (await service("admin").view("/admin/teams")) as any;
    const management = renderToStaticMarkup(
      createElement(AdminList, {
        data: {
          ...admin,
          items: admin.items.filter((row: any) => row.id === item.id),
        },
        path: "/admin/teams",
        run: noop,
      }),
    );
    assert.ok(management.includes("Status changes do not unlock teams."));
    await assert.rejects(
      service("pending").command("request-team", { teamId: item.id }),
      { code: "TEAM_LOCKED" },
    );
    await assert.rejects(
      service("pending").command("admin-status", {
        kind: "team",
        targetId: item.id,
        status: "Forming",
        confirmation: "CHANGE_STATUS",
      }),
      { code: "ADMIN_REQUIRED" },
    );
    assert.deepEqual(
      await rows(db, "SELECT * FROM ideas WHERE team_id='fake_team1'"),
      before,
    );
    assert.deepEqual(
      await rows(db, "SELECT * FROM memberships WHERE team_id='fake_team1'"),
      members,
    );
    assert.ok(
      await one(
        db,
        "SELECT team_id FROM team_locks WHERE team_id='fake_team1'",
      ),
    );
  } finally {
    db.close();
  }
});

test("fresh eligible teamless visitor sees unlocked team request; pending/full/member/Viewer/staff remain distinct", async () => {
  const { db, service, clock } = await setup();
  try {
    const first = (await service("pending").view("/discover/teams")) as any;
    const team = first.items.find((row: any) => row.id === "fake_team1");
    assert.equal(team.locked, false);
    assert.match(render({ ...first, items: [team] }), /Request to join/);
    await service("pending").command("request-team", { teamId: team.id });
    for (let i = 0; i < 3; i++) {
      const fresh = (await service("pending").view("/discover/teams")) as any;
      assert.match(
        render({
          ...fresh,
          items: fresh.items.filter((row: any) => row.id === team.id),
        }),
        /disabled=""[^>]*>Requested</,
      );
    }
    const full = first.items.find((row: any) => row.id === "fake_team5");
    assert.equal(full.readiness.total, 5);
    assert.doesNotMatch(render({ ...first, items: [full] }), /Request to join/);
    for (const who of ["alice", "admin", "stranger"]) {
      const view = (await service(who).view("/discover/teams")) as any;
      assert.doesNotMatch(render(view), /Request to join/);
    }
    await assert.rejects(
      service("stranger").command("request-team", { teamId: team.id }),
      { code: "VIEWER_READ_ONLY" },
    );
    await assert.rejects(
      service("alice").command("request-team", { teamId: "fake_team3" }),
      { code: "ALREADY_IN_TEAM" },
    );
    await service("admin").command("admin-status", {
      kind: "person",
      targetId: "fake_pending",
      status: "Absent",
      confirmation: "CHANGE_STATUS",
    });
    // Attendance is separate: existing code permits rostered complete profiles to
    // request before the freeze even when Absent. Do not invent a new restriction.
    const absent = (await service("pending").view("/discover/teams")) as any;
    assert.equal(absent.me.canParticipate, true);
    clock("2026-10-30T00:00:00.000Z");
    await assert.rejects(
      service("pending").command("request-team", { teamId: "fake_team3" }),
      { code: "MEMBERSHIP_FROZEN" },
    );
  } finally {
    db.close();
  }
});
