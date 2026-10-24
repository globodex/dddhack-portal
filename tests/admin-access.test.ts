import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AddAdmins, {
  addAdminValues,
  revokeAdminValues,
} from "../app/add-admins";
import { OWNER_EMAIL } from "../lib/identity";
import { batch, one, rows } from "../lib/db";
import { setup } from "./helpers";

test("admin access is an owner-only minimal projection, also present in owner settings", async () => {
  const { db, service } = await setup();
  try {
    const view = (await service("owner").view("/admin/access")) as any;
    assert.deepEqual(view.items.map((row: any) => row.id).sort(), [
      "fake_admin",
      "fake_owner",
    ]);
    assert.equal(
      view.items.find((row: any) => row.id === "fake_owner").owner,
      true,
    );
    for (const person of view.items)
      assert.deepEqual(Object.keys(person).sort(), [
        "email",
        "id",
        "name",
        "owner",
      ]);
    const settings = (await service("owner").view("/admin/settings")) as any;
    assert.deepEqual(settings.adminAccess, view);
    const adminSettings = (await service("admin").view(
      "/admin/settings",
    )) as any;
    assert.equal("adminAccess" in adminSettings, false);
    for (const role of ["admin", "judge", "alice", "stranger"])
      await assert.rejects(service(role).view("/admin/access"), {
        code: "OWNER_REQUIRED",
      });
  } finally {
    db.close();
  }
});

test("revoke blocks nonowners, self, configured owner and malformed confirmation without writes", async () => {
  const { db, service } = await setup();
  try {
    await batch(db, [
      [
        "INSERT INTO users(id,email,name,role,created_at) VALUES('protected-owner',?,'Protected owner','admin','2026-10-22T08:00:00.000Z')",
        OWNER_EMAIL,
      ],
    ]);
    for (const role of ["admin", "judge", "alice"])
      await assert.rejects(
        service(role).command("revoke-admin", revokeAdminValues("fake_admin")),
        { code: "OWNER_REQUIRED" },
      );
    await assert.rejects(
      service("stranger").command(
        "revoke-admin",
        revokeAdminValues("fake_admin"),
      ),
      { status: 403, code: "VIEWER_READ_ONLY" },
    );
    for (const userId of ["fake_owner", "protected-owner"])
      await assert.rejects(
        service("owner").command("revoke-admin", revokeAdminValues(userId)),
        { code: "OWNER_IDENTITY_IS_PLATFORM_MANAGED" },
      );
    for (const data of [
      { userId: "fake_admin" },
      { ...revokeAdminValues("fake_admin"), role: "owner" },
    ])
      await assert.rejects(service("owner").command("revoke-admin", data));
    assert.equal(
      (await rows(db, "SELECT * FROM audit_logs WHERE action='revoke-admin'"))
        .length,
      0,
    );
    assert.equal((await service("admin").actor()).role, "admin");
    const view = (await service("owner").view("/admin/access")) as any;
    assert.equal(
      view.items.find((row: any) => row.id === "protected-owner").owner,
      true,
    );
  } finally {
    db.close();
  }
});

test("legacy admin revocation overrides users.role and rechecks an already-authenticated session", async () => {
  const { db, service } = await setup();
  try {
    const adminSession = service("admin");
    assert.equal((await adminSession.actor()).role, "admin");
    const before = await one(db, "SELECT * FROM users WHERE id='fake_admin'");
    const first = (await service("owner").command(
      "revoke-admin",
      revokeAdminValues("fake_admin"),
    )) as any;
    assert.equal(first.revoked, true);
    assert.equal(
      (await one<any>(db, "SELECT role FROM users WHERE id='fake_admin'"))
        ?.role,
      "admin",
    );
    assert.equal(
      (
        await one<any>(
          db,
          "SELECT role FROM portal_roles WHERE user_id='fake_admin'",
        )
      )?.role,
      "participant",
    );
    const actor = await adminSession.actor();
    assert.equal(actor.id, "fake_admin");
    assert.equal(actor.role, "participant");
    await assert.rejects(adminSession.view("/admin/participants"), {
      code: "ADMIN_REQUIRED",
    });
    assert.deepEqual(
      await one(db, "SELECT * FROM users WHERE id='fake_admin'"),
      before,
    );
    const second = (await service("owner").command(
      "revoke-admin",
      revokeAdminValues("fake_admin"),
    )) as any;
    assert.equal(second.revoked, false);
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM audit_logs WHERE action='revoke-admin' AND entity_id='fake_admin'",
        )
      ).length,
      1,
    );
  } finally {
    db.close();
  }
});

test("existing normalized add, dedupe and revoke preserve participant, team, private idea and profile data", async () => {
  const { db, service } = await setup();
  try {
    const preserved = async () => ({
      users: await one(db, "SELECT * FROM users WHERE id='fake_bob'"),
      profiles: await one(
        db,
        "SELECT * FROM profiles WHERE user_id='fake_bob'",
      ),
      participant: await one(
        db,
        "SELECT * FROM participant_profiles WHERE user_id='fake_bob'",
      ),
      member: await one(
        db,
        "SELECT * FROM memberships WHERE user_id='fake_bob'",
      ),
      team: await one(db, "SELECT * FROM teams WHERE id='fake_team3'"),
      idea: await one(db, "SELECT * FROM ideas WHERE team_id='fake_team3'"),
    });
    const before = await preserved();
    await assert.rejects(
      service("admin").command("add-admin", addAdminValues("bob@portal.test")),
      { code: "OWNER_REQUIRED" },
    );
    await service("owner").command(
      "add-admin",
      addAdminValues("  BOB@PORTAL.TEST  "),
    );
    await service("owner").command(
      "add-admin",
      addAdminValues("bob@portal.test"),
    );
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM audit_logs WHERE action='add-admin' AND entity_id='fake_bob'",
        )
      ).length,
      1,
    );
    assert.equal((await service("bob").actor()).role, "admin");
    await service("owner").command(
      "revoke-admin",
      revokeAdminValues("fake_bob"),
    );
    assert.equal((await service("bob").actor()).role, "participant");
    assert.deepEqual(await preserved(), before);
    await service("owner").command(
      "add-admin",
      addAdminValues("bob@portal.test"),
    );
    assert.equal((await service("bob").actor()).role, "admin");
    assert.deepEqual(await preserved(), before);
  } finally {
    db.close();
  }
});

test("concurrent revoke commits one role change and one audit", async () => {
  const { db, service } = await setup();
  try {
    const results = (await Promise.all([
      service("owner").command("revoke-admin", revokeAdminValues("fake_admin")),
      service("owner").command("revoke-admin", revokeAdminValues("fake_admin")),
    ])) as any[];
    assert.equal(results.filter((result) => result.revoked).length, 1);
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM audit_logs WHERE action='revoke-admin' AND entity_id='fake_admin'",
        )
      ).length,
      1,
    );
    assert.equal((await service("admin").actor()).role, "participant");
  } finally {
    db.close();
  }
});

test("access controls show protected owner and targeted revoke, and guard native prehydration form submission", () => {
  const props = {
    owner: true,
    access: {
      items: [
        {
          id: "owner",
          name: "Synthetic Owner",
          email: "owner@portal.test",
          owner: true,
        },
        {
          id: "admin",
          name: "Synthetic Admin",
          email: "admin@portal.test",
          owner: false,
        },
      ],
    },
    run: async () => {
      throw new Error("Rendering cannot mutate");
    },
  };
  const html = renderToStaticMarkup(createElement(AddAdmins, props));
  assert.match(html, /Current admin access/);
  assert.match(html, /Revoke admin access for Synthetic Admin/);
  assert.doesNotMatch(html, /Revoke admin access for Synthetic Owner/);
  assert.match(html, /<form[^>]*method="post"/);
  assert.match(html, /<form[^>]*inert=""[^>]*data-hydrated="false"/);
  assert.match(html, /<fieldset disabled=""/);
  assert.equal(
    renderToStaticMarkup(createElement(AddAdmins, { ...props, owner: false })),
    "",
  );
  assert.deepEqual(addAdminValues("  BOB@PORTAL.TEST "), {
    email: "bob@portal.test",
    confirmation: "ADD_ADMIN",
  });
});
