import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { PortalService } from "../lib/service";
import { draftPolicy } from "../lib/policy";
import { type Database, rows } from "../lib/db";
import {
  makeLoad300,
  seedLoad300,
  projectPayload,
} from "../scripts/load-300-fixtures.mjs";

type View = Record<string, any>;
const now = "2026-11-01T04:00:00.000Z";
async function fixture() {
  const db = new LocalDatabase(":memory:");
  db.migrate();
  const f = makeLoad300();
  await seedLoad300(db, f, draftPolicy, new Date(now));
  for (const team of f.teams) {
    const id = "public_" + team.id,
      version = id + "_v1";
    const payload = JSON.stringify(projectPayload(team, 1));
    await db
      .prepare(
        "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES(?,?,?,?,1,?)",
      )
      .bind(id, team.id, "synthetic-" + team.index, payload, now)
      .all();
    await db
      .prepare("INSERT INTO submission_versions VALUES(?,?,1,?,?)")
      .bind(version, team.id, payload, now)
      .all();
    await db
      .prepare("UPDATE projects SET published_version_id=? WHERE id=?")
      .bind(version, id)
      .all();
    await db
      .prepare(
        "INSERT INTO project_eligibility VALUES(?,?,'eligible','Synthetic local decision',?,?)",
      )
      .bind(id, version, f.operations[0].id, now)
      .all();
  }
  let statements = 0;
  const measured: Database = {
    prepare(sql) {
      statements++;
      return db.prepare(sql);
    },
    batch: (statements) => db.batch(statements),
  };
  const service = (
    actor: (typeof f.participants)[number] | null = f.participants[0],
  ) =>
    new PortalService(
      measured,
      actor ? { ...actor, source: "sites" } : null,
      undefined,
      () => now,
    );
  return {
    db,
    f,
    service,
    count: () => statements,
    reset: () => {
      statements = 0;
    },
  };
}

test("same 300/90 public pages preserve pagination and use bounded request-local reads", async (t) => {
  const { db, service, count, reset } = await fixture();
  try {
    const ids: string[] = [];
    for (let page = 0; page < 4; page++) {
      reset();
      const view = (await service().view("/projects", { page })) as View;
      assert.equal(view.items.length, page === 3 ? 18 : 24);
      assert.equal(view.hasMore, page < 3);
      ids.push(...view.items.map((item: View) => item.id));
      t.diagnostic(
        `page ${page}: ${count()} SQL statements / ${view.items.length} cards`,
      );
      assert.ok(count() <= 15, `public page made ${count()} SQL statements`);
      assert.ok(
        view.items.every(
          (item: View) => !item.result && !item.draft && !item.payload,
        ),
      );
      assert.ok(!JSON.stringify(view).includes("Synthetic private core"));
    }
    assert.equal(new Set(ids).size, 90);
    const search = (await service(null).view("/projects", {
      search: "Synthetic Project 89",
    })) as View;
    assert.deepEqual(
      search.items.map((item: View) => item.slug),
      ["synthetic-89"],
    );
  } finally {
    db.close();
  }
});

test("bulk counts do not fan out and actor votes/own-team permission refresh on the next request", async () => {
  const { db, f, service } = await fixture();
  try {
    const actor = f.participants[0],
      own = f.teams.find((team) => team.members.includes(actor.id))!;
    const projectId = "public_" + own.id;
    for (const voter of [actor, f.participants[1]])
      await db
        .prepare("INSERT INTO project_upvotes VALUES(?,?,?)")
        .bind(projectId, voter.id, now)
        .all();
    for (let i = 0; i < 3; i++)
      await db
        .prepare("INSERT INTO project_comments VALUES(?,?,?,?,?)")
        .bind(
          "bulk_comment_" + i,
          projectId,
          f.participants[i].id,
          "Synthetic public comment for checking independent count aggregation " +
            i,
          now,
        )
        .all();
    const detail = (await service().view(
      "/projects/synthetic-" + own.index,
    )) as View;
    assert.equal(detail.items[0].upvotes, 2);
    assert.equal(detail.items[0].comments, 3);
    assert.equal(detail.items[0].upvoted, true);
    assert.equal(detail.items[0].canUpvote, true);
    assert.equal(detail.comments.length, 3);
    const anonymous = (await service(null).view(
      "/projects/synthetic-" + own.index,
    )) as View;
    assert.equal(anonymous.items[0].upvoted, false);
    assert.equal(anonymous.items[0].canUpvote, false);
    assert.equal(anonymous.items[0].upvotes, 2);
    await db
      .prepare("UPDATE registrations SET status='pending' WHERE email=?")
      .bind(actor.email)
      .all();
    const revoked = (await service().view(
      "/projects/synthetic-" + own.index,
    )) as View;
    assert.equal(
      revoked.items[0].canUpvote,
      false,
      "own-team vote still requires current personal check-in",
    );
    assert.equal(
      revoked.items[0].upvoted,
      true,
      "attendance changes preserve existing votes",
    );
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM project_upvotes WHERE project_id=?",
          projectId,
        )
      ).length,
      2,
    );
  } finally {
    db.close();
  }
});

test("public cards and global awards share current safe facts without exposing hidden final positions", async () => {
  const { db, f, service } = await fixture();
  try {
    const entries = f.teams.slice(0, 6).map((team, index) => ({
      projectId: "public_" + team.id,
      versionId: "public_" + team.id + "_v1",
      teamId: team.id,
      score: 100 - index,
      position: index + 1,
    }));
    await db
      .prepare(
        "INSERT INTO score_releases VALUES('bulk_final','final','synthetic-source',?,NULL,?,?)",
      )
      .bind(JSON.stringify(entries), now, f.operations[0].id)
      .all();
    await db
      .prepare("INSERT INTO winner_reveals VALUES('bulk_final',1,?,?,?)")
      .bind(entries[0].projectId, now, f.operations[0].id)
      .all();
    const first = (await service(null).view("/projects")) as View;
    assert.equal(first.finalCountdownComplete, false);
    assert.deepEqual(
      first.items
        .filter((item: View) => item.result)
        .map((item: View) => item.id),
      [entries[0].projectId],
    );
    assert.equal(first.awards.length, 1);
    assert.equal(first.awards[0].position, 1);
    assert.ok(
      first.items
        .filter((item: View) => item.id !== entries[0].projectId)
        .every((item: View) => !item.result),
    );
    const search = (await service(null).view("/projects", {
      search: "Synthetic Project 89",
    })) as View;
    assert.deepEqual(
      search.items.map((item: View) => item.slug),
      ["synthetic-89"],
    );
    assert.deepEqual(
      search.awards,
      first.awards,
      "search does not remove already-public global awards",
    );
    await db
      .prepare(
        "UPDATE project_eligibility SET status='ineligible',reason='Synthetic revocation' WHERE project_id=?",
      )
      .bind(entries[0].projectId)
      .all();
    const revoked = (await service(null).view("/projects")) as View;
    assert.equal(revoked.awards.length, 0);
    assert.ok(!JSON.stringify(revoked).includes(entries[0].projectId));
    await assert.rejects(service(null).view("/projects/synthetic-0"), {
      code: "PROJECT_NOT_ELIGIBLE",
    });
  } finally {
    db.close();
  }
});

test("removing a public project/version suppresses fresh list/detail projections without falling back to older payloads", async () => {
  const { db, f, service } = await fixture();
  try {
    const ids = f.teams.slice(0, 2).map((team) => "public_" + team.id);
    assert.equal(
      ((await service(null).view("/projects/synthetic-0")) as View).items
        .length,
      1,
    );
    for (const [i, kind] of ["project", "submission"].entries())
      await db
        .prepare(
          "INSERT INTO record_removals VALUES(?,?,1,'Synthetic removal',?,?,'{}')",
        )
        .bind(
          kind,
          ids[i] + (kind === "submission" ? "_v1" : ""),
          f.operations[0].id,
          now,
        )
        .all();
    const view = (await service(null).view("/projects")) as View;
    assert.ok(view.items.every((item: View) => !ids.includes(item.id)));
    for (const index of [0, 1])
      await assert.rejects(service(null).view("/projects/synthetic-" + index), {
        code: "PROJECT_NOT_ELIGIBLE",
      });
    assert.equal(
      (
        await rows(
          db,
          "SELECT id FROM submission_versions WHERE team_id IN (?,?)",
          f.teams[0].id,
          f.teams[1].id,
        )
      ).length,
      2,
    );
  } finally {
    db.close();
  }
});

test("new committed versions require their own eligibility and never inherit a published score", async () => {
  const { db, f, service } = await fixture();
  try {
    const team = f.teams[0],
      id = "public_" + team.id;
    await db
      .prepare(
        "INSERT INTO score_releases VALUES('bulk_ai','ai','synthetic-source',?,NULL,?,?)",
      )
      .bind(
        JSON.stringify([
          { projectId: id, versionId: id + "_v1", teamId: team.id, score: 99 },
        ]),
        now,
        f.operations[0].id,
      )
      .all();
    assert.equal(
      ((await service(null).view("/projects/synthetic-0")) as View).items[0]
        .result.score,
      99,
    );
    const payload = {
      ...projectPayload(team, 2),
      projectName: "Replacement Synthetic Project",
    };
    await db
      .prepare("INSERT INTO submission_versions VALUES(?,?,2,?,?)")
      .bind(
        id + "_v2",
        team.id,
        JSON.stringify(payload),
        "2026-11-01T04:01:00.000Z",
      )
      .all();
    await db
      .prepare(
        "UPDATE projects SET published_version_id=?,draft=?,revision=2 WHERE id=?",
      )
      .bind(id + "_v2", JSON.stringify(payload), id)
      .all();
    await assert.rejects(service(null).view("/projects/synthetic-0"), {
      code: "PROJECT_NOT_ELIGIBLE",
    });
    await db
      .prepare(
        "INSERT INTO project_eligibility VALUES(?,?,'eligible','Synthetic replacement review',?,?) ON CONFLICT(project_id) DO UPDATE SET version_id=excluded.version_id,status=excluded.status,reason=excluded.reason,decided_by=excluded.decided_by,updated_at=excluded.updated_at",
      )
      .bind(id, id + "_v2", f.operations[0].id, now)
      .all();
    const current = (await service(null).view("/projects/synthetic-0")) as View;
    assert.equal(current.items[0].projectName, payload.projectName);
    assert.equal(current.items[0].firstSubmittedAt, now);
    assert.equal(current.items[0].result, undefined);
    assert.match(current.items[0].banner, /_v2/);
  } finally {
    db.close();
  }
});

test("complete final awards spanning more than one bind chunk reuse bounded page facts", async () => {
  const { db, f, service, count, reset } = await fixture();
  try {
    const entries = f.teams.map((team, index) => ({
      projectId: "public_" + team.id,
      versionId: "public_" + team.id + "_v1",
      teamId: team.id,
      score: 100 - index,
      position: index + 1,
    }));
    await db
      .prepare(
        "INSERT INTO score_releases VALUES('bulk_complete','final','synthetic-source',?,NULL,?,?)",
      )
      .bind(JSON.stringify(entries), now, f.operations[0].id)
      .all();
    for (const entry of entries.slice(0, 5))
      await db
        .prepare("INSERT INTO winner_reveals VALUES('bulk_complete',?,?,?,?)")
        .bind(entry.position, entry.projectId, now, f.operations[0].id)
        .all();
    reset();
    const view = (await service(null).view("/leaderboard")) as View;
    assert.equal(view.finalCountdownComplete, true);
    assert.equal(view.items.length, 24);
    assert.equal(view.awards.length, 90);
    assert.deepEqual(
      view.awards.map((item: View) => item.position),
      Array.from({ length: 90 }, (_, i) => i + 1),
    );
    assert.ok(
      count() < 15,
      `page plus90 award entries used${count()} SQL statements`,
    );
  } finally {
    db.close();
  }
});


test("public media uses the current whitelisted team color without extra reads or style payloads", async () => {
  const { db, f, service, count, reset } = await fixture();
  try {
    const team = f.teams[0];
    const route = "/projects/synthetic-" + team.index;
    const read = async () => {
      reset();
      const view = (await service(null).view(route)) as View;
      assert.ok(count() <= 15, `public detail made ${count()} reads`);
      const project = view.items[0];
      assert.equal(project.draft, undefined);
      assert.equal(project.palette, undefined);
      assert.equal(project.color_key, undefined);
      return project;
    };
    await db.prepare("INSERT INTO team_styles(team_id,avatar,palette,color_key) VALUES(?,'initials','graphite','coral') ON CONFLICT(team_id) DO UPDATE SET color_key=excluded.color_key").bind(team.id).all();
    assert.equal((await read()).teamColorKey, "coral");
    await db.prepare("UPDATE team_styles SET color_key='yellow' WHERE team_id=?").bind(team.id).all();
    assert.equal((await read()).teamColorKey, "yellow", "new request reflects current style rather than a submission snapshot");
    await db.prepare("UPDATE team_styles SET color_key=NULL,palette='forest' WHERE team_id=?").bind(team.id).all();
    assert.equal((await read()).teamColorKey, "forest", "legacy canonical palette remains supported");
    await db.prepare("DELETE FROM team_styles WHERE team_id=?").bind(team.id).all();
    assert.equal((await read()).teamColorKey, "forest");
  } finally { db.close(); }
});
