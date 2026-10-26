import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, submission, attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, rows, type SQL } from "../lib/db";
import { handlePortal, handleExport } from "../lib/http";
import { adminDemographics } from "../lib/admin-demographic-filters";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminDemographicFilters from "../app/admin-demographic-filters";

for (const engine of ["sqlite", "postgres"] as const)
  test(`${engine}: admin demographic AND filters use the same member, explicit saved answers, full collection and stable whole-collection stats`, async () => {
    const f = engine === "sqlite" ? await setup() : await createPGliteFixture();
    if (engine === "postgres") await seedLocal(f.db);
    const service = (who: string) =>
      new PortalService(
        f.db,
        fixtures[who],
        LOCAL_CREDIT_KEY,
        () => "2026-10-22T08:00:00.000Z",
      );
    try {
      await attend(f.db, "fake_bob", "fake_alice");
      await batch(f.db, [
        ["UPDATE profiles SET gender='man'"],
        ["UPDATE profile_details SET best_description='School Student'"],
        [
          "UPDATE profiles SET gender='woman' WHERE user_id IN ('fake_bob','fake_alice')",
        ],
        [
          "UPDATE profile_details SET best_description='Startup Founder' WHERE user_id='fake_carol'",
        ],
        [
          "UPDATE profile_details SET best_description='College Student' WHERE user_id='fake_alice'",
        ],
        [
          "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('demo_project','fake_team3','demo-project',?,1,'2026-10-22T08:00:00Z')",
          JSON.stringify(submission),
        ],
        [
          "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('solo_project','fake_team1','solo-project',?,1,'2026-10-22T08:00:00Z')",
          JSON.stringify(submission),
        ],
      ]);
      const admin = service("admin"),
        both = { gender: "woman", profession: "Startup Founder" };
      for (const route of [
        "/admin/participants",
        "/admin/teams",
        "/admin/submissions",
      ]) {
        const all: any = await admin.view(route);
        const none: any = await admin.view(route, both);
        assert.equal(
          none.items.length,
          0,
          `${route}: different members may not satisfy separate filters`,
        );
        assert.deepEqual(
          none.stats,
          all.stats,
          `${route}: stats are entire collection, independent of filters`,
        );
        assert.ok(
          ((await admin.view(route, { gender: "woman" })) as any).items.length >
            0,
        );
        assert.ok(
          ((await admin.view(route, { profession: "Startup Founder" })) as any)
            .items.length > 0,
        );
        await assert.rejects(service("alice").view(route, both), {
          code: "ADMIN_REQUIRED",
        });
        await assert.rejects(service("stranger").view(route, both), {
          code: "ADMIN_REQUIRED",
        });
      }
      await batch(f.db, [
        ["UPDATE profiles SET gender='woman' WHERE user_id='fake_carol'"],
      ]);
      assert.deepEqual(
        ((await admin.view("/admin/participants", both)) as any).items.map(
          (r: any) => r.id,
        ),
        ["fake_carol"],
      );
      assert.deepEqual(
        ((await admin.view("/admin/teams", both)) as any).items.map(
          (r: any) => r.id,
        ),
        ["fake_team3"],
      );
      assert.deepEqual(
        ((await admin.view("/admin/submissions", both)) as any).items.map(
          (r: any) => r.id,
        ),
        ["demo_project"],
      );
      await batch(f.db, [
        [
          "UPDATE participant_profiles SET gender_confirmed=0 WHERE user_id='fake_carol'",
        ],
      ]);
      assert.equal(
        ((await admin.view("/admin/teams", both)) as any).items.length,
        0,
      );
      assert.equal(
        (
          (await admin.view("/admin/teams", {
            profession: "Startup Founder",
          })) as any
        ).items.length,
        1,
      );
      await batch(f.db, [
        [
          "UPDATE participant_profiles SET gender_confirmed=1 WHERE user_id='fake_carol'",
        ],
      ]);
      const runtime = {
        db: f.db,
        identity: fixtures.admin,
        key: LOCAL_CREDIT_KEY,
      };
      const url =
        "http://localhost/api/portal?view=/admin/teams&gender=woman&profession=Startup%20Founder";
      const response = await handlePortal(new Request(url), runtime);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /private.*no-store/);
      assert.deepEqual(
        ((await response.json()) as any).items.map((r: any) => r.id),
        ["fake_team3"],
      );
      const forbidden = await handlePortal(new Request(url), {
        ...runtime,
        identity: fixtures.alice,
      });
      assert.equal(forbidden.status, 403);
      const publicFilter = await handlePortal(
        new Request("http://localhost/api/portal?view=/projects&gender=woman"),
        runtime,
      );
      assert.equal(publicFilter.status, 422);
      for (const list of ["participants", "teams", "submissions"]) {
        const exportResponse = await handleExport(
          new Request(
            `http://localhost/api/export?list=${list}&gender=woman&profession=Startup%20Founder`,
          ),
          runtime,
        );
        assert.equal(exportResponse.status, 200);
        const text = await exportResponse.text();
        assert.doesNotMatch(
          text,
          /solo_project|Small Wonder|alice@portal.test/,
        );
        assert.match(
          text,
          list === "participants"
            ? /carol@portal.test/
            : list === "teams"
              ? /Common Ground/
              : /demo_project/,
        );
      }
      await assert.rejects(
        admin.view("/admin/teams", { gender: "self-described" }),
        { code: "INVALID_GENDER_FILTER" },
      );
      await assert.rejects(
        admin.view("/admin/teams", { profession: "inferred" }),
        { code: "INVALID_PROFESSION_FILTER" },
      );
      // Create 1001 newer, nonmatching drafts. The matching project must survive filtering before LIMIT 1000.
      if (engine === "sqlite") {
        const records: SQL[] = [];
        for (let i = 1; i <= 1001; i++) {
          const id = "filter_" + i,
            email = id + "@portal.test";
          records.push(
            [
              "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,'Synthetic filter member','participant','2026-10-22T07:00:00Z')",
              id,
              email,
            ],
            [
              "INSERT INTO registrations(email,status,luma_confirmed) VALUES(?,'approved',1)",
              email,
            ],
            [
              "INSERT INTO teams(id,name,leader_id,created_at) VALUES(?,?,?,'2026-10-22T07:00:00Z')",
              id,
              "Filter team " + i,
              id,
            ],
            [
              "INSERT INTO memberships(user_id,team_id,joined_at) VALUES(?,?,'2026-10-22T07:00:00Z')",
              id,
              id,
            ],
            [
              "INSERT INTO manual_checkins(user_id,verified_email,actor_id,created_at) VALUES(?,?,'fake_admin','2026-10-22T07:00:00Z')",
              id,
              email,
            ],
            [
              "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES(?,?,?,?,1,'2026-10-23T08:00:00Z')",
              id,
              id,
              id,
              JSON.stringify(submission),
            ],
          );
        }
        await batch(f.db, records);
        assert.deepEqual(
          ((await admin.view("/admin/submissions", both)) as any).items.map(
            (r: any) => r.id,
          ),
          ["demo_project"],
        );
        const exported = await handleExport(
          new Request(
            "http://localhost/api/export?list=submissions&gender=woman&profession=Startup%20Founder",
          ),
          runtime,
        );
        assert.match(await exported.text(), /demo_project/);
        assert.equal(
          (await rows(f.db, "SELECT count(*) n FROM projects"))[0].n,
          1003,
        );
      }
    } finally {
      await f.db.close();
    }
  });

test("filter trigger is compact, accessible and reports selected fields without a separate row", () => {
  assert.deepEqual(adminDemographics({}), {
    gender: "",
    profession: "",
    participantStatus: "",
    teamStatus: "",
  });
  const html = renderToStaticMarkup(
    createElement(AdminDemographicFilters, {
      value: { gender: "woman", profession: "Startup Founder" },
      onChange() {},
    }),
  );
  assert.match(html, /Filters \(2 active\)/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.doesNotMatch(html, /<select|<fieldset|Gender|Matching mode|Minimum/);
});
