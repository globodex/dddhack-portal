import {revealScores} from './helpers';
import { freezeResults } from "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, submission, rehearsalPolicy } from "./helpers";
import { one, rows } from "../lib/db";
import { scoreState } from "../lib/score-release";
import type { Policy } from "../lib/policy";
const row = (value: unknown) => value as Record<string, any>;
const project = (name = "Synthetic derived-readiness project") => ({
  projectName: name,
  problemSolution: submission.problemSolution,
  description: submission.description,
  github: submission.github,
  demo: "",
  logo: submission.logo,
  banner: submission.banner,
  attestation: true,
});
async function staleFlags(
  ctx: Awaited<ReturnType<typeof setup>>,
  actualScoring = false,
) {
  const current = await ctx.service().settings();
  const policy: Policy = {
    ...(actualScoring ? rehearsalPolicy : current.policy),
    operationScopes: [],
    confirmations: [],
    ...(actualScoring
      ? {
          scoringDisclosure: {
            ...rehearsalPolicy.scoringDisclosure!,
            confirmed: false,
          },
        }
      : {}),
  };
  await ctx.db
    .prepare("UPDATE event_settings SET active=0,policy=? WHERE id=1")
    .bind(JSON.stringify(policy))
    .all();
  return policy;
}

test("existing inactive flags do not block legitimate check-in and three submission attempts", async () => {
  const ctx = await setup();
  const { db, service, clock } = ctx;
  try {
    await staleFlags(ctx);
    clock("2026-11-01T04:00:00.000Z");
    const before = await one(db, "SELECT * FROM event_settings");
    await assert.rejects(
      service("admin").command("check-in", {
        userId: "fake_pending",
        reason: "Synthetic pending attendance",
      }),
      { code: "PORTAL_GOING_REQUIRED" },
    );
    await service("admin").command("check-in", {
      userId: "fake_alice",
      reason: "Synthetic legitimate attendance",
    });
    await service("admin").command("check-in", {
      userId: "fake_carol",
      reason: "Synthetic teammate attendance",
    });
    await assert.rejects(
      service("bob").command("submit-project", {
        revision: 0,
        project: project(),
      }),
      { code: "LEADER_CHECKIN_REQUIRED" },
    );
    await assert.rejects(
      service("carol").command("submit-project", {
        revision: 0,
        project: project(),
      }),
      { code: "LEADER_REQUIRED" },
    );
    await service().command("save-project", {
      revision: 0,
      project: project(),
    });
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      0,
    );
    let revision = 1;
    for (const attempt of [1, 2, 3]) {
      const payload = {
        revision,
        project: project(`Synthetic derived attempt ${attempt}`),
      };
      const result = await service().command("submit-project", payload);
      const retry = await service().command("submit-project", payload);
      assert.equal(result.versionId, retry.versionId);
      revision++;
    }
    assert.deepEqual(
      (
        await rows<{ attempt: number }>(
          db,
          "SELECT attempt FROM submission_versions WHERE team_id='fake_team1' ORDER BY attempt",
        )
      ).map((v) => v.attempt),
      [1, 2, 3],
    );
    await assert.rejects(
      service().command("submit-project", {
        revision,
        project: project("Fourth"),
      }),
      { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
    );
    await assert.rejects(
      service().command("save-project", {
        revision,
        project: project("Locked"),
      }),
      { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
    );
    assert.deepEqual(
      await one(db, "SELECT * FROM event_settings"),
      before,
      "Readiness never auto-enables, initializes or rewrites policy",
    );
    assert.equal((await rows(db, "SELECT * FROM result_snapshots")).length, 0);
    await assert.rejects(service("owner").command("reveal-ai-scores", {reason:"Synthetic retired action",confirmation:"PUBLIC_AI"}), {code:"USE_OWNER_SCORE_REVEAL"});
    assert.equal((await rows(db, "SELECT * FROM score_releases")).length, 0);
  } finally {
    db.close();
  }
});

test("derived submissions preserve real window boundaries and version-bound owner edits", async () => {
  const ctx = await setup();
  const { db, service, clock } = ctx;
  try {
    await staleFlags(ctx);
    clock("2026-11-01T04:00:00.000Z");
    await service("admin").command("check-in", {
      userId: "fake_alice",
      reason: "Synthetic attendance",
    });
    for (const time of [
      "2026-11-01T02:29:59.999Z",
      "2026-11-01T10:30:00.000Z",
    ]) {
      clock(time);
      await assert.rejects(
        service().command("submit-project", {
          revision: 0,
          project: project(),
        }),
        { code: "SUBMISSIONS_CLOSED" },
      );
    }
    clock("2026-11-01T04:00:00.000Z");
    const request = {
      open: "2026-11-01T03:00:00.000Z",
      close: "2026-11-01T11:00:00.000Z",
      reason: "Synthetic actual date change",
    };
    await assert.rejects(
      service("admin").command("preview-submission-window", request),
      { code: "OWNER_REQUIRED" },
    );
    const preview = await service("owner").command(
      "preview-submission-window",
      request,
    );
    await assert.rejects(
      service("owner").command("publish-submission-window", {
        ...request,
        version: preview.version,
        token: preview.token,
      }),
      { code: "POLICY_PREVIEW_CONFIRMATION_REQUIRED" },
    );
    await service("owner").command("publish-submission-window", {
      ...request,
      version: preview.version,
      token: preview.token,
      confirmation: "CHANGE_SUBMISSION_WINDOW",
    });
    await assert.rejects(
      service("owner").command("publish-submission-window", {
        ...request,
        version: preview.version,
        token: preview.token,
        confirmation: "CHANGE_SUBMISSION_WINDOW",
      }),
      { code: "POLICY_PREVIEW_CONFIRMATION_REQUIRED" },
    );
    assert.equal(
      (await rows(db, "SELECT * FROM event_policy_history")).length,
      1,
    );
    assert.equal((await service().settings()).active, 0);
    await service().command("submit-project", {
      revision: 0,
      project: project(),
    });
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      1,
    );
  } finally {
    db.close();
  }
});

test("retired AI-only release cannot publish marks through operational acknowledgments", async () => {
  const ctx = await setup();
  const { db, service, clock } = ctx;
  try {
    await staleFlags(ctx);
    clock("2026-11-01T04:00:00.000Z");
    await service("admin").command("check-in", {
      userId: "fake_alice",
      reason: "Synthetic attendance",
    });
    const committed = await service().command("submit-project", {
      revision: 0,
      project: project(),
    });
    await service("admin").command("set-project-eligibility", {
      projectId: committed.projectId,
      versionId: committed.versionId,
      status: "eligible",
      reason: "Synthetic current-version evidence",
    });
    clock("2026-11-01T13:00:00.000Z");
    await assert.rejects(
      service("admin").command("reveal-ai-scores", {
        reason: "Synthetic evidence gate",
        confirmation: "PUBLIC_AI",
      }),
      { code: "OWNER_REQUIRED" },
    );
    assert.equal((await rows(db, "SELECT * FROM score_releases")).length, 0);
    assert.equal((await rows(db, "SELECT * FROM result_snapshots")).length, 0);
  } finally {
    db.close();
  }
});

test("actual score coverage and owner-only publication preserve immutable final snapshots without staged awards", async () => {
  const ctx = await setup();
  const { db, service, clock } = ctx;
  try {
    await staleFlags(ctx, true);
    clock("2026-11-01T04:00:00.000Z");
    await service("admin").command("check-in", {
      userId: "fake_alice",
      reason: "Synthetic attendance",
    });
    const committed = await service().command("submit-project", {
      revision: 0,
      project: project(),
    });
    clock("2026-11-01T11:00:00.000Z");
    await assert.rejects(service("admin").command("compute-results", {}), {
      code: "REVIEW_INCOMPLETE",
    });
    await service("admin").command("review", {
      teamId: "fake_team1",
      versionId: committed.versionId,
      eligibility: "eligible",
      astra: 12,
      codex: 3,
      diversity: 4,
      falseClaims: 0,
      evidence: "Synthetic explicit score evidence",
      reason: "Synthetic review",
    });
    await assert.rejects(service("admin").command("compute-results", {}), {
      code: "SCORE_COVERAGE_INCOMPLETE",
    });
    await service("admin").command("review-project", {
      projectId: committed.projectId,
      versionId: committed.versionId,
      body: "Synthetic current-version human review",
      rating: 8,
    });
    assert.equal(
      row(await service("admin").command("compute-results", {})).items.length,
      1,
    );
    const preview = await service("owner").command("preview-freeze-results", {});
    assert.equal(preview.projects, 1, "Owner readiness can be previewed before any historical close time");
    clock("2026-11-01T13:00:00.000Z");
    const frozen = await freezeResults(service("owner"), {
      reason: "Synthetic actual score freeze",
    });
    await assert.rejects(
      service().command("save-project", {
        revision: 1,
        project: project("After freeze"),
      }),
      { code: "RESULTS_FROZEN" },
    );
    await assert.rejects(
      db
        .prepare("UPDATE result_snapshots SET payload='[]' WHERE id=?")
        .bind(frozen.snapshotId)
        .all(),
      /IMMUTABLE/,
    );
    await assert.rejects(
      service("owner").command("reveal-final-scores", {
        snapshotId: frozen.snapshotId,
        reason: "Synthetic reveal missing action confirmation",
        confirmation: "WRONG",
      }),
      { code: "USE_OWNER_SCORE_REVEAL" },
    );
    await revealScores(service("owner"),{reason:"Synthetic deliberate final reveal"});
    assert.equal((await scoreState(service())).stage, "final");
    assert.equal((await scoreState(service())).complete, true);
    assert.equal((await rows(db, "SELECT * FROM winner_reveals")).length, 0);
    assert.equal((await service().settings()).active, 0);
  } finally {
    db.close();
  }
});
