import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { handlePortal } from "../lib/http";
import { rows } from "../lib/db";
import {
  seedTeamControls,
  teamControlActors as actors,
  teamControlIds as ids,
} from "../scripts/team-controls-fixtures";

test("synthetic Team HTTP flow persists ten writes and revokes removed-member private access", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-23T10:00:00Z"),
  });
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("External calls are forbidden in this synthetic HTTP flow");
  });
  const { db } = await setup();
  let successfulWrites = 0;
  const origin = "http://127.0.0.1:4176";
  const call = async (
    who: keyof typeof actors,
    action?: string,
    data?: unknown,
  ) => {
    const request = new Request(
      origin + "/api/portal" + (action ? "" : "?view=%2Fdashboard"),
      {
        method: action ? "POST" : "GET",
        headers: action ? { "content-type": "application/json", origin } : {},
        ...(action ? { body: JSON.stringify({ action, data }) } : {}),
      },
    );
    const response = await handlePortal(request, {
      db,
      identity: actors[who],
      key: undefined,
    });
    assert.match(
      response.headers.get("cache-control") || "",
      /private, no-store/,
    );
    const result = (await response.json()) as any;
    return { response, result };
  };
  const write = async (
    who: keyof typeof actors,
    action: string,
    data: unknown,
  ) => {
    const { response, result } = await call(who, action, data);
    assert.equal(response.status, 200, action + ": " + JSON.stringify(result));
    successfulWrites++;
    return result;
  };
  const view = async (who: keyof typeof actors) => {
    const { response, result } = await call(who);
    assert.equal(response.status, 200);
    return result;
  };
  try {
    await seedTeamControls(db, { scope: "fresh-disposable-local" });
    const initial = await view("leader");
    assert.equal(initial.team.id, ids.formingTeam);
    assert.equal(initial.submissionAccess.attemptsUsed, 0);
    const memberRename = await call("member", "rename-team", {
      name: "Forbidden rename",
    });
    assert.equal(memberRename.response.status, 403);
    assert.equal((await view("leader")).team.name, "Synthetic Green Loop");

    const idea = {
      title: "Synthetic persisted idea",
      description: "Synthetic private idea. ".repeat(24).slice(0, 500),
    };
    await write("leader", "save-workspace-idea", idea);
    await write("leader", "rename-team", { name: "Synthetic HTTP Loop" });
    await write("leader", "team-style", {
      avatar: "initials",
      palette: "coral",
    });
    await write("leader", "respond-team", {
      requestId: ids.acceptRequest,
      accept: true,
    });
    assert.equal(
      (await view("accept")).idea.description,
      idea.description.trim(),
    );
    await write("leader", "respond-team", {
      requestId: ids.declineRequest,
      accept: false,
    });
    assert.ok(!(await view("decline")).team);
    await write("leader", "remove-workspace-member", {
      userId: actors.accept.id,
    });
    const removed = await view("accept");
    for (const key of [
      "team",
      "idea",
      "privateVenue",
      "privateVenueDirections",
    ])
      assert.ok(!removed[key], key + " must be revoked");
    assert.ok(!JSON.stringify(removed).includes(idea.description.trim()));
    await write("leader", "lock-team", { confirmation: "LOCK_TEAM" });
    const locked = await view("leader");
    assert.equal(locked.teamStatus, "Locked");
    assert.equal(locked.team.name, "Synthetic HTTP Loop");
    assert.equal(locked.team.palette, "coral");
    assert.equal(locked.submissionAccess.attemptsUsed, 0);
    const frozenRename = await call("leader", "rename-team", {
      name: "Forbidden frozen rename",
    });
    assert.equal(frozenRename.response.status, 409);
    assert.equal(frozenRename.result.code, "TEAM_LOCKED");

    await write("solo", "delete-own-team", { confirmation: "DELETE_OWN_TEAM" });
    assert.ok(!(await view("solo")).team);
    const created = await write("solo", "create-workspace-team", {
      name: "Synthetic HTTP Replacement",
      bio: "",
      avatar: "initials",
      palette: "forest",
    });
    assert.match(created.teamId, /^[a-f0-9-]{36}$/);
    await write("decline", "request-team", { teamId: created.teamId });
    const replacement = await view("solo");
    assert.equal(replacement.team.id, created.teamId);
    assert.equal(
      replacement.actions.filter(
        (entry: any) =>
          entry.user_id === actors.decline.id && entry.status === "pending",
      ).length,
      1,
    );
    assert.equal(successfulWrites, 10);
    assert.equal(
      (
        await rows(
          db,
          "SELECT id FROM submission_versions WHERE team_id IN (?,?)",
          ids.formingTeam,
          created.teamId,
        )
      ).length,
      0,
    );
    const history = await rows<{ snapshot: string }>(
      db,
      "SELECT snapshot FROM record_removals WHERE kind='team' AND target_id=? AND active=1",
      ids.soloTeam,
    );
    assert.equal(history.length, 1);
    assert.equal(JSON.parse(history[0].snapshot).leaderId, actors.solo.id);
  } finally {
    db.close();
  }
});
