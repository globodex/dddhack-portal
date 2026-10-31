import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { seedRichVisual } from "../scripts/visual-rich-fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows, type Database } from "../lib/db";
import { handlePortal } from "../lib/http";
import { OWNER_EMAIL } from "../lib/identity";

const teamDelete = { teamId: "fake_team5", confirmation: "DELETE_TEAM" };
const personDelete = (userId = "fake_carol") => ({
  userId,
  expectedLeaderTeamIds:
    userId === "fake_eve"
      ? ["fake_team5"]
      : userId === "fake_alice"
        ? ["fake_team1"]
        : [],
  confirmation: "DELETE_PARTICIPANT",
});
const asPlain = (value: unknown) => JSON.parse(JSON.stringify(value));
async function fixture(engine: "sqlite" | "postgres", rich = true) {
  const db =
    engine === "sqlite"
      ? new LocalDatabase(":memory:")
      : (await createPGliteFixture()).db;
  if (engine === "sqlite") (db as LocalDatabase).migrate();
  await seedLocal(db);
  if (rich) await seedRichVisual(db);
  let time = new Date().toISOString();
  return {
    db,
    service: (who = "admin") =>
      new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => time),
    clock: (t: string) => {
      time = t;
    },
  };
}
async function stableOtherProject(db: Database) {
  return asPlain(
    await Promise.all([
      rows(db, "SELECT * FROM projects WHERE id='visual_project_alice'"),
      rows(
        db,
        "SELECT * FROM submission_versions WHERE team_id='fake_team1' ORDER BY id",
      ),
      rows(
        db,
        "SELECT * FROM project_review_history WHERE project_id='visual_project_alice' ORDER BY id",
      ),
      rows(db, "SELECT * FROM credit_allocations WHERE user_id='fake_alice'"),
    ]),
  );
}
async function enrichTarget(db: Database) {
  const now = new Date().toISOString();
  const policy = JSON.parse(
    (await one<{ policy: string }>(
      db,
      "SELECT policy FROM event_settings WHERE id=1",
    ))!.policy,
  );
  await batch(db, [
    [
      "UPDATE event_settings SET policy=? WHERE id=1",
      JSON.stringify({
        ...policy,
        engagementOpen: "2020-01-01T00:00:00.000Z",
        engagementClose: "2090-01-01T00:00:00.000Z",
      }),
    ],
    ["INSERT INTO team_locks VALUES('fake_team5','fake_eve',?)", now],
    [
      "INSERT INTO check_ins VALUES('fake_alice','fake_admin',?) ON CONFLICT DO NOTHING",
      now,
    ],
    [
      "INSERT INTO idea_revisions VALUES('cascade-idea-revision','fake_team5','{\"private\":\"SYNTHETIC-PRIVATE-IDEA\"}',?)",
      now,
    ],
    ["INSERT INTO judge_assignments VALUES('fake_judge','fake_team5')"],
    [
      "INSERT INTO human_scores VALUES('fake_judge','fake_team5',7,'Synthetic private judge notes',?)",
      now,
    ],
    [
      "INSERT INTO reviews VALUES('fake_team5','visual_eve_v3','eligible',NULL,NULL,NULL,0,'Synthetic private evidence','fake_admin',?)",
      now,
    ],
    ["INSERT INTO votes VALUES('fake_alice','fake_team5',?)", now],
    [
      "INSERT INTO feedback VALUES('fake_alice','fake_team5','Synthetic specific old feedback about this project',1,NULL,?)",
      policy.submissionClose,
    ],
    [
      "INSERT INTO tie_resolutions VALUES('synthetic-cascade-tie','fake_team5',1)",
    ],
    [
      "INSERT INTO project_feedback_reviews VALUES('cascade-feedback-review','visual_comment_eve','visual_eve_v3',1,1,'synthetic-body-hash','fake_admin','Synthetic moderation',?)",
      now,
    ],
    [
      "INSERT INTO eligibility_history VALUES('cascade-eligibility','visual_project_eve','visual_eve_v3','eligible','Synthetic only','private synthetic evidence','fake_admin',?)",
      now,
    ],
    [
      "INSERT INTO repository_evidence VALUES('cascade-repository','visual_project_eve','visual_eve_v3',?,'verified','Synthetic private repository evidence','Synthetic only','fake_admin',?)",
      "a".repeat(40),
      now,
    ],
    [
      "INSERT INTO evaluation_runs(id,project_id,version_id,config_key,state,report,created_at,updated_at) VALUES('cascade-evaluation','visual_project_eve','visual_eve_v3','synthetic-cascade','completed','{}',?,?)",
      now,
      now,
    ],
    ...[1, 2, 3].flatMap((n): import("../lib/db").SQL[] => [
      [
        "INSERT INTO project_commit_receipts VALUES('fake_team5',?,'visual_project_eve',?,?)",
        "synthetic-request-" + n,
        "visual_eve_v" + n,
        now,
      ],
      [
        "INSERT INTO astra_jobs(id,version_id,updated_at) VALUES(?,?,?)",
        "cascade-job-" + n,
        "visual_eve_v" + n,
        now,
      ],
    ]),
  ]);
}
for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: a crown transfer before the request cannot broaden the confirmed participant cascade`, async () => {
    const f = await fixture(engine, false);
    try {
      await f
        .service("owner")
        .command("transfer-team-leader", {
          teamId: "fake_team3",
          userId: "fake_carol",
          expectedLeaderId: "fake_bob",
          confirmation: "TRANSFER_TEAM_LEADER",
        });
      await assert.rejects(
        f.service().command("admin-delete-participant", personDelete()),
        { code: "DELETION_TARGET_CHANGED" },
      );
      assert(await one(f.db, "SELECT id FROM teams WHERE id='fake_team3'"));
      assert(
        await one(
          f.db,
          "SELECT user_id FROM memberships WHERE user_id='fake_carol'",
        ),
      );
      assert.equal(
        (await rows(f.db, "SELECT * FROM terminal_record_deletions")).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM audit_logs WHERE action='admin-delete-participant'",
          )
        ).length,
        0,
      );
      await f
        .service()
        .command("admin-delete-participant", {
          ...personDelete(),
          expectedLeaderTeamIds: ["fake_team3"],
        });
      assert.equal(
        (await rows(f.db, "SELECT id FROM teams WHERE id='fake_team3'")).length,
        0,
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: imports after preview or during commit cannot re-enroll terminal identities and keep unrelated existing/new participants`, async () => {
    const f = await fixture(engine, false);
    try {
      const existing = asPlain(
        await rows(
          f.db,
          "SELECT * FROM registrations WHERE email='bob@portal.test'",
        ),
      );
      const admin = f.service();
      const first = {
        kind: "roster",
        csv: "carol@portal.test\nsynthetic-terminal-import-one@portal.test\nbob@portal.test",
      };
      const preview = await admin.command("preview-import", first);
      await f
        .service("owner")
        .command("admin-delete-participant", personDelete());
      await admin.command("commit-import", {
        ...first,
        digest: preview.digest,
      });
      const second = {
        kind: "roster",
        csv: "dave@portal.test\nsynthetic-terminal-import-two@portal.test\nbob@portal.test",
      };
      const next = await admin.command("preview-import", second);
      const original = admin.mutate.bind(admin);
      let once = true;
      admin.mutate = async (...args) => {
        if (once && args[1] === "commit-import") {
          once = false;
          await f
            .service("owner")
            .command("admin-delete-participant", personDelete("fake_dave"));
        }
        return original(...args);
      };
      await admin.command("commit-import", { ...second, digest: next.digest });
      for (const email of ["carol@portal.test", "dave@portal.test"]) {
        for (const table of ["registrations", "luma_roster", "roster_prefills"])
          assert.equal(
            (await rows(f.db, `SELECT * FROM ${table} WHERE email=?`, email))
              .length,
            0,
            table + email,
          );
      }
      for (const id of ["fake_carol", "fake_dave"])
        for (const table of [
          "profiles",
          "participant_profiles",
          "profile_details",
        ])
          assert.equal(
            (await rows(f.db, `SELECT * FROM ${table} WHERE user_id=?`, id))
              .length,
            0,
            table + id,
          );
      for (const email of [
        "synthetic-terminal-import-one@portal.test",
        "synthetic-terminal-import-two@portal.test",
      ])
        assert(
          await one(
            f.db,
            "SELECT email FROM registrations WHERE email=?",
            email,
          ),
        );
      assert.deepEqual(
        asPlain(
          await rows(
            f.db,
            "SELECT * FROM registrations WHERE email='bob@portal.test'",
          ),
        ),
        existing,
      );
      await assert.rejects(f.service("carol").view("/profile"), {
        code: "PARTICIPANT_REMOVED",
      });
    } finally {
      await f.db.close();
    }
  });

  test(`${engine}: terminal cascade adds no approval/check-in gates and preserves legacy soft restore contracts`, async () => {
    const f = await fixture(engine, false);
    try {
      await f
        .service("bob")
        .command("lock-team", { confirmation: "LOCK_TEAM" });
      await batch(f.db, [
        [
          "UPDATE registrations SET status='pending' WHERE email IN ('bob@portal.test','carol@portal.test','dave@portal.test')",
        ],
      ]);
      const response = await f.service().command("admin-delete-team", {
        teamId: "fake_team3",
        confirmation: "DELETE_TEAM",
      });
      assert.equal(response.changed, true);
      assert(await one(f.db, "SELECT id FROM users WHERE id='fake_bob'"));
      await f.service().command("participant-deactivate", {
        userId: "fake_pending",
        confirmation: "REMOVE_PARTICIPANT",
      });
      await f.service().command("participant-restore", {
        userId: "fake_pending",
        confirmation: "RESTORE_PARTICIPANT",
      });
      assert.equal((await f.service("pending").actor()).deactivated, false);
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: stale profile mutation cannot recreate participant data after terminal deletion`, async () => {
    const f = await fixture(engine, false);
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r)),
      gate = new Promise<void>((r) => (release = r));
    let pending: Promise<unknown> | undefined;
    try {
      const person = f.service("carol"),
        original = person.mutate.bind(person);
      person.mutate = async (...args) => {
        entered();
        await gate;
        return original(...args);
      };
      pending = person.command("complete-profile", {
        displayName: "Never restored",
        gender: "non-binary",
        bio: "Synthetic stale content must never reappear",
        phone: "+12025550100",
      });
      await ready;
      await f.service().command("admin-delete-participant", personDelete());
      release();
      await assert.rejects(pending);
      assert.equal(
        (await rows(f.db, "SELECT * FROM profiles WHERE user_id='fake_carol'"))
          .length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM participant_profiles WHERE user_id='fake_carol'",
          )
        ).length,
        0,
      );
      await assert.rejects(f.service("carol").view("/profile"), {
        code: "PARTICIPANT_REMOVED",
      });
      const audit = await rows(
        f.db,
        "SELECT detail,reason FROM audit_logs WHERE action='admin-delete-participant'",
      );
      for (const privateText of [
        "carol@portal.test",
        "Never restored",
        "+12025550100",
      ])
        assert(!JSON.stringify(audit).includes(privateText));
    } finally {
      release?.();
      await pending?.catch(() => {});
      await f.db.close();
    }
  });

  test(`${engine}: explicit team deletion atomically erases locked three-attempt content/dependencies, releases members, preserves unrelated records and durable attempt count`, async () => {
    const f = await fixture(engine);
    try {
      await enrichTarget(f.db);
      const stable = await stableOtherProject(f.db);
      const people = asPlain(
        await rows(f.db, "SELECT * FROM participant_profiles ORDER BY user_id"),
      );
      const audit = asPlain(
        await rows(f.db, "SELECT * FROM audit_logs ORDER BY id"),
      );
      const result = await f.service().command("admin-delete-team", teamDelete);
      assert.equal(result.changed, true);
      for (const [table, column, target] of [
        ["teams", "id", "fake_team5"],
        ["memberships", "team_id", "fake_team5"],
        ["ideas", "team_id", "fake_team5"],
        ["idea_revisions", "team_id", "fake_team5"],
        ["team_locks", "team_id", "fake_team5"],
        ["submission_versions", "team_id", "fake_team5"],
        ["projects", "id", "visual_project_eve"],
        ["project_commit_receipts", "team_id", "fake_team5"],
        ["reviews", "team_id", "fake_team5"],
        ["votes", "team_id", "fake_team5"],
        ["feedback", "team_id", "fake_team5"],
        ["human_scores", "team_id", "fake_team5"],
        ["judge_assignments", "team_id", "fake_team5"],
        ["tie_resolutions", "team_id", "fake_team5"],
        ["project_review_history", "project_id", "visual_project_eve"],
        ["evaluation_runs", "project_id", "visual_project_eve"],
        ["eligibility_history", "project_id", "visual_project_eve"],
        ["repository_evidence", "project_id", "visual_project_eve"],
        ["project_eligibility", "project_id", "visual_project_eve"],
        ["project_comments", "project_id", "visual_project_eve"],
        ["project_upvotes", "project_id", "visual_project_eve"],
      ])
        assert.equal(
          (await one<{ n: number }>(
            f.db,
            `SELECT count(*) n FROM ${table} WHERE ${column}=?`,
            target,
          ))!.n,
          0,
          table,
        );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM astra_jobs WHERE id LIKE 'cascade-job-%'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM project_feedback_reviews WHERE id='cascade-feedback-review'",
          )
        ).length,
        0,
      );
      assert.deepEqual(await stableOtherProject(f.db), stable);
      assert.deepEqual(
        asPlain(
          await rows(
            f.db,
            "SELECT * FROM participant_profiles ORDER BY user_id",
          ),
        ),
        people,
      );
      assert.equal(
        (await one(
          f.db,
          "SELECT attempts FROM submission_attempt_ledger WHERE team_id='fake_team5'",
        ))!.attempts,
        3,
      );
      assert.equal((await rows(f.db, "SELECT * FROM write_guards")).length, 0);
      const after = await rows<any>(
        f.db,
        "SELECT * FROM audit_logs ORDER BY id",
      );
      for (const old of audit)
        assert.deepEqual(asPlain(after.find((a) => a.id === old.id)), old);
      const terminal = after.find((a) => a.action === "admin-delete-team");
      assert(terminal);
      for (const value of [
        "SYNTHETIC-PRIVATE-IDEA",
        "Synthetic private judge notes",
        "alice@portal.test",
        "SYNTHETIC-NOT-REDEEMABLE-VOUCHER",
      ])
        assert(!JSON.stringify(terminal).includes(value));
      await assert.rejects(
        f.service().command("restore-removed-team", {
          teamId: "fake_team5",
          confirmation: "RESTORE_TEAM",
        }),
        { code: "RECORD_PERMANENTLY_DELETED" },
      );
      await assert.rejects(
        batch(f.db, [
          [
            "INSERT INTO teams VALUES('fake_team5','Reused team','fake_eve','',?)",
            new Date().toISOString(),
          ],
        ]),
        /RECORD_PERMANENTLY_DELETED/,
      );
      await assert.rejects(
        batch(f.db, [
          ["DELETE FROM submission_attempt_ledger WHERE team_id='fake_team5'"],
        ]),
        /SUBMISSION_ATTEMPTS_IMMUTABLE/,
      );
      await assert.rejects(
        batch(f.db, [
          [
            "UPDATE submission_attempt_ledger SET attempts=1 WHERE team_id='fake_team5'",
          ],
        ]),
        /SUBMISSION_ATTEMPTS_IMMUTABLE/,
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: deleting the leader deletes only their team/content, keeps every other member as a teamless participant and retains audit identity`, async () => {
    const f = await fixture(engine);
    try {
      await enrichTarget(f.db);
      const stable = await stableOtherProject(f.db);
      const members = await rows<{ user_id: string }>(
        f.db,
        "SELECT user_id FROM memberships WHERE team_id='fake_team5' AND user_id<>'fake_eve'",
      );
      const profiles = await Promise.all(
        members.map((m) =>
          rows(f.db, "SELECT * FROM profiles WHERE user_id=?", m.user_id),
        ),
      );
      await f
        .service()
        .command("admin-delete-participant", personDelete("fake_eve"));
      assert.equal(
        (await rows(f.db, "SELECT * FROM teams WHERE id='fake_team5'")).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM submission_versions WHERE team_id='fake_team5'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM participant_profiles WHERE user_id='fake_eve'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM registrations WHERE email='eve@portal.test'",
          )
        ).length,
        0,
      );
      for (let i = 0; i < members.length; i++) {
        assert.deepEqual(
          await rows(
            f.db,
            "SELECT * FROM profiles WHERE user_id=?",
            members[i].user_id,
          ),
          profiles[i],
        );
        assert.equal(
          (
            await rows(
              f.db,
              "SELECT * FROM memberships WHERE user_id=?",
              members[i].user_id,
            )
          ).length,
          0,
        );
        assert(
          await one(
            f.db,
            "SELECT id FROM users WHERE id=?",
            members[i].user_id,
          ),
        );
      }
      assert.deepEqual(await stableOtherProject(f.db), stable);
      assert.equal(
        (await one(
          f.db,
          "SELECT attempts FROM submission_attempt_ledger WHERE team_id='fake_team5'",
        ))!.attempts,
        3,
      );
      assert.equal(
        (await one(f.db, "SELECT name FROM users WHERE id='fake_eve'"))!.name,
        "Deleted participant",
      );
      const request = new Request(
        "https://portal.test/api/portal?view=%2Fprofile",
      );
      const response = await handlePortal(request, {
        db: f.db,
        identity: fixtures.eve,
        key: LOCAL_CREDIT_KEY,
      });
      assert.equal(response.status, 403);
      assert.equal(
        ((await response.json()) as any).code,
        "PARTICIPANT_REMOVED",
      );
      assert.equal(
        (await rows(f.db, "SELECT * FROM profiles WHERE user_id='fake_eve'"))
          .length,
        0,
      );
      await assert.rejects(
        f.service().command("participant-restore", {
          userId: "fake_eve",
          confirmation: "RESTORE_PARTICIPANT",
        }),
        { code: "RECORD_PERMANENTLY_DELETED" },
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: nonleader deletion leaves locked team, crown, idea and unrelated projects intact; personal assigned codes retire forever`, async () => {
    const f = await fixture(engine);
    try {
      await f
        .service("bob")
        .command("lock-team", { confirmation: "LOCK_TEAM" });
      const stable = await stableOtherProject(f.db);
      const team = asPlain(
        await rows(f.db, "SELECT * FROM teams WHERE id='fake_team3'"),
      );
      const idea = asPlain(
        await rows(f.db, "SELECT * FROM ideas WHERE team_id='fake_team3'"),
      );
      const lock = asPlain(
        await rows(f.db, "SELECT * FROM team_locks WHERE team_id='fake_team3'"),
      );
      const now = new Date().toISOString();
      await batch(f.db, [
        ["INSERT INTO check_ins VALUES('fake_carol','fake_admin',?)", now],
        [
          "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) VALUES('cascade-carol-code','fake_credit','','cascade-carol-fingerprint',?,'SYNTHETIC-CASCADE-NEVER-REDEEM')",
          now,
        ],
        [
          "INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email) VALUES('cascade-carol-code','fake_credit','fake_carol',?,'carol@portal.test')",
          now,
        ],
      ]);
      await f.service().command("admin-delete-participant", personDelete());
      assert.deepEqual(
        asPlain(await rows(f.db, "SELECT * FROM teams WHERE id='fake_team3'")),
        team,
      );
      assert.deepEqual(
        asPlain(
          await rows(f.db, "SELECT * FROM ideas WHERE team_id='fake_team3'"),
        ),
        idea,
      );
      assert.deepEqual(
        asPlain(
          await rows(
            f.db,
            "SELECT * FROM team_locks WHERE team_id='fake_team3'",
          ),
        ),
        lock,
      );
      assert.deepEqual(await stableOtherProject(f.db), stable);
      assert(
        await one(
          f.db,
          "SELECT user_id FROM memberships WHERE user_id='fake_bob' AND team_id='fake_team3'",
        ),
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM memberships WHERE user_id='fake_carol'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_allocations WHERE user_id='fake_carol'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_inventory WHERE id='cascade-carol-code'",
          )
        ).length,
        0,
      );
      assert.equal(
        (await one(
          f.db,
          "SELECT assigned FROM credit_code_history WHERE fingerprint='cascade-carol-fingerprint'",
        ))!.assigned,
        1,
      );
      await assert.rejects(
        batch(f.db, [
          [
            "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) VALUES('cascade-recycle','fake_credit','','cascade-carol-fingerprint',?,'SYNTHETIC')",
            now,
          ],
        ]),
        /CREDIT_CODE_RETIRED/,
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: strict single-target confirmation, real staff authorization and protected owner/self/staff accounts`, async () => {
    const f = await fixture(engine, false);
    try {
      for (const who of ["alice", "bob", "judge", "stranger"])
        await assert.rejects(
          f.service(who).command("admin-delete-team", {
            teamId: "fake_team3",
            confirmation: "DELETE_TEAM",
          }),
        );
      for (const input of [
        { ...personDelete(), confirmation: "REMOVE_PARTICIPANT" },
        { userId: "fake_carol", confirmation: "DELETE_PARTICIPANT" },
        {
          userId: ["fake_carol", "fake_dave"],
          expectedLeaderTeamIds: [],
          confirmation: "DELETE_PARTICIPANT",
        },
        {
          ...personDelete(),
          reason: "Not accepted",
        },
        {
          ...personDelete(),
          userIds: ["fake_dave"],
        },
      ])
        await assert.rejects(
          f.service().command("admin-delete-participant", input),
        );
      for (const target of ["fake_admin", "fake_judge"])
        await assert.rejects(
          f.service().command("admin-delete-participant", personDelete(target)),
          { code: "PROTECTED_ACCOUNT" },
        );
      await batch(f.db, [
        [
          "INSERT INTO users(id,email,name,role,created_at) VALUES('synthetic-configured-owner',?,'Owner','participant',?)",
          OWNER_EMAIL,
          new Date().toISOString(),
        ],
      ]);
      await assert.rejects(
        f
          .service()
          .command(
            "admin-delete-participant",
            personDelete("synthetic-configured-owner"),
          ),
        { code: "PROTECTED_ACCOUNT" },
      );
      assert.equal(
        (await rows(f.db, "SELECT * FROM terminal_record_deletions")).length,
        0,
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: injected mid-cascade failure rolls back every deletion, guard, tombstone and audit`, async () => {
    const f = await fixture(engine);
    try {
      await enrichTarget(f.db);
      const stable = asPlain(
        await Promise.all(
          [
            "teams",
            "projects",
            "submission_versions",
            "project_commit_receipts",
            "team_locks",
            "memberships",
            "audit_logs",
            "record_removals",
            "terminal_record_deletions",
            "submission_attempt_ledger",
          ].map((t) => rows(f.db, `SELECT * FROM ${t} ORDER BY 1`)),
        ),
      );
      const admin = f.service();
      const original = admin.mutate.bind(admin);
      admin.mutate = (actor, action, entity, sql, detail, why) =>
        original(
          actor,
          action,
          entity,
          [
            ...sql.slice(0, 12),
            ["INSERT INTO table_that_does_not_exist VALUES(1)"],
            ...sql.slice(12),
          ],
          detail,
          why,
        );
      await assert.rejects(admin.command("admin-delete-team", teamDelete));
      assert.deepEqual(
        asPlain(
          await Promise.all(
            [
              "teams",
              "projects",
              "submission_versions",
              "project_commit_receipts",
              "team_locks",
              "memberships",
              "audit_logs",
              "record_removals",
              "terminal_record_deletions",
              "submission_attempt_ledger",
            ].map((t) => rows(f.db, `SELECT * FROM ${t} ORDER BY 1`)),
          ),
        ),
        stable,
      );
      assert.equal((await rows(f.db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: concurrent replay commits one deletion audit; frozen results and ordinary immutable deletes remain protected`, async () => {
    const f = await fixture(engine);
    try {
      const before = await stableOtherProject(f.db);
      const outputs = await Promise.all([
        f.service().command("admin-delete-team", teamDelete),
        f.service("owner").command("admin-delete-team", teamDelete),
      ]);
      assert.equal(outputs.filter((x) => x.changed === true).length, 1);
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM audit_logs WHERE action='admin-delete-team'",
          )
        ).length,
        1,
      );
      assert.deepEqual(await stableOtherProject(f.db), before);
      await assert.rejects(
        batch(f.db, [
          ["DELETE FROM submission_versions WHERE team_id='fake_team1'"],
        ]),
        /IMMUTABLE/,
      );
      await assert.rejects(
        batch(f.db, [["DELETE FROM audit_logs"]]),
        /IMMUTABLE/,
      );
      await batch(f.db, [
        [
          "INSERT INTO result_snapshots SELECT 'cascade-frozen',e.version,r.version,'{}',?,'fake_owner' FROM event_settings e CROSS JOIN scoring_revision r WHERE e.id=1 AND r.id=1",
          new Date().toISOString(),
        ],
      ]);
      const stable = await stableOtherProject(f.db);
      await assert.rejects(
        f
          .service()
          .command("admin-delete-participant", personDelete("fake_alice")),
        { code: "RESULTS_FROZEN" },
      );
      assert.deepEqual(await stableOtherProject(f.db), stable);
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM terminal_record_deletions WHERE target_id='fake_alice'",
          )
        ).length,
        0,
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: role revocation and new crown between read and transaction deny stale deletion without partial data loss`, async () => {
    const f = await fixture(engine);
    try {
      const admin = f.service();
      const original = admin.mutate.bind(admin);
      let once = true;
      admin.mutate = async (...args) => {
        if (once) {
          once = false;
          await batch(f.db, [
            [
              "INSERT INTO portal_roles VALUES('fake_admin','participant','fake_owner',?) ON CONFLICT(user_id) DO UPDATE SET role='participant'",
              new Date().toISOString(),
            ],
          ]);
        }
        return original(...args);
      };
      await assert.rejects(admin.command("admin-delete-team", teamDelete), {
        code: "ADMIN_REQUIRED",
      });
      assert(await one(f.db, "SELECT id FROM teams WHERE id='fake_team5'"));
      const owner = f.service("owner"),
        originalOwner = owner.mutate.bind(owner);
      once = true;
      owner.mutate = async (...args) => {
        if (once) {
          once = false;
          await f.service("owner").command("transfer-team-leader", {
            teamId: "fake_team3",
            userId: "fake_carol",
            expectedLeaderId: "fake_bob",
            confirmation: "TRANSFER_TEAM_LEADER",
          });
        }
        return originalOwner(...args);
      };
      await assert.rejects(
        owner.command("admin-delete-participant", personDelete()),
        { code: "DELETION_TARGET_CHANGED" },
      );
      assert(await one(f.db, "SELECT id FROM users WHERE id='fake_carol'"));
      assert(
        await one(
          f.db,
          "SELECT user_id FROM memberships WHERE user_id='fake_carol'",
        ),
      );
      assert.equal(
        (await rows(f.db, "SELECT * FROM terminal_record_deletions")).length,
        0,
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: late provider completion cannot recreate jobs, reports or project data after terminal cascade`, async () => {
    const f = await fixture(engine);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      ready = new Promise<void>((r) => (entered = r));
    let pending: Promise<any> | undefined;
    try {
      const now = new Date().toISOString();
      await batch(f.db, [
        [
          "INSERT INTO astra_jobs(id,version_id,updated_at) VALUES('cascade-inflight','visual_eve_v3',?)",
          now,
        ],
      ]);
      f.clock(new Date(Date.now() + 3 * 86400000).toISOString());
      const admin = f.service();
      admin.evaluator = {
        provenance: "provider",
        available: true,
        configuration: "synthetic-cascade-provider",
        async evaluate(versionId) {
          entered();
          await gate;
          return {
            versionId,
            status: "needs_review",
            model: "synthetic-cascade-provider",
            rubricVersion: 1,
            revision: "unverified",
            checks: [],
            dimensions: null,
            suspectedFalseClaims: [],
          };
        },
      };
      pending = admin.command("astra-run", { jobId: "cascade-inflight" });
      await ready;
      await f.service("owner").command("admin-delete-team", teamDelete);
      release();
      await pending;
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM astra_jobs WHERE id='cascade-inflight'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM evaluation_runs WHERE project_id='visual_project_eve'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM projects WHERE id='visual_project_eve'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM submission_versions WHERE team_id='fake_team5'",
          )
        ).length,
        0,
      );
    } finally {
      release?.();
      await pending?.catch(() => {});
      await f.db.close();
    }
  });
}
