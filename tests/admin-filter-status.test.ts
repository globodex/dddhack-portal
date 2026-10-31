import { AdminPresentationCache } from "../lib/admin-presentation";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setup,
  activate,
  attend,
  submission,
  rehearsalPolicy,
} from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch } from "../lib/db";
import { personFacts } from "../lib/directory-facts";
import {
  adminTeamStatuses,
  adminParticipantStatuses,
} from "../lib/admin-filter-options";
import { handleExport, handlePortal } from "../lib/http";
for (const engine of ["sqlite", "postgres"] as const)
  test(`${engine}: four admin filters preserve exact personal/team statuses, same-member AND, no-account rows and exports`, async () => {
    const f = engine === "sqlite" ? await setup() : await createPGliteFixture();
    if (engine === "postgres") await seedLocal(f.db);
    let now = "2026-10-22T08:00:00.000Z";
    const service = (who = "owner") =>
      new PortalService(f.db, fixtures[who], LOCAL_CREDIT_KEY, () => now);
    const admin = service();
    try {
      await batch(f.db, [
        [
          "UPDATE event_settings SET policy=?,active=1 WHERE id=1",
          JSON.stringify(rehearsalPolicy),
        ],
        ["UPDATE profiles SET gender='man'"],
        ["UPDATE profile_details SET best_description='School Student'"],
        ["UPDATE profiles SET gender='woman' WHERE user_id='fake_bob'"],
        [
          "UPDATE profile_details SET best_description='Startup Founder' WHERE user_id IN ('fake_bob','fake_carol')",
        ],
        [
          "UPDATE registrations SET status='pending' WHERE email='bob@portal.test'",
        ],
        [
          "INSERT INTO registrations(email,status) VALUES('never-signed-in@portal.test','pending')",
        ],
      ]);
      const preview: any = await admin.view("/admin/team-lock", {
        focus: "fake_team3",
      });
      await admin.command("admin-lock-team", {
        teamId: "fake_team3",
        expectedName: preview.team.name,
        snapshotDigest: preview.snapshotDigest,
        confirmation: "ADMIN_LOCK_TEAM",
      });
      const matching = {
        gender: "woman",
        profession: "Startup Founder",
        participantStatus: "Registered",
        teamStatus: "Locked",
      };
      const read = (route: string, filters: any = {}) =>
        admin.view(route, filters) as Promise<any>;
      assert.deepEqual(
        (await read("/admin/teams", matching)).items.map((r: any) => r.id),
        ["fake_team3"],
      );
      assert.equal(
        (
          await read("/admin/teams", {
            ...matching,
            participantStatus: "Going",
          })
        ).items.length,
        0,
        "another Going teammate cannot satisfy the personal field",
      );
      const roster = await read("/admin/participants", {
        participantStatus: "Registered",
        teamStatus: "none",
      });
      assert.ok(
        roster.items.some(
          (r: any) =>
            r.email === "never-signed-in@portal.test" && r.id === null,
        ),
      );
      assert.ok(
        roster.items.every((r: any) => r.status === "Registered" && !r.team_id),
      );
      const viewers = await read("/admin/participants", {
        participantStatus: "Not registered",
        teamStatus: "none",
      });
      assert.ok(viewers.items.some((r: any) => r.id === "fake_stranger"));
      assert.ok(viewers.items.every((r: any) => r.viewer === true));
      await admin.command("admin-status", {
        kind: "person",
        targetId: "fake_bob",
        status: "Checked in",
        reason: "Synthetic filter test",
        confirmation: "CHANGE_STATUS",
      });
      await batch(f.db, [
        [
          "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('filter-status-project','fake_team3','filter-status',?,1,?)",
          JSON.stringify(submission),
          now,
        ],
      ]);
      await admin.command("admin-status", {
        kind: "person",
        targetId: "fake_bob",
        status: "Absent",
        reason: "Synthetic attendance state",
        confirmation: "CHANGE_STATUS",
      });
      const absent = {
        ...matching,
        participantStatus: "Absent",
        teamStatus: "Approved",
      };
      for (const route of [
        "/admin/participants",
        "/admin/teams",
        "/admin/submissions",
      ]) {
        const all = await read(route),
          filtered = await read(route, absent);
        assert.equal(filtered.items.length, 1, route);
        assert.deepEqual(
          filtered.stats,
          all.stats,
          "whole-collection stats unchanged",
        );
      }
      assert.equal(
        (await read("/admin/teams", { ...absent, participantStatus: "Going" }))
          .items.length,
        0,
      );
      const runtime = {
        db: f.db,
        identity: fixtures.owner,
        key: LOCAL_CREDIT_KEY,
      };
      // HTTP uses the current clock; for the early Approved check use actual future-independent status without Team status.
      const response = await handlePortal(
        new Request(
          "http://localhost/api/portal?view=/admin/teams&participantStatus=Absent&gender=woman&profession=Startup%20Founder",
        ),
        runtime,
      );
      assert.equal(response.status, 200);
      const filteredPage: any = await response.json();
      assert.equal(filteredPage.items.length, 1);
      const cache = new AdminPresentationCache();
      const cacheOptions = {
        search: "",
        page: 0,
        focus: "",
        gender: "woman",
        profession: "Startup Founder",
        participantStatus: "Absent",
        teamStatus: "",
        teamSize: "",
      };
      await cache.merge(filteredPage, "/admin/teams", cacheOptions);
      const repeated = await handlePortal(
        new Request(
          "http://localhost/api/portal?view=/admin/teams&participantStatus=Absent&gender=woman&profession=Startup%20Founder&presentation=" +
            filteredPage.adminPresentation.version,
        ),
        runtime,
      );
      const repeatedPage: any = await repeated.json();
      assert.equal(repeatedPage.adminPresentation.unchanged, true);
      assert.equal(
        (await cache.merge(repeatedPage, "/admin/teams", cacheOptions)).items
          .length,
        1,
      );
      for (const list of [
        "participants",
        "teams",
        "team-emails",
        "submissions",
      ]) {
        const exported = await handleExport(
          new Request(
            `http://localhost/api/export?list=${list}&participantStatus=Absent&gender=woman&profession=Startup%20Founder`,
          ),
          runtime,
        );
        assert.equal(exported.status, 200);
        const text = await exported.text();
        assert.doesNotMatch(
          text,
          /Small Wonder|The Fifth Element|alice@portal.test/,
        );
        assert.match(
          text,
          list === "submissions" ? /filter-status-project/ : /bob@portal.test/,
        );
      }
      const participantRows = (await read("/admin/participants")).items;
      const facts = await personFacts(
        f.db,
        participantRows.filter((r: any) => r.id).map((r: any) => r.id),
      );
      for (const status of adminParticipantStatuses) {
        const expected = participantRows
          .filter((row: any) => row.status === status)
          .map((row: any) => row.email)
          .sort();
        assert.deepEqual(
          (
            await read("/admin/participants", { participantStatus: status })
          ).items
            .map((row: any) => row.email)
            .sort(),
          expected,
        );
        const expectedTeams = (await read("/admin/teams")).items
          .filter((team: any) =>
            team.members.some(
              (member: any) => facts.get(member.id)?.status === status,
            ),
          )
          .map((team: any) => team.id)
          .sort();
        assert.deepEqual(
          (await read("/admin/teams", { participantStatus: status })).items
            .map((team: any) => team.id)
            .sort(),
          expectedTeams,
        );
      }
      for (const time of [
        "2026-10-22T08:00:00.000Z",
        "2026-11-01T08:00:00.000Z",
      ]) {
        now = time;
        const all = (await read("/admin/teams")).items;
        for (const status of adminTeamStatuses)
          assert.deepEqual(
            (await read("/admin/teams", { teamStatus: status })).items
              .map((r: any) => r.id)
              .sort(),
            all
              .filter((r: any) => r.status === status)
              .map((r: any) => r.id)
              .sort(),
            status + " " + time,
          );
      }
      assert.equal(
        (
          await read("/admin/submissions", {
            ...absent,
            teamStatus: "Yet to submit",
          })
        ).items.length,
        1,
      );
      if (engine === "sqlite") {
        await batch(
          f.db,
          Array.from(
            { length: 30 },
            (_, i) =>
              [
                "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)",
                "filter_viewer_" + i,
                "viewer" + i + "@portal.test",
                "Viewer " + i,
                now,
              ] as [string, ...unknown[]],
          ),
        );
        const pages = await read("/admin/participants", {
          participantStatus: "Not registered",
          teamStatus: "none",
        });
        assert.equal(
          pages.items.length,
          31,
          "filter covers the whole Viewer collection before client pagination",
        );
        const exportedPage = await handleExport(
          new Request(
            "http://localhost/api/export?list=participants&participantStatus=Not%20registered&teamStatus=none&scope=page&page=1&pageSize=25",
          ),
          runtime,
        );
        assert.equal(exportedPage.status, 200);
        assert.equal(exportedPage.headers.get("X-Total-Count"), "31");
        assert.equal(exportedPage.headers.get("X-Exported-Count"), "6");
      }
      await assert.rejects(service("alice").view("/admin/teams", matching), {
        code: "ADMIN_REQUIRED",
      });
      await assert.rejects(
        admin.view("/admin/teams", { participantStatus: "Online" }),
        { code: "INVALID_PARTICIPANT_STATUS_FILTER" },
      );
      await assert.rejects(
        admin.view("/admin/teams", { teamStatus: "Draft" }),
        { code: "INVALID_TEAM_STATUS_FILTER" },
      );
    } finally {
      await f.db.close();
    }
  });
