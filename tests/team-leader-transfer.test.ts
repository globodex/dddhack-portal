import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, attend, submission } from "./helpers";
import { batch, one, rows } from "../lib/db";
import { transferTeamLeader } from "../lib/team-leader-transfer";
import { submissionAccess } from "../lib/team-access";
import { PortalService } from "../lib/service";

async function freeze(db: Awaited<ReturnType<typeof setup>>["db"]) {
  await batch(db, [
    [
      "INSERT INTO result_snapshots(id,policy_version,source_revision,payload,created_at,frozen_by) SELECT 'fake_transfer_snapshot',1,version,'{}','2026-11-01T12:30:00Z','fake_admin' FROM scoring_revision WHERE id=1",
    ],
  ]);
}

const transfer = (userId = "fake_carol", expectedLeaderId = "fake_bob") => ({
  teamId: "fake_team3",
  userId,
  expectedLeaderId,
  confirmation: "TRANSFER_TEAM_LEADER" as const,
});

test("admin crown transfer changes exactly one leader and records only safe identities", async () => {
  const { db, service } = await setup();
  try {
    await batch(db, [
      [
        "UPDATE participant_profiles SET display_name=? WHERE user_id=?",
        "Chosen Carol",
        "fake_carol",
      ],
    ]);
    const before = await one<any>(
      db,
      "SELECT * FROM teams WHERE id='fake_team3'",
    );
    const preserved = await Promise.all(
      [
        "memberships",
        "ideas",
        "team_locks",
        "submission_versions",
        "project_commit_receipts",
      ].map((table) => rows(db, `SELECT * FROM ${table} ORDER BY 1`)),
    );
    assert.equal((await rows(db, "SELECT * FROM check_ins")).length, 0);
    const result = await transferTeamLeader(service("admin"), transfer());
    assert.equal(result.leaderId, "fake_carol");
    assert.deepEqual(
      { ...(await one(db, "SELECT * FROM teams WHERE id='fake_team3'")) },
      { ...before, leader_id: "fake_carol" },
    );
    assert.deepEqual(
      await Promise.all(
        [
          "memberships",
          "ideas",
          "team_locks",
          "submission_versions",
          "project_commit_receipts",
        ].map((table) => rows(db, `SELECT * FROM ${table} ORDER BY 1`)),
      ),
      preserved,
    );
    const audit = await one<{ detail: string; entity_id: string }>(
      db,
      "SELECT detail,entity_id FROM audit_logs WHERE action='transfer-team-leader'",
    );
    assert.equal(audit?.entity_id, "fake_team3");
    assert.deepEqual(JSON.parse(audit!.detail), {
      team: { id: "fake_team3", name: "Common Ground" },
      oldLeader: { id: "fake_bob", name: "Bob" },
      newLeader: { id: "fake_carol", name: "Chosen Carol" },
      membershipPreserved: true,
      lockPreserved: true,
    });
    for (const privateValue of [
      "+12025550100",
      "A fake private core idea.",
      "A local rehearsal description.",
    ])
      assert.ok(!audit!.detail.includes(privateValue));
    assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    await transferTeamLeader(
      service("owner"),
      transfer("fake_dave", "fake_carol"),
    );
    assert.equal(
      (await one<any>(db, "SELECT leader_id FROM teams WHERE id='fake_team3'"))!
        .leader_id,
      "fake_dave",
    );
  } finally {
    db.close();
  }
});

test("participants, current leaders and judges cannot use staff crown transfer", async () => {
  const { db, service } = await setup();
  try {
    await assert.rejects(
      transferTeamLeader(new PortalService(db, null, undefined), transfer()),
      { code: "SIGN_IN_REQUIRED" },
    );
    for (const actor of ["bob", "carol", "judge", "stranger"])
      await assert.rejects(transferTeamLeader(service(actor), transfer()), {
        code: "ADMIN_REQUIRED",
      });
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM audit_logs WHERE action='transfer-team-leader'",
        )
      ).length,
      0,
    );
    assert.equal(
      (await one<any>(db, "SELECT leader_id FROM teams WHERE id='fake_team3'"))!
        .leader_id,
      "fake_bob",
    );
  } finally {
    db.close();
  }
});

test("staff permission is rechecked after a prior authorized read", async () => {
  const { db, service } = await setup();
  try {
    const admin = service("admin");
    await admin.staff();
    await batch(db, [
      [
        "INSERT INTO portal_roles(user_id,role,granted_by,updated_at) VALUES('fake_admin','participant','fake_owner','2026-10-23T10:00:00Z')",
      ],
    ]);
    await assert.rejects(transferTeamLeader(admin, transfer()), {
      code: "ADMIN_REQUIRED",
    });
    await batch(db, [
      ["UPDATE portal_roles SET role='admin' WHERE user_id='fake_admin'"],
    ]);
    await transferTeamLeader(admin, transfer());
    assert.equal(
      (await one<any>(db, "SELECT leader_id FROM teams WHERE id='fake_team3'"))!
        .leader_id,
      "fake_carol",
    );
  } finally {
    db.close();
  }
});

test("frozen results reject crown transfer without changing the team or audit", async () => {
  const { db, service } = await setup();
  try {
    await freeze(db);
    await assert.rejects(transferTeamLeader(service("admin"), transfer()), {
      code: "RESULTS_FROZEN",
    });
    assert.equal(
      (await one<any>(db, "SELECT leader_id FROM teams WHERE id='fake_team3'"))!
        .leader_id,
      "fake_bob",
    );
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM audit_logs WHERE action='transfer-team-leader'",
        )
      ).length,
      0,
    );
  } finally {
    db.close();
  }
});

test("transfer rejects outsiders, removed teammates, stale crowns and missing confirmations", async () => {
  const { db, service } = await setup();
  try {
    await assert.rejects(
      transferTeamLeader(service("admin"), transfer("fake_alice")),
      { code: "CURRENT_TEAMMATE_REQUIRED" },
    );
    await assert.rejects(
      transferTeamLeader(service("admin"), transfer("fake_bob")),
      { code: "ALREADY_TEAM_LEADER" },
    );
    await assert.rejects(
      transferTeamLeader(service("admin"), transfer("fake_carol", "fake_dave")),
      { code: "TEAM_LEADER_CHANGED" },
    );
    await assert.rejects(
      transferTeamLeader(service("admin"), {
        ...transfer(),
        confirmation: "wrong",
      }),
    );
    await assert.rejects(
      transferTeamLeader(service("admin"), {
        ...transfer(),
        phone: "+12025550100",
      }),
    );
    await batch(db, [
      [
        "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('participant','fake_carol',1,'Synthetic removal','fake_admin','2026-10-23T10:00:00Z')",
      ],
    ]);
    await assert.rejects(transferTeamLeader(service("admin"), transfer()), {
      code: "CURRENT_TEAMMATE_REQUIRED",
    });
    await batch(db, [
      [
        "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('team','fake_team3',1,'Synthetic removal','fake_admin','2026-10-23T10:00:00Z')",
      ],
    ]);
    await assert.rejects(
      transferTeamLeader(service("admin"), transfer("fake_dave")),
      { code: "TEAM_NOT_FOUND" },
    );
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM audit_logs WHERE action='transfer-team-leader'",
        )
      ).length,
      0,
    );
  } finally {
    db.close();
  }
});

for (const race of ["membership", "removed", "leader", "frozen"] as const) {
  test(`atomic crown CAS rolls back its guard and audit after concurrent ${race} change`, async () => {
    const { db, service } = await setup();
    try {
      const admin = service("admin"),
        mutate = admin.mutate.bind(admin);
      admin.mutate = async (...args: Parameters<typeof admin.mutate>) => {
        // Model another committed operation after validation but before our batch.
        if (race === "membership")
          await batch(db, [
            ["DELETE FROM memberships WHERE user_id='fake_carol'"],
          ]);
        if (race === "removed")
          await batch(db, [
            [
              "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('participant','fake_carol',1,'Synthetic concurrent removal','fake_admin','2026-10-23T10:00:00Z')",
            ],
          ]);
        if (race === "leader")
          await batch(db, [
            ["UPDATE teams SET leader_id='fake_dave' WHERE id='fake_team3'"],
          ]);
        if (race === "frozen") await freeze(db);
        return mutate(...args);
      };
      await assert.rejects(
        transferTeamLeader(admin, transfer()),
        /CHECK constraint/,
      );
      assert.equal(
        (await one<any>(
          db,
          "SELECT leader_id FROM teams WHERE id='fake_team3'",
        ))!.leader_id,
        race === "leader" ? "fake_dave" : "fake_bob",
      );
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM audit_logs WHERE action='transfer-team-leader'",
          )
        ).length,
        0,
      );
    } finally {
      db.close();
    }
  });
}

test("audit failure rolls back the crown change and temporary guard together", async () => {
  const { db, service } = await setup();
  try {
    db.raw.exec(
      "CREATE TRIGGER synthetic_transfer_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action='transfer-team-leader' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_AUDIT_FAILURE'); END;",
    );
    await assert.rejects(
      transferTeamLeader(service("admin"), transfer()),
      /SYNTHETIC_AUDIT_FAILURE/,
    );
    assert.equal(
      (await one<any>(db, "SELECT leader_id FROM teams WHERE id='fake_team3'"))!
        .leader_id,
      "fake_bob",
    );
    assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM audit_logs WHERE action='transfer-team-leader'",
        )
      ).length,
      0,
    );
  } finally {
    db.close();
  }
});

test("locked crown guard permits no other fields, outsiders or mismatched transfer tuple", async () => {
  const { db, service } = await setup();
  try {
    await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
    const original = await rows(
      db,
      "SELECT * FROM teams WHERE id='fake_team3'",
    );
    const guard =
      "admin-leader-transfer:" +
      JSON.stringify(["fake_team3", "fake_bob", "fake_carol"]);
    await assert.rejects(
      batch(db, [
        ["UPDATE teams SET leader_id='fake_carol' WHERE id='fake_team3'"],
      ]),
      /TEAM_LOCKED/,
    );
    for (const update of [
      "UPDATE teams SET leader_id='fake_carol',name='common ground' WHERE id='fake_team3'",
      "UPDATE teams SET leader_id='fake_carol',bio='Changed bio' WHERE id='fake_team3'",
      "UPDATE teams SET leader_id='fake_dave' WHERE id='fake_team3'",
    ])
      await assert.rejects(
        batch(db, [
          ["INSERT INTO write_guards VALUES(?,1)", guard],
          [update],
          ["DELETE FROM write_guards WHERE token=?", guard],
        ]),
        /TEAM_LOCKED/,
      );
    const outsiderGuard =
      "admin-leader-transfer:" +
      JSON.stringify(["fake_team3", "fake_bob", "fake_alice"]);
    await assert.rejects(
      batch(db, [
        ["INSERT INTO write_guards VALUES(?,1)", outsiderGuard],
        ["UPDATE teams SET leader_id='fake_alice' WHERE id='fake_team3'"],
        ["DELETE FROM write_guards WHERE token=?", outsiderGuard],
      ]),
      /TEAM_LOCKED/,
    );
    assert.deepEqual(
      await rows(db, "SELECT * FROM teams WHERE id='fake_team3'"),
      original,
    );
    assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
  } finally {
    db.close();
  }
});

test("locked absent-leader transfer preserves lock and history; only personally checked-in new leader can continue", async () => {
  const { db, service, clock } = await setup();
  try {
    await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
    const lock = await rows(
      db,
      "SELECT * FROM team_locks WHERE team_id='fake_team3'",
    );
    const idea = await rows(
      db,
      "SELECT * FROM ideas WHERE team_id='fake_team3'",
    );
    await activate(db);
    await attend(db, "fake_bob");
    clock("2026-11-01T04:00:00.000Z");
    const project = {
      projectName: "Synthetic crown handoff",
      problemSolution: submission.problemSolution,
      description: submission.description,
      github: submission.github,
      demo: "",
      logo: submission.logo,
      banner: submission.banner,
      tools: submission.tools,
      attestation: true,
    };
    await service("bob").command("submit-project", { revision: 0, project });
    const firstVersion = await rows(
      db,
      "SELECT * FROM submission_versions WHERE team_id='fake_team3'",
    );
    await transferTeamLeader(service("admin"), transfer());
    assert.deepEqual(
      await rows(db, "SELECT * FROM team_locks WHERE team_id='fake_team3'"),
      lock,
    );
    assert.deepEqual(
      await rows(db, "SELECT * FROM ideas WHERE team_id='fake_team3'"),
      idea,
    );
    assert.deepEqual(
      await rows(
        db,
        "SELECT * FROM submission_versions WHERE team_id='fake_team3'",
      ),
      firstVersion,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM memberships WHERE team_id='fake_team3'"))
        .length,
      3,
    );
    assert.equal(
      (await submissionAccess(service("carol"), "fake_team3"))
        .personallyCheckedIn,
      false,
    );
    await assert.rejects(
      service("bob").command("submit-project", { revision: 1, project }),
      { code: "LEADER_REQUIRED" },
    );
    await assert.rejects(
      service("carol").command("submit-project", { revision: 1, project }),
      { code: "LEADER_CHECKIN_REQUIRED" },
    );
    await attend(db, "fake_carol");
    await service("carol").command("submit-project", {
      revision: 1,
      project: {
        ...project,
        description: "Synthetic second version after personal check-in.",
      },
    });
    await service("carol").command("submit-project", {
      revision: 2,
      project: {
        ...project,
        description: "Synthetic third version remains the final attempt.",
      },
    });
    const finalVersions = await rows(
      db,
      "SELECT * FROM submission_versions WHERE team_id='fake_team3' ORDER BY attempt",
    );
    await transferTeamLeader(
      service("owner"),
      transfer("fake_dave", "fake_carol"),
    );
    await attend(db, "fake_dave");
    const access = await submissionAccess(service("dave"), "fake_team3");
    assert.equal(access.attemptsUsed, 3);
    assert.equal(access.canCommit, false);
    await assert.rejects(
      service("dave").command("submit-project", {
        revision: 3,
        project: { ...project, description: "Fourth attempt forbidden." },
      }),
      /THIRD_SUBMISSION|SUBMISSION_LIMIT|read-only|three|Three/,
    );
    assert.deepEqual(
      await rows(
        db,
        "SELECT * FROM submission_versions WHERE team_id='fake_team3' ORDER BY attempt",
      ),
      finalVersions,
    );
    assert.deepEqual(
      await rows(db, "SELECT * FROM team_locks WHERE team_id='fake_team3'"),
      lock,
    );
    await assert.rejects(
      batch(db, [
        ["UPDATE teams SET name='Forbidden rename' WHERE id='fake_team3'"],
      ]),
      /TEAM_LOCKED/,
    );
    await assert.rejects(
      batch(db, [["DELETE FROM memberships WHERE user_id='fake_bob'"]]),
      /TEAM_LOCKED/,
    );
  } finally {
    db.close();
  }
});
