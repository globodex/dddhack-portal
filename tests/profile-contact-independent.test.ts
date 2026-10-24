import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { batch, rows } from "../lib/db";
import { PortalService } from "../lib/service";
import { handlePortal, handleExport } from "../lib/http";

const bobPhone = "+12025550991";
const bobDigits = bobPhone.slice(1);
const bobOrg = "org-independent-private-bob";
const publicGender = "woman";
const now = "2026-10-22T08:00:00.000Z";
async function fixture(engine: "sqlite" | "postgres") {
  const pg = engine === "postgres" ? await createPGliteFixture() : null;
  const local = pg ? null : await setup();
  const db = pg?.db || local!.db;
  if (pg) await seedLocal(db);
  await batch(db, [
    [
      "UPDATE profiles SET public=0,bio='PRIVATE-INDEPENDENT-BOB-BIO',gender=?,gender_description='PRIVATE-INDEPENDENT-BOB-DESCRIPTION',socials='[]' WHERE user_id='fake_bob'",
      publicGender,
    ],
    [
      "UPDATE profile_details SET phone=?,openai_org_id=?,organization='PRIVATE-INDEPENDENT-BOB-ORGANIZATION' WHERE user_id='fake_bob'",
      bobPhone,
      bobOrg,
    ],
    [
      "INSERT INTO portal_roles VALUES('fake_ivy','volunteer','fake_owner',?)",
      now,
    ],
  ]);
  const service = (who = "owner") =>
    new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => now);
  async function get(
    who: string | null,
    route: string,
    params: Record<string, string> = {},
  ) {
    const request = new Request(
      "http://localhost/api/portal?" +
        new URLSearchParams({ view: route, ...params }),
      {
        headers: {
          "oai-authenticated-user-id": "fake_admin",
          "oai-authenticated-user-email": "admin@portal.test",
        },
      },
    );
    const response = await handlePortal(request, {
      db,
      identity: who ? fixtures[who] : null,
      key: LOCAL_CREDIT_KEY,
      localTest: true,
    });
    assert.equal(
      response.headers.get("Cache-Control"),
      "private, no-store, max-age=0",
    );
    assert.equal(
      response.headers.get("Vary"),
      "Cookie, oai-authenticated-user-id",
    );
    return { status: response.status, body: (await response.json()) as any };
  }
  const lookup = (who: string | null, params: Record<string, string> = {}) =>
    get(who, "/discover/participants", { person: "fake_bob", ...params });
  const close = async () => {
    if (pg) await pg.pool.end();
    else local!.db.close();
  };
  return { db, get, lookup, service, close };
}
function noBobPrivate(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const sentinel of [bobPhone, bobDigits, bobOrg])
    assert.ok(
      !serialized.includes(sentinel),
      "unexpected Bob private contact/org field",
    );
}
const nonProfileReadRoutes = [
  "/",
  "/rules",
  "/projects",
  "/projects/not-an-existing-project",
  "/leaderboard",
  "/winners",
  "/teams",
  "/teams/fake_team3",
  "/discover/teams",
  "/discover/participants",
  "/admin",
  "/admin/participants",
  "/admin/teams",
  "/admin/submissions",
  "/admin/credits",
  "/admin/settings",
  "/admin/permissions",
  "/admin/access",
  "/admin/check-in",
  "/admin/astra",
  "/admin/judging",
  "/admin/votes",
  "/admin/feedback",
  "/admin/results",
  "/admin/audit",
  "/review",
  "/judge",
  "/judge/fake_team3",
  "/project-history",
  "/personal/credits",
];

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: actual HTTP profile contact role matrix and other read projections exclude private fields`, async () => {
    const f = await fixture(engine);
    try {
      for (const who of [
        "owner",
        "admin",
        "bob",
        "carol",
        "alice",
        "judge",
        "ivy",
        "pending",
        "stranger",
        null,
      ]) {
        const focused = await f.lookup(who);
        assert.equal(focused.status, who ? 200 : 401);
        if (!who) {
          noBobPrivate(focused.body);
          continue;
        }
        noBobPrivate(focused.body.items);
        assert.ok(
          focused.body.items.every(
            (row: any) => !("details" in row) && !("gender" in row),
          ),
        );
        const details = focused.body.focusedPerson.details;
        assert.equal(
          details.gender,
          publicGender,
          "approved saved gender audience is unchanged",
        );
        const admin = ["owner", "admin"].includes(who);
        const sameTeam = ["bob", "carol"].includes(who);
        assert.equal(details.openaiOrgId, admin ? bobOrg : undefined);
        assert.equal(details.phone, admin || sameTeam ? bobPhone : undefined);
        assert.equal(
          details.whatsappUrl,
          admin || sameTeam ? "https://wa.me/" + bobDigits : undefined,
        );
        if (!admin && !sameTeam) noBobPrivate(focused.body);
        // A person/query/header argument cannot select another user's editor.
        const editor = await f.get(who, "/profile", {
          person: "fake_bob",
          userId: "fake_bob",
          actorId: "fake_admin",
          owner: "true",
          role: "admin",
        });
        assert.equal(editor.status, 200);
        if (who === "stranger") {
          assert.equal(editor.body.registrationRequired, true);
          noBobPrivate(editor.body);
        } else {
          assert.equal(editor.body.me.id, fixtures[who].id);
          assert.equal(editor.body.profile.user_id, fixtures[who].id);
          if (who === "bob") {
            assert.equal(editor.body.profile.openai_org_id, bobOrg);
            assert.equal(editor.body.profile.phone, bobPhone);
          } else noBobPrivate(editor.body);
        }
      }
      for (const who of ["alice", "stranger", "admin"]) {
        for (const route of nonProfileReadRoutes) {
          const result = await f.get(who, route, {
            teamId: "fake_team3",
            personId: "fake_bob",
            userId: "fake_bob",
            role: "admin",
            presentation: "apv1.untrusted",
          });
          noBobPrivate(result.body);
        }
        for (const route of [
          "/dashboard",
          "/dashboard/team",
          "/dashboard/profile",
          "/dashboard/credits",
          "/submission",
          "/dashboard/submission",
        ]) {
          noBobPrivate(
            (
              await f.get(who, route, {
                teamId: "fake_team3",
                person: "fake_bob",
                userId: "fake_bob",
              })
            ).body,
          );
        }
      }
      const workspace = await f.get("carol", "/dashboard/team", {
        teamId: "fake_team1",
      });
      assert.equal(workspace.status, 200);
      assert.equal(
        workspace.body.members.find((row: any) => row.id === "fake_bob").phone,
        bobPhone,
      );
      assert.ok(!JSON.stringify(workspace.body).includes(bobOrg));
      // Completed non-admin workspaces do not need these own-editor fields.
      const ownWorkspace = await f.get("bob", "/dashboard");
      assert.ok(!("phone" in ownWorkspace.body.profile));
      assert.ok(!("openai_org_id" in ownWorkspace.body.profile));
      assert.ok(!JSON.stringify(ownWorkspace.body.members).includes(bobOrg));
      const exportResponse = await handleExport(
        new Request("http://localhost/api/export?list=participants"),
        {
          db: f.db,
          identity: fixtures.admin,
          key: LOCAL_CREDIT_KEY,
          localTest: true,
        },
      );
      const csv = await exportResponse.text();
      assert.equal(exportResponse.status, 200);
      for (const sentinel of [bobPhone, bobDigits, bobOrg])
        assert.ok(!csv.includes(sentinel));
    } finally {
      await f.close();
    }
  });

  test(`${engine}: role, membership, roster and participant removals revoke contacts on the next private request`, async () => {
    const f = await fixture(engine);
    try {
      assert.equal(
        (await f.lookup("admin")).body.focusedPerson.details.openaiOrgId,
        bobOrg,
      );
      await f.service().command("revoke-admin", {
        userId: "fake_admin",
        confirmation: "REVOKE_ADMIN",
      });
      noBobPrivate(
        (
          await f.lookup("admin", {
            owner: "true",
            role: "admin",
            viewerId: "fake_owner",
          })
        ).body,
      );
      assert.equal(
        (await f.lookup("carol")).body.focusedPerson.details.phone,
        bobPhone,
      );
      await f
        .service()
        .command("remove-workspace-member", { userId: "fake_carol" });
      const removedMember = await f.lookup("carol");
      assert.deepEqual(removedMember.body.focusedPerson.details, {
        gender: publicGender,
      });
      noBobPrivate(
        (await f.get("carol", "/dashboard/team", { teamId: "fake_team3" }))
          .body,
      );
      // Fresh allowlist loss must turn the same still-complete member into a
      // Viewer. One remaining registration OR Luma row is deliberately enough.
      assert.equal(
        (await f.lookup("dave")).body.focusedPerson.details.phone,
        bobPhone,
      );
      await batch(f.db, [
        ["DELETE FROM registrations WHERE email='dave@portal.test'"],
      ]);
      assert.equal(
        (await f.lookup("dave")).body.focusedPerson.details.phone,
        bobPhone,
      );
      await assert.rejects(
        batch(f.db, [
          ["DELETE FROM luma_roster WHERE email='dave@portal.test'"],
        ]),
        (error: unknown) =>
          error instanceof Error && /ROSTER_ADD_ONLY/.test(error.message),
      );
      // The Luma roster is append-only. A legitimate legacy registration-only
      // member exercises actual allowlist loss without disabling that guard.
      await batch(f.db, [
        [
          "INSERT INTO registrations(email,status) VALUES('stranger@portal.test','approved')",
        ],
        ["INSERT INTO memberships VALUES('fake_stranger','fake_team3',?)", now],
      ]);
      assert.equal(
        (await f.lookup("stranger")).body.focusedPerson.details.phone,
        bobPhone,
      );
      await batch(f.db, [
        ["DELETE FROM registrations WHERE email='stranger@portal.test'"],
      ]);
      const viewer = await f.lookup("stranger");
      assert.equal(viewer.body.me.mode, "viewer");
      noBobPrivate(viewer.body);
      const viewerWorkspace = await f.get("stranger", "/dashboard/team");
      assert.equal(viewerWorkspace.body.registrationRequired, true);
      noBobPrivate(viewerWorkspace.body);
      // Real public removal API preserves a member row for history, but never
      // gives that removed actor contact access or includes them in contacts.
      await f.service().command("participant-deactivate", {
        userId: "fake_dave",
        confirmation: "REMOVE_PARTICIPANT",
      });
      assert.deepEqual((await f.lookup("dave")).body.focusedPerson.details, {
        gender: publicGender,
      });
      assert.equal((await f.get("dave", "/profile")).status, 403);
      assert.equal(
        (await f.lookup("stranger", { person: "fake_dave" })).body
          .focusedPerson,
        null,
      );
      const tampered = await f.lookup("stranger", {
        person: "fake_bob' OR '1'='1",
        viewerId: "fake_admin",
        role: "admin",
      });
      assert.equal(tampered.status, 200);
      assert.equal(tampered.body.focusedPerson, null);
      noBobPrivate(tampered.body);
      // The actual team-delete contract cannot create a soft-removed team with
      // two current members: it rejects multi-member teams and removes the sole
      // leader membership atomically. No direct invalid DB state is invented.
      await assert.rejects(
        f
          .service("bob")
          .command("delete-own-team", { confirmation: "DELETE_OWN_TEAM" }),
        { code: "SOLE_MEMBER_REQUIRED" },
      );
      await f
        .service("alice")
        .command("delete-own-team", { confirmation: "DELETE_OWN_TEAM" });
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM memberships WHERE team_id='fake_team1'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows<any>(
            f.db,
            "SELECT active FROM record_removals WHERE kind='team' AND target_id='fake_team1'",
          )
        )[0].active,
        1,
      );
      assert.equal(
        (await f.lookup("owner", { person: "fake_stranger" })).body
          .focusedPerson,
        null,
      );
    } finally {
      await f.close();
    }
  });

  test(`${engine}: completed workspace omits self editor contacts while editor, incomplete flow and admin remain intact`, async () => {
    const f = await fixture(engine);
    try {
      for (const route of ["/dashboard", "/dashboard/team"]) {
        const completed = await f.get("bob", route, {
          userId: "fake_admin",
          role: "admin",
        });
        assert.equal(completed.status, 200);
        assert.equal(completed.body.profile.complete, true);
        assert.ok(!("phone" in completed.body.profile));
        assert.ok(!("openai_org_id" in completed.body.profile));
        assert.equal(
          completed.body.members.find((row: any) => row.id === "fake_bob")
            .phone,
          bobPhone,
          "the own/current-team member contact projection is independent",
        );
      }
      for (const route of ["/profile", "/dashboard/profile"]) {
        const editor = await f.get("bob", route, { userId: "fake_admin" });
        assert.equal(editor.body.profile.phone, bobPhone);
        assert.equal(editor.body.profile.openai_org_id, bobOrg);
      }
      await batch(f.db, [
        [
          "DELETE FROM participant_profiles WHERE user_id='fake_bob'",
        ],
      ]);
      const incomplete = await f.get("bob", "/dashboard");
      assert.equal(incomplete.body.profileIncomplete, true);
      assert.equal(incomplete.body.profile.phone, bobPhone);
      assert.equal(incomplete.body.profile.openai_org_id, bobOrg);
      await batch(f.db, [
        [
          "UPDATE profile_details SET phone='+12025550992',openai_org_id='org-independent-admin' WHERE user_id='fake_admin'",
        ],
      ]);
      const admin = await f.get("admin", "/dashboard");
      assert.equal(admin.body.profile.phone, "+12025550992");
      assert.equal(admin.body.profile.openai_org_id, "org-independent-admin");
      assert.equal(
        (await f.lookup("alice")).body.focusedPerson,
        null,
        "an incomplete target cannot enter selected directory profiles",
      );
    } finally {
      await f.close();
    }
  });
}
