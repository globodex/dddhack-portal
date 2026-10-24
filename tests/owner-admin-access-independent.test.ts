import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { handlePortal } from "../lib/http";
import { OWNER_EMAIL, type Identity } from "../lib/identity";
import { batch, one, rows, type Database } from "../lib/db";

const now = "2026-10-22T08:00:00.000Z";
const revoke = (userId: string) => ({ userId, confirmation: "REVOKE_ADMIN" });
const add = (email: string) => ({ email, confirmation: "ADD_ADMIN" });
async function fixture(engine: "sqlite" | "postgres") {
  if (engine === "sqlite") return setup();
  const { db } = await createPGliteFixture();
  await seedLocal(db);
  return {
    db,
    service: (who = "alice") =>
      new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => now),
  };
}
async function get(db: Database, identity: Identity | null, path: string) {
  const response = await handlePortal(
    new Request(
      "https://portal.test/api/portal?view=" + encodeURIComponent(path),
    ),
    { db, identity, key: LOCAL_CREDIT_KEY },
  );
  return { response, body: (await response.json()) as Record<string, any> };
}
async function post(
  db: Database,
  identity: Identity | null,
  action: string,
  data: unknown,
) {
  const response = await handlePortal(
    new Request("https://portal.test/api/portal", {
      method: "POST",
      headers: {
        origin: "https://portal.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, data }),
    }),
    { db, identity, key: LOCAL_CREDIT_KEY },
  );
  return { response, body: (await response.json()) as Record<string, any> };
}
async function revocations(db: Database, target = "fake_admin") {
  return (
    await rows(
      db,
      "SELECT * FROM audit_logs WHERE action='revoke-admin' AND entity_id=?",
      target,
    )
  ).length;
}
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function retained(db: Database, userId: string) {
  const memberships = await rows<any>(
    db,
    "SELECT * FROM memberships WHERE user_id=? ORDER BY team_id",
    userId,
  );
  const teams = [];
  for (const membership of memberships)
    teams.push({
      team: await one(db, "SELECT * FROM teams WHERE id=?", membership.team_id),
      idea: await one(
        db,
        "SELECT * FROM ideas WHERE team_id=?",
        membership.team_id,
      ),
      lock: await one(
        db,
        "SELECT * FROM team_locks WHERE team_id=?",
        membership.team_id,
      ),
    });
  return digest({
    user: await one(db, "SELECT * FROM users WHERE id=?", userId),
    profile: await one(db, "SELECT * FROM profiles WHERE user_id=?", userId),
    participant: await one(
      db,
      "SELECT * FROM participant_profiles WHERE user_id=?",
      userId,
    ),
    details: await one(
      db,
      "SELECT * FROM profile_details WHERE user_id=?",
      userId,
    ),
    registration: await one(
      db,
      "SELECT r.* FROM registrations r JOIN users u ON u.email=r.email WHERE u.id=?",
      userId,
    ),
    memberships,
    teams,
    allocations: await rows(
      db,
      "SELECT * FROM credit_allocations WHERE user_id=? ORDER BY inventory_id",
      userId,
    ),
  });
}
function beforeMutation(
  service: PortalService,
  action: string,
  work: () => Promise<unknown>,
) {
  const mutate = service.mutate.bind(service);
  let done = false;
  service.mutate = async (...args) => {
    if (args[1] === action && !done) {
      done = true;
      await work();
    }
    return mutate(...args);
  };
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: owner-only actual HTTP projection and settings omit all roster data for nonowners`, async () => {
    const { db, service } = await fixture(engine);
    try {
      const owner = await get(db, fixtures.owner, "/admin/access");
      assert.equal(owner.response.status, 200);
      assert.match(
        owner.response.headers.get("cache-control") || "",
        /no-store/,
      );
      assert.ok(
        owner.body.items.some(
          (row: any) => row.id === "fake_owner" && row.owner === true,
        ),
      );
      assert.ok(
        owner.body.items.some(
          (row: any) => row.id === "fake_admin" && row.owner === false,
        ),
      );
      assert.equal(
        new Set(owner.body.items.map((row: any) => row.id)).size,
        owner.body.items.length,
      );
      for (const row of owner.body.items)
        assert.deepEqual(Object.keys(row).sort(), [
          "email",
          "id",
          "name",
          "owner",
        ]);
      const ownerSettings = await get(db, fixtures.owner, "/admin/settings");
      assert.deepEqual(ownerSettings.body.adminAccess, {
        items: owner.body.items,
      });
      const adminSettings = await get(db, fixtures.admin, "/admin/settings");
      assert.equal(adminSettings.response.status, 200);
      assert.equal(Object.hasOwn(adminSettings.body, "adminAccess"), false);
      for (const who of ["admin", "judge", "alice", "stranger"]) {
        const denied = await get(db, fixtures[who], "/admin/access");
        assert.equal(denied.response.status, 403);
        assert.equal(denied.body.code, "OWNER_REQUIRED");
        assert.ok(!("items" in denied.body) && !("adminAccess" in denied.body));
        const write = await post(
          db,
          fixtures[who],
          "revoke-admin",
          revoke("fake_admin"),
        );
        assert.equal(write.response.status, 403);
        assert.ok(!("revoked" in write.body));
      }
      const anonymous = await get(db, null, "/admin/access");
      assert.equal(anonymous.response.status, 401);
      assert.ok(!("items" in anonymous.body));
      assert.equal(await revocations(db), 0);
      assert.equal((await service("admin").actor()).role, "admin");
    } finally {
      await db.close();
    }
  });

  test(`${engine}: legacy users.role admin loses private API access with the exact same authenticated identity`, async () => {
    const { db, service } = await fixture(engine);
    try {
      const identity = fixtures.admin,
        identityBefore = digest(identity),
        session = service("admin");
      const storedBefore = await retained(db, "fake_admin");
      assert.equal(
        (await get(db, identity, "/admin/participants")).response.status,
        200,
      );
      assert.equal((await session.actor()).role, "admin");
      assert.equal(
        await one(db, "SELECT * FROM portal_roles WHERE user_id='fake_admin'"),
        undefined,
      );
      const result = await post(
        db,
        fixtures.owner,
        "revoke-admin",
        revoke("fake_admin"),
      );
      assert.equal(result.response.status, 200);
      assert.equal(result.body.revoked, true);
      assert.equal(
        (await one(db, "SELECT role FROM users WHERE id='fake_admin'"))?.role,
        "admin",
        "legacy default is retained",
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT role FROM portal_roles WHERE user_id='fake_admin'",
          )
        )?.role,
        "participant",
        "explicit override defeats legacy fallback",
      );
      assert.equal(
        (await session.actor()).role,
        "participant",
        "existing service object also reloads roles",
      );
      const denied = await get(db, identity, "/admin/participants");
      assert.equal(denied.response.status, 403);
      assert.equal(denied.body.code, "ADMIN_REQUIRED");
      assert.ok(!("items" in denied.body));
      assert.equal(digest(identity), identityBefore);
      assert.equal(await retained(db, "fake_admin"), storedBefore);
      assert.equal(await revocations(db), 1);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: self/configured-owner protection and strict confirmation never change protected or nongranular roles`, async () => {
    const { db, service } = await fixture(engine);
    try {
      await batch(db, [
        [
          "INSERT INTO users(id,email,name,role,created_at) VALUES('fake_configured_owner',?,'Configured owner fixture','participant',?)",
          OWNER_EMAIL.toUpperCase(),
          now,
        ],
      ]);
      const protectedView = (await service("owner").view(
        "/admin/access",
      )) as any;
      assert.equal(
        protectedView.items.find(
          (row: any) => row.id === "fake_configured_owner",
        ).owner,
        true,
      );
      for (const userId of ["fake_owner", "fake_configured_owner"])
        await assert.rejects(
          service("owner").command("revoke-admin", revoke(userId)),
          { code: "OWNER_IDENTITY_IS_PLATFORM_MANAGED" },
        );
      for (const input of [
        { userId: "fake_admin" },
        { ...revoke("fake_admin"), confirmation: "ADD_ADMIN" },
        { ...revoke("fake_admin"), role: "judge" },
        { ...revoke("fake_admin"), owner: true },
      ])
        assert.equal(
          (await post(db, fixtures.owner, "revoke-admin", input)).response
            .status,
          422,
        );
      const judge = await one(db, "SELECT * FROM users WHERE id='fake_judge'");
      const noop = await service("owner").command(
        "revoke-admin",
        revoke("fake_judge"),
      );
      assert.equal(noop.revoked, false);
      assert.deepEqual(
        await one(db, "SELECT * FROM users WHERE id='fake_judge'"),
        judge,
      );
      assert.equal(
        await one(db, "SELECT * FROM portal_roles WHERE user_id='fake_judge'"),
        undefined,
      );
      const trusted: Identity = {
        id: "fake_configured_owner",
        email: OWNER_EMAIL,
        name: "Configured owner fixture",
        source: "neon",
        emailVerified: true,
      };
      assert.equal(
        (await get(db, trusted, "/admin/access")).response.status,
        200,
      );
      assert.equal(
        (await get(db, { ...trusted, emailVerified: false }, "/admin/access"))
          .response.status,
        403,
      );
      assert.equal(await revocations(db), 0);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: normalized add/revoke/regrant retain account, private profile, team, idea and personal allocation`, async () => {
    const { db, service } = await fixture(engine);
    try {
      await service("owner").command("check-in", {
        userId: "fake_bob",
        reason: "Synthetic existing personal allocation",
      });
      const before = await retained(db, "fake_bob"),
        session = service("bob"),
        identityBefore = digest(fixtures.bob);
      const valueBefore = digest(
        await session.command("reveal-credit", { typeId: "fake_credit" }),
      );
      await service("owner").command("add-admin", add("  BOB@PORTAL.TEST  "));
      await service("owner").command("add-admin", add("bob@portal.test"));
      assert.equal((await session.actor()).role, "admin");
      assert.equal(await retained(db, "fake_bob"), before);
      const removed = await service("owner").command(
        "revoke-admin",
        revoke("fake_bob"),
      );
      assert.equal(removed.revoked, true);
      assert.equal((await session.actor()).role, "participant");
      assert.equal(await retained(db, "fake_bob"), before);
      assert.equal(
        digest(
          await session.command("reveal-credit", { typeId: "fake_credit" }),
        ),
        valueBefore,
      );
      await service("owner").command("add-admin", add("bob@portal.test"));
      assert.equal((await session.actor()).role, "admin");
      assert.equal(await retained(db, "fake_bob"), before);
      assert.equal(digest(fixtures.bob), identityBefore);
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM audit_logs WHERE action='add-admin' AND entity_id='fake_bob'",
          )
        ).length,
        2,
      );
      assert.equal(await revocations(db, "fake_bob"), 1);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: repeated and concurrent revoke commit exactly one override and audit`, async () => {
    const { db, service } = await fixture(engine);
    try {
      const results = await Promise.all([
        service("owner").command("revoke-admin", revoke("fake_admin")),
        service("owner").command("revoke-admin", revoke("fake_admin")),
      ]);
      assert.equal(
        results.filter((result) => result.revoked === true).length,
        1,
      );
      assert.equal(
        results.filter((result) => result.revoked === false).length,
        1,
      );
      assert.equal(
        (await service("owner").command("revoke-admin", revoke("fake_admin")))
          .revoked,
        false,
      );
      assert.equal(await revocations(db), 1);
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM portal_roles WHERE user_id='fake_admin'",
          )
        ).length,
        1,
      );
      assert.equal((await service("admin").actor()).role, "participant");
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: interleaved authorized grant/revoke serialize without fallback resurrection or lost user data`, async () => {
    const { db, service } = await fixture(engine);
    try {
      const before = await retained(db, "fake_admin"),
        outer = service("owner"),
        inner = service("owner");
      beforeMutation(outer, "revoke-admin", async () => {
        await inner.command("revoke-admin", revoke("fake_admin"));
        await inner.command("add-admin", add("admin@portal.test"));
      });
      await outer.command("revoke-admin", revoke("fake_admin"));
      assert.equal(
        (await service("admin").actor()).role,
        "participant",
        "last committed revoke remains authoritative",
      );
      const grant = service("owner");
      beforeMutation(grant, "add-admin", async () => {
        assert.equal(
          (await inner.command("revoke-admin", revoke("fake_admin"))).revoked,
          false,
        );
      });
      await grant.command("add-admin", add("admin@portal.test"));
      assert.equal(
        (await service("admin").actor()).role,
        "admin",
        "later committed grant is explicit and authorized",
      );
      assert.equal(await retained(db, "fake_admin"), before);
      assert.equal(await revocations(db), 2);
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM audit_logs WHERE action='add-admin' AND entity_id='fake_admin'",
          )
        ).length,
        2,
      );
    } finally {
      await db.close();
    }
  });

  test(`${engine}: target becoming configured owner before the transaction is protected atomically`, async () => {
    const { db, service } = await fixture(engine);
    try {
      const owner = service("owner");
      beforeMutation(owner, "revoke-admin", async () =>
        batch(db, [
          ["UPDATE users SET email=? WHERE id='fake_admin'", OWNER_EMAIL],
        ]),
      );
      await assert.rejects(
        owner.command("revoke-admin", revoke("fake_admin")),
        { code: "ADMIN_ACCESS_CHANGED" },
      );
      assert.equal(
        await one(db, "SELECT * FROM portal_roles WHERE user_id='fake_admin'"),
        undefined,
      );
      assert.equal(
        (await one(db, "SELECT role FROM users WHERE id='fake_admin'"))?.role,
        "admin",
      );
      assert.equal(await revocations(db), 0);
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await db.close();
    }
  });

  test(`${engine}: owner removal during an in-flight revoke is revalidated and leaves target unchanged`, async () => {
    const { db, service } = await fixture(engine);
    try {
      const owner = service("owner");
      beforeMutation(owner, "revoke-admin", async () =>
        batch(db, [
          [
            "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) VALUES('participant','fake_owner',1,'Synthetic authorization race','fake_admin',?,'{}')",
            now,
          ],
        ]),
      );
      await assert.rejects(
        owner.command("revoke-admin", revoke("fake_admin")),
        { code: "PARTICIPANT_REMOVED" },
      );
      assert.equal((await service("admin").actor()).role, "admin");
      assert.equal(
        await one(db, "SELECT * FROM portal_roles WHERE user_id='fake_admin'"),
        undefined,
      );
      assert.equal(await revocations(db), 0);
    } finally {
      await db.close();
    }
  });
}
