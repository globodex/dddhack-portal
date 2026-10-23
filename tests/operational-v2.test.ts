import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, attend } from "./helpers";
import { syntheticImage } from "./fixture-images";
import {
  teamStatus,
  personStatus,
  prizeEligibility,
} from "../lib/portal-status";
import { githubEligibility } from "../lib/evaluation";
import { rows, one } from "../lib/db";
import { PortalService } from "../lib/service";
import {
  instructionInline,
  parseInstructions,
} from "../lib/instruction-markdown";
import { delhiOffset } from "../lib/delhi-motion";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CreditInstructions from "../app/credit-instructions";
import ProfileFlow from "../app/profile-flow";
const project = {
  projectName: "Rehearsal",
  problemSolution: "A synthetic useful project",
  description: "Synthetic implementation for local tests",
  github: "https://github.com/example/rehearsal",
  commitSha: "a".repeat(40),
  demo: "",
  logo: syntheticImage(64, 64),
  banner: syntheticImage(160, 90),
  tools: "Codex",
  contributions: [
    {
      userId: "fake_alice",
      role: "Built the prototype",
      codex: "Wrote regression tests",
    },
  ],
  attestation: true,
};
const row = (v: unknown) => v as Record<string, any>;
test("lock freezes facts without approving members; manual statuses preserve locks/history and attendance is individual", async () => {
  const { db, service } = await setup();
  try {
    await service("alice").command("save-workspace-idea", {
      title: "Synthetic idea",
      core: "A completed synthetic idea",
      description: "Synthetic",
    });
    await service("admin").command("participant-bulk", {
      emails: ["alice@portal.test"],
      status: "pending",
      reason: "Synthetic review pending",
    });
    await service("alice").command("lock-team", { confirmation: "LOCK_TEAM" });
    let t = await teamStatus(service(), "fake_team1");
    assert.equal(t.status, "Locked");
    assert.equal(
      (await personStatus(service(), "fake_alice")).status,
      "Registered",
    );
    await assert.rejects(
      service("alice").command("team-style", {
        avatar: "initials",
        palette: "forest",
      }),
      { code: "TEAM_LOCKED" },
    );
    await assert.rejects(
      db.prepare("UPDATE teams SET name='Tamper' WHERE id='fake_team1'").all(),
      /TEAM_LOCKED/,
    );
    await assert.rejects(
      db.prepare("UPDATE team_locks SET locked_at='2000'").all(),
      /IMMUTABLE/,
    );
    await assert.rejects(
      service("alice").command("admin-status", {
        kind: "person",
        targetId: "fake_alice",
        status: "Checked in",
        reason: "Untrusted attendance",
        confirmation: "CHANGE_STATUS",
      }),
      { code: "ADMIN_REQUIRED" },
    );
    await service("admin").command("admin-status", {
      kind: "person",
      targetId: "fake_alice",
      status: "Checked in",
      reason: "Organizer verified physical attendance",
      confirmation: "CHANGE_STATUS",
    });
    assert.equal(
      (await teamStatus(service(), "fake_team1")).status,
      "Not submitted",
    );
    assert.equal(
      (await prizeEligibility(service(), "fake_alice")).eligible,
      true,
    );
    assert.equal(
      (await prizeEligibility(service(), "fake_bob")).eligible,
      false,
    );
    await service("admin").command("admin-status", {
      kind: "person",
      targetId: "fake_alice",
      status: "Absent",
      reason: "Organizer corrected attendance",
      confirmation: "CHANGE_STATUS",
    });
    assert.equal(
      (await personStatus(service(), "fake_alice")).checkedIn,
      false,
    );
    assert.equal((await rows(db, "SELECT * FROM manual_checkins")).length, 1);
    assert.equal((await teamStatus(service(), "fake_team1")).locked, true);
    assert.equal((await personStatus(service(), "fake_bob")).status, "Going"); // no automatic absence job
  } finally {
    db.close();
  }
});
test("zero check-in denies endpoint and draft; concurrent retries consume one version and third locks all edits", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    clock("2026-11-01T04:00:00.000Z");
    for (const path of ["/submission", "/dashboard/submission"])
      await assert.rejects(service().view(path), {
        code: "TEAM_CHECKIN_REQUIRED",
      });
    await assert.rejects(
      service().command("save-project", { revision: 0, project }),
      { code: "TEAM_CHECKIN_REQUIRED" },
    );
    await attend(db, "fake_alice");
    await service().command("save-project", { revision: 0, project });
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      0,
    );
    const concurrent = await Promise.all(
      Array.from({ length: 12 }, () =>
        service().command("submit-project", { revision: 1, project }),
      ),
    );
    assert.equal(
      new Set(concurrent.map((r) => r.versionId).filter(Boolean)).size <= 1,
      true,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      1,
    );
    for (let i = 2; i <= 3; i++) {
      const w = row(await service().view("/submission"));
      await service().command("submit-project", {
        revision: w.project.revision,
        project: { ...project, projectName: "Version " + i },
      });
    }
    let w = row(await service().view("/submission"));
    assert.equal(w.submissionAccess.locked, true);
    assert.equal(w.teamStatus, "Submitted");
    for (const action of ["save-project", "submit-project"])
      await assert.rejects(
        service().command(action, { revision: w.project.revision, project }),
        { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
      );
    await assert.rejects(
      db
        .prepare("UPDATE projects SET draft='{}' WHERE team_id='fake_team1'")
        .all(),
      /PROJECT_LOCKED/,
    );
    await service("admin").command("admin-status", {
      kind: "team",
      targetId: "fake_team1",
      status: "Forming",
      reason: "Synthetic display correction",
      confirmation: "CHANGE_STATUS",
    });
    w = row(await service().view("/dashboard"));
    assert.equal(w.teamStatus, "Forming");
    assert.equal(w.submissionAccess.attemptsUsed, 3);
    assert.equal(w.submissionAccess.locked, true);
    await service("admin").command("admin-status", {
      kind: "team",
      targetId: "fake_team3",
      status: "Submitted",
      reason: "Synthetic label only",
      confirmation: "CHANGE_STATUS",
    });
    assert.equal(
      row(await service("bob").view("/dashboard")).submissionProgress
        .attemptsUsed,
      0,
    );
    assert.equal(
      row(await new PortalService(db, null, undefined).view("/projects")).items
        .length,
      0,
    );
  } finally {
    db.close();
  }
});
test("only one checked-in team member is necessary; unapproved or absent member does not erase a committed project", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    clock("2026-11-01T04:00:00.000Z");
    await attend(db, "fake_bob");
    await service("admin").command("participant-bulk", {
      emails: ["carol@portal.test"],
      status: "pending",
      reason: "Synthetic individual review",
    });
    const p = {
      ...project,
      contributions: ["fake_bob", "fake_carol", "fake_dave"].map((userId) => ({
        userId,
        role: "Synthetic contribution",
        codex: "Tested locally",
      })),
    };
    await service("bob").command("submit-project", { revision: 0, project: p });
    assert.equal(
      (await teamStatus(service(), "fake_team3")).status,
      "Submitted",
    );
    assert.equal(
      (await prizeEligibility(service(), "fake_carol")).eligible,
      false,
    );
  } finally {
    db.close();
  }
});
test("repository cutoff is strictly after 08:00 IST for BOTH dates; uncertainty is never a violation", () => {
  const before = "2026-11-01T02:29:59.999Z",
    exact = "2026-11-01T08:00:00+05:30",
    after = "2026-11-01T08:00:00.001+05:30";
  for (const createdAt of [before, exact, after])
    for (const firstCommit of [before, exact, after])
      assert.equal(
        githubEligibility({ public: true, createdAt, firstCommit }),
        createdAt === after && firstCommit === after
          ? "ELIGIBLE"
          : "INELIGIBLE",
      );
  for (const meta of [
    null,
    { public: true, createdAt: "bad", firstCommit: after },
    { public: false, createdAt: before, firstCommit: before },
    { public: true, createdAt: after, firstCommit: null },
  ])
    assert.equal(githubEligibility(meta), "NEEDS_MANUAL_REVIEW");
});
test("version-bound private repository evidence, proven violation and narrow assigned-judge restoration preserve Submitted lifecycle", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    clock("2026-11-01T04:00:00.000Z");
    await attend(db, "fake_alice");
    await service().command("submit-project", { revision: 0, project });
    const w = row(await service().view("/submission")),
      v = w.attempts[0].id,
      p = w.project.id;
    const evidence = {
      projectId: p,
      versionId: v,
      commitSha: project.commitSha,
      source: "Synthetic organizer metadata capture",
      reason: "Synthetic verified repository timestamps",
      observedAt: "2026-11-01T03:55:00Z",
      metadata: {
        public: true,
        createdAt: "2026-11-01T02:30:00Z",
        firstCommit: "2026-11-01T02:30:01Z",
      },
    };
    await service("admin").command("record-repository-evidence", evidence);
    assert.equal(
      row(await service().view("/dashboard")).eligibility.status,
      "ineligible",
    );
    assert.equal(
      (await teamStatus(service(), "fake_team1")).status,
      "Submitted",
    );
    assert.equal(
      row(await new PortalService(db, null, undefined).view("/projects")).items
        .length,
      0,
    );
    await assert.rejects(
      service("judge").command("set-project-eligibility", {
        projectId: p,
        versionId: v,
        status: "eligible",
        reason: "Synthetic exception after review",
      }),
      { code: "ASSIGNED_ELIGIBILITY_REVIEWER_REQUIRED" },
    );
    await service("admin").command("assign-project", {
      projectId: p,
      userId: "fake_judge",
      kind: "judge",
      reason: "Synthetic limited assignment",
    });
    await service("admin").command("admin-status", {
      kind: "team",
      targetId: "fake_team1",
      status: "Forming",
      reason: "Synthetic prior display override",
      confirmation: "CHANGE_STATUS",
    });
    await service("judge").command("set-project-eligibility", {
      projectId: p,
      versionId: v,
      status: "eligible",
      reason: "Synthetic explicit judging exception",
    });
    assert.equal(
      row(await new PortalService(db, null, undefined).view("/projects")).items
        .length,
      1,
    );
    assert.equal(
      (await teamStatus(service(), "fake_team1")).status,
      "Submitted",
    );
    await assert.rejects(
      service("judge").command("set-project-eligibility", {
        projectId: p,
        versionId: v,
        status: "ineligible",
        reason: "Synthetic rejected negative decision",
        violation: { rule: "Example", evidence: "Synthetic evidence" },
      }),
      { code: "ADMIN_ELIGIBILITY_DECISION_REQUIRED" },
    );
    // Participants no longer submit a manual hash. An authorized reviewer may
    // bind observed repository evidence to this immutable version separately.
    await service("admin").command("record-repository-evidence", {
      ...evidence,
      commitSha: "b".repeat(40),
    });
    await service("admin").command("record-repository-evidence", {
      ...evidence,
      metadata: null,
      reason: "Synthetic GitHub API timeout; unverifiable",
    });
    assert.equal(
      row(await service().view("/dashboard")).eligibility.status,
      "needs_review",
    );
    assert.equal(
      (await rows(db, "SELECT * FROM repository_evidence")).length,
      3,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM eligibility_history")).length,
      4,
    );
    await assert.rejects(
      db.prepare("UPDATE repository_evidence SET commit_sha='tamper'").all(),
      /IMMUTABLE/,
    );
    const publicJSON = JSON.stringify(
      await new PortalService(db, null, undefined).view("/projects"),
    );
    assert.ok(
      !publicJSON.includes("metadata capture") &&
        !publicJSON.includes("GitHub API timeout"),
    );
  } finally {
    db.close();
  }
});
test("personal credits require matching checked-in identity AND email; Markdown is safe and shared instructions are staff-only", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    clock("2026-11-01T04:00:00.000Z");
    await service("admin").command("check-in", {
      userId: "fake_alice",
      reason: "Synthetic physical check-in",
    });
    await assert.rejects(
      service().command("reveal-credit", {
        typeId: "fake_credit",
        userId: "fake_bob",
      }),
    );
    await assert.rejects(
      service("bob").command("reveal-credit", { typeId: "fake_credit" }),
      { code: "CHECKIN_REQUIRED" },
    );
    await service("admin").command("admin-status", {
      kind: "person",
      targetId: "fake_alice",
      status: "Absent",
      reason: "Synthetic revoked attendance",
      confirmation: "CHANGE_STATUS",
    });
    await assert.rejects(
      service().command("reveal-credit", { typeId: "fake_credit" }),
      { code: "CHECKIN_REQUIRED" },
    );
    await service("admin").command("admin-status", {
      kind: "person",
      targetId: "fake_alice",
      status: "Checked in",
      reason: "Synthetic corrected attendance",
      confirmation: "CHANGE_STATUS",
    });
    await db
      .prepare(
        "UPDATE credit_allocations SET recipient_email='someone-else@invalid' WHERE user_id='fake_alice'",
      )
      .all();
    await assert.rejects(
      service().command("reveal-credit", { typeId: "fake_credit" }),
      { code: "ALLOCATION_PENDING" },
    );
    await assert.rejects(
      service().command("update-credit-instructions", {
        typeId: "fake_credit",
        markdown: "1. Install",
        reason: "Synthetic change",
      }),
      { code: "ADMIN_REQUIRED" },
    );
    await service("admin").command("update-credit-instructions", {
      typeId: "fake_credit",
      markdown:
        "# Setup\n1. Install\n2. [Docs](https://example.com)\n<script>alert(1)</script>\n[Bad](javascript:evil)",
      reason: "Synthetic instructions",
    });
    const html = renderToStaticMarkup(
      createElement(CreditInstructions, {
        markdown: (await one<{ instructions: string }>(
          db,
          "SELECT instructions FROM credit_types WHERE id='fake_credit'",
        ))!.instructions,
      }),
    );
    assert.ok(
      html.includes("<ol>") &&
        !html.includes("<script>") &&
        !html.includes('href="javascript:'),
    );
    assert.equal(
      instructionInline("[x](https://u:p@example.com)")[0].href,
      undefined,
    );
    assert.equal(parseInstructions("1. One\n2. Two")[0].lines.length, 2);
  } finally {
    db.close();
  }
});
test("minimal profile requires explicit supported sex and one-line bio, with no skills requirement or public disclosure", async () => {
  const { db, service } = await setup();
  try {
    await service().command("complete-profile", {
      displayName: "Alice Example",
      gender: "non-binary",
      bio: "I build tools",
      socialLinks: [],
    });
    assert.equal(
      row(await service().view("/dashboard")).profile.complete,
      true,
    );
    await assert.rejects(
      service().command("complete-profile", {
        displayName: "Alice Example",
        gender: "prefer-not-to-say",
        bio: "I build tools",
      }),
    );
    await assert.rejects(
      service().command("complete-profile", {
        displayName: "Alice Example",
        bio: "I build tools",
      }),
    );
    const html = renderToStaticMarkup(
      createElement(ProfileFlow, {
        data: { me: { name: "" }, profile: {} },
        run: async () => ({}),
      }),
    );
    assert.ok(
      html.includes("Male") &&
        html.includes("Female") &&
        html.includes("Non-binary"),
    );
    assert.ok(
      !html.includes("prefer-not") &&
        !html.includes("skills") &&
        !html.includes("Signed in as"),
    );
  } finally {
    db.close();
  }
});
test("Delhi fill displacement is inverse, clamped and responsive; mask/Metro never receive motion", () => {
  assert.deepEqual(delhiOffset(2048, 768, 2048, 768), { x: -6, y: -4 });
  assert.deepEqual(delhiOffset(0, 0, 1024, 384), { x: 3, y: 2 });
  assert.deepEqual(delhiOffset(99999, -99999, 2048, 768), { x: -6, y: 4 });
  assert.deepEqual(delhiOffset(1, 1, 0, 1), { x: 0, y: 0 });
  assert.deepEqual(delhiOffset(1, 1, 100, 40, false), { x: 0, y: 0 });
});
test("public metadata uses only safe project projections; private routes and signed-in Rules remain noindex and authenticated", async () => {
  const { pageMetadata, safeJSONLD, xmlEscape } = await import("../lib/seo");
  for (const path of [
    "/dashboard",
    "/admin/participants",
    "/rules",
    "/profile",
    "/teams",
    "/submission",
  ]) {
    const m = pageMetadata(path);
    assert.equal(m.robots.index, false);
    assert.equal(m.openGraph, undefined);
  }
  assert.equal(pageMetadata("/projects").robots.index, true);
  assert.ok(!safeJSONLD({ x: "</script><script>alert(1)" }).includes("<"));
  assert.equal(xmlEscape("a&<b>"), "a&amp;&lt;b&gt;");
  const { db, service } = await setup();
  try {
    const anonymous = new PortalService(db, null, undefined);
    await assert.rejects(anonymous.view("/rules"), {
      code: "SIGN_IN_REQUIRED",
    });
    const rules = row(await service().view("/rules"));
    assert.equal(rules.categories.length, 5);
    assert.ok(JSON.stringify(rules).includes("checked-in"));
    assert.ok(!JSON.stringify(rules).includes("blacklist"));
  } finally {
    db.close();
  }
});
test("admin defaults prioritize Registered members of earliest Locked teams; combined export filters and bulk statuses preserve facts", async () => {
  const { db, service, clock } = await setup();
  try {
    for (const [person, time] of [
      ["alice", "2026-10-23T08:00:00.000Z"],
      ["bob", "2026-10-23T09:00:00.000Z"],
    ]) {
      clock(time);
      await service(person).command("save-workspace-idea", {
        title: "Synthetic idea",
        core: "Synthetic completed idea",
        description: "Synthetic",
      });
      await service("admin").command("participant-bulk", {
        emails: [person + "@portal.test"],
        status: "pending",
        reason: "Synthetic approval queue",
      });
      await service(person).command("lock-team", { confirmation: "LOCK_TEAM" });
    }
    let view = row(await service("admin").view("/admin/participants"));
    assert.equal(view.items[0].id, "fake_alice");
    assert.equal(view.items[1].id, "fake_bob");
    await assert.rejects(
      db
        .prepare(
          "UPDATE memberships SET team_id='fake_team5' WHERE user_id='fake_alice'",
        )
        .all(),
      /TEAM_LOCKED/,
    );
    await service("admin").command("admin-status-bulk", {
      userIds: ["fake_alice", "fake_bob"],
      status: "Going",
      reason: "Synthetic reviewed approval",
      confirmation: "CHANGE_STATUS",
    });
    assert.equal((await teamStatus(service(), "fake_team1")).status, "Locked");
    assert.equal((await teamStatus(service(), "fake_team3")).status, "Locked");
    assert.equal((await rows(db, "SELECT * FROM manual_checkins")).length, 0);
    const { handleExport } = await import("../lib/http"),
      { fixtures } = await import("../scripts/fixtures");
    const response = await handleExport(
      new Request(
        "https://portal.test/api/export?list=participants&status=Going&teamStatus=Locked",
      ),
      { db, identity: fixtures.admin, key: undefined },
    );
    assert.equal(response.status, 200);
    const csv = await response.text();
    assert.ok(
      csv.includes("alice@portal.test") &&
        csv.includes("bob@portal.test") &&
        !csv.includes("eve@portal.test"),
    );
    assert.ok(
      !csv.includes("ciphertext") && !csv.includes("FAKE-NOT-REDEEMABLE"),
    );
    await service("admin").command("admin-status-bulk", {
      userIds: ["fake_alice", "fake_bob"],
      status: "Checked in",
      reason: "Synthetic organizer attendance",
      confirmation: "CHANGE_STATUS",
    });
    assert.equal(
      (await teamStatus(service(), "fake_team3")).status,
      "Not submitted",
    );
    assert.equal(
      (await one<{ active: number }>(db, "SELECT active FROM event_settings"))!
        .active,
      0,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      0,
    );
  } finally {
    db.close();
  }
});
test("zero AI weight removes only its score contribution and never overrides version eligibility", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice");
    clock("2026-11-01T04:00:00.000Z");
    await service().command("submit-project", { revision: 0, project });
    const w = row(await service().view("/submission")),
      p = w.project.id,
      v = w.attempts[0].id;
    for (const judge of ["judge", "judge2"]) {
      await service("admin").command("assign-project", {
        projectId: p,
        userId: "fake_" + judge,
        kind: "judge",
        reason: "Synthetic independent reviewer",
      });
      await service(judge).command("review-project", {
        projectId: p,
        versionId: v,
        rating: 8,
        body: "Synthetic verified review",
      });
    }
    await db
      .prepare(
        "UPDATE event_settings SET policy=json_set(policy,'$.weights.ai',0)",
      )
      .all();
    clock("2026-11-01T11:00:00.000Z");
    await service("admin").command("review", {
      teamId: "fake_team1",
      versionId: v,
      eligibility: "eligible",
      astra: null,
      codex: 3,
      diversity: 7,
      falseClaims: 0,
      evidence: "Synthetic manual assessment; no provider call",
      reason: "Synthetic zero contribution",
    });
    await service("admin").command("set-project-eligibility", {
      projectId: p,
      versionId: v,
      status: "eligible",
      reason: "Synthetic verified rule compliance",
    });
    const result = row(await service("owner").command("compute-results", {}));
    assert.equal(result.items[0].components.astra, 0);
    assert.equal(
      (await one<{ astra: number | null }>(db, "SELECT astra FROM reviews"))!
        .astra,
      null,
    );
    await service("admin").command("set-project-eligibility", {
      projectId: p,
      versionId: v,
      status: "ineligible",
      reason: "Synthetic established date violation",
      violation: {
        rule: "Repository creation after start",
        evidence: "Synthetic exact timestamp at cutoff",
      },
    });
    const excluded = row(await service("owner").command("compute-results", {}));
    assert.equal(excluded.items[0].components, null);
    assert.equal(excluded.items[0].eligibility, "ineligible");
  } finally {
    db.close();
  }
});
