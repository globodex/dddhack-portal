import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, activate, attend, submission } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows } from "../lib/db";
import { createMediaDatabase } from "../neon/storage/database";
import type { MediaObjectStore } from "../neon/storage/types";
for (const engine of ["sqlite", "postgres"])
  test(`${engine}: two admin leaders and owner retain private committed projects across all times, repeated reads and identities with real media storage boundary`, async () => {
    const base =
      engine === "sqlite" ? await setup() : await createPGliteFixture();
    if (engine === "postgres") await seedLocal(base.db);
    const images = new Map<string, any>();
    const objectStore: MediaObjectStore = {
      async signPut() {
        throw Error("NO_NETWORK");
      },
      async read(_, key) {
        const v = images.get(key);
        assert.ok(v);
        return v;
      },
      async write(_, key, v) {
        images.set(key, {
          bytes: v.bytes,
          contentType: v.contentType,
          contentLength: v.byteLength,
        });
      },
    };
    const db = createMediaDatabase(base.db, { objectStore });
    let now = "2026-10-22T08:00:00.000Z";
    const service = (who: string) =>
      new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => now);
    const payload = (name: string) => ({
      projectName: name,
      problemSolution: submission.problemSolution,
      description: submission.description,
      github: submission.github,
      demo: "",
      logo: submission.logo,
      banner: submission.banner,
      attestation: true,
    });
    try {
      await batch(base.db, [
        [
          "INSERT INTO portal_roles VALUES('fake_alice','admin','fake_owner',?)",
          now,
        ],
        [
          "INSERT INTO portal_roles VALUES('fake_bob','admin','fake_owner',?)",
          now,
        ],
        [
          "DELETE FROM participant_profiles WHERE user_id IN ('fake_alice','fake_bob','fake_owner')",
        ],
        [
          "INSERT INTO teams VALUES('private-owner-team','Synthetic owner team','fake_owner','',?)",
          now,
        ],
        [
          "INSERT INTO memberships VALUES('fake_owner','private-owner-team',?)",
          now,
        ],
      ]);
      const ids = new Map<string, string>();
      for (const [index, time] of [
        "2026-10-31T08:00:00.000Z",
        "2026-11-01T04:30:00.000Z",
        "2026-11-02T08:00:00.000Z",
      ].entries()) {
        now = time;
        await Promise.all(
          ["alice", "bob", "owner"].map(async (who) => {
            const s = service(who),
              v: any = await s.view("/dashboard");
            const result = await s.command("submit-project", {
              revision: v.project?.revision || 0,
              project: payload("Synthetic " + who + " " + index),
            });
            ids.set(who, String(result.projectId));
            assert.equal(result.attemptsUsed, index + 1);
          }),
        );
        for (let read = 0; read < 3; read++)
          for (const who of ["alice", "bob", "owner"]) {
            for (const path of [
              "/dashboard",
              "/dashboard/team",
              "/submission",
              "/dashboard/submission",
            ]) {
              const v: any = await service(who).view(path);
              assert.equal(v.project?.id, ids.get(who), who + path);
              assert.ok(v.project.published_version_id);
              assert.equal(v.attempts.length, index + 1);
              assert.equal(v.submissionAccess.canRead, true);
              assert.equal(v.submissionAccess.intentVersion, 1);
              assert.equal(v.submissionAccess.adminSubmissionTest, true);
            }
            const admin: any = await service(who).view("/admin/submissions");
            assert.equal(admin.items.length, 3);
            assert.ok(admin.items.every((x: any) => x.status === "Submitted"));
            if (read === 0) {
              const history: any = await service(who).view("/project-history");
              assert.equal(history.items.length, index + 1);
              assert.equal(history.items[0].payload.logo, submission.logo);
              assert.equal(history.items[0].payload.banner, submission.banner);
            }
          }
        const anonymous: any = await new PortalService(
          db,
          null,
          undefined,
          () => now,
        ).view("/projects");
        assert.equal(
          anonymous.items.length,
          0,
          "Public eligibility policy is unchanged",
        );
      }
      assert.equal(
        (await rows(base.db, "SELECT id FROM submission_versions")).length,
        9,
      );
      await assert.rejects(
        service("alice").command("submit-project", {
          revision: 3,
          project: payload("No fourth"),
        }),
        { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
      );
      const carol: any = await service("carol").view("/dashboard");
      assert.equal(
        carol.project,
        undefined,
        "Non-admin members do not inherit the leader testing exception",
      );
      await attend(base.db, "fake_carol");
      const checked: any = await service("carol").view("/dashboard");
      assert.equal(checked.project?.id, ids.get("bob"));
      assert.equal(checked.submissionAccess.canCommit, false);
    } finally {
      await base.db.close();
    }
  });

for (const engine of ["sqlite", "postgres"]) {
  test(`${engine}: legacy admin submit creates canonical project index and stable receipt; actor/team changes cannot write`, async () => {
    const f = engine === "sqlite" ? await setup() : await createPGliteFixture();
    if (engine === "postgres") await seedLocal(f.db);
    const now = "2026-10-31T08:00:00.000Z";
    const s = (who: string) =>
      new PortalService(f.db, fixtures[who], LOCAL_CREDIT_KEY, () => now);
    try {
      await batch(f.db, [
        [
          "INSERT INTO portal_roles VALUES('fake_alice','admin','fake_owner',?)",
          now,
        ],
        ["DELETE FROM participant_profiles WHERE user_id='fake_alice'"],
      ]);
      const before: any = await s("alice").view("/dashboard");
      const first = await s("alice").command("submit", {
        ...submission,
        projectName: "Legacy admin canonical",
      });
      const repeated = await s("alice").command("submit", {
        ...submission,
        projectName: "Legacy admin canonical",
      });
      assert.equal(first.versionId, repeated.versionId);
      assert.equal(first.id, first.versionId);
      assert.equal((await rows(f.db, "SELECT id FROM projects")).length, 1);
      assert.equal(
        (await rows(f.db, "SELECT id FROM submission_versions")).length,
        1,
      );
      const v: any = await s("alice").view("/dashboard");
      assert.equal(v.project.published_version_id, first.versionId);
      assert.equal(v.projectIndexMissing, false);
      const project = v.project.draft;
      for (const [intent, code] of [
        [
          { teamId: "different-team", actorId: "fake_alice" },
          "SUBMISSION_TEAM_CHANGED",
        ],
        [
          { teamId: before.team.id, actorId: "fake_bob" },
          "SUBMISSION_ACCOUNT_CHANGED",
        ],
      ] as const) {
        await assert.rejects(
          s("alice").command("submit-project", {
            revision: v.project.revision,
            project,
            ...intent,
          }),
          { code },
        );
      }
      assert.equal(
        (await rows(f.db, "SELECT id FROM submission_versions")).length,
        1,
      );
      await assert.rejects(s("carol").command("submit", submission), {
        code: "LEADER_REQUIRED",
      });
      const publicView: any = await new PortalService(
        f.db,
        null,
        undefined,
        () => now,
      ).view("/projects");
      assert.equal(publicView.items.length, 0);
    } finally {
      await f.db.close();
    }
  });

  test(`${engine}: actual legacy commits remain visible privately without repair, public exposure or another consumed attempt`, async () => {
    const f = engine === "sqlite" ? await setup() : await createPGliteFixture();
    if (engine === "postgres") await seedLocal(f.db);
    let now = "2026-11-01T06:00:00.000Z";
    const s = (who: string) =>
      new PortalService(f.db, fixtures[who], LOCAL_CREDIT_KEY, () => now);
    try {
      await activate(f.db as any);
      await attend(f.db, "fake_alice", "fake_bob");
      const a = await s("alice").command("submit", {
        ...submission,
        projectName: "Preserved Alice legacy",
      });
      const b = await s("bob").command("submit", {
        ...submission,
        projectName: "Preserved Bob legacy",
      });
      assert.equal((await rows(f.db, "SELECT id FROM projects")).length, 0);
      await batch(f.db, [
        [
          "INSERT INTO portal_roles VALUES('fake_alice','admin','fake_owner',?)",
          now,
        ],
        [
          "INSERT INTO portal_roles VALUES('fake_bob','admin','fake_owner',?)",
          now,
        ],
      ]);
      for (const time of [
        "2026-10-31T08:00:00.000Z",
        "2026-11-01T06:00:00.000Z",
        "2026-11-02T08:00:00.000Z",
      ]) {
        now = time;
        for (const who of ["alice", "bob", "owner"]) {
          const list: any = await s(who).view("/admin/submissions");
          assert.equal(list.items.length, 2);
          assert.equal(list.unindexedSubmissionCount, 2);
          assert.ok(
            list.items.every(
              (i: any) => i.projectIndexMissing === 1 && !i.slug,
            ),
          );
          assert.deepEqual(
            new Set(list.items.map((i: any) => i.id)),
            new Set([a.id, b.id]),
          );
          for (const item of list.items) {
            const history: any = await s(who).view("/project-history", {
              focus: item.teamId,
            });
            assert.equal(history.items[0].id, item.id);
            assert.match(history.items[0].payload.projectName, /Preserved/);
          }
        }
        for (const who of ["alice", "bob"]) {
          const dashboard: any = await s(who).view("/dashboard");
          assert.equal(dashboard.projectIndexMissing, true);
          assert.equal(dashboard.submissionAccess.canCommit, false);
          assert.equal(dashboard.attempts.length, 1);
          await assert.rejects(
            s(who).command("submit-project", {
              revision: 0,
              project: {
                projectName: submission.projectName,
                description: submission.description,
                problemSolution: submission.problemSolution,
                github: submission.github,
                logo: submission.logo,
                banner: submission.banner,
                attestation: true,
              },
            }),
            { code: "PROJECT_INDEX_MISSING" },
          );
        }
      }
      const team: any = await one(
        f.db,
        "SELECT team_id FROM submission_versions WHERE id=?",
        a.id,
      );
      await assert.rejects(
        s("carol").view("/project-history", { focus: team.team_id }),
        { code: "ADMIN_REQUIRED" },
      );
      const anon: any = await new PortalService(
        f.db,
        null,
        undefined,
        () => now,
      ).view("/projects");
      assert.equal(anon.items.length, 0);
      assert.equal((await rows(f.db, "SELECT id FROM projects")).length, 0);
      assert.equal(
        (await rows(f.db, "SELECT id FROM submission_versions")).length,
        2,
      );
    } finally {
      await f.db.close();
    }
  });
}
