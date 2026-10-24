import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { batch, one, rows, type Database } from "../lib/db";
import { PortalService } from "../lib/service";
import { handleExport, handlePortal } from "../lib/http";
import type { Identity } from "../lib/identity";
import { AdminPresentationCache } from "../lib/admin-presentation";

type Row = Record<string, any>;
const origin = "https://portal.test";
const privateRoutes = [
  "/dashboard",
  "/dashboard/team",
  "/dashboard/credits",
  "/profile",
  "/dashboard/profile",
  "/submission",
  "/dashboard/submission",
  "/personal/credits",
];
async function fixture(engine: "sqlite" | "postgres") {
  if (engine === "sqlite") return setup();
  const { db } = await createPGliteFixture();
  await seedLocal(db);
  return { db };
}
async function get(
  db: Database,
  identity: Identity | null,
  path: string,
  query: Record<string, string> = {},
) {
  const params = new URLSearchParams({ view: path, ...query });
  const response = await handlePortal(
    new Request(origin + "/api/portal?" + params),
    { db, identity, key: LOCAL_CREDIT_KEY },
  );
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.match(response.headers.get("vary") || "", /Cookie/);
  return { response, body: (await response.json()) as Row };
}
async function post(
  db: Database,
  identity: Identity,
  action: string,
  data: unknown,
) {
  const response = await handlePortal(
    new Request(origin + "/api/portal", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ action, data }),
    }),
    { db, identity, key: LOCAL_CREDIT_KEY },
  );
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  return { response, body: (await response.json()) as Row };
}
function onlyError(body: Row) {
  assert.deepEqual(Object.keys(body).sort(), ["code", "message"]);
}
function noPrivateFields(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(
      ![
        "email",
        "phone",
        "whatsapp",
        "organization",
        "openai_org_id",
        "openaiOrgId",
        "gender",
        "gender_description",
        "credits",
        "ciphertext",
        "voucher_value",
        "recipient_email",
        "privateVenue",
        "core",
        "idea",
        "draft",
        "payload",
      ].includes(key),
      `Public projection must omit ${key}`,
    );
    noPrivateFields(child);
  }
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: authenticated Viewer has a narrow private-route registration projection, never participant writes or removed access`, async () => {
    const { db } = await fixture(engine);
    try {
      const profileBefore = await one(
        db,
        "SELECT * FROM profiles WHERE user_id='fake_stranger'",
      );
      const teamsBefore = await rows(db, "SELECT * FROM teams ORDER BY id");
      for (const path of [...privateRoutes, "//dashboard//profile/"]) {
        const { response, body } = await get(db, fixtures.stranger, path);
        assert.equal(response.status, 200, path);
        assert.deepEqual(Object.keys(body).sort(), [
          "localTest",
          "me",
          "registrationRequired",
        ]);
        assert.equal(body.registrationRequired, true);
        assert.equal(body.me.id, fixtures.stranger.id);
        assert.equal(body.me.email, fixtures.stranger.email);
        assert.equal(body.me.mode, "viewer");
        assert.equal(body.me.canEngage, false);
        assert.equal(body.me.canParticipate, false);
      }
      for (const path of ["/dashboard/not-a-route", "/profile/not-a-route"]) {
        const result = await get(db, fixtures.stranger, path);
        assert.equal(result.response.status, 404, path);
        onlyError(result.body);
      }
      const history = await get(db, fixtures.stranger, "/project-history");
      assert.equal(history.response.status, 403);
      onlyError(history.body);
      for (const action of [
        "complete-profile",
        "create-workspace-team",
        "request-team",
        "upvote-project",
        "comment-project",
        "vote",
        "feedback",
      ]) {
        const result = await post(db, fixtures.stranger, action, {});
        assert.equal(result.response.status, 403, action);
        assert.equal(result.body.code, "VIEWER_READ_ONLY", action);
        onlyError(result.body);
      }
      const reveal = await post(db, fixtures.stranger, "reveal-credit", {
        typeId: "fake_credit",
      });
      assert.equal(reveal.response.status, 403);
      assert.equal(reveal.body.code, "CHECKIN_REQUIRED");
      onlyError(reveal.body);
      assert.deepEqual(
        await one(db, "SELECT * FROM profiles WHERE user_id='fake_stranger'"),
        profileBefore,
      );
      assert.deepEqual(
        await rows(db, "SELECT * FROM teams ORDER BY id"),
        teamsBefore,
      );
      assert.equal(
        await one(
          db,
          "SELECT email FROM registrations WHERE email=?",
          fixtures.stranger.email,
        ),
        undefined,
      );
      for (const path of privateRoutes) {
        const anonymous = await get(db, null, path);
        assert.equal(anonymous.response.status, 401, path);
        onlyError(anonymous.body);
      }
      await batch(db, [
        [
          "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) VALUES('participant','fake_stranger',1,'Synthetic removal','fake_owner','2026-10-22T08:00:00.000Z','{}')",
        ],
      ]);
      for (const path of privateRoutes) {
        const removed = await get(db, fixtures.stranger, path);
        assert.equal(removed.response.status, 403, path);
        assert.equal(removed.body.code, "PARTICIPANT_REMOVED", path);
        onlyError(removed.body);
      }
    } finally {
      await db.close();
    }
  });

  test(`${engine}: admin add refreshes the unchanged authenticated Viewer and registration-state delta without approval or check-in`, async () => {
    const { db } = await fixture(engine);
    try {
      await batch(db, [
        [
          "DELETE FROM participant_profiles WHERE user_id IN ('fake_stranger','fake_pending')",
        ],
      ]);
      const identity = fixtures.stranger;
      const identityBefore = structuredClone(identity);
      const sameSession = new PortalService(db, identity, LOCAL_CREDIT_KEY);
      const cache = new AdminPresentationCache();
      const before = await get(db, fixtures.admin, "/admin/participants");
      assert.equal(before.response.status, 200);
      await cache.merge(before.body, "/admin/participants", {
        search: "",
        page: 0,
        focus: "",
      });
      const outsider = before.body.items.find(
        (row: Row) => row.id === identity.id,
      );
      assert.equal(outsider.status, "Not registered");
      assert.equal(outsider.registered, false);
      assert.equal(outsider.viewer, true);
      assert.equal((await sameSession.actor()).mode, "viewer");
      assert.equal(
        (await get(db, identity, "/dashboard")).body.registrationRequired,
        true,
      );

      const csv = "email\n" + identity.email + "\n";
      const preview = await post(db, fixtures.admin, "preview-import", {
        kind: "roster",
        csv,
      });
      assert.equal(preview.response.status, 200);
      assert.equal(
        (await sameSession.actor()).mode,
        "viewer",
        "Preview cannot register an account",
      );
      const commit = await post(db, fixtures.admin, "commit-import", {
        kind: "roster",
        csv,
        digest: preview.body.digest,
      });
      assert.equal(commit.response.status, 200);
      assert.deepEqual(
        identity,
        identityBefore,
        "No refreshed authentication claims are needed",
      );
      assert.equal((await sameSession.actor()).mode, "participant");
      const dashboard = await get(db, identity, "/dashboard");
      assert.equal(dashboard.response.status, 200);
      assert.equal(dashboard.body.profileIncomplete, true);
      assert.equal(dashboard.body.profile.complete, false);
      assert.notEqual(dashboard.body.registrationRequired, true);
      assert.equal(dashboard.body.me.canEngage, false);
      const registration = await one(
        db,
        "SELECT status FROM registrations WHERE email=?",
        identity.email,
      );
      assert.equal(registration?.status, "pending");
      const credits = await get(db, identity, "/personal/credits");
      assert.equal(credits.response.status, 403);
      assert.equal(credits.body.code, "CHECKIN_REQUIRED");
      const known = before.body.adminPresentation.version;
      const refreshed = await get(db, fixtures.admin, "/admin/participants", {
        presentation: known,
      });
      assert.equal(refreshed.response.status, 200);
      assert.equal(refreshed.body.adminPresentation.unchanged, false);
      assert.notEqual(refreshed.body.adminPresentation.version, known);
      const merged = await cache.merge(refreshed.body, "/admin/participants", {
        search: "",
        page: 0,
        focus: "",
      });
      const added = merged.items.find((row: Row) => row.id === identity.id);
      assert.equal(added.status, "Registered");
      assert.equal(added.registered, true);
      assert.equal(added.viewer, false);
      assert.equal(added.checked_in, null);

      const pending = await get(db, fixtures.pending, "/dashboard");
      assert.equal(pending.response.status, 200);
      assert.equal(pending.body.me.mode, "participant");
      assert.equal(pending.body.profileIncomplete, true);
      assert.notEqual(pending.body.registrationRequired, true);
      assert.equal(
        (await get(db, fixtures.admin, "/dashboard")).body.me.mode,
        "staff",
      );
      assert.equal(
        (await get(db, fixtures.admin, "/personal/credits")).response.status,
        403,
      );
      await batch(db, [
        ["DELETE FROM registrations WHERE email=?", fixtures.pending.email],
      ]);
      const allowlistedOnly = await get(db, fixtures.pending, "/dashboard");
      assert.equal(allowlistedOnly.response.status, 200);
      assert.equal(allowlistedOnly.body.me.mode, "participant");
      assert.equal(allowlistedOnly.body.profileIncomplete, true);
      assert.equal(
        await one(
          db,
          "SELECT email FROM registrations WHERE email=?",
          fixtures.pending.email,
        ),
        undefined,
        "Reading an allowlisted account cannot register or approve it",
      );
    } finally {
      await db.close();
    }
  });

  test(`${engine}: registered-only eligibility stays separate from approval and public Viewer payloads omit all private fields`, async () => {
    const { db } = await fixture(engine);
    try {
      for (const path of [
        "/discover/participants",
        "/discover/teams",
        "/projects",
        "/leaderboard",
      ]) {
        const result = await get(db, fixtures.stranger, path);
        assert.equal(result.response.status, 200, path);
        const { me, ...projection } = result.body;
        assert.equal(me.mode, "viewer");
        noPrivateFields(projection);
        if (path === "/discover/participants") {
          assert.ok(projection.items.length > 0);
          for (const person of projection.items) {
            assert.deepEqual(Object.keys(person).sort(), [
              "avatarColor",
              "avatarExpression",
              "bio",
              "id",
              "name",
              "socials",
              "teamName",
              "teamPalette",
              "teamStatus",
            ]);
            assert.notEqual(person.id, fixtures.stranger.id);
          }
        }
      }
      for (const path of [
        "/admin/participants",
        "/admin/teams",
        "/admin/credits",
        "/admin/access",
      ]) {
        const denied = await get(db, fixtures.stranger, path, {
          presentation: "apv1." + "a".repeat(64),
        });
        assert.equal(denied.response.status, 403, path);
        onlyError(denied.body);
      }
      const exported = await handleExport(
        new Request(origin + "/api/export?list=participants"),
        { db, identity: fixtures.stranger, key: LOCAL_CREDIT_KEY },
      );
      assert.equal(exported.status, 403);
      onlyError(await exported.json());
      for (const q of [fixtures.bob.email, "+12025550100"]) {
        const search = await get(
          db,
          fixtures.stranger,
          "/discover/participants",
          { q },
        );
        assert.equal(search.response.status, 200);
        assert.deepEqual(
          search.body.items,
          [],
          "Private contact data is not searchable",
        );
      }
      await batch(db, [
        ["UPDATE profiles SET public=0 WHERE user_id='fake_bob'"],
      ]);
      const focused = await get(
        db,
        fixtures.stranger,
        "/discover/participants",
        { person: fixtures.bob.id },
      );
      assert.equal(focused.response.status, 200);
      assert.equal(focused.body.focusedPerson.id, fixtures.bob.id);
      assert.equal(focused.body.focusedPerson.bio, "");
      assert.deepEqual(focused.body.focusedPerson.socials, []);
      const { details, ...publicIdentity } = focused.body.focusedPerson;
      assert.deepEqual(details, { gender: "non-binary" }, "Only the explicitly approved saved gender chip joins the selected profile projection");
      noPrivateFields(publicIdentity);
      await batch(db, [
        ["UPDATE users SET role='admin' WHERE id='fake_stranger'"],
      ]);
      const unregisteredStaff = await get(db, fixtures.stranger, "/dashboard");
      assert.equal(unregisteredStaff.response.status, 200);
      assert.equal(unregisteredStaff.body.me.mode, "staff");
      assert.notEqual(unregisteredStaff.body.registrationRequired, true);
      assert.equal(
        (await get(db, fixtures.stranger, "/admin/participants")).response
          .status,
        200,
      );
      assert.equal(
        await one(
          db,
          "SELECT email FROM registrations WHERE email=?",
          fixtures.stranger.email,
        ),
        undefined,
      );
      await batch(db, [
        ["UPDATE users SET role='participant' WHERE id='fake_stranger'"],
      ]);
      await batch(db, [
        ["DELETE FROM participant_profiles WHERE user_id='fake_stranger'"],
      ]);
      const added = await post(db, fixtures.admin, "participant-bulk", {
        emails: [fixtures.stranger.email],
        status: "pending",
      });
      assert.equal(added.response.status, 200);
      assert.equal(
        await one(
          db,
          "SELECT email FROM luma_roster WHERE email=?",
          fixtures.stranger.email,
        ),
        undefined,
      );
      const registered = await get(db, fixtures.stranger, "/dashboard");
      assert.equal(registered.response.status, 200);
      assert.equal(registered.body.me.mode, "participant");
      assert.equal(registered.body.profileIncomplete, true);
      assert.equal(registered.body.me.canEngage, false);
      assert.equal(
        (
          await one(
            db,
            "SELECT status FROM registrations WHERE email=?",
            fixtures.stranger.email,
          )
        )?.status,
        "pending",
      );
      assert.equal(
        (await get(db, fixtures.stranger, "/profile")).response.status,
        200,
      );
      const credits = await get(db, fixtures.stranger, "/personal/credits");
      assert.equal(credits.response.status, 403);
      assert.equal(credits.body.code, "CHECKIN_REQUIRED");
      assert.equal(
        (await get(db, fixtures.stranger, "/admin/participants")).response
          .status,
        403,
      );
    } finally {
      await db.close();
    }
  });
}
