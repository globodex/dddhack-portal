import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminParticipantActions, { participantDeleteValues } from "../app/admin-participant-actions";
import AdminTeamActions from "../app/admin-team-actions";
import { confirmationFor, requiresActionConfirmation, revealConfirmation } from "../lib/action-confirmation";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch } from "../lib/db";
import { AdminList, AdminParticipants } from "../app/portal";

const run = async () => { throw new Error("Rendering must not mutate"); };
const target = { id: "fake_person", name: "Synthetic Person", email: "synthetic@portal.test" };

test("single-person deletion confirms every led team without sending a reset or bulk target", () => {
  assert.deepEqual(participantDeleteValues(target), { userId: target.id, expectedLeaderTeamIds: [], confirmation: "DELETE_PARTICIPANT" });
  assert.deepEqual(participantDeleteValues({ ...target, leaderTeamIds: ["active", "archived"] }).expectedLeaderTeamIds, ["active", "archived"]);
  assert.throws(() => participantDeleteValues({ ...target, id: "" }));
  for (const action of ["admin-delete-participant", "admin-delete-team"]) {
    assert.equal(requiresActionConfirmation(action), true);
    assert.equal(revealConfirmation(action, {}), action === "admin-delete-team" ? "DELETE_TEAM" : "DELETE_PARTICIPANT");
    const confirmation = confirmationFor(action, {}, target.name);
    assert.equal(confirmation.critical, true);
    assert.equal(confirmation.tone, "danger");
    assert.match(confirmation.note!, /cannot be undone/);
  }
  const leader = confirmationFor("admin-delete-participant", { participantDeleteSummary: { teamCount: 2, teamNames: ["Current team", "Archived team"] } }, target.name);
  assert.match(leader.description, /2 teams, ideas, projects and all submissions/);
  assert.match(leader.description, /Other members stay registered/);
  assert.match(leader.badge!, /Current team.*Archived team/);
  assert.doesNotMatch(confirmationFor("admin-delete-participant", {}, target.name).description, /team stays/);
  assert.match(confirmationFor("admin-delete-participant", { participantDeleteSummary: { teamCount: 0, memberTeamName: "Surviving team" } }, target.name).description, /Their team stays intact/);
});

test("routine admin status menus ask for the status without demanding a reason", () => {
  const me = { id: "fake_admin", name: "Synthetic admin", email: "admin@portal.test", role: "admin", owner: false };
  const people = renderToStaticMarkup(createElement(AdminParticipants, { data: { me, items: [{ ...target, status: "Going", approval: "approved", canDeleteParticipant: true }] }, run }));
  const teams = renderToStaticMarkup(createElement(AdminList, { path: "/admin/teams", data: { me, items: [{ id: "fake_team", name: "Synthetic team", status: "Forming", members: [] }] }, run }));
  for (const markup of [people, teams]) {
    assert.match(markup, /New status/);
    assert.doesNotMatch(markup, /Audit reason|name="reason"/);
  }
});

test("participant controls keep legacy restore separate from irreversible deletion and omit protected targets", () => {
  const html = (participant: typeof target & { removed?: boolean; canDelete?: boolean }) => renderToStaticMarkup(createElement(AdminParticipantActions, { participant, run }));
  assert.match(html(target), /Delete participant: Synthetic Person/);
  assert.doesNotMatch(html(target), /Restore|Remove participant/);
  assert.match(html({ ...target, removed: true }), />Restore<\/button>/);
  assert.match(html({ ...target, removed: true }), /Delete participant/);
  assert.doesNotMatch(html({ ...target, canDelete: false }), /Delete participant/);
  const team = renderToStaticMarkup(createElement(AdminTeamActions, { team: { id: "fake_team", name: "Synthetic team", members: [] }, run }));
  assert.match(team, /Delete team/);
  assert.match(team, /Add member/);
  assert.match(team, /Rename team/);
});

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: admin deletion projection includes archived leadership and omits terminal auth stubs`, async () => {
    const pg = engine === "postgres" ? await createPGliteFixture() : null;
    const local = pg ? null : await setup();
    const db = pg?.db || local!.db;
    if (pg) await seedLocal(db);
    const service = new PortalService(db, fixtures.admin, LOCAL_CREDIT_KEY);
    try {
      await batch(db, [
        ["INSERT INTO teams VALUES('archived-synthetic','Archived synthetic team','fake_alice','Synthetic archived team','2026-10-24')"],
        ["INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) VALUES('team','archived-synthetic',1,'Synthetic','fake_admin','2026-10-24','{}')"],
      ]);
      const before = await service.view("/admin/participants") as any;
      const alice = before.items.find((person: any) => person.id === "fake_alice");
      assert.deepEqual(alice.leaderTeamIds, ["archived-synthetic", "fake_team1"]);
      assert.equal(alice.canDeleteParticipant, true);
      assert.equal(before.items.find((person: any) => person.id === "fake_admin").canDeleteParticipant, false);
      assert.equal(before.items.find((person: any) => person.id === "fake_carol").teamLeader, false);
      await service.command("admin-delete-participant", participantDeleteValues({ ...target, id: "fake_alice", leaderTeamIds: alice.leaderTeamIds }));
      const after = await service.view("/admin/participants") as any;
      assert.ok(!after.items.some((person: any) => person.id === "fake_alice" || person.email === "alice@portal.test"));
      assert.ok(after.items.some((person: any) => person.id === "fake_carol"));
      const publicView = await new PortalService(db, fixtures.carol, LOCAL_CREDIT_KEY).view("/discover/participants") as any;
      assert.doesNotMatch(JSON.stringify(publicView), /leaderTeamIds|leaderTeamNames|canDeleteParticipant/);
    } finally { if (pg) await pg.pool.end(); else local!.db.close(); }
  });
}
