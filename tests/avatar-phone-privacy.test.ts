import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { PortalService } from "../lib/service";
import { dotColors, dotExpressions } from "../lib/avatar-contract";
import { normalizePhone } from "../lib/phone";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DotAvatar from "../app/dot-avatar";
import TeamAvatar from "../app/team-avatar";
import ProfileFlow from "../app/profile-flow";
import { handlePortal } from "../lib/http";
import { fixtures } from "../scripts/fixtures";
type Row = Record<string, any>;
test("eight symbolic expressions and eight approved colors validate server-side; profile upload is rejected; teams use initials", async () => {
  assert.equal(Object.keys(dotExpressions).length, 8);
  assert.equal(Object.keys(dotColors).length, 8);
  assert.ok(!("cyan" in dotColors));
  const html = renderToStaticMarkup(
    createElement(ProfileFlow, {
      data: {
        me: { name: "Alex Rao", email: "a@example.invalid" },
        profile: {},
      },
      run: async () => ({}),
    }),
  );
  assert.ok(!html.includes('type="file"') && !html.includes("Profile picture"));
  for (const expression of Object.keys(dotExpressions)) {
    const svg = renderToStaticMarkup(createElement(DotAvatar, { expression }));
    assert.equal((svg.match(/<circle/g) || []).length, 1);
    assert.ok(svg.includes("<text") && !svg.includes("<path"));
  }
  const badge = renderToStaticMarkup(
    createElement(TeamAvatar, { name: "Real Builders", palette: "forest" }),
  );
  assert.ok(badge.includes("RB") && !badge.includes("<path"));
  const { db, service } = await setup();
  try {
    const profile = {
      displayName: "Alice Builder",
      gender: "non-binary",
      bio: "Builds tools",
      avatarColor: "orange",
      avatarExpression: "mixed-slash",
    };
    await service().command("complete-profile", profile);
    const view = (await service().view("/profile")) as Row;
    assert.equal(view.profile.avatar_color, "orange");
    assert.equal(view.profile.avatar_expression, "mixed-slash");
    for (const payload of [
      { ...profile, photo: "data:image/png;base64,AAAA" },
      { ...profile, avatarColor: "cyan" },
      { ...profile, avatarExpression: "literal-pupils" },
    ])
      await assert.rejects(service().command("complete-profile", payload));
    await assert.rejects(
      service().command("team-style", { avatar: "fold", palette: "forest" }),
    );
  } finally {
    db.close();
  }
});
test("phone visibility is limited to current own-team members, revoked on leaving/transfer and absent from discovery/admin/public projections", async () => {
  const { db, service } = await setup();
  try {
    for (const [id, phone] of [
      ["alice", "+12025550101"],
      ["bob", "+12025550102"],
      ["carol", "+12025550103"],
      ["dave", "+12025550104"],
    ])
      await db
        .prepare("UPDATE profile_details SET phone=? WHERE user_id=?")
        .bind(phone, "fake_" + id)
        .all();
    const bob = (await service("bob").view("/dashboard/team")) as Row;
    assert.equal(bob.members.length, 3);
    assert.ok(bob.members.some((m: Row) => m.phone === "+12025550103"));
    for (const m of bob.members) {
      assert.match(m.whatsappUrl, /^https:\/\/wa\.me\/\d+$/);
      assert.equal(new URL(m.whatsappUrl).search, "");
    }
    for (const [who, path] of [
      ["alice", "/dashboard"],
      ["bob", "/teams"],
      ["admin", "/admin/teams"],
      ["admin", "/admin/participants"],
    ]) {
      const v = await service(who).view(path);
      if (path !== "/dashboard")
        assert.ok(!JSON.stringify(v).includes("+12025550103"));
      else
        assert.ok(!JSON.stringify((v as Row).members).includes("+12025550103"));
    }
    await service("admin").command("remove-workspace-member", {
      userId: "fake_carol",
      reason: "Synthetic member left team",
    });
    assert.ok(
      !JSON.stringify(
        ((await service("bob").view("/dashboard")) as Row).members,
      ).includes("+12025550103"),
    );
    assert.ok(
      !JSON.stringify(
        ((await service("carol").view("/dashboard")) as Row).members,
      ).includes("+12025550102"),
    );
    await db
      .prepare(
        "INSERT INTO memberships VALUES('fake_carol','fake_team1','2026-10-23')",
      )
      .all();
    const transferred = (await service("alice").view("/dashboard")) as Row;
    assert.ok(transferred.members.some((m: Row) => m.phone === "+12025550103"));
    assert.ok(
      !JSON.stringify(
        ((await service("bob").view("/dashboard")) as Row).members,
      ).includes("+12025550103"),
    );
    const response = await handlePortal(
      new Request(
        "https://portal.test/api/portal?view=/dashboard/team&teamId=fake_team1",
      ),
      { db, identity: fixtures.bob, key: undefined },
    );
    assert.equal(response.status, 200);
    assert.ok(
      !JSON.stringify(((await response.json()) as Row).members).includes(
        "+12025550101",
      ),
    );
    assert.match(response.headers.get("cache-control")!, /no-store/);
    const anon = new PortalService(db, null, undefined);
    for (const path of ["/", "/projects", "/leaderboard"])
      assert.ok(
        !JSON.stringify(await anon.view(path)).includes("+12025550103"),
      );
    assert.equal(normalizePhone("+1 (202) 555-0100"), "+12025550100");
    assert.throws(() => normalizePhone("2025550100"));
    assert.throws(() => normalizePhone("+1234567890123456"));
  } finally {
    db.close();
  }
});
test("leader rename requires roster and unlocked pre-freeze team, preserves identity/history and never deletes a team", async () => {
  const { db, service, clock } = await setup();
  try {
    await service().command("rename-team", {
      name: "Renamed Builders",
      reason: "Synthetic leader rename",
    });
    let w = (await service().view("/dashboard")) as Row;
    assert.equal(w.team.name, "Renamed Builders");
    assert.equal(w.team.id, "fake_team1");
    await assert.rejects(
      service("carol").command("rename-team", {
        name: "Not mine",
        reason: "Synthetic forbidden edit",
      }),
      { code: "LEADER_REQUIRED" },
    );
    await service().command("save-workspace-idea", {
      title: "Synthetic",
      core: "Synthetic completed idea",
      description: "Synthetic",
    });
    await service().command("lock-team", { confirmation: "LOCK_TEAM" });
    await assert.rejects(
      service().command("rename-team", {
        name: "After lock",
        reason: "Synthetic blocked rename",
      }),
      { code: "TEAM_LOCKED" },
    );
    clock("2026-10-29T18:29:00.000Z");
    await assert.rejects(
      service("bob").command("rename-team", {
        name: "After freeze",
        reason: "Synthetic blocked rename",
      }),
      { code: "MEMBERSHIP_FROZEN" },
    );
    assert.equal(
      ((await service().view("/dashboard")) as Row).team.id,
      "fake_team1",
    );
  } finally {
    db.close();
  }
});
