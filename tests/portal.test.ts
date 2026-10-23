import { attend } from "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, submission, rehearsalPolicy } from "./helpers";
import { batch, one, rows } from "../lib/db";
import { fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { policyBlockers, draftPolicy, ist } from "../lib/policy";
import { score, githubEligibility, reportSchema } from "../lib/evaluation";
import {
  csvCell,
  parseCSV,
  feedbackQuality,
  seal,
  unseal,
} from "../lib/security";
import { sitesIdentity, signInPath } from "../lib/identity";
import { handlePortal, handleExport } from "../lib/http";
test("owner derives only from trusted Sites identity; local header spoofing and unsafe return paths fail", () => {
  assert.throws(
    () =>
      sitesIdentity(
        new Request("https://portal.test", {
          headers: {
            "oai-authenticated-user-email": "connectwithparam.30@gmail.com",
          },
        }),
        {},
      ),
    /SITES_DISPATCH/,
  );
  assert.equal(
    sitesIdentity(new Request("https://portal.test"), {
      PORTAL_RUNTIME: "sites",
      PORTAL_TRUST_SITES_DISPATCH: "true",
    }),
    null,
  );
  assert.throws(() => signInPath("//evil.test"));
  assert.throws(() => signInPath("/\\evil.test"));
  assert.equal(
    signInPath("/dashboard"),
    "/signin-with-chatgpt?return_to=%2Fdashboard",
  );
});
test("unresolved scoring content blocks activation while genuine attendance guards submission", async () => {
  const { db, service } = await setup();
  assert(!policyBlockers(draftPolicy).includes("submissionCutoff"));
  assert(
    policyBlockers(draftPolicy).includes("non-demographic diversity rubric"),
  );
  assert.deepEqual(policyBlockers(rehearsalPolicy), []);
  await assert.rejects(
    service("admin").command("activate", { reason: "test" }),
    /OWNER_REQUIRED/,
  );
  await assert.rejects(
    service("owner").command("activate", { reason: "test" }),
    /diversity/,
  );
  await assert.rejects(service().command("submit", submission), {
    code: "TEAM_CHECKIN_REQUIRED",
  });
  db.close();
});
test("registered approval, single membership and five-person constraints; request/invite acceptance", async () => {
  const { db, service } = await setup();
  await assert.rejects(
    service("pending").command("create-team", { name: "No" }),
    /APPROVAL_REQUIRED/,
  );
  await assert.rejects(
    service("alice").command("create-team", { name: "No" }),
    /ALREADY/,
  );
  await service("admin").command("create-team", { name: "Staff team" });
  await service("owner").command("team-request", { teamId: "fake_team1" });
  const a = await one<{ id: string }>(
    db,
    "SELECT id FROM team_actions WHERE user_id='fake_owner'",
  );
  await service("alice").command("team-respond", {
    id: a!.id,
    decision: "accepted",
  });
  assert.equal((await service("owner").team("fake_owner"))?.id, "fake_team1");
  await service("admin").command("registration", {
    email: "stranger@portal.test",
    status: "approved",
    reason: "fake registration",
  });
  await service("eve").command("team-invite", {
    teamId: "fake_team5",
    email: "stranger@portal.test",
  });
  const full = await one<{ id: string }>(
    db,
    "SELECT id FROM team_actions WHERE user_id='fake_stranger'",
  );
  await db
    .prepare(
      "INSERT INTO luma_roster VALUES('stranger@portal.test','fake_admin','2026-10-23')",
    )
    .all();
  await assert.rejects(
    service("stranger").command("team-respond", {
      id: full!.id,
      decision: "accepted",
    }),
    /TEAM_FULL/,
  );
  assert.equal(
    (await one<{ status: string }>(
      db,
      "SELECT status FROM team_actions WHERE id=?",
      full!.id,
    ))!.status,
    "pending",
  );
  db.close();
});
test("whole idea locks exactly with the roster at the IST boundary and no public idea/profile/gender leak", async () => {
  const { db, service, clock } = await setup();
  clock("2026-10-29T18:28:59.999Z");
  await service().command("idea", {
    title: "Final core",
    core: "The immutable concept",
    description: "First description",
  });
  clock("2026-10-29T18:29:00.000Z");
  await assert.rejects(
    service().command("idea", {
      title: "Changed core",
      core: "Changed",
      description: "New",
    }),
    /IDEA_LOCKED/,
  );
  await assert.rejects(
    service().command("idea", {
      title: "Final core",
      core: "The immutable concept",
      description: "Better description",
    }),
    /IDEA_LOCKED/,
  );
  await assert.rejects(
    new PortalService(db, null, LOCAL_CREDIT_KEY).view("/teams/fake_team1"),
    /SIGN_IN_REQUIRED/,
  );
  assert.equal((await rows(db, "SELECT * FROM idea_revisions")).length, 1);
  await activate(db);
  clock("2026-10-29T18:29:00.000Z");
  await assert.rejects(
    service("owner").command("create-team", { name: "Frozen" }),
    /MEMBERSHIP_FROZEN/,
  );
  assert.match(ist("2026-10-28T18:29:00.000Z"), /11:59/);
  db.close();
});
test("check-in allocations are idempotent, encrypted, private and retryable after inventory exhaustion", async () => {
  const { db, service } = await setup();
  await activate(db);
  await assert.rejects(
    service("admin").command("check-in", {
      userId: "fake_pending",
      reason: "test",
    }),
    /PORTAL_GOING_REQUIRED/,
  );
  await Promise.all(
    Array.from({ length: 20 }, () =>
      service("admin").command("check-in", {
        userId: "fake_alice",
        reason: "physical verification rehearsal",
      }),
    ),
  );
  assert.equal(
    (
      await rows(
        db,
        "SELECT * FROM credit_allocations WHERE user_id='fake_alice'",
      )
    ).length,
    1,
  );
  await assert.rejects(
    service().command("reveal-credit", {
      typeId: "fake_credit",
      userId: "fake_bob",
    }),
  );
  const c = await service().command("reveal-credit", { typeId: "fake_credit" });
  assert.match(String(c.value), /^FAKE-NOT-REDEEMABLE/);
  await assert.rejects(
    service("bob").command("reveal-credit", { typeId: "fake_credit" }),
    /CHECKIN_REQUIRED/,
  );
  await assert.rejects(
    service("judge").view("/dashboard/credits"),
    /JUDGES_CANNOT/,
  );
  await assert.rejects(
    service("judge").view("/admin/credits"),
    /ADMIN_REQUIRED/,
  );
  const raw = JSON.stringify(
    await rows(db, "SELECT ciphertext FROM credit_inventory"),
  );
  assert(!raw.includes("FAKE-NOT-REDEEMABLE"));
  assert(
    !JSON.stringify(await rows(db, "SELECT * FROM audit_logs")).includes(
      "FAKE-NOT-REDEEMABLE",
    ),
  );
  const t = await service("admin").command("credit-type", {
    name: "New empty pool",
    instructions: "FAKE",
  });
  await service("admin").command("allocate", { userId: "fake_alice" });
  assert.equal(
    (
      await rows(
        db,
        "SELECT * FROM credit_allocations WHERE user_id='fake_alice'",
      )
    ).length,
    1,
  );
  const csv = "value\nFAKE-LATE-CODE";
  const p = await service("admin").command("preview-import", {
    kind: "credits",
    typeId: t.id,
    csv,
  });
  await service("admin").command("commit-import", {
    kind: "credits",
    typeId: t.id,
    csv,
    digest: p.digest,
  });
  await service("admin").command("allocate", { userId: "fake_alice" });
  assert.equal(
    (
      await rows(
        db,
        "SELECT * FROM credit_allocations WHERE user_id='fake_alice'",
      )
    ).length,
    2,
  );
  db.close();
});
test("CSV previews, duplicate handling, formula protection and AES-GCM integrity", async () => {
  assert.deepEqual(parseCSV('email\r\n"a@example.test"\r\n'), [
    ["email"],
    ["a@example.test"],
  ]);
  assert.throws(() => parseCSV('email\n"bad'));
  assert.equal(csvCell(' =HYPERLINK("bad")'), '"\' =HYPERLINK(""bad"")"');
  assert.equal(csvCell("@SUM(1)"), '"\'@SUM(1)"');
  const value = await seal("FAKE", LOCAL_CREDIT_KEY);
  assert.equal(await unseal(value, LOCAL_CREDIT_KEY), "FAKE");
  await assert.rejects(unseal(value + "x", LOCAL_CREDIT_KEY));
  const { db, service } = await setup();
  const duplicatePreview = await service("admin").command("preview-import", {
    kind: "roster",
    csv: "email\nA@example.test\na@example.test",
  });
  assert.equal(
    (duplicatePreview.counts as { duplicates: number }).duplicates,
    1,
  );
  await assert.rejects(
    service("admin").command("commit-import", {
      kind: "roster",
      csv: "email\nnew@example.test",
      digest: "untrusted",
    }),
    /PREVIEW_REQUIRED/,
  );
  const p = await service("admin").command("preview-import", {
    kind: "roster",
    csv: "email\nalice@portal.test\nnew@example.test",
  });
  await service("admin").command("commit-import", {
    kind: "roster",
    csv: "email\nalice@portal.test\nnew@example.test",
    digest: p.digest,
  });
  assert.equal(
    (await one<{ status: string }>(
      db,
      "SELECT status FROM registrations WHERE email='alice@portal.test'",
    ))!.status,
    "approved",
  );
  db.close();
});
test("only leader can commit; exactly three successful versions, invalid fields/cutoff do not consume attempts", async () => {
  const { db, service, clock } = await setup();
  await activate(db);
  await attend(db, "fake_alice", "fake_bob", "fake_eve");
  clock("2026-11-01T06:00:00.000Z");
  await assert.rejects(
    service("carol").command("submit", submission),
    /LEADER_REQUIRED/,
  );
  await assert.rejects(
    service().command("submit", {
      ...submission,
      github: "http://localhost:8888",
    }),
  );
  assert.equal((await rows(db, "SELECT * FROM submission_versions")).length, 0);
  const outcomes = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      service().command("submit", {
        ...submission,
        projectName: "Attempt " + i,
      }),
    ),
  );
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 3);
  assert.equal((await rows(db, "SELECT * FROM astra_jobs")).length, 3);
  clock("2026-11-01T10:30:00.000Z");
  await assert.rejects(
    service().command("submit", submission),
    /SUBMISSIONS_CLOSED|CHECK/,
  );
  assert.equal((await rows(db, "SELECT * FROM submission_versions")).length, 3);
  db.close();
});
test("external evaluation failure and invalid model output preserve submission; uncertainty is reviewable", async () => {
  assert.equal(githubEligibility(null), "NEEDS_MANUAL_REVIEW");
  assert.equal(
    githubEligibility({
      public: true,
      createdAt: "2026-11-01T02:30:01Z",
      firstCommit: "2026-11-01T02:30:02Z",
    }),
    "ELIGIBLE",
  );
  assert.equal(
    githubEligibility({
      public: true,
      createdAt: "2026-10-31T18:29:59Z",
      firstCommit: "2026-11-01T00:00:00Z",
    }),
    "INELIGIBLE",
  );
  assert.equal(
    githubEligibility({
      public: false,
      createdAt: "2026-11-01T00:00:00Z",
      firstCommit: "2026-11-01T00:00:00Z",
    }),
    "NEEDS_MANUAL_REVIEW",
  );
  assert.equal(
    githubEligibility({
      public: true,
      createdAt: "invalid",
      firstCommit: null,
    }),
    "NEEDS_MANUAL_REVIEW",
  );
  const { db, service, clock } = await setup();
  await activate(db);
  await attend(db, "fake_alice", "fake_bob", "fake_eve");
  clock("2026-11-01T06:00:00.000Z");
  await service().command("submit", submission);
  clock("2026-11-01T11:00:00.000Z");
  const j = (await rows<{ id: string }>(db, "SELECT id FROM astra_jobs"))[0];
  const bad = service("admin");
  bad.evaluator = {
    async evaluate() {
      throw new Error("timeout secret should not be logged");
    },
  };
  await bad.command("astra-run", { jobId: j.id });
  assert.equal(
    (await one<{ state: string }>(db, "SELECT state FROM astra_jobs"))!.state,
    "failed_retryable",
  );
  await service("admin").command("astra-run", { jobId: j.id });
  assert.equal(
    (await one<{ state: string }>(db, "SELECT state FROM astra_jobs"))!.state,
    "needs_review",
  );
  assert.equal((await rows(db, "SELECT * FROM submission_versions")).length, 1);
  assert(
    !JSON.stringify(await rows(db, "SELECT * FROM astra_jobs")).includes(
      "timeout secret",
    ),
  );
  db.close();
});
test("three distinct votes, no own-team or duplicate votes, meaningful feedback and bounded scoring", async () => {
  const { db, service, clock } = await setup();
  await activate(db);
  await attend(db, "fake_alice", "fake_bob", "fake_eve");
  clock("2026-11-01T06:00:00.000Z");
  await service().command("submit", submission);
  for (const leader of ["bob", "eve"]) {
    const m = await rows<{ user_id: string }>(
      db,
      "SELECT user_id FROM memberships WHERE team_id=?",
      leader === "bob" ? "fake_team3" : "fake_team5",
    );
    await service(leader).command("submit", {
      ...submission,
      contributions: m.map((x) => ({
        userId: x.user_id,
        role: "Meaningful implementation",
        codex: "Used Codex for testing",
      })),
    });
  }
  await service("admin").command("check-in", {
    userId: "fake_bob",
    reason: "test",
  });
  clock("2026-11-01T10:45:00.000Z");
  await assert.rejects(
    service("bob").command("vote", { teamId: "fake_team3" }),
    /OWN_TEAM/,
  );
  await service("bob").command("vote", { teamId: "fake_team1" });
  await assert.rejects(
    service("bob").command("vote", { teamId: "fake_team1" }),
  );
  assert(
    feedbackQuality(
      "Good layout, but the search button failed twice while testing.",
    ),
  );
  assert(!feedbackQuality("good"));
  assert(!feedbackQuality("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  await service("bob").command("feedback", {
    teamId: "fake_team1",
    text: "Good layout, but the search button failed twice while testing.",
  });
  await assert.rejects(
    service("bob").command("feedback", {
      teamId: "fake_team5",
      text: "Good layout, but the search button failed twice while testing.",
    }),
    /DUPLICATE_FEEDBACK/,
  );
  const result = score({
    human: [8, 9, 7, 8, 9],
    astra: 24,
    codex: 4,
    diversity: 7,
    votes: 4,
    maxVotes: 4,
    voteFormula: "sqrt-relative",
    voteTarget: 10,
    feedback: 100,
    feedbackTarget: 10,
    falseClaims: 1,
    eligible: true,
  });
  assert.equal(result!.human, 41);
  assert.equal(result!.bonus, 5);
  assert.equal(result!.total, 81);
  assert.equal(
    score({
      human: [],
      astra: 30,
      codex: 5,
      diversity: 10,
      votes: 0,
      maxVotes: 0,
      voteFormula: "sqrt-relative",
      voteTarget: 10,
      feedback: 0,
      feedbackTarget: 10,
      falseClaims: 0,
      eligible: false,
    }),
    null,
  );
  assert.throws(() =>
    score({
      human: [11],
      astra: 31,
      codex: 5,
      diversity: 10,
      votes: 0,
      maxVotes: 0,
      voteFormula: "sqrt-relative",
      voteTarget: 10,
      feedback: 0,
      feedbackTarget: 10,
      falseClaims: 0,
      eligible: true,
    }),
  );
  db.close();
});
test("full mock rehearsal: two equal-weight judges, human review, owner freeze, immutable private snapshot and publication", async () => {
  const { db, service, clock } = await setup();
  await activate(db);
  await attend(db, "fake_alice", "fake_bob", "fake_eve");
  clock("2026-11-01T06:00:00.000Z");
  const v = await service().command("submit", submission);
  await service("owner").command("assign-judge", {
    judgeId: "fake_judge",
    teamId: "fake_team1",
    reason: "assignment",
  });
  await service("owner").command("assign-judge", {
    judgeId: "fake_judge2",
    teamId: "fake_team1",
    reason: "assignment",
  });
  clock("2026-11-01T11:00:00.000Z");
  await service("judge").command("judge-score", {
    teamId: "fake_team1",
    rating: 8,
    notes: "Strong prototype",
  });
  await service("judge2").command("judge-score", {
    teamId: "fake_team1",
    rating: 10,
    notes: "Clear explanation",
  });
  await assert.rejects(
    service("judge").command("review", {}),
    /ADMIN_REQUIRED/,
  );
  await service("admin").command("review", {
    teamId: "fake_team1",
    versionId: v.id,
    eligibility: "eligible",
    astra: 24,
    codex: 4,
    diversity: 7,
    falseClaims: 0,
    evidence:
      "FAKE: repository metadata and build verified in a mocked rehearsal; no real API checks.",
    reason: "manual review",
  });
  await assert.rejects(
    service("admin").command("freeze-results", { reason: "test" }),
    /OWNER_REQUIRED/,
  );
  assert.equal(
    ((await service().view("/winners")).items as unknown[]).length,
    0,
  );
  clock("2026-11-01T13:00:00.000Z");
  const frozen = await service("owner").command("freeze-results", {
    reason: "Rehearsal completed",
  });
  await assert.rejects(
    service("admin").command("review", {
      teamId: "fake_team1",
      versionId: v.id,
      eligibility: "eligible",
      astra: 30,
      codex: 5,
      diversity: 10,
      falseClaims: 0,
      evidence: "Changed",
      reason: "changed",
    }),
    /RESULTS_FROZEN/,
  );
  await assert.rejects(
    batch(db, [["UPDATE result_snapshots SET payload='[]'"]]),
    /IMMUTABLE/,
  );
  await assert.rejects(
    service("owner").command("publish-results", {
      snapshotId: frozen.snapshotId,
      reason: "FAKE local reveal",
    }),
    /USE_STAGED_SCORE_REVEAL/,
  );
  assert.equal(
    ((await service().view("/winners")).items as unknown[]).length,
    0,
  );
  db.close();
});
test("HTTP security: CSRF, IDOR, role bypass, export permissions, cache controls and bounded body", async () => {
  const { db } = await setup();
  const rt = {
    db,
    identity: fixtures.alice,
    key: LOCAL_CREDIT_KEY,
    localTest: true,
  };
  const forged = await handlePortal(
    new Request("http://127.0.0.1:5173/api/portal", {
      method: "POST",
      headers: {
        origin: "https://attacker.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "role",
        data: { userId: "fake_alice", role: "admin" },
      }),
    }),
    rt,
  );
  assert.equal(forged.status, 403);
  const req = (action: string, data: unknown) =>
    new Request("http://127.0.0.1:5173/api/portal", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, data }),
    });
  assert.equal(
    (
      await handlePortal(
        req("role", {
          userId: "fake_alice",
          role: "admin",
          reason: "escalate",
        }),
        rt,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleExport(
        new Request("http://127.0.0.1:5173/api/export?list=credits"),
        rt,
      )
    ).status,
    403,
  );
  const admin = { ...rt, identity: fixtures.admin };
  const exp = await handleExport(
    new Request("http://127.0.0.1:5173/api/export?list=credits"),
    admin,
  );
  assert.equal(exp.status, 200);
  assert(!(await exp.text()).includes("ciphertext"));
  assert.match(exp.headers.get("cache-control")!, /no-store/);
  assert.equal(
    (await handlePortal(req("profile", { bio: "x".repeat(600001) }), rt))
      .status,
    413,
  );
  db.close();
});
