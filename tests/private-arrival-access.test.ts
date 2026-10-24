import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { batch, rows } from "../lib/db";
import { handlePortal } from "../lib/http";
import { PortalService } from "../lib/service";

const now = "2026-10-24T12:00:00.000Z";
const published = { location: "SYNTHETIC ROOM TEST-201", directions: "SYNTHETIC Test Block floor 2; test gate only.", mapUrl: "https://www.google.com/maps?q=SYNTHETIC_VENUE_FIXTURE" };
const draft = { ...published, location: "SYNTHETIC UNPUBLISHED ROOM" };
async function fixture(engine: "sqlite" | "postgres") {
  const pg = engine === "postgres" ? await createPGliteFixture() : null;
  const local = pg ? null : await setup();
  const db = pg?.db || local!.db;
  if (pg) await seedLocal(db);
  await batch(db, [
    ["INSERT INTO private_venue VALUES(1,?,?,1,?)", JSON.stringify(draft), JSON.stringify(published), now],
    ["DELETE FROM memberships WHERE user_id='fake_dave'"],
    ["UPDATE registrations SET status='pending' WHERE email IN ('bob@portal.test','pending@portal.test','admin@portal.test','owner@portal.test')"],
    ["INSERT INTO participant_status_overrides(user_id,status,reason,actor_id,updated_at) VALUES('fake_gina','Absent','Synthetic','fake_owner',?)", now],
    ["INSERT INTO manual_checkins VALUES('fake_eve','eve@portal.test','fake_owner',?)", now],
    ["INSERT INTO team_locks VALUES('fake_team3','fake_bob',?)", now],
  ]);
  const service = (who = "owner") => new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => now);
  async function get(who: string | null, route = "/", query: Record<string, string> = {}) {
    const response = await handlePortal(new Request("http://localhost/api/portal?" + new URLSearchParams({ view: route, ...query }), { headers: { "oai-authenticated-user-id": "fake_admin", "oai-authenticated-user-email": "admin@portal.test" } }), { db, identity: who ? fixtures[who] : null, key: LOCAL_CREDIT_KEY, localTest: true });
    assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
    assert.equal(response.headers.get("Vary"), "Cookie, oai-authenticated-user-id");
    return { status: response.status, body: await response.json() as any };
  }
  return { db, service, get, close: async () => { if (pg) await pg.pool.end(); else local!.db.close(); } };
}
function noPrivate(body: unknown) {
  const text = JSON.stringify(body);
  assert.ok(!text.includes("SYNTHETIC ROOM"));
  assert.ok(!text.includes("SYNTHETIC UNPUBLISHED"));
  assert.ok(!text.includes("SYNTHETIC_VENUE_FIXTURE"));
  assert.ok(!text.includes('"privateVenue"'));
}
for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: only explicit authenticated Home enrichment receives published personal arrival details`, async () => {
    const f = await fixture(engine);
    try {
      for (const [who, allowed] of [[null, false], ["stranger", false], ["pending", false], ["bob", false], ["alice", true], ["dave", true], ["eve", true], ["gina", false], ["admin", true], ["owner", true]] as const) {
        const publicView = await f.get(who);
        assert.equal(publicView.status, 200);
        noPrivate(publicView.body); // This is the SSR/bootstrap contract, even signed in.
        const enriched = await f.get(who, "/", { arrival: "1", role: "admin", owner: "true", userId: "fake_admin", teamId: "fake_team3" });
        assert.equal(enriched.status, 200);
        if (allowed) {
          assert.deepEqual(enriched.body.privateVenue, published);
          assert.ok(!JSON.stringify(enriched.body).includes(draft.location));
        } else noPrivate(enriched.body);
        for (const path of ["/dashboard", "/dashboard/team"]) {
          const workspace = await f.get(who, path);
          if (allowed) assert.deepEqual(workspace.body.privateVenue, published);
          else noPrivate(workspace.body);
        }
      }
      assert.equal((await f.get("bob", "/dashboard")).body.team.locked, true);
      assert.equal((await f.get("dave", "/dashboard")).body.team, undefined);
      for (const arrival of ["true", "01", "0"]) noPrivate((await f.get("owner", "/", { arrival })).body);
      noPrivate((await f.get("owner", "/", { includePrivateVenue: "true" })).body);
      for (const route of ["/projects", "/rules", "/discover/teams", "/discover/participants"]) noPrivate((await f.get("owner", route, { arrival: "1" })).body);
    } finally { await f.close(); }
  });
  test(`${engine}: fresh status/account/role changes revoke arrival while all-admin read does not grant editing`, async () => {
    const f = await fixture(engine);
    try {
      const read = (who: string | null) => f.get(who, "/", { arrival: "1" });
      assert.deepEqual((await read("alice")).body.privateVenue, published);
      noPrivate((await read(null)).body);
      noPrivate((await read("stranger")).body);
      await batch(f.db, [["INSERT INTO participant_status_overrides(user_id,status,reason,actor_id,updated_at) VALUES('fake_alice','Absent','Synthetic','fake_owner',?)", now]]);
      noPrivate((await read("alice")).body);
      noPrivate((await f.get("alice", "/dashboard")).body);
      await batch(f.db, [["UPDATE participant_status_overrides SET status='Going' WHERE user_id='fake_alice'"]]);
      assert.deepEqual((await read("alice")).body.privateVenue, published);
      await batch(f.db, [["UPDATE registrations SET status='pending' WHERE email='alice@portal.test'"]]);
      noPrivate((await read("alice")).body);
      assert.deepEqual((await read("admin")).body.privateVenue, published);
      const adminSettings = await f.get("admin", "/admin/settings");
      assert.equal(adminSettings.body.canManageVenue, false);
      assert.equal(adminSettings.body.venue, undefined);
      const before = await rows(f.db, "SELECT * FROM private_venue");
      await assert.rejects(f.service("admin").command("content-save", { scope: "private", revision: 1, content: draft }), { code: "VENUE_MANAGER_REQUIRED" });
      assert.deepEqual(await rows(f.db, "SELECT * FROM private_venue"), before);
      await f.service().command("venue-manager", { userId: "fake_admin", enabled: true });
      assert.equal((await f.get("admin", "/admin/settings")).body.canManageVenue, true);
      await f.service().command("venue-manager", { userId: "fake_admin", enabled: false });
      assert.deepEqual((await read("admin")).body.privateVenue, published, "read remains allowed without an editing grant");
      await f.service().command("revoke-admin", { userId: "fake_admin", confirmation: "REVOKE_ADMIN" });
      noPrivate((await read("admin")).body);
      await f.service().command("participant-deactivate", { userId: "fake_dave", confirmation: "REMOVE_PARTICIPANT" });
      noPrivate((await read("dave")).body);
      await batch(f.db, [["UPDATE private_venue SET published=NULL WHERE id=1"]]);
      noPrivate((await read("owner")).body);
    } finally { await f.close(); }
  });
}
