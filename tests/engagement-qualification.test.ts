import { attend } from "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, rehearsalPolicy } from "./helpers";
import { one, rows, batch } from "../lib/db";
import { qualifiedEngagement } from "../lib/engagement-scoring";
import { policyBlockers, type Policy } from "../lib/policy";
import { syntheticImage } from "./fixture-images";
type Row = Record<string, any>;
const project = {
  projectName: "Qualified Rehearsal",
  problemSolution: "Synthetic points separation",
  description: "Reproducible synthetic test",
  github: "https://github.com/example/rehearsal",
  commitSha: "a".repeat(40),
  demo: "",
  logo: syntheticImage(64, 64),
  banner: syntheticImage(160, 90),
  tools: "Codex",
  contributions: [
    {
      userId: "fake_alice",
      role: "Implemented fixture",
      codex: "Verified the tests",
    },
  ],
  attestation: true,
};
const rules = {
  confirmed: true,
  version: 1,
  voters: "approved-checked-in-other-team" as const,
  feedbackAuthors: "approved-checked-in-other-team" as const,
  feedbackReview: "staff-qualified" as const,
  feedbackDuplicates: "exclude-exact-normalized-copies" as const,
};
const policy: Policy = {
  ...rehearsalPolicy,
  projectEngagementRule: "score-with-approved-normalization",
  engagementQualification: rules,
  engagementOpen: "2026-11-01T04:00:00.000Z",
  engagementClose: "2026-11-01T12:00:00.000Z",
};
async function prepared() {
  const ctx = await setup();
  await activate(ctx.db);
  await attend(ctx.db, "fake_alice");
  ctx.clock("2026-11-01T04:00:00.000Z");
  await ctx
    .service("alice")
    .command("submit-project", { revision: 0, project });
  const v = (await ctx.service("alice").view("/submission")) as Row;
  const id = v.project.id,
    version = v.attempts[0].id;
  await ctx.service("admin").command("set-project-eligibility", {
    projectId: id,
    versionId: version,
    status: "eligible",
    reason: "Synthetic verified eligibility",
  });
  return { ...ctx, id, version };
}
async function configure(db: any, p = policy) {
  await batch(db, [
    ["UPDATE event_settings SET policy=? WHERE id=1", JSON.stringify(p)],
  ]);
}
const body =
  "The search workflow worked in my test, but keyboard focus needs a clearer indicator.";
async function comment(
  db: any,
  id: string,
  projectId: string,
  user: string,
  text = body,
  time = "2026-11-01T04:10:00.000Z",
) {
  await batch(db, [
    [
      "INSERT INTO project_comments VALUES(?,?,?,?,?)",
      id,
      projectId,
      "fake_" + user,
      text,
      time,
    ],
  ]);
}
async function qualify(
  service: any,
  commentId: string,
  versionId: string,
  qualified = true,
) {
  return service("admin").command("qualify-project-feedback", {
    commentId,
    versionId,
    qualified,
    reason: "Synthetic staff judgement based on the described project test",
  });
}
test("scored engagement stays disabled without explicit qualification policy; public interactions remain available and unchanged", async () => {
  const { db, service, id, version } = await prepared();
  try {
    await service("pending").command("upvote-project", { projectId: id });
    await service("pending").command("comment-project", {
      projectId: id,
      body: "Public comment remains independent of judging qualification.",
    });
    const unconfirmed = { ...policy, engagementQualification: null };
    await configure(db, unconfirmed);
    assert.ok(
      policyBlockers(unconfirmed).includes(
        "confirmed engagement qualification rules",
      ),
    );
    await assert.rejects(qualifiedEngagement(db, unconfirmed, id, version), {
      code: "ENGAGEMENT_SCORING_NOT_CONFIGURED",
    });
    const c = (await rows<Row>(db, "SELECT id FROM project_comments"))[0];
    await assert.rejects(qualify(service, c.id, version), {
      code: "ENGAGEMENT_SCORING_NOT_CONFIGURED",
    });
    const publicView = (await service("pending").view(
      "/projects/" +
        ((await service("alice").view("/submission")) as Row).project.slug,
    )) as Row;
    assert.equal(publicView.comments.length, 1);
    assert.equal(publicView.items[0].upvotes, 1);
    assert.ok(!JSON.stringify(publicView).includes("rule_version"));
    assert.equal(
      (await rows(db, "SELECT * FROM project_feedback_reviews")).length,
      0,
    );
  } finally {
    db.close();
  }
});
test("qualified scoring filters declared audience/windows, requires staff review, deduplicates authors/copies and ignores late public comments", async () => {
  const { db, service, id, version } = await prepared();
  try {
    await configure(db);
    await service("admin").command("participant-bulk", {
      emails: ["bob@portal.test", "carol@portal.test", "dave@portal.test"],
      checkIn: true,
      reason: "Synthetic attendance facts",
    });
    for (const [user, time] of [
      ["bob", "2026-11-01T04:10:00.000Z"],
      ["carol", "2026-11-01T03:59:59.999Z"],
      ["alice", "2026-11-01T04:10:00.000Z"],
      ["pending", "2026-11-01T04:10:00.000Z"],
      ["dave", "2026-11-01T12:00:00.000Z"],
    ])
      await batch(db, [
        ["INSERT INTO project_upvotes VALUES(?,?,?)", id, "fake_" + user, time],
      ]);
    await comment(db, "original", id, "bob", body, "2026-11-01T04:10:00.000Z");
    await comment(
      db,
      "same-author",
      id,
      "bob",
      body,
      "2026-11-01T04:11:00.000Z",
    );
    await comment(
      db,
      "copy",
      id,
      "carol",
      body.toLowerCase(),
      "2026-11-01T04:12:00.000Z",
    );
    await comment(
      db,
      "pending-review",
      id,
      "dave",
      "I tested the export and found the generated CSV useful, although empty states need guidance.",
      "2026-11-01T04:13:00.000Z",
    );
    await comment(db, "own", id, "alice");
    await comment(db, "unapproved", id, "pending");
    await comment(db, "late", id, "carol", body, "2026-11-01T12:00:00.000Z");
    let counted = await qualifiedEngagement(db, policy, id, version);
    assert.equal(counted.votes, 1);
    assert.equal(counted.feedback, 0);
    assert.equal(counted.pendingFeedback, 3);
    await assert.rejects(
      service("alice").command("qualify-project-feedback", {
        commentId: "original",
        versionId: version,
        qualified: true,
        reason: "Synthetic forbidden self judgement",
      }),
      /ADMIN_REQUIRED/,
    );
    for (const c of ["original", "same-author", "copy"])
      await qualify(service, c, version);
    counted = await qualifiedEngagement(db, policy, id, version);
    assert.equal(counted.feedback, 1);
    assert.equal(counted.pendingFeedback, 1);
    await qualify(service, "pending-review", version, false);
    counted = await qualifiedEngagement(db, policy, id, version);
    assert.deepEqual(counted, { votes: 1, feedback: 1, pendingFeedback: 0 });
    assert.equal((await rows(db, "SELECT * FROM project_comments")).length, 7);
    const revisedPolicy = {
      ...policy,
      engagementQualification: { ...rules, version: 2 },
    };
    await configure(db, revisedPolicy);
    counted = await qualifiedEngagement(db, revisedPolicy, id, version);
    assert.equal(counted.feedback, 0);
    assert.equal(counted.pendingFeedback, 3);
  } finally {
    db.close();
  }
});
test("qualification binds comment text and submission/rule version, records immutable decisions and respects result freeze", async () => {
  const { db, service, id, version } = await prepared();
  try {
    await configure(db);
    await service("admin").command("participant-bulk", {
      emails: ["bob@portal.test"],
      checkIn: true,
      reason: "Synthetic attendance",
    });
    await comment(db, "body-bound", id, "bob");
    await qualify(service, "body-bound", version);
    assert.equal(
      (await qualifiedEngagement(db, policy, id, version)).feedback,
      1,
    );
    await batch(db, [
      [
        "UPDATE project_comments SET body=? WHERE id='body-bound'",
        "I tested a different feature after editing this comment, so the previous review cannot qualify it.",
      ],
    ]);
    assert.equal(
      (await qualifiedEngagement(db, policy, id, version)).feedback,
      0,
    );
    assert.equal(
      (await qualifiedEngagement(db, policy, id, version)).pendingFeedback,
      1,
    );
    await assert.rejects(
      qualify(service, "body-bound", "not-current-version"),
      /PROJECT_VERSION_CHANGED/,
    );
    await qualify(service, "body-bound", version);
    assert.equal(
      (await qualifiedEngagement(db, policy, id, version)).feedback,
      1,
    );
    await assert.rejects(
      batch(db, [["UPDATE project_feedback_reviews SET qualified=0"]]),
      /IMMUTABLE/,
    );
    const revision = (await one<Row>(
      db,
      "SELECT version FROM scoring_revision",
    ))!.version;
    const settings = await service("owner").settings();
    await batch(db, [
      [
        "INSERT INTO result_snapshots VALUES('qualification-freeze',?,?, '[]',?,'fake_owner')",
        settings.version,
        revision,
        "2026-11-01",
      ],
    ]);
    await assert.rejects(
      qualify(service, "body-bound", version, false),
      /RESULTS_FROZEN/,
    );
  } finally {
    db.close();
  }
});

test("final computation refuses pending scored feedback and uses only reviewed valid authors after qualification", async () => {
  const { db, service, clock, id, version } = await prepared();
  try {
    await configure(db);
    await service("admin").command("participant-bulk", {
      emails: ["bob@portal.test"],
      checkIn: true,
      reason: "Synthetic scoring attendance",
    });
    await comment(db, "scoring-pending", id, "bob");
    for (const judge of ["judge", "judge2"]) {
      await service("owner").command("assign-project", {
        projectId: id,
        userId: "fake_" + judge,
        kind: "judge",
        reason: "Synthetic independent reviewer",
      });
      await service(judge).command("review-project", {
        projectId: id,
        versionId: version,
        body: "Synthetic private advice",
        rating: 8,
      });
    }
    clock("2026-11-01T11:00:00.000Z");
    await service("admin").command("review", {
      teamId: "fake_team1",
      versionId: version,
      eligibility: "eligible",
      astra: 20,
      codex: 3,
      diversity: 7,
      falseClaims: 0,
      evidence: "Synthetic manually verified rubric evidence",
      reason: "Synthetic rubric review",
    });
    await assert.rejects(service("owner").command("compute-results", {}), {
      code: "ENGAGEMENT_REVIEW_INCOMPLETE",
    });
    await qualify(service, "scoring-pending", version, false);
    let scores = (await service("owner").command("compute-results", {})) as Row;
    assert.equal(scores.items[0].components.bonus, 0);
    await qualify(service, "scoring-pending", version, true);
    scores = (await service("owner").command("compute-results", {})) as Row;
    assert.equal(scores.items[0].components.bonus, 0.5);
    assert.equal((await rows(db, "SELECT * FROM project_comments")).length, 1);
  } finally {
    db.close();
  }
});
