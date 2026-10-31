import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import {
  publicProjectMembers,
  adminSubmissionMembers,
} from "../lib/project-member-profiles";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal } from "../scripts/fixtures";
import { batch } from "../lib/db";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectTeamMembers } from "../app/participant-profile-info";

for (const engine of ["sqlite", "postgres"] as const)
  test(`${engine}: inline members reuse selected-profile permissions; no public contacts, status or org ID`, async () => {
    const f = engine === "sqlite" ? await setup() : await createPGliteFixture();
    if (engine === "postgres") await seedLocal(f.db);
    try {
      await batch(f.db, [
        [
          "UPDATE profiles SET gender='woman',public=1,bio='Public synthetic bio',socials=? WHERE user_id='fake_bob'",
          JSON.stringify([
            "https://github.com/synthetic",
            "https://linkedin.com/in/synthetic",
            "javascript:alert(1)",
            "https://user:password@example.test/",
          ]),
        ],
        [
          "UPDATE profile_details SET best_description='Startup Founder',organization='Private synthetic organization',phone='+12025550123',openai_org_id='org-synthetic-private' WHERE user_id='fake_bob'",
        ],
      ]);
      const viewers = [
        undefined,
        { id: "fake_stranger", role: "participant", canParticipate: false },
        { id: "fake_alice", role: "participant", canParticipate: true },
        { id: "fake_carol", role: "participant", canParticipate: true },
        { id: "fake_owner", role: "admin", owner: true },
      ];
      for (const viewer of viewers) {
        const members: any[] = await publicProjectMembers(
          f.db,
          "fake_team3",
          viewer,
        );
        const bob = members.find((member) => member.id === "fake_bob");
        if (!viewer)
          assert.deepEqual(
            Object.keys(bob).sort(),
            ["id", "name", "avatarColor", "avatarExpression"].sort(),
          );
        else {
          assert.equal(bob.details.gender, "woman");
          assert.equal(
            bob.details.profession,
            viewer.owner ? "Startup Founder" : undefined,
          );
          assert.match(bob.socials[0], /github/);
        }
        assert.doesNotMatch(
          JSON.stringify(members),
          /12025550123|org-synthetic-private|Private synthetic organization|"email"|"status"|"phone"/,
        );
        const html = renderToStaticMarkup(
          createElement(ProjectTeamMembers, { members }),
        );
        assert.doesNotMatch(
          html,
          /javascript:|password@|participant-profile-info|org-synthetic-private|12025550123/,
        );
        if (viewer) assert.match(html, /Female|GitHub/);
      }
      const admin: any = await adminSubmissionMembers(f.db, "fake_team3", {
        id: "fake_owner",
        role: "admin",
        owner: true,
      });
      const bob = admin.find((member: any) => member.id === "fake_bob");
      assert.equal(bob.details.profession, "Startup Founder");
      assert.equal(bob.details.openaiOrgId, "org-synthetic-private");
      assert.equal(bob.details.phone, "+12025550123");
      assert.equal(bob.email, "bob@portal.test");
      const html = renderToStaticMarkup(
        createElement(ProjectTeamMembers, { members: admin, admin: true }),
      );
      assert.match(html, /Startup Founder|Female/);
      assert.match(html, /org-synthetic-private/);
      assert.doesNotMatch(
        html,
        /javascript:|password@|participant-profile-info/,
      );
      await batch(f.db, [
        ["UPDATE profiles SET public=0 WHERE user_id='fake_bob'"],
      ]);
      const privatePublic: any = await publicProjectMembers(
        f.db,
        "fake_team3",
        viewers[4],
      );
      assert.deepEqual(
        privatePublic.find((member: any) => member.id === "fake_bob").socials,
        [],
      );
      assert.equal(
        privatePublic.find((member: any) => member.id === "fake_bob").bio,
        "",
      );
    } finally {
      await f.db.close();
    }
  });

for (const engine of ["sqlite", "postgres"] as const)
  test(`${engine}: public project shows registered completed admin teammates from current membership without exposing staff contacts`, async () => {
    const f = engine === "sqlite" ? await setup() : await createPGliteFixture();
    if (engine === "postgres") await seedLocal(f.db);
    try {
      await batch(f.db, [
        [
          "INSERT INTO portal_roles VALUES('fake_bob','admin','fake_owner','2026-10-22T08:00:00Z')",
        ],
        [
          "INSERT INTO portal_roles VALUES('fake_carol','admin','fake_owner','2026-10-22T08:00:00Z')",
        ],
      ]);
      for (const viewer of [
        undefined,
        { id: "fake_alice", role: "participant", canParticipate: true },
        { id: "fake_owner", role: "admin", owner: true },
      ]) {
        const members = await publicProjectMembers(f.db, "fake_team3", viewer);
        assert.deepEqual(
          members.map((m) => m.id),
          ["fake_bob", "fake_carol", "fake_dave"],
        );
        assert.doesNotMatch(
          JSON.stringify(members),
          /"email"|"phone"|"openaiOrgId"|"status"/,
        );
      }
      await batch(f.db, [
        ["DELETE FROM participant_profiles WHERE user_id='fake_carol'"],
        [
          "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at)VALUES('participant','fake_dave',1,'Synthetic privacy check','fake_owner','2026-10-22T08:00:00Z')",
        ],
      ]);
      assert.deepEqual(
        (await publicProjectMembers(f.db, "fake_team3")).map((m) => m.id),
        ["fake_bob"],
        "Existing profile/removal gates stay intact, including for staff",
      );
    } finally {
      await f.db.close();
    }
  });
