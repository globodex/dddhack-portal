import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { PortalService } from "../lib/service";
import { PortalExperience } from "../lib/experience";
import { teamFacts, personFacts } from "../lib/directory-facts";
import { teamStatus, personStatus } from "../lib/portal-status";
import { draftPolicy } from "../lib/policy";
import { type Database, rows } from "../lib/db";
import {
  makeLoad300,
  seedLoad300,
  projectPayload,
} from "../scripts/load-300-fixtures.mjs";

const now = "2026-11-01T04:00:00.000Z";
async function fixture() {
  const db = new LocalDatabase(":memory:");
  db.migrate();
  const fixture = makeLoad300();
  await seedLoad300(db, fixture, draftPolicy, new Date(now));
  const service = (actor = fixture.operations[0], database: Database = db) =>
    new PortalService(
      database,
      { ...actor, source: "sites" },
      undefined,
      () => now,
    );
  return { db, fixture, service };
}

test("300-person / 90-team directories use bounded queries and preserve private/public projections", async (t) => {
  const { db, fixture: f, service } = await fixture();
  let statements = 0;
  const measured: Database = {
    prepare(sql) {
      statements++;
      return db.prepare(sql);
    },
    batch: (statements) => db.batch(statements),
  };
  try {
    for (const [route, expected] of [
      ["/admin/participants", 302],
      ["/admin/teams", 90],
      ["/discover/teams", 90],
    ] as const) {
      statements = 0;
      const response = (await service(f.operations[0], measured).view(
        route,
      )) as Record<string, any>;
      assert.equal(response.items.length, expected);
      assert.ok(statements < 25, `${route} used ${statements} SQL statements`);
      t.diagnostic(
        `${route}: ${statements} SQL statements on the unchanged 300/90 assignment`,
      );
      if (route === "/discover/teams") {
        assert.equal(
          response.items.reduce(
            (n: number, team: any) => n + team.readiness.total,
            0,
          ),
          300,
        );
        for (const team of response.items)
          assert.deepEqual(
            Object.keys(team).sort(),
            [
              "id",
              "name",
              "bio",
              "avatar",
              "palette",
              "locked",
              "status",
              "readiness",
              "requested",
              "members",
            ].sort(),
          );
        for (const team of response.items)
          for (const member of team.members)
            assert.deepEqual(
              Object.keys(member).sort(),
              [
                "id",
                "name",
                "avatarColor",
                "avatarExpression",
                "profileUrl",
              ].sort(),
            );
        for (const secret of [
          "Synthetic private core",
          "+12025550100",
          "@load300.test",
          "Synthetic private description",
        ])
          assert.ok(!JSON.stringify(response.items).includes(secret));
      }
    }
    await assert.rejects(service(f.participants[0]).view("/admin/teams"), {
      code: "ADMIN_REQUIRED",
    });
    await assert.rejects(
      service(f.participants[0]).view("/admin/submissions"),
      { code: "REVIEWER_REQUIRED" },
    );
  } finally {
    db.close();
  }
});

test("bulk team facts match authoritative status, avoid fan-out and re-read attendance, override and soft-removal changes", async () => {
  const { db, fixture: f, service } = await fixture();
  try {
    const team = f.teams.find((team) => team.members.length === 5)!,
      leader = f.participants.find((p) => p.id === team.leaderId)!;
    const compare = async () => {
      const bulk = (
        await teamFacts(db, [team.id, team.id], f.participants[0].id)
      ).get(team.id)!;
      const { readiness, lockedAt, requested, ...status } = bulk;
      assert.deepEqual(status, await teamStatus(service(), team.id));
      assert.equal(readiness.total, 5);
      return bulk;
    };
    await db
      .prepare(
        "INSERT INTO team_actions VALUES('bulk_request',?,?, 'request','pending',?)",
      )
      .bind(team.id, f.participants[0].id, now)
      .all();
    assert.equal((await compare()).requested, true);
    await db
      .prepare("INSERT INTO team_locks VALUES(?,?,?)")
      .bind(team.id, leader.id, now)
      .all();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const s = service(leader),
        project = projectPayload(team, attempt);
      const workspace = (await s.view("/submission")) as Record<string, any>;
      await s.command("submit-project", {
        revision: workspace.project?.revision || 0,
        project,
      });
    }
    let fact = await compare();
    assert.equal(fact.attemptsUsed, 3);
    assert.equal(fact.checkedInMembers, 5);
    assert.equal(fact.derivedStatus, "Submitted");
    const project = (
      await rows<{ id: string; published_version_id: string }>(
        db,
        "SELECT id,published_version_id FROM projects WHERE team_id=?",
        team.id,
      )
    )[0];
    await db
      .prepare(
        "INSERT INTO project_eligibility VALUES(?,?,'ineligible','Synthetic private eligibility reason',?,?)",
      )
      .bind(project.id, project.published_version_id, f.operations[0].id, now)
      .all();
    await db
      .prepare(
        "INSERT INTO record_removals VALUES('submission',?,1,'Synthetic removal',?,?,'{}')",
      )
      .bind(project.published_version_id, f.operations[0].id, now)
      .all();
    await db
      .prepare("UPDATE registrations SET status='pending' WHERE email=?")
      .bind(leader.email)
      .all();
    fact = await compare();
    assert.equal(
      fact.attemptsUsed,
      3,
      "soft removal never refunds a historical attempt",
    );
    assert.equal(fact.checkedInMembers, 4);
    assert.equal(fact.readiness.approved, 4);
    assert.equal(fact.ineligible, true);
    await db
      .prepare(
        "INSERT INTO team_status_overrides VALUES(?,'Forming','Synthetic override',NULL,NULL,?,?)",
      )
      .bind(team.id, f.operations[0].id, now)
      .all();
    fact = await compare();
    assert.equal(
      fact.status,
      "Submitted",
      "A manual display override cannot hide committed submissions",
    );
    assert.equal(
      fact.manual,
      true,
      "The old override record remains preserved",
    );
    assert.equal(fact.derivedStatus, "Submitted");
    assert.equal(fact.locked, true);
    await db
      .prepare(
        "INSERT INTO teams VALUES('bulk_empty','Synthetic Empty',?,'',?)",
      )
      .bind(leader.id, now)
      .all();
    assert.deepEqual(
      (await teamFacts(db, ["bulk_empty"])).get("bulk_empty")?.readiness,
      { total: 0, approved: 0, allApproved: false, label: "No team yet" },
    );
  } finally {
    db.close();
  }
});

test("bulk people retain absence/override precedence, removal visibility and fresh next-request state", async () => {
  const { db, fixture: f, service } = await fixture();
  try {
    const person = f.participants[0],
      actor = f.operations[0];
    const compare = async () => {
      const result = (await personFacts(db, [person.id])).get(person.id)!;
      const { deactivatedAt, ...status } = result;
      assert.deepEqual(status, await personStatus(service(), person.id));
      return result;
    };
    assert.equal((await compare()).checkedIn, true);
    await db
      .prepare("INSERT INTO automatic_absences VALUES(?,?,'2026-11-01')")
      .bind(person.id, "2026-11-02T00:00:00.000Z")
      .all();
    assert.equal((await compare()).status, "Absent");
    await db
      .prepare(
        "INSERT INTO participant_status_overrides VALUES(?,'Going','Synthetic correction',?,?)",
      )
      .bind(person.id, actor.id, "2026-11-03T00:00:00.000Z")
      .all();
    assert.equal((await compare()).status, "Going");
    assert.equal((await compare()).checkedIn, false);
    await db
      .prepare(
        "UPDATE participant_status_overrides SET status='Checked in' WHERE user_id=?",
      )
      .bind(person.id)
      .all();
    assert.equal((await compare()).checkedIn, true);
    await db
      .prepare(
        "INSERT INTO record_removals VALUES('participant',?,1,'Synthetic removal',?,?,'{}')",
      )
      .bind(person.id, actor.id, now)
      .all();
    const removed = await compare();
    assert.equal(removed.checkedIn, false);
    assert.equal(removed.deactivatedAt, now);
    await db
      .prepare(
        "INSERT INTO registrations VALUES('unsigned@load300.test','approved',0)",
      )
      .all();
    await db
      .prepare(
        "INSERT INTO registration_absences VALUES('unsigned@load300.test',?,'2026-11-01')",
      )
      .bind(now)
      .all();
    const directory = await new PortalExperience(service()).participantRows();
    assert.equal(
      directory.find((row) => row.email === "unsigned@load300.test")?.status,
      "Absent",
    );
    assert.equal(
      directory.find((row) => row.id === person.id)?.deactivated_at,
      now,
    );
  } finally {
    db.close();
  }
});

test("submission lists batch immutable metadata while retaining assignment and removal boundaries", async () => {
  const { db, fixture: f, service } = await fixture();
  try {
    const committed: { id: string; versionId: string }[] = [];
    for (const team of f.teams.slice(0, 2)) {
      const leader = f.participants.find((p) => p.id === team.leaderId)!;
      await service(leader).command("submit-project", {
        revision: 0,
        project: projectPayload(team, 1),
      });
      committed.push(
        (
          await rows<{ id: string; versionId: string }>(
            db,
            "SELECT id,published_version_id versionId FROM projects WHERE team_id=?",
            team.id,
          )
        )[0],
      );
    }
    const [first, second] = committed;
    await db
      .prepare(
        "INSERT INTO record_removals VALUES('project',?,1,'Synthetic removal',?,?,'{}')",
      )
      .bind(first.id, f.operations[0].id, now)
      .all();
    await db
      .prepare(
        "INSERT INTO record_removals VALUES('submission',?,1,'Synthetic version removal',?,?,'{}')",
      )
      .bind(first.versionId, f.operations[0].id, now)
      .all();
    const admin = (await service().view("/admin/submissions")) as Record<
      string,
      any
    >;
    assert.equal(admin.items.length, 2);
    const removed = admin.items.find((item: any) => item.id === first.id);
    assert.equal(removed.deleted_at, now);
    assert.deepEqual(removed.versions, [
      { id: first.versionId, attempt: 1, deleted_at: now },
    ]);
    const judge = f.participants.find(
      (p) => !f.teams.slice(0, 2).some((team) => team.members.includes(p.id)),
    )!;
    await db
      .prepare("UPDATE users SET role='judge' WHERE id=?")
      .bind(judge.id)
      .all();
    await db
      .prepare("INSERT INTO project_assignments VALUES(?,?,'judge')")
      .bind(first.id, judge.id)
      .all();
    let review = (await service(judge).view("/review")) as Record<string, any>;
    assert.deepEqual(
      review.items.map((item: any) => item.id),
      [first.id],
    );
    assert.equal(review.items[0].versions, undefined);
    assert.ok(!JSON.stringify(review).includes(second.id));
    await db
      .prepare("DELETE FROM project_assignments WHERE user_id=?")
      .bind(judge.id)
      .all();
    review = (await service(judge).view("/review")) as Record<string, any>;
    assert.equal(review.items.length, 0);
  } finally {
    db.close();
  }
});
