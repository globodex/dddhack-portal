import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { handlePortal } from "../lib/http";
import { rows, batch, one } from "../lib/db";
import { fixtures } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import {
  seedTeamControls,
  teamControlActors as actors,
  teamControlIds as ids,
} from "../scripts/team-controls-fixtures";

test("accepted former member can submit a fresh actionable request to the same team", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-23T10:00:00Z") });
  t.mock.method(globalThis, "fetch", () => { throw new Error("Synthetic audit forbids external calls"); });
  const { db } = await setup();
  const call = async (who: keyof typeof actors, action: string, data: unknown) => {
    const response = await handlePortal(new Request("http://localhost/api/portal", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ action, data }),
    }), { db, identity: actors[who], key: undefined, localTest: true });
    const body = await response.json() as any;
    assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
    return body;
  };
  try {
    await seedTeamControls(db, { scope: "fresh-disposable-local" });
    await call("leader", "respond-team", { requestId: ids.acceptRequest, accept: true });
    await call("leader", "remove-workspace-member", { userId: actors.accept.id });
    assert.equal((await rows(db, "SELECT user_id FROM memberships WHERE user_id=?", actors.accept.id)).length, 0);
    const sent = await call("accept", "request-team", { teamId: ids.formingTeam });
    assert.equal(sent.message, "Request sent to the team leader.");
    const requests = await rows<{ id: string; status: string }>(db,
      "SELECT id,status FROM team_actions WHERE team_id=? AND user_id=? AND kind='request'", ids.formingTeam, actors.accept.id);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].status, "pending", "A successful request response must leave a pending leader action");
    assert.notEqual(requests[0].id, ids.acceptRequest, "Resolved request IDs must not become actionable again");
    const history = await rows<{ detail: string }>(db, "SELECT detail FROM audit_logs WHERE action='request-team'");
    assert.equal(history.length, 1);
    assert.equal(JSON.parse(history[0].detail).previousRequest.id, ids.acceptRequest);
    assert.equal(JSON.parse(history[0].detail).previousRequest.status, "accepted");
    const stale = await handlePortal(new Request("http://localhost/api/portal", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ action: "respond-team", data: { requestId: ids.acceptRequest, accept: true } }),
    }), { db, identity: actors.leader, key: undefined });
    assert.equal(stale.status, 403);
    const pendingRetries = await Promise.all(Array.from({ length: 3 }, () => call("accept", "request-team", { teamId: ids.formingTeam })));
    for (const retry of pendingRetries) assert.equal(retry.requestId, requests[0].id);
    assert.equal((await rows(db, "SELECT id FROM audit_logs WHERE action='request-team'")).length, 1);
    await call("leader", "respond-team", { requestId: requests[0].id, accept: true });
    assert.equal((await rows(db, "SELECT user_id FROM memberships WHERE user_id=? AND team_id=?", actors.accept.id, ids.formingTeam)).length, 1);
    const currentMember = await handlePortal(new Request("http://localhost/api/portal", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ action: "request-team", data: { teamId: ids.formingTeam } }),
    }), { db, identity: actors.accept, key: undefined });
    assert.equal(currentMember.status, 409);
    assert.equal((await currentMember.json() as any).code, "ALREADY_IN_TEAM");
  } finally { db.close(); }
});

test("concurrent accept and decline resolves a team request exactly once", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-23T10:00:00Z") });
  const { db } = await setup();
  try {
    await seedTeamControls(db, { scope: "fresh-disposable-local" });
    const respond = (accept: boolean) => handlePortal(new Request("http://localhost/api/portal", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ action: "respond-team", data: { requestId: ids.acceptRequest, accept } }),
    }), { db, identity: actors.leader, key: undefined });
    const results = await Promise.all([respond(false), respond(true)]);
    const outcomes = await Promise.all(results.map(async (response) => ({ status: response.status, body: await response.json() })));
    assert.equal(outcomes.filter((r) => r.status === 200).length, 1, JSON.stringify(outcomes));
    assert.equal(outcomes.filter((r) => r.status === 409 && (r.body as any).code === "REQUEST_ALREADY_RESOLVED").length, 1);
    assert.equal((await rows(db, "SELECT user_id FROM memberships WHERE user_id=?", actors.accept.id)).length, 0, "The winning decline must not create membership");
    assert.equal((await rows(db, "SELECT id FROM audit_logs WHERE action='respond-team' AND entity_id=?", ids.formingTeam)).length, 1);
  } finally { db.close(); }
});

test("concurrent repeated acceptance creates one membership and one response audit", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-23T10:00:00Z") });
  const { db } = await setup();
  try {
    await seedTeamControls(db, { scope: "fresh-disposable-local" });
    const leader = new PortalService(db, actors.leader, undefined);
    const decisions = await Promise.allSettled(Array.from({ length: 3 }, () => leader.command("respond-team", { requestId: ids.acceptRequest, accept: true })));
    assert.equal(decisions.filter((r) => r.status === "fulfilled").length, 1);
    for (const result of decisions) if (result.status === "rejected") assert.equal(result.reason.code, "REQUEST_ALREADY_RESOLVED");
    assert.equal((await rows(db, "SELECT user_id FROM memberships WHERE user_id=? AND team_id=?", actors.accept.id, ids.formingTeam)).length, 1);
    assert.equal((await rows(db, "SELECT id FROM audit_logs WHERE action='respond-team'")).length, 1);
    assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
  } finally { db.close(); }
});

test("new and declined requests have one stable pending ID under concurrent retries", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-23T10:00:00Z") });
  for (const prior of ["new", "declined"] as const) {
    const { db } = await setup();
    try {
      await seedTeamControls(db, { scope: "fresh-disposable-local" });
      const applicant = new PortalService(db, actors.decline, undefined);
      const leader = new PortalService(db, actors.leader, undefined);
      if (prior === "new") await batch(db, [["DELETE FROM team_actions WHERE id=?", ids.declineRequest]]);
      else await leader.command("respond-team", { requestId: ids.declineRequest, accept: false });
      const sends = await Promise.all(Array.from({ length: 3 }, () => applicant.command("request-team", { teamId: ids.formingTeam })));
      const pending = await one<{ id: string; status: string }>(db, "SELECT id,status FROM team_actions WHERE team_id=? AND user_id=? AND kind='request'", ids.formingTeam, actors.decline.id);
      assert.equal(pending?.status, "pending");
      assert.notEqual(pending.id, ids.declineRequest);
      for (const sent of sends) assert.equal(sent.requestId, pending.id);
      const audits = await rows<{ detail: string }>(db, "SELECT detail FROM audit_logs WHERE action='request-team'");
      assert.equal(audits.length, 1);
      if (prior === "declined") assert.equal(JSON.parse(audits[0].detail).previousRequest.id, ids.declineRequest);
      else assert.equal(JSON.parse(audits[0].detail).previousRequest, undefined);
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    } finally { db.close(); }
  }
});

test("requesting a full team reserves no seat; acceptance keeps capacity, registration and deadline guards", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-23T10:00:00Z") });
  const { db, service, clock } = await setup();
  try {
    const request = await service("pending").command("request-team", { teamId: "fake_team5" });
    assert.equal((await rows(db, "SELECT user_id FROM memberships WHERE team_id='fake_team5'")).length, 5);
    await assert.rejects(service("eve").command("respond-team", { requestId: request.requestId, accept: true }), /TEAM_FULL/);
    assert.equal((await one<any>(db, "SELECT status FROM team_actions WHERE id=?", request.requestId))?.status, "pending");
    assert.equal((await rows(db, "SELECT id FROM audit_logs WHERE action='respond-team'")).length, 0);
    const other = await service("pending").command("request-team", { teamId: "fake_team1" });
    await service("owner").command("participant-bulk", { emails: [fixtures.pending.email], status: "rejected" });
    await assert.rejects(service("alice").command("respond-team", { requestId: other.requestId, accept: true }), /REGISTRATION_REQUIRED/);
    assert.equal((await one<any>(db, "SELECT status FROM team_actions WHERE id=?", other.requestId))?.status, "pending");
    clock("2026-11-01T10:30:00.000Z");
    await assert.rejects(service("alice").command("respond-team", { requestId: other.requestId, accept: false }), { code: "MEMBERSHIP_FROZEN" });
    await assert.rejects(service("pending").command("request-team", { teamId: "fake_team3" }), { code: "MEMBERSHIP_FROZEN" });
    assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
  } finally { db.close(); }
});

test("concurrent retry recovery preserves the owner's existing participant-role request permission", async () => {
  const { db, service } = await setup();
  try {
    const owner = service("owner");
    const sent = await Promise.all(Array.from({ length: 3 }, () => owner.command("request-team", { teamId: "fake_team1" })));
    assert.equal(new Set(sent.map((r) => r.requestId)).size, 1);
    assert.equal((await rows(db, "SELECT id FROM audit_logs WHERE action='request-team'")).length, 1);
    assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
  } finally { db.close(); }
});
