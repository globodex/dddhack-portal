import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AdminPresentationCache,
  AdminPresentationCacheMiss,
  prepareAdminPresentation,
} from "../lib/admin-presentation";
const path = "/admin/participants";
const actor = { id: "fake_admin", role: "admin", owner: false };
const view = () => ({
  me: { ...actor },
  items: [
    {
      id: "fake_alice",
      name: "Synthetic Alice",
      avatarColor: "blue",
      avatarExpression: "squeezed",
      teamName: "Synthetic Team",
      teamPalette: "forest",
      status: "Registered",
      teamId: "fake_team",
      email: "private@portal.test",
      phone: "PRIVATE-PHONE",
      idea: "PRIVATE-IDEA",
      credit: "PRIVATE-CREDIT",
      votes: 0,
    },
    {
      id: null,
      name: "Not signed in",
      email: "unregistered@portal.test",
      status: "Registered",
    },
  ],
});

test("Admin refresh reuses only explicit labels while all volatile/private fields stay fresh, preserving id/null-id rows", async () => {
  const cache = new AdminPresentationCache();
  const original = view();
  const full = await prepareAdminPresentation(original, path);
  assert.equal(full.items, original.items);
  await cache.merge(full, path);
  const known = await cache.knownVersion(path, actor);
  const current = view();
  Object.assign(current.items[0], {
    status: "Checked in",
    votes: 7,
    phone: "NEW-PRIVATE-PHONE",
    idea: "NEW-PRIVATE-IDEA",
    credit: "NEW-PRIVATE-CREDIT",
  });
  current.items[1].name = "Fresh never-signed-in label";
  const delta = await prepareAdminPresentation(current, path, {}, known);
  assert.equal(delta.adminPresentation.unchanged, true);
  assert.equal(delta.items[0].id, "fake_alice");
  assert.equal("name" in delta.items[0], false);
  assert.equal(delta.items[1], current.items[1]);
  assert.equal(original.items[0].name, "Synthetic Alice");
  const merged = await cache.merge(delta, path);
  assert.deepEqual(merged.items, current.items);
  assert.ok(
    Buffer.byteLength(JSON.stringify(delta)) <
      Buffer.byteLength(
        JSON.stringify({
          ...current,
          adminPresentation: full.adminPresentation,
        }),
      ),
  );
});

test("editable avatars, name overrides and membership presentation changes invalidate version without assuming immutability", async () => {
  for (const change of [
    { avatarColor: "purple" },
    { avatarExpression: "sleepy" },
    { name: "Admin-corrected name" },
    { teamName: "New Team", teamId: "fake_other" },
    { teamPalette: "blue" },
  ]) {
    const cache = new AdminPresentationCache();
    const full = await prepareAdminPresentation(view(), path);
    await cache.merge(full, path);
    const next = view();
    Object.assign(next.items[0], change);
    const response = await prepareAdminPresentation(
      next,
      path,
      {},
      full.adminPresentation.version,
    );
    assert.equal(response.adminPresentation.unchanged, false);
    assert.notEqual(
      response.adminPresentation.version,
      full.adminPresentation.version,
    );
    assert.deepEqual((await cache.merge(response, path)).items, next.items);
  }
});

test("actor, role, owner, route and options are independent scopes; scope switches clear the single snapshot", async () => {
  const full = await prepareAdminPresentation(view(), path, {
    search: "private@portal.test",
    page: 0,
  });
  assert.doesNotMatch(
    full.adminPresentation.scope,
    /private|portal|fake_admin/,
  );
  for (const [nextActor, nextPath, options] of [
    [
      { ...actor, id: "fake_other_admin" },
      path,
      { search: "private@portal.test", page: 0 },
    ],
    [
      { ...actor, role: "volunteer" },
      path,
      { search: "private@portal.test", page: 0 },
    ],
    [
      { ...actor, owner: true },
      path,
      { search: "private@portal.test", page: 0 },
    ],
    [actor, "/admin/teams", { search: "private@portal.test", page: 0 }],
    [actor, path, { search: "changed", page: 0 }],
  ] as const) {
    const cache = new AdminPresentationCache();
    await cache.merge(full, path, { search: "private@portal.test", page: 0 });
    assert.equal(
      await cache.knownVersion(nextPath, nextActor, options),
      undefined,
    );
    assert.equal(
      await cache.knownVersion(path, actor, {
        search: "private@portal.test",
        page: 0,
      }),
      undefined,
    );
    const changed = { ...view(), me: nextActor };
    const response = await prepareAdminPresentation(
      changed,
      nextPath,
      options,
      full.adminPresentation.version,
    );
    assert.equal(response.adminPresentation.unchanged, false);
  }
});

test("missing/wrong snapshots, tampered scopes, changed IDs and unsafe delta shapes fail closed for full retry", async () => {
  const full = await prepareAdminPresentation(view(), path);
  const delta = await prepareAdminPresentation(
    view(),
    path,
    {},
    full.adminPresentation.version,
  );
  for (const modify of [
    (row: any) => {
      row.adminPresentation.scope = "wrong";
    },
    (row: any) => {
      row.items[0].id = "fake_changed";
    },
    (row: any) => {
      row.items.push({ id: "fake_new", status: "Registered" });
    },
    (row: any) => {
      row.items[0].name = "Contradictory label";
    },
    (row: any) => {
      row.me.id = "fake_other";
    },
  ]) {
    const cache = new AdminPresentationCache();
    await cache.merge(full, path);
    const invalid = structuredClone(delta);
    modify(invalid);
    await assert.rejects(
      cache.merge(invalid, path),
      AdminPresentationCacheMiss,
    );
    assert.equal(await cache.knownVersion(path, actor), undefined);
  }
  const empty = new AdminPresentationCache();
  await assert.rejects(empty.merge(delta, path), AdminPresentationCacheMiss);
  await empty.merge(full, path);
  empty.clear();
  await assert.rejects(empty.merge(delta, path), AdminPresentationCacheMiss);
});

test("row removals invalidate snapshot; row order can change without recaching labels; unsupported views remain full", async () => {
  const cache = new AdminPresentationCache();
  const current: any = view();
  current.items.push({
    id: "fake_bob",
    name: "Synthetic Bob",
    status: "Registered",
  });
  const full = await prepareAdminPresentation(current, path);
  await cache.merge(full, path);
  const reversed = { ...current, items: [...current.items].reverse() };
  const delta = await prepareAdminPresentation(
    reversed,
    path,
    {},
    full.adminPresentation.version,
  );
  assert.equal(delta.adminPresentation.unchanged, true);
  assert.deepEqual((await cache.merge(delta, path)).items, reversed.items);
  const removed = {
    ...current,
    items: current.items.filter((row: any) => row.id !== "fake_bob"),
  };
  assert.equal(
    (
      await prepareAdminPresentation(
        removed,
        path,
        {},
        full.adminPresentation.version,
      )
    ).adminPresentation.unchanged,
    false,
  );
  assert.equal(
    await prepareAdminPresentation(current, "/admin/submissions"),
    current,
  );
  const unauthorized = { ...current, me: { ...actor, role: "participant" } };
  assert.equal(
    await prepareAdminPresentation(unauthorized, path),
    unauthorized,
  );
});

test("real fresh Admin projections preserve status/readiness and private ideas while avatar/name changes invalidate labels", async () => {
  const { setup } = await import("./helpers");
  const { db, service } = await setup();
  try {
    const participants = new AdminPresentationCache();
    const first = await prepareAdminPresentation(
      await service("admin").view(path),
      path,
    );
    await participants.merge(first, path);
    await db
      .prepare(
        "UPDATE registrations SET status='pending' WHERE email='alice@portal.test'",
      )
      .all();
    const fresh = await service("admin").view(path);
    const delta = await prepareAdminPresentation(
      fresh,
      path,
      {},
      first.adminPresentation.version,
    );
    assert.equal(delta.adminPresentation.unchanged, true);
    const merged = await participants.merge(delta, path);
    assert.deepEqual(merged.items, fresh.items);
    assert.equal(
      (merged.items as any[]).find((row) => row.id === "fake_alice").status,
      "Registered",
    );

    await db
      .prepare(
        "UPDATE profile_details SET avatar_color='purple' WHERE user_id='fake_alice'",
      )
      .all();
    const avatar = await prepareAdminPresentation(
      await service("admin").view(path),
      path,
      {},
      first.adminPresentation.version,
    );
    assert.equal(avatar.adminPresentation.unchanged, false);
    await participants.merge(avatar, path);
    assert.equal(
      (avatar.items as any[]).find((row) => row.id === "fake_alice")
        .avatarColor,
      "purple",
    );

    await db
      .prepare(
        "UPDATE participant_profiles SET display_name='Synthetic Admin Override' WHERE user_id='fake_alice'",
      )
      .all();
    const renamed = await prepareAdminPresentation(
      await service("admin").view(path),
      path,
      {},
      avatar.adminPresentation.version,
    );
    assert.equal(renamed.adminPresentation.unchanged, false);
    assert.equal(
      (renamed.items as any[]).find((row) => row.id === "fake_alice").name,
      "Synthetic Admin Override",
    );

    await db
      .prepare(
        "INSERT INTO team_locks(team_id,locked_by,locked_at) VALUES('fake_team1','fake_alice','2026-10-22T08:00:00.000Z')",
      )
      .all();
    const teamsPath = "/admin/teams";
    const teams = new AdminPresentationCache();
    const teamFull = await prepareAdminPresentation(
      await service("admin").view(teamsPath),
      teamsPath,
    );
    await teams.merge(teamFull, teamsPath);
    await service("admin").command("admin-idea-override", {
      teamId: "fake_team3",
      title: "NEW PRIVATE IDEA",
      description: "Synthetic authorized correction",
      reason: "Synthetic cache freshness check",
      confirmation: "OVERRIDE_TEAM_IDEA",
    });
    const ideasFresh = await service("admin").view(teamsPath);
    const ideaDelta = await prepareAdminPresentation(
      ideasFresh,
      teamsPath,
      {},
      teamFull.adminPresentation.version,
    );
    assert.equal(ideaDelta.adminPresentation.unchanged, true);
    assert.equal(
      (ideaDelta.items as any[]).find((row) => row.id === "fake_team3").idea
        .title,
      "NEW PRIVATE IDEA",
    );
    assert.deepEqual(
      (await teams.merge(ideaDelta, teamsPath)).items,
      ideasFresh.items,
    );
    await assert.rejects(
      db
        .prepare(
          "UPDATE teams SET name='Blocked Locked Rename' WHERE id='fake_team1'",
        )
        .all(),
      /TEAM_LOCKED/,
    );
    await db
      .prepare(
        "UPDATE teams SET name='Synthetic Team Label Change' WHERE id='fake_team3'",
      )
      .all();
    const teamRenamed = await prepareAdminPresentation(
      await service("admin").view(teamsPath),
      teamsPath,
      {},
      teamFull.adminPresentation.version,
    );
    assert.equal(teamRenamed.adminPresentation.unchanged, false);
    assert.equal(
      (teamRenamed.items as any[]).find((row) => row.id === "fake_team3").name,
      "Synthetic Team Label Change",
    );

    await db
      .prepare("UPDATE users SET role='participant' WHERE id='fake_admin' ")
      .all();
    await assert.rejects(service("admin").view(path), {
      code: "ADMIN_REQUIRED",
    });
  } finally {
    db.close();
  }
});

test("logout/pagehide clear cannot be undone by in-flight digest completion", async () => {
  const cache = new AdminPresentationCache();
  const full = await prepareAdminPresentation(view(), path);
  const pending = cache.merge(full, path);
  cache.clear();
  await assert.rejects(pending, AdminPresentationCacheMiss);
  assert.equal(await cache.knownVersion(path, actor), undefined);
});
