import { attend } from "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, submission } from "./helpers";
import { one, rows, batch } from "../lib/db";
import { draftPolicy, baseWeights, policyBlockers } from "../lib/policy";
import { score } from "../lib/evaluation";
type Row = Record<string, any>;
test("confirmed rules have no admission cap, one roster/idea lock and the sole 16:00 IST deadline", () => {
  assert.equal(draftPolicy.capacity, null);
  assert.equal(draftPolicy.capacityRule, "no-strict-cap");
  assert.equal(draftPolicy.ideaLock, "2026-10-29T18:29:00.000Z");
  assert.equal(draftPolicy.membershipFreeze, draftPolicy.ideaLock);
  assert.equal(draftPolicy.submissionClose, "2026-11-01T10:30:00.000Z");
  assert.equal(draftPolicy.revealOrder, "manual");
  assert.equal(
    Object.values(baseWeights).reduce((a, b) => a + b, 0),
    105,
  );
  assert.ok(!policyBlockers(draftPolicy).includes("confirmed event capacity"));
});
test("owner-only positive extension previews IST rollover, requires matching confirmation, versions/audits and changes server cutoff without touching submissions", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice");
    const configured = JSON.parse(
      (await one<Row>(db, "SELECT policy FROM event_settings"))!.policy,
    );
    await batch(db, [
      [
        "UPDATE event_settings SET policy=?",
        JSON.stringify({
          ...configured,
          judgingClose: "2026-11-02T12:30:00.000Z",
        }),
      ],
    ]);
    clock("2026-11-01T04:00:00.000Z");
    await service("alice").command("submit", submission);
    const current = (await one<Row>(db, "SELECT * FROM event_settings"))!,
      request = { version: current.version, minutes: 600 };
    for (const who of ["admin", "alice"])
      await assert.rejects(
        service(who).command("preview-submission-extension", request),
        /OWNER_REQUIRED/,
      );
    for (const minutes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER])
      await assert.rejects(
        service("owner").command("preview-submission-extension", {
          ...request,
          minutes,
        }),
      );
    const preview = await service("owner").command(
      "preview-submission-extension",
      request,
    );
    assert.equal(preview.after, "2026-11-01T20:30:00.000Z");
    assert.match(String(preview.label), /2 Nov 2026/);
    assert.equal(
      (await one<Row>(db, "SELECT version FROM event_settings"))!.version,
      current.version,
    );
    await assert.rejects(
      service("owner").command("publish-submission-extension", {
        ...request,
        preview: "forged",
        confirmation: "EXTEND_DEADLINE",
        reason: "Synthetic extension",
      }),
      /PREVIEW_CONFIRMATION/,
    );
    const submit = {
      ...request,
      preview: preview.preview,
      confirmation: "EXTEND_DEADLINE",
      reason: "Synthetic rollover extension",
    };
    await service("owner").command("publish-submission-extension", submit);
    await assert.rejects(
      service("owner").command("publish-submission-extension", submit),
      /POLICY_CHANGED_RELOAD/,
    );
    assert.equal(
      (await service("owner").view("/")).submissionClose,
      preview.after,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      1,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM event_policy_history")).length,
      1,
    );
    assert.ok(
      (await rows<Row>(db, "SELECT action FROM audit_logs")).some(
        (r) => r.action === "publish-submission-extension",
      ),
    );
    clock("2026-11-01T10:30:00.000Z");
    await service("alice").command("submit", {
      ...submission,
      description: "Synthetic valid after original cutoff",
    });
    clock("2026-11-01T20:30:00.000Z");
    await assert.rejects(
      service("alice").command("submit", submission),
      /SUBMISSIONS_CLOSED/,
    );
    await assert.rejects(
      batch(db, [["UPDATE event_policy_history SET reason='changed'"]]),
      /IMMUTABLE/,
    );
  } finally {
    db.close();
  }
});
test("global weights use one preview/version for all teams, reject per-team overrides and cannot alter frozen results", async () => {
  const { db, service } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice");
    const version = (await one<Row>(db, "SELECT version FROM event_settings"))!
      .version;
    const weights = { ...baseWeights, human: 60, ai: 20 };
    await assert.rejects(
      service("admin").command("preview-policy-weights", { version, weights }),
      /OWNER_REQUIRED/,
    );
    await assert.rejects(
      service("owner").command("preview-policy-weights", {
        version,
        weights,
        teamId: "fake_team1",
      }),
    );
    const preview = await service("owner").command("preview-policy-weights", {
      version,
      weights,
    });
    await service("owner").command("publish-policy-weights", {
      version,
      weights,
      preview: preview.preview,
      confirmation: "GLOBAL_SCORING",
      reason: "Synthetic global weights",
    });
    const settings = await service("owner").settings();
    assert.equal(settings.version, version + 1);
    assert.deepEqual(settings.policy.weights, weights);
    const input = {
      human: [8, 8],
      astra: 15,
      codex: 2.5,
      diversity: 5,
      votes: 0,
      maxVotes: 0,
      voteFormula: "sqrt-relative" as const,
      voteTarget: 10,
      feedback: 0,
      feedbackTarget: 10,
      falseClaims: 0,
      eligible: true,
    };
    const a = score({ ...input, weights: settings.policy.weights }),
      b = score({ ...input, weights: settings.policy.weights });
    assert.equal(a!.total, b!.total);
    assert.equal(a!.human, 48);
    assert.equal(a!.astra, 10);
    assert.equal(score({ ...input })!.human, 40);
    const rev = (await one<Row>(
      db,
      "SELECT version FROM scoring_revision WHERE id=1",
    ))!.version;
    await batch(db, [
      [
        "INSERT INTO result_snapshots VALUES('policy-frozen',?,?, '[]',?,'fake_owner')",
        settings.version,
        rev,
        "2026-11-01",
      ],
    ]);
    const next = await service("owner").command("preview-policy-weights", {
      version: settings.version,
      weights: baseWeights,
    });
    await assert.rejects(
      service("owner").command("publish-policy-weights", {
        version: settings.version,
        weights: baseWeights,
        preview: next.preview,
        confirmation: "GLOBAL_SCORING",
        reason: "Synthetic blocked after freeze",
      }),
      /RESULTS_FROZEN/,
    );
  } finally {
    db.close();
  }
});

test("roster and whole idea lock together by server clock, including an inactive draft event", async () => {
  const { db, service, clock } = await setup();
  try {
    clock("2026-10-29T18:28:59.999Z");
    await service("alice").command("save-workspace-idea", {
      title: "Pre-made team idea",
      core: "A synthetic confirmed team concept",
      description: "Synthetic details",
    });
    assert.equal(
      ((await service("alice").view("/dashboard")) as Row).idea.title,
      "Pre-made team idea",
    );
    clock("2026-10-29T18:29:00.000Z");
    await assert.rejects(
      service("alice").command("save-workspace-idea", {
        title: "Pre-made team idea",
        core: "A synthetic confirmed team concept",
        description: "An after-lock edit",
      }),
      /IDEA_LOCKED/,
    );
    await assert.rejects(
      service("pending").command("create-workspace-team", {
        name: "Too late",
        bio: "",
        avatar: "orbit",
        palette: "forest",
      }),
      /MEMBERSHIP_FROZEN/,
    );
    await assert.rejects(
      service("pending").command("request-team", { teamId: "fake_team1" }),
      /MEMBERSHIP_FROZEN/,
    );
    await assert.rejects(
      batch(db, [
        [
          "UPDATE ideas SET description='Bypass',updated_at=? WHERE team_id='fake_team1'",
          "2026-10-29T18:29:00.000Z",
        ],
      ]),
      /IDEA_LOCKED/,
    );
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM idea_revisions WHERE team_id='fake_team1'",
        )
      ).length,
      1,
    );
  } finally {
    db.close();
  }
});
