import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, LOCAL_CREDIT_KEY, seedLocal } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows, type Database, type SQL } from "../lib/db";
import type { AdminTeamApprovalDTO } from "../lib/admin-team-approval";
import { handlePortal } from "../lib/http";

const at = "2026-10-22T08:00:00.000Z",
  teamId = "fake_team3";
const payload = (snapshotDigest: string) => ({
  teamId,
  snapshotDigest,
  confirmation: "APPROVE_TEAM",
});
const preview = (s: PortalService) =>
  s.view("/admin/team-approval", {
    focus: teamId,
  }) as Promise<AdminTeamApprovalDTO>;
const protectedTables = [
  "teams",
  "memberships",
  "team_locks",
  "ideas",
  "idea_revisions",
  "projects",
  "submission_versions",
  "submission_attempt_ledger",
  "project_commit_receipts",
  "project_eligibility",
  "check_ins",
  "manual_checkins",
  "automatic_absences",
  "registration_absences",
  "profiles",
  "participant_profiles",
  "profile_details",
];
const stable = (db: Database) =>
  Promise.all(
    protectedTables.map((table) =>
      rows(db, `SELECT * FROM ${table} ORDER BY 1`),
    ),
  );
const approvalWrites = (db: Database) =>
  Promise.all(
    ["registrations", "participant_status_overrides"].map((table) =>
      rows(db, `SELECT * FROM ${table} ORDER BY 1`),
    ),
  );

for (const engine of ["sqlite", "postgres"] as const) {
  async function fixture() {
    const pg = engine === "postgres" ? await createPGliteFixture() : null;
    const local = pg ? null : await setup();
    const db = pg?.db || local!.db;
    if (pg) await seedLocal(db);
    const service = (who = "admin") =>
      new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => at);
    await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
    await attend(db, "fake_bob");
    await batch(db, [
      [
        "UPDATE registrations SET status='pending' WHERE email='carol@portal.test'",
      ],
      [
        "INSERT INTO participant_status_overrides VALUES('fake_dave','Absent','Synthetic attendance','fake_owner',?)",
        at,
      ],
      [
        "UPDATE profiles SET socials=?,gender='woman' WHERE user_id='fake_bob'",
        JSON.stringify([
          "https://github.com/synthetic-bob",
          "https://www.linkedin.com/in/synthetic-bob/",
          "javascript:alert(1)",
          "https://github.com.evil.test/unsafe",
        ]),
      ],
      [
        "UPDATE profile_details SET best_description='Working Professional' WHERE user_id='fake_bob'",
      ],
    ]);
    return {
      db,
      service,
      async close() {
        if (pg) await pg.pool.end();
        else local!.db.close();
      },
    };
  }

  test(`${engine}: approval preview is private, fresh, bounded, canonical and explicit about missing saved fields`, async () => {
    const f = await fixture();
    try {
      await batch(f.db, [["DELETE FROM profiles WHERE user_id='fake_carol'"]]);
      const view = await preview(f.service());
      assert.equal(view.team.id, teamId);
      assert.equal(view.team.locked, true);
      assert.equal(view.team.leaderId, "fake_bob");
      assert.ok(view.team.lockedAt);
      assert.equal(view.idea!.title, "Common Ground idea");
      assert.equal(view.idea!.revisionId, null);
      assert.match(view.snapshotDigest, /^[a-f0-9]{64}$/);
      assert.equal(view.canApprove, true);
      assert.equal(view.blockedReason, null);
      assert.deepEqual(
        view.members.map((m) => [m.id, m.status, m.willBecomeGoing]),
        [
          ["fake_bob", "Checked in", false],
          ["fake_carol", "Registered", true],
          ["fake_dave", "Absent", false],
        ],
      );
      const bob = view.members[0],
        carol = view.members[1];
      assert.equal(bob.githubUrl, "https://github.com/synthetic-bob");
      assert.equal(
        bob.linkedinUrl,
        "https://www.linkedin.com/in/synthetic-bob/",
      );
      assert.equal(bob.profession, "Working Professional");
      assert.equal(bob.genderLabel, "Female");
      assert.equal(bob.role, "leader");
      assert.equal(bob.checkedIn, true);
      assert.equal(bob.attendanceRecorded, true);
      for (const field of [
        "githubUrl",
        "linkedinUrl",
        "profession",
        "gender",
        "genderLabel",
        "approvalIssue",
      ] as const)
        assert.equal(carol[field], null);
      assert.doesNotMatch(
        JSON.stringify(view),
        /1202555|openai_org|organization|private core|javascript:|evil.test/,
      );
      assert.equal(
        (await preview(f.service())).snapshotDigest,
        view.snapshotDigest,
      );
      for (const who of ["bob", "carol", "judge", "stranger"]) {
        await assert.rejects(preview(f.service(who)), {
          code: "ADMIN_REQUIRED",
        });
        const response = await handlePortal(
          new Request(
            `http://localhost/api/portal?view=/admin/team-approval&focus=${teamId}`,
          ),
          { db: f.db, identity: fixtures[who], key: LOCAL_CREDIT_KEY },
        );
        assert.equal(response.status, 403);
        assert.doesNotMatch(
          await response.text(),
          /carol@|Common Ground idea|Working Professional/,
        );
      }
      await assert.rejects(
        preview(new PortalService(f.db, null, LOCAL_CREDIT_KEY)),
        { code: "SIGN_IN_REQUIRED" },
      );
      await assert.rejects(f.service().view("/admin/team-approval", {}));
      await assert.rejects(
        f.service().view("/admin/team-approval", { focus: "missing" }),
        { code: "TEAM_NOT_FOUND" },
      );
      const publicView = await f.service("stranger").view("/discover/teams");
      assert.doesNotMatch(
        JSON.stringify(publicView),
        /snapshotDigest|approvalIssue|carol@|Working Professional|linkedin/,
      );
    } finally {
      await f.close();
    }
  });

  test(`${engine}: only Registered becomes Going, approved Absent and valid Checked in stay exact, duplicate/repeat are idempotent`, async () => {
    const f = await fixture();
    try {
      const before = await stable(f.db),
        beforeDave = await one(
          f.db,
          "SELECT * FROM participant_status_overrides WHERE user_id='fake_dave'",
        );
      const view = await preview(f.service()),
        input = payload(view.snapshotDigest);
      const [first, duplicate] = await Promise.all([
        f.service().command("approve-team", input),
        f.service().command("approve-team", input),
      ]);
      assert.deepEqual([first.changed, duplicate.changed].sort(), [
        false,
        true,
      ]);
      const revision = await one(
        f.db,
        "SELECT version FROM scoring_revision WHERE id=1",
      );
      assert.equal(
        (await f.service().command("approve-team", input)).changed,
        false,
      );
      assert.deepEqual(
        await one(f.db, "SELECT version FROM scoring_revision WHERE id=1"),
        revision,
      );
      assert.deepEqual(await stable(f.db), before);
      assert.deepEqual(
        await one(
          f.db,
          "SELECT * FROM participant_status_overrides WHERE user_id='fake_dave'",
        ),
        beforeDave,
      );
      const after = await preview(f.service());
      assert.deepEqual(
        after.members.map((m) => [
          m.status,
          m.approval,
          m.checkedIn,
          m.willBecomeGoing,
        ]),
        [
          ["Checked in", "approved", true, false],
          ["Going", "approved", false, false],
          ["Absent", "approved", false, false],
        ],
      );
      const audit = await rows<{ detail: string }>(
        f.db,
        "SELECT detail FROM audit_logs WHERE action='approve-team'",
      );
      assert.equal(audit.length, 1);
      assert.equal(JSON.parse(audit[0].detail).updatedMembers, 1);
      assert.doesNotMatch(
        JSON.stringify(audit),
        /@|social|Common Ground idea|private core|Working Professional|Woman|1202555/,
      );
      assert.equal((await rows(f.db, "SELECT * FROM write_guards")).length, 0);
      for (const who of ["bob", "judge", "stranger"])
        await assert.rejects(
          f.service(who).command("approve-team", payload(after.snapshotDigest)),
          { code: who === "stranger" ? "VIEWER_READ_ONLY" : "ADMIN_REQUIRED" },
        );
    } finally {
      await f.close();
    }
  });

  test(`${engine}: unresolved later statuses block the whole action, strict input and real lock remain authoritative`, async () => {
    const f = await fixture();
    try {
      const initial = await preview(f.service());
      for (const input of [
        { teamId },
        { ...payload(initial.snapshotDigest), reason: "No reasons" },
        { ...payload(initial.snapshotDigest), confirmation: "YES" },
      ])
        await assert.rejects(f.service().command("approve-team", input));
      await assert.rejects(
        f.service().command("approve-team", payload("0".repeat(64))),
        { code: "TEAM_APPROVAL_CHANGED" },
      );
      const unlocked = (await f.service().view("/admin/team-approval", {
        focus: "fake_team1",
      })) as AdminTeamApprovalDTO;
      assert.equal(unlocked.canApprove, false);
      await assert.rejects(
        f.service().command("approve-team", {
          ...payload(unlocked.snapshotDigest),
          teamId: "fake_team1",
        }),
        { code: "TEAM_LOCK_REQUIRED" },
      );
      await batch(f.db, [
        [
          "UPDATE registrations SET status='pending' WHERE email='dave@portal.test'",
        ],
      ]);
      const absentPending = await preview(f.service());
      assert.equal(absentPending.canApprove, false);
      assert.ok(
        absentPending.members.find((m) => m.id === "fake_dave")!.approvalIssue,
      );
      assert.equal(
        absentPending.members.find((m) => m.id === "fake_dave")!
          .willBecomeGoing,
        false,
      );
      const before = await approvalWrites(f.db);
      await assert.rejects(
        f
          .service()
          .command("approve-team", payload(absentPending.snapshotDigest)),
        { code: "TEAM_APPROVAL_INCONSISTENT" },
      );
      assert.deepEqual(await approvalWrites(f.db), before);
      await batch(f.db, [
        [
          "UPDATE registrations SET status='approved' WHERE email='dave@portal.test'",
        ],
        [
          "INSERT INTO participant_status_overrides VALUES('fake_bob','Checked in','Synthetic current status','fake_owner',?)",
          at,
        ],
        [
          "UPDATE registrations SET status='pending' WHERE email='bob@portal.test'",
        ],
      ]);
      const checkedPending = await preview(f.service());
      assert.equal(checkedPending.canApprove, false);
      assert.equal(checkedPending.members[0].attendanceRecorded, true);
      await assert.rejects(
        f
          .service()
          .command("approve-team", payload(checkedPending.snapshotDigest)),
        { code: "TEAM_APPROVAL_INCONSISTENT" },
      );
      await batch(f.db, [
        [
          "UPDATE registrations SET status='approved' WHERE email='bob@portal.test'",
        ],
        [
          "UPDATE registrations SET status='approved' WHERE email='carol@portal.test'",
        ],
        [
          "INSERT INTO participant_status_overrides VALUES('fake_carol','Checked in','Synthetic stale status','fake_owner',?)",
          at,
        ],
      ]);
      const noProof = await preview(f.service());
      assert.equal(noProof.canApprove, false);
      assert.equal(
        noProof.members.find((m) => m.id === "fake_carol")!.attendanceRecorded,
        false,
      );
      await assert.rejects(
        f.service().command("approve-team", payload(noProof.snapshotDigest)),
        { code: "TEAM_CHECKIN_INCONSISTENT" },
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM audit_logs WHERE action='approve-team'",
          )
        ).length,
        0,
      );
      await f
        .service("eve")
        .command("lock-team", { confirmation: "LOCK_TEAM" });
      const five = (await f.service().view("/admin/team-approval", {
        focus: "fake_team5",
      })) as AdminTeamApprovalDTO;
      assert.equal(five.members.length, 5);
      assert.equal(five.canApprove, true);
    } finally {
      await f.close();
    }
  });

  const races: [
    string,
    (f: Awaited<ReturnType<typeof fixture>>) => Promise<unknown>,
  ][] = [
    [
      "actor role",
      (f) =>
        batch(f.db, [
          [
            "INSERT INTO portal_roles VALUES('fake_admin','participant','fake_owner',?)",
            at,
          ],
        ]),
    ],
    [
      "crown",
      (f) =>
        f.service("owner").command("transfer-team-leader", {
          teamId,
          userId: "fake_carol",
          expectedLeaderId: "fake_bob",
          confirmation: "TRANSFER_TEAM_LEADER",
        }),
    ],
    [
      "membership",
      (f) =>
        f.service("owner").command("admin-add-team-member", {
          teamId,
          email: "pending@portal.test",
          confirmation: "ADD_TEAM_MEMBER",
        }),
    ],
    [
      "saved profile",
      (f) =>
        batch(f.db, [
          [
            "UPDATE profile_details SET best_description='Startup Founder' WHERE user_id='fake_carol'",
          ],
        ]),
    ],
    [
      "idea revision",
      (f) =>
        batch(f.db, [
          [
            "INSERT INTO idea_revisions VALUES('synthetic-new-revision',?,'{}',?)",
            teamId,
            at,
          ],
        ]),
    ],
    [
      "attendance proof",
      (f) =>
        batch(f.db, [
          ["INSERT INTO check_ins VALUES('fake_bob','fake_owner',?)", at],
        ]),
    ],
    [
      "results freeze",
      (f) =>
        batch(f.db, [
          [
            "INSERT INTO result_snapshots(id,policy_version,source_revision,payload,created_at,frozen_by) SELECT 'synthetic-approval-freeze',1,version,'[]',?,'fake_owner' FROM scoring_revision WHERE id=1",
            at,
          ],
        ]),
    ],
  ];
  test(`${engine}: transaction guards reject post-preview role/crown/membership/profile/idea/attendance/freeze races before any approval writes`, async (t) => {
    for (const [label, race] of races)
      await t.test(label, async () => {
        const f = await fixture();
        try {
          const s = f.service(),
            view = await preview(s),
            before = await approvalWrites(f.db),
            mutate = s.mutate.bind(s);
          s.mutate = async (...args: Parameters<PortalService["mutate"]>) => {
            if (args[1] === "approve-team") await race(f);
            return mutate(...args);
          };
          await assert.rejects(
            s.command("approve-team", payload(view.snapshotDigest)),
            { code: "TEAM_APPROVAL_CHANGED" },
          );
          assert.deepEqual(await approvalWrites(f.db), before);
          assert.equal(
            (
              await rows(
                f.db,
                "SELECT * FROM audit_logs WHERE action='approve-team'",
              )
            ).length,
            0,
          );
          assert.equal(
            (await rows(f.db, "SELECT * FROM write_guards")).length,
            0,
          );
        } finally {
          await f.close();
        }
      });
  });

  test(`${engine}: a failure after the first Registered update rolls back every member and approval audit`, async () => {
    const f = await fixture();
    try {
      await batch(f.db, [
        [
          "UPDATE participant_status_overrides SET status='Registered' WHERE user_id='fake_dave'",
        ],
        [
          "UPDATE registrations SET status='pending' WHERE email='dave@portal.test'",
        ],
      ]);
      const s = f.service(),
        view = await preview(s),
        before = await approvalWrites(f.db),
        mutate = s.mutate.bind(s);
      s.mutate = async (actor, action, entity, sql, ...rest) => {
        if (action === "approve-team") {
          const altered: SQL[] = [...sql],
            index = altered.findIndex(([query]) =>
              query.startsWith("INSERT INTO participant_status_overrides"),
            );
          altered.splice(index + 1, 0, [
            "INSERT INTO write_guards VALUES('synthetic-approval-failure',0)",
          ]);
          return mutate(actor, action, entity, altered, ...rest);
        }
        return mutate(actor, action, entity, sql, ...rest);
      };
      await assert.rejects(
        s.command("approve-team", payload(view.snapshotDigest)),
        { code: "TEAM_APPROVAL_CHANGED" },
      );
      assert.deepEqual(await approvalWrites(f.db), before);
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM audit_logs WHERE action='approve-team'",
          )
        ).length,
        0,
      );
      assert.equal((await rows(f.db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await f.close();
    }
  });
  for (const target of ["locked snapshot", "removed member"] as const) {
    test(`${engine}: ${target} is rechecked inside the approval transaction`, async () => {
      const f = await fixture();
      try {
        const s = f.service(),
          view = await preview(s),
          before = await approvalWrites(f.db),
          mutate = s.mutate.bind(s);
        s.mutate = async (...args: Parameters<PortalService["mutate"]>) => {
          if (args[1] === "approve-team") {
            if (target === "locked snapshot")
              await f.service("owner").command("admin-unlock-team", {
                teamId,
                expectedLockedAt: view.team.lockedAt,
                confirmation: "UNLOCK_TEAM",
              });
            else
              await batch(f.db, [
                [
                  "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('participant','fake_carol',1,'Synthetic removal','fake_owner',?)",
                  at,
                ],
              ]);
          }
          return mutate(...args);
        };
        await assert.rejects(
          s.command("approve-team", payload(view.snapshotDigest)),
          { code: "TEAM_APPROVAL_CHANGED" },
        );
        assert.deepEqual(await approvalWrites(f.db), before);
        assert.equal(
          (
            await rows(
              f.db,
              "SELECT * FROM audit_logs WHERE action='approve-team'",
            )
          ).length,
          0,
        );
        const current = await preview(f.service("owner"));
        assert.equal(current.canApprove, false);
        assert.equal(
          target === "locked snapshot"
            ? current.team.locked
            : !current.members.find((member) => member.id === "fake_carol")!
                .removed,
          false,
        );
      } finally {
        await f.close();
      }
    });
  }
}
