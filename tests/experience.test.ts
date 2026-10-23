import { attend } from "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setup, activate } from "./helpers";
import { PortalService } from "../lib/service";
import { PortalExperience } from "../lib/experience";
import { fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { one, rows } from "../lib/db";
import { handleExport, handlePortal } from "../lib/http";
import { publicProjectImage } from "../lib/public-project-image";
import { defaultPublicContent } from "../lib/event-content-contract";
import { disabledEvaluator, type Evaluator } from "../lib/evaluation";
type Row = Record<string, any>;
import { syntheticImage as png } from "./fixture-images";

const logo = png(64, 64),
  banner = png(160, 90);
function payload(userId = "fake_alice") {
  return {
    projectName: "Synthetic Neighbourhood",
    problemSolution: "A useful synthetic community project",
    description:
      "A synthetic project used exclusively for local security tests.",
    github: "https://github.com/example/synthetic",
    commitSha: "a".repeat(40),
    demo: "https://example.com/demo",
    logo,
    banner,
    tools: "Codex CLI",
    contributions: [
      {
        userId,
        role: "Built the test project",
        codex: "Wrote and verified tests",
      },
    ],
    attestation: true,
  };
}
async function committed(
  s: ReturnType<Awaited<ReturnType<typeof setup>>["service"]>,
  p = payload(),
) {
  await attend(s.db, p.contributions[0].userId);
  await s.command("save-project", { revision: 0, project: p });
  const v = (await s.view("/submission")) as Row;
  await s.command("submit-project", {
    revision: v.project.revision,
    project: p,
  });
  return (await s.view("/submission")) as Row;
}
async function eligible(s: PortalService, projectId: string) {
  const detail = (await s.view("/admin/submissions/" + projectId)) as Row;
  await s.command("set-project-eligibility", {
    projectId,
    versionId: detail.version.id,
    status: "eligible",
    reason: "Synthetic verified eligibility",
  });
}
test("additive local upgrade preserves existing users and is idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "portal-upgrade-"));
  const db = new LocalDatabase(join(dir, "old.sqlite"));
  try {
    db.raw.exec(readFileSync("db/migrations/0001_portal.sql", "utf8"));
    db.raw.exec(readFileSync("db/migrations/0002_tie_resolutions.sql", "utf8"));
    db.raw
      .prepare(
        "INSERT INTO users VALUES('preserved','preserved@example.invalid','Preserved','participant','2026-10-23')",
      )
      .run();
    db.migrate();
    db.migrate();
    assert.equal(
      (
        db.raw
          .prepare("SELECT name FROM users WHERE id='preserved'")
          .get() as Row
      ).name,
      "Preserved",
    );
    assert.equal(
      (
        db.raw
          .prepare("SELECT count(*) n FROM local_schema_migrations")
          .get() as Row
      ).n,
      readdirSync("db/migrations").filter((n) => n.endsWith(".sql")).length,
    );
    assert.ok(
      db.raw
        .prepare("SELECT name FROM sqlite_master WHERE name='private_venue'")
        .get(),
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true });
  }
});
test("inline profile gate, registered team creation, presets, partial readiness and revocation", async () => {
  const { db, service } = await setup();
  try {
    const identity = {
      id: "new_builder",
      name: "New Builder",
      email: "new@example.invalid",
      source: "sites" as const,
    };
    await db
      .prepare("INSERT INTO luma_roster VALUES(?,'fake_admin','2026-10-23')")
      .bind(identity.email)
      .all();
    const s = new PortalService(db, identity, undefined);
    assert.equal((await s.view("/dashboard")).profileIncomplete, true);
    await assert.rejects(
      s.command("create-workspace-team", {
        name: "New Geometry",
        avatar: "initials",
        palette: "violet",
      }),
      /PROFILE_COMPLETION_REQUIRED/,
    );
    await assert.rejects(
      s.command("complete-profile", {
        displayName: "New Builder",
        phone: "+1 202 555 0100",
        bio: "I enjoy building useful tools.",
        skills: "TypeScript",
      }),
    );
    await assert.rejects(
      s.command("complete-profile", {
        displayName: "New Builder",
        phone: "+1 202 555 0100",
        bio: "I enjoy building useful tools.",
        skills: "TypeScript",
        gender: "",
      }),
    );
    await s.command("complete-profile", {
      displayName: "New Builder",
      phone: "+1 202 555 0100",
      bio: "I enjoy building useful tools.",
      skills: "TypeScript",
      gender: "non-binary",
    });
    await s.command("profile", { gender: "woman" });
    await s.command("profile", { bio: "I still enjoy building useful tools." });
    assert.equal(((await s.view("/profile")) as Row).profile.gender, "woman");
    const created = await s.command("create-workspace-team", {
      name: "New Geometry",
      bio: "A synthetic team",
      avatar: "initials",
      palette: "violet",
    });
    assert.equal(((await s.view("/dashboard")) as Row).status, "Registered");
    await service("pending").command("request-team", {
      teamId: created.teamId,
    });
    const actions = ((await s.view("/dashboard")) as Row).actions;
    await s.command("respond-team", {
      requestId: actions.find((r: Row) => r.user_id === "fake_pending").id,
      accept: true,
    });
    await service("owner").command("participant-bulk", {
      emails: [identity.email],
      status: "approved",
      reason: "Synthetic individual approval",
    });
    let view = (await s.view("/dashboard")) as Row;
    assert.equal(view.teamReadiness.allApproved, false);
    assert.equal(view.teamReadiness.approved, 1);
    assert.equal(view.status, "Going");
    assert.equal(
      ((await service("pending").view("/dashboard")) as Row).team.palette,
      "violet",
    );
    await service("owner").command("participant-bulk", {
      emails: ["pending@portal.test"],
      status: "approved",
      reason: "Synthetic second approval",
    });
    view = (await s.view("/dashboard")) as Row;
    assert.equal(view.status, "Going");
    await service("owner").command("participant-bulk", {
      emails: ["pending@portal.test"],
      status: "pending",
      reason: "Synthetic approval revoked",
    });
    assert.equal(
      ((await s.view("/dashboard")) as Row).teamReadiness.allApproved,
      false,
    );
    await assert.rejects(
      s.command("create-workspace-team", {
        name: "Bad CSS",
        avatar: "official-dot",
        palette: "url(evil)",
      }),
    );
    await assert.rejects(
      new PortalService(db, null, undefined).view("/teams"),
      /SIGN_IN_REQUIRED/,
    );
    await assert.rejects(
      new PortalService(db, null, undefined).view("/teams/anything"),
      /SIGN_IN_REQUIRED/,
    );
  } finally {
    db.close();
  }
});
test("private venue never leaves unauthorized projections; Going, approval and membership are checked afresh", async () => {
  const { db, service } = await setup();
  const secret = "SYNTHETIC-PRIVATE-ROOM-DO-NOT-LEAK";
  try {
    const owner = service("owner");
    await owner.command("content-save", {
      scope: "private",
      revision: 0,
      content: {
        location: secret,
        directions: "Synthetic restricted entry",
        mapUrl: "https://www.google.com/maps?q=synthetic",
      },
      reason: "Synthetic venue draft",
    });
    assert.equal(
      ((await service("alice").view("/dashboard")) as Row).privateVenue,
      undefined,
    );
    await owner.command("content-publish", {
      scope: "private",
      revision: 1,
      reason: "Synthetic publish saved venue",
    });
    const anon = new PortalService(db, null, undefined);
    for (const route of ["/", "/projects"]) {
      assert.ok(!JSON.stringify(await anon.view(route)).includes(secret));
    }
    assert.ok(
      ((await service("alice").view("/dashboard")) as Row).privateVenue
        .location === secret,
    );
    await owner.command("participant-bulk", {
      emails: ["dave@portal.test"],
      status: "pending",
      reason: "Synthetic partial approval",
    });
    assert.equal(
      ((await service("bob").view("/dashboard")) as Row).privateVenue,
      undefined,
    );
    assert.equal(
      ((await service("pending").view("/dashboard")) as Row).privateVenue,
      undefined,
    );
    await assert.rejects(service("stranger").view("/dashboard"), {
      code: "LUMA_EMAIL_MISMATCH",
    });
    assert.equal(
      ((await service("admin").view("/admin/settings")) as Row).venue,
      undefined,
    );
    await assert.rejects(
      service("admin").command("content-save", {
        scope: "private",
        revision: 2,
        content: { location: "forbidden", directions: "", mapUrl: "" },
        reason: "Unauthorized edit",
      }),
      /VENUE_MANAGER_REQUIRED/,
    );
    await owner.command("venue-manager", {
      userId: "fake_admin",
      enabled: true,
      reason: "Synthetic scoped operational grant",
    });
    assert.ok(
      JSON.stringify(
        ((await service("admin").view("/admin/settings")) as Row).venue,
      ).includes(secret),
    );
    await owner.command("venue-manager", {
      userId: "fake_admin",
      enabled: false,
      reason: "Synthetic operational revocation",
    });
    assert.equal(
      ((await service("admin").view("/admin/settings")) as Row).venue,
      undefined,
    );
    await owner.command("participant-bulk", {
      emails: ["alice@portal.test"],
      status: "pending",
      reason: "Synthetic approval withdrawal",
    });
    assert.equal(
      ((await service("alice").view("/dashboard")) as Row).privateVenue,
      undefined,
    );
    await owner.command("participant-bulk", {
      emails: ["dave@portal.test"],
      status: "approved",
      reason: "Synthetic approval restored",
    });
    assert.ok(((await service("dave").view("/dashboard")) as Row).privateVenue);
    await service("bob").command("remove-workspace-member", {
      userId: "fake_dave",
      reason: "Synthetic membership removal",
    });
    assert.equal(
      ((await service("dave").view("/dashboard")) as Row).privateVenue,
      undefined,
    );
    for (const list of [
      "participants",
      "teams",
      "submissions",
      "settings",
      "audit",
    ]) {
      const r = await handleExport(
        new Request("https://portal.test/api/export?list=" + list),
        { db, identity: fixtures.owner, key: undefined },
      );
      assert.ok(!(await r.text()).includes(secret));
    }
    assert.ok(!JSON.stringify(await owner.adminList("audit")).includes(secret));
  } finally {
    db.close();
  }
});
test("owner event drafts, safe Maps URLs, plain text and optimistic edits preserve published content", async () => {
  const { db, service } = await setup();
  try {
    const owner = service("owner"),
      content = {
        ...defaultPublicContent,
        venue: "Synthetic general venue",
        mapUrl: "https://maps.app.goo.gl/synthetic",
      };
    await assert.rejects(
      service("admin").command("content-save", {
        scope: "public",
        revision: 0,
        content,
        reason: "Forbidden general edit",
      }),
      /OWNER_REQUIRED/,
    );
    await assert.rejects(
      owner.command("content-save", {
        scope: "public",
        revision: 0,
        content: { ...content, mapUrl: "javascript:alert(1)" },
        reason: "Reject unsafe link",
      }),
    );
    await assert.rejects(
      owner.command("content-save", {
        scope: "public",
        revision: 0,
        content: { ...content, rules: "<script>bad</script>" },
        reason: "Reject unsafe markup",
      }),
    );
    await owner.command("content-save", {
      scope: "public",
      revision: 0,
      content,
      reason: "Synthetic content draft",
    });
    assert.equal(((await owner.view("/")) as Row).content.venue, "IIIT Delhi");
    await owner.command("content-publish", {
      scope: "public",
      revision: 1,
      reason: "Synthetic general publication",
    });
    assert.equal(((await owner.view("/")) as Row).content.venue, content.venue);
    const results = await Promise.allSettled([
      owner.command("content-save", {
        scope: "public",
        revision: 2,
        content: { ...content, venue: "First" },
        reason: "Synthetic concurrent edit",
      }),
      owner.command("content-save", {
        scope: "public",
        revision: 2,
        content: { ...content, venue: "Second" },
        reason: "Synthetic concurrent edit",
      }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(((await owner.view("/")) as Row).content.venue, content.venue);
    assert.equal(
      (await one<{ active: number }>(db, "SELECT active FROM event_settings"))!
        .active,
      0,
    );
    assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
  } finally {
    db.close();
  }
});
test("shared draft/committed project, required media, concurrent writes and public version isolation", async () => {
  const { db, service, clock } = await setup();
  try {
    const alice = service("alice"),
      p = payload();
    await assert.rejects(
      alice.command("save-project", { revision: 0, project: p }),
      { code: "TEAM_CHECKIN_REQUIRED" },
    );
    await activate(db);
    await attend(db, "fake_alice", "fake_bob", "fake_eve");
    clock("2026-11-01T04:00:00.000Z");
    await assert.rejects(
      alice.command("save-project", {
        revision: 0,
        project: { ...p, logo: banner },
      }),
      /Project logo must be square/,
    );
    await alice.command("save-project", { revision: 0, project: p });

    await assert.rejects(
      alice.command("submit-project", {
        revision: 1,
        project: { ...p, banner: "" },
      }),
      /Upload a PNG or JPEG banner/,
    );
    const writes = await Promise.allSettled([
      alice.command("save-project", { revision: 1, project: p }),
      alice.command("save-project", {
        revision: 1,
        project: { ...p, projectName: "Other title" },
      }),
    ]);
    assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
    const draft = (await alice.view("/submission")) as Row;
    await alice.command("submit-project", {
      revision: draft.project.revision,
      project: p,
    });
    const saved = (await alice.view("/submission")) as Row;
    const projectId = saved.project.id;
    assert.equal(
      ((await service("owner").view("/projects")) as Row).items.length,
      0,
    );
    await eligible(service("admin"), projectId);
    let publicView = (await new PortalService(db, null, undefined).view(
      "/projects",
    )) as Row;
    assert.equal(publicView.items[0].projectName, p.projectName);
    assert.equal(publicView.items[0].result, undefined);
    assert.ok(publicView.items[0].logo.startsWith("/api/project-image/"));
    assert.ok(!JSON.stringify(publicView).includes("contributions"));
    await alice.command("save-project", {
      revision: saved.project.revision,
      project: { ...p, projectName: "Private uncommitted rename" },
    });
    publicView = (await new PortalService(db, null, undefined).view(
      "/projects",
    )) as Row;
    assert.equal(publicView.items[0].projectName, p.projectName);
    const version = String(publicView.items[0].logo).split("version=")[1];
    assert.equal(
      (await publicProjectImage(db, projectId, "logo", version)).headers.get(
        "content-type",
      ),
      "image/png",
    );
    await assert.rejects(
      publicProjectImage(db, projectId, "logo", "unpublished"),
      /IMAGE_NOT_FOUND/,
    );
    await assert.rejects(
      service("bob").command("save-project", { revision: 1, project: p }),
      /PROJECT_CHANGED_RELOAD/,
    );
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM submission_versions WHERE team_id='fake_team1'",
        )
      ).length,
      1,
    );
  } finally {
    db.close();
  }
});
test("signed-in engagement permits admins and pending people, is idempotent, and stays separate from private reviews", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice", "fake_bob", "fake_eve");
    clock("2026-11-01T04:00:00.000Z");
    const v = await committed(service("alice"));
    const p = v.project;
    await eligible(service("admin"), p.id);
    await service("pending").command("upvote-project", { projectId: p.id });
    await service("pending").command("upvote-project", { projectId: p.id });
    await service("admin").command("upvote-project", { projectId: p.id });
    await service("alice").command("comment-project", {
      projectId: p.id,
      body: "A synthetic public comment.",
    });
    assert.equal((await rows(db, "SELECT * FROM project_upvotes")).length, 2);
    assert.equal((await rows(db, "SELECT * FROM votes")).length, 0);
    await assert.rejects(
      new PortalService(db, null, undefined).command("upvote-project", {
        projectId: p.id,
      }),
      /SIGN_IN_REQUIRED/,
    );
    await service("owner").command("assign-project", {
      projectId: p.id,
      userId: "fake_judge",
      kind: "judge",
      reason: "Synthetic review assignment",
    });
    const versionId = v.attempts[0].id;
    await service("judge").command("review-project", {
      projectId: p.id,
      versionId,
      rating: 9,
      body: "PRIVATE-SYNTHETIC-FEEDBACK",
    });
    const publicView = (await new PortalService(db, null, undefined).view(
      "/projects/" + p.slug,
    )) as Row;
    assert.equal(publicView.items[0].upvotes, 2);
    assert.equal(publicView.items[0].comments, 1);
    assert.ok(
      !JSON.stringify(publicView).includes("PRIVATE-SYNTHETIC-FEEDBACK"),
    );
    assert.ok(!JSON.stringify(publicView).includes("rating"));
    const team = (await service("alice").view("/dashboard")) as Row;
    assert.equal(team.feedback[0].body, "PRIVATE-SYNTHETIC-FEEDBACK");
    assert.equal(team.feedback[0].rating, undefined);
    assert.equal(
      ((await service("bob").view("/dashboard")) as Row).feedback.length,
      0,
    );
    const exported = await handleExport(
      new Request("https://portal.test/api/export?list=submissions"),
      { db, identity: fixtures.admin, key: undefined },
    );
    assert.equal(exported.status, 200);
    const body = await exported.text();
    assert.ok(!body.includes("PRIVATE-SYNTHETIC-FEEDBACK"));
    assert.ok(!body.includes("rating"));
  } finally {
    db.close();
  }
});
test("volunteer, mentor and judge boundaries, owner Logs, role and assignment revocation", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice", "fake_bob", "fake_eve");
    clock("2026-11-01T04:00:00.000Z");
    const v = await committed(service("alice")),
      p = v.project,
      versionId = v.attempts[0].id;
    const owner = service("owner");
    await owner.command("portal-role", {
      userId: "fake_stranger",
      role: "volunteer",
      reason: "Synthetic volunteer grant",
    });
    assert.equal(
      ((await service("stranger").view("/admin/participants")) as Row)
        .lookupOnly,
      true,
    );
    await assert.rejects(
      service("stranger").command("participant-bulk", {
        emails: ["pending@portal.test"],
        status: "approved",
        reason: "Forbidden volunteer approval",
      }),
      /ADMIN_REQUIRED/,
    );
    await assert.rejects(
      service("stranger").view("/admin/teams"),
      /ADMIN_REQUIRED/,
    );
    await assert.rejects(
      service("admin").view("/admin//logs/"),
      /OWNER_REQUIRED/,
    );
    const exportLogs = await handleExport(
      new Request("https://portal.test/api/export?list=audit"),
      { db, identity: fixtures.admin, key: undefined },
    );
    assert.equal(exportLogs.status, 403);
    await assert.rejects(
      service("judge2").view("/review/" + p.slug),
      /PROJECT_ASSIGNMENT_REQUIRED/,
    );
    await owner.command("portal-role", {
      userId: "fake_pending",
      role: "mentor",
      reason: "Synthetic mentor grant",
    });
    await owner.command("assign-project", {
      projectId: p.id,
      userId: "fake_pending",
      kind: "mentor",
      reason: "Synthetic mentor assignment",
    });
    await service("pending").command("review-project", {
      projectId: p.id,
      versionId,
      body: "Synthetic mentor advice",
    });
    await assert.rejects(
      service("pending").command("review-project", {
        projectId: p.id,
        versionId,
        body: "Forbidden scoring",
        rating: 8,
      }),
      /ONLY_ASSIGNED_JUDGES_SCORE/,
    );
    await assert.rejects(
      service("pending").command("reevaluate-project", {
        projectId: p.id,
        versionId,
      }),
      /SCORING_REVIEWER_REQUIRED/,
    );
    await owner.command("portal-role", {
      userId: "fake_pending",
      role: "participant",
      reason: "Synthetic mentor role revoked",
    });
    await assert.rejects(
      service("pending").view("/review/" + p.slug),
      /PROJECT_ASSIGNMENT_REQUIRED/,
    );
    assert.equal(
      (
        await handleExport(
          new Request("https://portal.test/api/export?list=participants"),
          { db, identity: fixtures.stranger, key: undefined },
        )
      ).status,
      403,
    );
  } finally {
    db.close();
  }
});
test("reevaluation stays Not configured while API setup is pending; active-run guard and history remain structural", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice", "fake_bob", "fake_eve");
    clock("2026-11-01T04:00:00.000Z");
    const v = await committed(service("alice")),
      projectId = v.project.id,
      versionId = v.attempts[0].id;
    await assert.rejects(
      service("admin").command("reevaluate-project", { projectId, versionId }),
      /EVALUATOR_NOT_CONFIGURED/,
    );
    assert.equal((await rows(db, "SELECT * FROM evaluation_runs")).length, 0);
    const time = "2026-11-01T04:00:00.000Z";
    await db
      .prepare(
        "INSERT INTO evaluation_runs(id,project_id,version_id,config_key,state,report,error,created_at,updated_at) VALUES('synthetic-run',?,?,?,'queued',NULL,NULL,?,?)",
      )
      .bind(projectId, versionId, "synthetic-config", time, time)
      .all();
    await assert.rejects(
      db
        .prepare(
          "INSERT INTO evaluation_runs(id,project_id,version_id,config_key,state,report,error,created_at,updated_at) VALUES('duplicate-run',?,?,?,'running',NULL,NULL,?,?)",
        )
        .bind(projectId, versionId, "synthetic-config", time, time)
        .all(),
      /UNIQUE/,
    );
    await db
      .prepare(
        "UPDATE evaluation_runs SET state='failed',error='Synthetic test failure' WHERE id='synthetic-run'",
      )
      .all();
    await db
      .prepare(
        "INSERT INTO evaluation_runs(id,project_id,version_id,config_key,state,report,error,created_at,updated_at) VALUES('synthetic-retry',?,?,?,'queued',NULL,NULL,?,?)",
      )
      .bind(projectId, versionId, "synthetic-config", time, time)
      .all();
    assert.equal((await rows(db, "SELECT * FROM evaluation_runs")).length, 2);
    assert.equal(
      (await service("admin").view("/admin/submissions/" + v.project.slug))
        .evaluationConfigured,
      false,
    );
  } finally {
    db.close();
  }
});
test("leaderboard orders by upvotes then immutable first submission time, excludes ineligible, and exposes no evaluation or rank", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice", "fake_bob", "fake_eve");
    const ids: Record<string, string> = {};
    for (const [name, time] of [
      ["bob", "2026-11-01T03:00:00.000Z"],
      ["alice", "2026-11-01T04:00:00.000Z"],
      ["eve", "2026-11-01T05:00:00.000Z"],
    ]) {
      clock(time);
      const workspace = (await service(name).view("/submission")) as Row,
        p = {
          ...payload(),
          projectName: "Synthetic " + name,
          contributions: workspace.members.map((m: Row) => ({
            userId: m.id,
            role: "Synthetic contribution",
            codex: "Synthetic tools",
          })),
        };
      const v = await committed(service(name), p);
      ids[name] = v.project.id;
      await eligible(service("admin"), v.project.id);
    }
    const publicService = new PortalService(db, null, undefined);
    let board = (await publicService.view("/leaderboard")) as Row;
    assert.deepEqual(
      board.items.map((r: Row) => r.id),
      [ids.bob, ids.alice, ids.eve],
    );
    const first = board.items[0].firstSubmittedAt;
    await service("admin").command("upvote-project", { projectId: ids.alice });
    board = (await publicService.view("/leaderboard")) as Row;
    assert.equal(board.items[0].id, ids.alice);
    await service("pending").command("upvote-project", { projectId: ids.bob });
    board = (await publicService.view("/leaderboard")) as Row;
    assert.equal(board.items[0].id, ids.bob);
    clock("2026-11-01T06:00:00.000Z");
    const bob = (await service("bob").view("/submission")) as Row;
    await service("bob").command("submit-project", {
      revision: bob.project.revision,
      project: bob.project.draft,
    });
    await eligible(service("admin"), ids.bob);
    board = (await publicService.view("/leaderboard")) as Row;
    assert.equal(board.items[0].firstSubmittedAt, first);
    assert.equal(board.items[0].id, ids.bob);
    const alice = (await service("alice").view("/submission")) as Row;
    await service("admin").command("set-project-eligibility", {
      projectId: ids.alice,
      versionId: alice.attempts[0].id,
      status: "ineligible",
      violation: {
        rule: "Synthetic confirmed rule",
        evidence: "Synthetic recorded proven violation",
      },
      reason: "SYNTHETIC private eligibility reason",
    });
    board = (await publicService.view("/leaderboard")) as Row;
    assert.equal(board.items.length, 2);
    assert.ok(!JSON.stringify(board).includes("private eligibility reason"));
    assert.equal(
      ((await service("alice").view("/dashboard")) as Row).eligibility.reason,
      "SYNTHETIC private eligibility reason",
    );
    assert.ok(
      (
        (await service("bob").view("/dashboard")) as Row
      ).leaderboardUrl.includes("#entry-"),
    );
    for (const item of board.items) {
      for (const key of [
        "rank",
        "rating",
        "evaluationState",
        "runs",
        "history",
        "report",
      ])
        assert.equal(item[key], undefined);
    }
    await assert.rejects(
      db
        .prepare(
          "UPDATE submission_versions SET created_at='2000-01-01' WHERE team_id='fake_team3'",
        )
        .all(),
      /IMMUTABLE/,
    );
  } finally {
    db.close();
  }
});
test("revised judge reviews feed only an owner-revealed frozen score; public engagement remains independent", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice", "fake_bob", "fake_eve");
    clock("2026-11-01T04:00:00.000Z");
    const v = await committed(service("alice")),
      projectId = v.project.id,
      versionId = v.attempts[0].id;
    await eligible(service("admin"), projectId);
    clock("2026-11-01T11:00:00.000Z");
    for (const [judge, rating] of [
      ["judge", 8],
      ["judge2", 6],
    ] as const) {
      await service("owner").command("assign-project", {
        projectId,
        userId: "fake_" + judge,
        kind: "judge",
        reason: "Synthetic independent assignment",
      });
      await service(judge).command("review-project", {
        projectId,
        versionId,
        rating,
        body: "Synthetic private team advice",
      });
    }
    await service("admin").command("review", {
      teamId: "fake_team1",
      versionId,
      eligibility: "eligible",
      astra: 20,
      codex: 3,
      diversity: 7,
      falseClaims: 0,
      evidence:
        "Synthetic manual verified rubric evidence; no paid evaluation.",
      reason: "Synthetic rubric review",
    });
    const publicService = new PortalService(db, null, undefined);
    assert.equal(
      ((await publicService.view("/leaderboard")) as Row).items[0].result,
      undefined,
    );
    clock("2026-11-01T13:00:00.000Z");
    const frozen = await service("owner").command("freeze-results", {
      reason: "Synthetic final snapshot",
    });
    assert.equal(
      ((await publicService.view("/leaderboard")) as Row).items[0].result,
      undefined,
    );
    const release = await service("admin").command("reveal-final-scores", {
      confirmation: "PUBLIC_FINAL",
      snapshotId: frozen.snapshotId,
      reason: "Synthetic explicit reveal",
    });
    assert.equal(
      ((await publicService.view("/leaderboard")) as Row).items[0].result,
      undefined,
    );
    await service("admin").command("unveil-winner", {
      releaseId: release.releaseId,
      position: 1,
      confirmation: "UNVEIL_1",
      reason: "Synthetic first award",
    });
    let board = (await publicService.view("/leaderboard")) as Row;
    assert.equal(board.items[0].result.score, 65);
    assert.equal(board.items[0].result.rank, undefined);
    await service("pending").command("upvote-project", { projectId });
    board = (await publicService.view("/leaderboard")) as Row;
    assert.equal(board.items[0].upvotes, 1);
    assert.equal(board.items[0].result.score, 65);
    assert.ok(!JSON.stringify(board).includes("private team advice"));
    await assert.rejects(
      service("judge").command("review-project", {
        projectId,
        versionId,
        rating: 10,
        body: "Synthetic late edit",
      }),
      /RESULTS_FROZEN/,
    );
  } finally {
    db.close();
  }
});
test("exact timestamp ties use a stable key and a focused leaderboard link selects its containing page", async () => {
  const { db } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice", "fake_bob", "fake_eve");
    const time = "2026-11-01T04:00:00.000Z";
    for (let i = 0; i < 26; i++) {
      const key = "order-" + String(i).padStart(2, "0"),
        user = "user-" + key,
        team = "team-" + key,
        version = "version-" + key,
        p = payload(user);
      await db.batch([
        db
          .prepare("INSERT INTO users VALUES(?,?,?,'participant',?)")
          .bind(user, key + "@example.invalid", key, time),
        db
          .prepare("INSERT INTO registrations VALUES(?,'approved',1)")
          .bind(key + "@example.invalid"),
        db
          .prepare("INSERT INTO teams VALUES(?,?,?,'',?)")
          .bind(team, key, user, time),
        db
          .prepare("INSERT INTO memberships VALUES(?,?,?)")
          .bind(user, team, "2026-10-22T08:00:00.000Z"),
        db
          .prepare("INSERT INTO manual_checkins VALUES(?,?,?,?)")
          .bind(user, key + "@example.invalid", "fake_admin", time),
        db
          .prepare("INSERT INTO submission_versions VALUES(?,?,1,?,?)")
          .bind(version, team, JSON.stringify(p), time),
        db
          .prepare("INSERT INTO projects VALUES(?,?,?,?,1,?,?)")
          .bind(key, team, key, JSON.stringify(p), version, time),
        db
          .prepare(
            "INSERT INTO project_eligibility VALUES(?,?,'eligible','Synthetic verification','fake_admin',?)",
          )
          .bind(key, version, time),
      ]);
    }
    const anonymous = new PortalService(db, null, undefined),
      first = (await anonymous.view("/leaderboard")) as Row;
    assert.equal(first.items.length, 24);
    assert.equal(first.items[0].id, "order-00");
    assert.equal(first.items[23].id, "order-23");
    assert.equal(first.hasMore, true);
    const focused = (await anonymous.view("/leaderboard", {
      focus: "order-25",
    })) as Row;
    assert.equal(focused.page, 1);
    assert.deepEqual(
      focused.items.map((r: Row) => r.id),
      ["order-24", "order-25"],
    );
    assert.equal(focused.hasMore, false);
    const search = (await anonymous.view("/projects", {
      search: "' OR 1=1 --",
    })) as Row;
    assert.equal(search.items.length, 0);
  } finally {
    db.close();
  }
});
