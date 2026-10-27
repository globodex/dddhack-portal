import { test } from "node:test";
import assert from "node:assert/strict";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { rehearsalPolicy, submission, attend } from "./helpers";
import { batch, type SQL } from "../lib/db";
import { PortalService } from "../lib/service";
import {
  publicProjectMembers,
  adminSubmissionMembers,
} from "../lib/project-member-profiles";

// One isolated PostgreSQL engine and serial subtests. No hosted database or
// existing synthetic fixture is read, copied or changed.
test("PostgreSQL profile-info projection and role/membership boundaries", async (t) => {
  const { db, pool } = await createPGliteFixture();
  const now = "2026-11-01T08:00:00.000Z";
  const service = (who: string | null) =>
    new PortalService(
      db,
      who ? fixtures[who] : null,
      LOCAL_CREDIT_KEY,
      () => now,
    );
  try {
    await seedLocal(db);
    await batch(db, [
      [
        "UPDATE event_settings SET policy=?,active=1 WHERE id=1",
        JSON.stringify(rehearsalPolicy),
      ],
    ]);
    await attend(db, "fake_bob");
    const payload = JSON.stringify(submission);
    await batch(db, [
      [
        "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('pg_info_project','fake_team3','pg-synthetic-info',?,1,?)",
        payload,
        now,
      ],
      [
        "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES('pg_info_v1','fake_team3',1,?,?)",
        payload,
        now,
      ],
      [
        "UPDATE projects SET published_version_id='pg_info_v1' WHERE id='pg_info_project'",
      ],
      [
        "INSERT INTO project_eligibility VALUES('pg_info_project','pg_info_v1','eligible','Synthetic profile-info test','fake_owner',?)",
        now,
      ],
      [
        "UPDATE profiles SET public=0,bio='PRIVATE_PG_PROFILE_INFO_BIO',socials='[]',gender='woman',gender_description='PRIVATE_PG_GENDER_DESCRIPTION' WHERE user_id='fake_bob'",
      ],
      [
        "UPDATE profile_details SET best_description='Working Professional',organization='PRIVATE_PG_ORGANIZATION',openai_org_id='org-private-pg-profile-info',phone='+12025550123' WHERE user_id='fake_bob'",
      ],
      ...[
        ["fake_bob", "Checked in"],
        ["fake_carol", "Going"],
        ["fake_dave", "Absent"],
      ].map(
        ([id, status]) =>
          [
            "INSERT INTO participant_status_overrides VALUES(?,?,'Synthetic status','fake_owner',?)",
            id,
            status,
            now,
          ] as SQL,
      ),
    ]);
    await t.test(
      "anonymous, Viewer and admin public detail share the same member allowlist with no private SSR fields",
      async () => {
        for (const who of [null, "stranger", "owner"]) {
          const page = (await service(who).view(
            "/projects/pg-synthetic-info",
          )) as any;
          assert.equal(page.teamMembers.length, 3);
          for (const member of page.teamMembers)
            assert.deepEqual(
              Object.keys(member).sort(),
              ["id", "name", "avatarColor", "avatarExpression", ...(who === null ? [] : ["bio", "socials", "details"])].sort(),
            );
          assert.doesNotMatch(
            JSON.stringify(page),
            /PRIVATE_PG_|org-private-pg-profile-info|12025550123/,
          );
          assert.doesNotMatch(
            JSON.stringify(page.teamMembers),
            /status|email|phone|approval|checkedIn/,
          );
        }
        const list = (await service(null).view("/projects")) as any;
        assert.ok(!("teamMembers" in list));
        await assert.rejects(
          service(null).view("/discover/participants", { person: "fake_bob" }),
          { code: "SIGN_IN_REQUIRED" },
        );
      },
    );
    await t.test(
      "owner/admin detail receives all current members and fresh personal statuses; an assigned judge does not",
      async () => {
        for (const who of ["owner", "admin"]) {
          const page = (await service(who).view(
            "/admin/submissions/pg_info_project",
          )) as any;
          assert.deepEqual(
            page.teamMembers.map((member: any) => member.status).sort(),
            ["Absent", "Checked in", "Going"].sort(),
          );
          assert.ok(
            page.teamMembers.every(
              (member: any) => typeof member.email === "string" && typeof member.details === "object",
            ),
          );
        }
        await batch(db, [
          [
            "INSERT INTO project_assignments VALUES('pg_info_project','fake_judge','judge')",
          ],
        ]);
        const judge = (await service("judge").view(
          "/review/pg_info_project",
        )) as any;
        assert.ok(!("teamMembers" in judge));
        await assert.rejects(
          service("alice").view("/admin/submissions/pg_info_project"),
          { code: "PROJECT_ASSIGNMENT_REQUIRED" },
        );
      },
    );
    const selected = async (who: string) =>
      (
        (await service(who).view("/discover/participants", {
          person: "fake_bob",
        })) as any
      ).focusedPerson;
    await t.test(
      "admin orgID/contact, Viewer public gender and current-teammate phone obey fresh audience checks",
      async () => {
        const admin = await selected("admin");
        assert.equal(admin.details.email, "bob@portal.test");
        assert.equal((await selected("owner")).details.email, "bob@portal.test");
        assert.equal(admin.details.openaiOrgId, "org-private-pg-profile-info");
        assert.equal(admin.details.phone, "+12025550123");
        assert.equal(admin.bio, "PRIVATE_PG_PROFILE_INFO_BIO");
        assert.deepEqual((await selected("stranger")).details, {
          gender: "woman",
        });
        assert.deepEqual((await selected("alice")).details, {
          gender: "woman",
        });
        assert.equal(
          (await selected("carol")).details.whatsappUrl,
          "https://wa.me/12025550123",
        );
        await batch(db, [
          ["DELETE FROM memberships WHERE user_id='fake_carol'"],
        ]);
        assert.deepEqual((await selected("carol")).details, {
          gender: "woman",
        });
        await batch(db, [
          [
            "INSERT INTO portal_roles(user_id,role,granted_by,updated_at) VALUES('fake_admin','volunteer','fake_owner',?) ON CONFLICT(user_id) DO UPDATE SET role='volunteer'",
            now,
          ],
        ]);
        assert.deepEqual((await selected("admin")).details, {
          gender: "woman",
        });
      },
    );
    await t.test(
      "selected staff can inspect existing incomplete accounts without widening cards or ordinary selected lookup",
      async () => {
        await batch(db, [
          ["DELETE FROM participant_profiles WHERE user_id='fake_bob'"],
        ]);
        const staffPage = (await service("owner").view(
          "/discover/participants",
          { person: "fake_bob" },
        )) as any;
        assert.equal(staffPage.focusedPerson.id, "fake_bob");
        assert.equal(
          staffPage.focusedPerson.details.openaiOrgId,
          "org-private-pg-profile-info",
        );
        assert.ok(!staffPage.items.some((row: any) => row.id === "fake_bob"));
        assert.equal(
          (
            (await service("stranger").view("/discover/participants", {
              person: "fake_bob",
            })) as any
          ).focusedPerson,
          null,
        );
        assert.equal(
          (
            (await service("alice").view("/discover/participants", {
              person: "fake_bob",
            })) as any
          ).focusedPerson,
          null,
        );
      },
    );
    await t.test(
      "public member selection drops soft-removed targets while administrative retained membership/history stays intact",
      async () => {
        await batch(db, [
          [
            "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('participant','fake_dave',1,'Synthetic recoverable removal','fake_owner',?)",
            now,
          ],
        ]);
        assert.ok(
          !(await publicProjectMembers(db, "fake_team3")).some(
            (member) => member.id === "fake_dave",
          ),
        );
        assert.ok(
          (await adminSubmissionMembers(db, "fake_team3")).some(
            (member) => member.id === "fake_dave",
          ),
        );
        // This profile-info change does not rewrite the retained prior approval/status,
        // or decide the separately pending reversible roster-readiness policy.
        const page = (await service("owner").view(
          "/admin/submissions/pg_info_project",
        )) as any;
        assert.equal(page.version.id, "pg_info_v1");
        assert.equal(page.project.id, "pg_info_project");
      },
    );
  } finally {
    await pool.end();
  }
});
