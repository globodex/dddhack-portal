import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import {
  draftPolicy,
  policySchema,
  policyBlockers,
  operationalBlockers,
  setupReadiness,
  type Policy,
} from "../lib/policy";
import { one, rows, batch } from "../lib/db";
import { syntheticImage } from "./fixture-images";
import { PortalService } from "../lib/service";
import { fixtures } from "../scripts/fixtures";
import { handlePortal } from "../lib/http";
type Row = Record<string, any>;
export const operationPolicy: Policy = {
  ...draftPolicy,
  operationScopes: [],
  deploymentRule:
    "SYNTHETIC: deployment link is optional for all projects; absence does not affect eligibility.",
  retentionNotice:
    "SYNTHETIC: retain rehearsal data only until test completion.",
  confirmations: [
    ...draftPolicy.confirmations,
    "submissionOpen",
    "deploymentRule",
    "privacyRetention",
    "lumaPolicy",
  ],
};
const project = {
  projectName: "Operational Rehearsal",
  problemSolution: "Synthetic test project",
  description: "Synthetic reproducible project instructions",
  github: "https://github.com/example/rehearsal",
  demo: "",
  logo: syntheticImage(64, 64),
  banner: syntheticImage(160, 90),
  tools: "Codex CLI",
  contributions: [
    {
      userId: "fake_alice",
      role: "Built the synthetic flow",
      codex: "Wrote and verified tests",
    },
  ],
  attestation: true,
};
async function configure(service: any) {
  await service("owner").command("settings", {
    policy: operationPolicy,
    reason: "Synthetic operational rules only",
  });
}
async function enable(service: any, operation: "submissions" | "checkin") {
  const s = await service("owner").settings();
  return service("owner").command("activate-operations", {
    operation,
    version: s.version,
    confirmation:
      operation === "submissions" ? "ENABLE_SUBMISSIONS" : "ENABLE_CHECKIN",
    reason: "Synthetic operational enablement",
  });
}
test("operational-only policy accepts valid submissions while judging and reveals remain blocked; scopes never enable each other", async () => {
  const { db, service, clock } = await setup();
  try {
    await configure(service);
    assert.deepEqual(operationalBlockers(operationPolicy, "submissions"), []);
    assert.ok(policyBlockers(operationPolicy).includes("diversity"));
    await enable(service, "submissions");
    clock("2026-11-01T04:00:00.000Z");
    const workspace = (await service("alice").view("/dashboard")) as Row;
    assert.equal(workspace.submissionStatus.allowed, true);
    const status = ((await service("owner").view("/admin/settings")) as Row)
      .readiness;
    assert.equal(status.scoring.ready, false);
    assert.equal(status.checkin.allowed, false);
    await service("alice").command("submit-project", { revision: 0, project });
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      1,
    );
    await assert.rejects(service("owner").command("compute-results", {}), {
      code: "POLICIES_UNCONFIRMED",
    });
    await assert.rejects(
      service("admin").command("reveal-ai-scores", {
        confirmation: "PUBLIC_AI",
        reason: "Synthetic premature reveal",
      }),
      { code: "POLICIES_UNCONFIRMED" },
    );
    await assert.rejects(
      service("admin").command("participant-bulk", {
        emails: ["alice@portal.test"],
        checkIn: true,
        reason: "Synthetic no check-in scope",
      }),
      { code: "CHECKIN_POLICY_UNCONFIRMED" },
    );
    await assert.rejects(
      batch(db, [
        [
          "INSERT INTO check_ins VALUES('fake_alice','fake_admin','2026-11-01')",
        ],
      ]),
      /OPERATION_NOT_ENABLED/,
    );
    assert.equal(
      (await service("owner").settings()).policy.confirmations.includes(
        "diversity",
      ),
      false,
    );
  } finally {
    db.close();
  }
});
test("operational split preserves server windows, Going, required media, repository validation and three-attempt atomic limits", async () => {
  const { db, service, clock } = await setup();
  try {
    await configure(service);
    await enable(service, "submissions");
    clock("2026-11-01T02:29:59.999Z");
    await assert.rejects(
      service("alice").command("submit-project", { revision: 0, project }),
      /SUBMISSIONS_CLOSED/,
    );
    assert.equal((await rows(db, "SELECT * FROM projects")).length, 0);
    clock("2026-11-01T04:00:00.000Z");
    await assert.rejects(
      service("alice").command("submit-project", {
        revision: 0,
        project: { ...project, logo: "" },
      }),
      /Upload a PNG/,
    );
    await assert.rejects(
      service("alice").command("submit-project", {
        revision: 0,
        project: { ...project, github: "https://example.com/not-github" },
      }),
    );
    await service("owner").command("participant-bulk", {
      emails: ["alice@portal.test"],
      status: "pending",
      reason: "Synthetic revoke approval",
    });
    await assert.rejects(
      service("alice").command("submit-project", { revision: 0, project }),
      /TEAM_APPROVAL_INCOMPLETE/,
    );
    await service("owner").command("participant-bulk", {
      emails: ["alice@portal.test"],
      status: "approved",
      reason: "Synthetic restore approval",
    });
    for (let i = 0; i < 3; i++) {
      const v = (await service("alice").view("/submission")) as Row;
      await service("alice").command("submit-project", {
        revision: v.project?.revision || 0,
        project,
      });
    }
    const v = (await service("alice").view("/submission")) as Row;
    await assert.rejects(
      service("alice").command("submit-project", {
        revision: v.project.revision,
        project,
      }),
      /SUBMISSION_LIMIT|attempt BETWEEN 1 AND 3/,
    );
    clock("2026-11-01T10:30:00.000Z");
    assert.equal(
      ((await service("alice").view("/dashboard")) as Row).submissionStatus
        .state,
      "closed",
    );
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      3,
    );
  } finally {
    db.close();
  }
});
test("check-in requires only its operational policy, keeps approval/Luma protections and works without a credit key", async () => {
  const { db, service, clock } = await setup();
  try {
    const policy = {
      ...operationPolicy,
      lumaRequired: true,
      confirmations: operationPolicy.confirmations.filter(
        (k) => !["submissionOpen", "deploymentRule"].includes(k),
      ),
    };
    await service("owner").command("settings", {
      policy,
      reason: "Synthetic check-in-only rules",
    });
    await enable(service, "checkin");
    const view = (await service("admin").view("/admin/participants")) as Row;
    assert.equal(view.checkInConfigured, true);
    assert.equal(
      ((await service("owner").view("/admin/settings")) as Row).readiness
        .submissions.configured,
      false,
    );
    await assert.rejects(
      service("admin").command("participant-bulk", {
        emails: ["pending@portal.test"],
        checkIn: true,
        reason: "Synthetic unapproved check-in",
      }),
      /APPROVAL_REQUIRED/,
    );
    await batch(db, [
      [
        "UPDATE registrations SET luma_confirmed=0 WHERE email='alice@portal.test'",
      ],
    ]);
    await assert.rejects(
      service("admin").command("check-in", {
        userId: "fake_alice",
        reason: "Synthetic missing Luma confirmation",
      }),
      /APPROVAL_REQUIRED/,
    );
    await batch(db, [
      [
        "UPDATE registrations SET luma_confirmed=1 WHERE email='alice@portal.test'",
      ],
    ]);
    const noKey = new PortalService(
      db,
      fixtures.admin,
      undefined,
      () => "2026-11-01T03:00:00.000Z",
    );
    const checked = await noKey.command("check-in", {
      userId: "fake_alice",
      reason: "Synthetic physical verification",
    });
    assert.match(
      String(checked.message),
      /Credit allocation is not configured/,
    );
    assert.equal((await rows(db, "SELECT * FROM check_ins")).length, 1);
    assert.equal(
      (await rows(db, "SELECT * FROM credit_allocations")).length,
      0,
    );
    clock("2026-11-01T04:00:00.000Z");
    await assert.rejects(
      service("alice").command("submit-project", { revision: 0, project }),
      { code: "SUBMISSIONS_NOT_ENABLED" },
    );
  } finally {
    db.close();
  }
});
test("fresh setup errors are actionable, owner enablement needs intent/current version, and judging updates cannot weaken enabled operations", async () => {
  const { db, service } = await setup();
  try {
    await configure(service);
    const current = await service("owner").settings();
    await assert.rejects(
      service("admin").command("activate-operations", {
        operation: "submissions",
        version: current.version,
        confirmation: "ENABLE_SUBMISSIONS",
        reason: "Synthetic unauthorized enable",
      }),
      /OWNER_REQUIRED/,
    );
    await assert.rejects(
      service("owner").command("activate-operations", {
        operation: "submissions",
        version: current.version,
        confirmation: "",
        reason: "Synthetic missing intent",
      }),
      /EXPLICIT_OPERATION/,
    );
    await enable(service, "submissions");
    const active = await service("owner").settings();
    await service("owner").command("settings", {
      policy: {
        ...active.policy,
        diversityAssessment: "non-demographic-evidence",
        diversityRubric:
          "No gender or demographic inference; judge documented complementary skills and collaboration.",
      },
      reason: "Synthetic record a rubric without opening scoring",
    });
    const updated = await service("owner").settings();
    assert.equal(updated.policy.operationScopes?.includes("submissions"), true);
    assert.equal(updated.policy.confirmations.includes("diversity"), false);
    await assert.rejects(
      service("owner").command("settings", {
        policy: {
          ...updated.policy,
          submissionClose: "2026-11-01T10:00:00.000Z",
        },
        reason: "Synthetic attempted shortening",
      }),
      { code: "ACTIVE_OPERATION_POLICY_PROTECTED" },
    );
    await db.prepare("DELETE FROM event_settings").all();
    const response = await handlePortal(
      new Request("https://portal.test/api/portal", {
        method: "POST",
        headers: {
          origin: "https://portal.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "submit-project",
          data: { revision: 0, project },
        }),
      }),
      { db, identity: fixtures.alice, key: undefined },
    );
    assert.equal(response.status, 409);
    const error = (await response.json()) as Row;
    assert.equal(error.code, "SUBMISSIONS_NOT_ENABLED");
    assert.ok(!JSON.stringify(error).includes("DATABASE_NOT_INITIALIZED"));
    assert.match(error.message, /draft/i);
    assert.equal(
      ((await service("alice").view("/dashboard")) as Row).submissionStatus
        .state,
      "setup-pending",
    );
  } finally {
    db.close();
  }
});
test("diversity validation uses an explicit supported assessment mode, accepts negated words and never approves demographic algorithms", () => {
  const safe = policySchema.parse({
    ...operationPolicy,
    diversityAssessment: "non-demographic-evidence",
    diversityRubric:
      "Do not use gender, demographic inference or entropy. Evaluate documented skills and collaboration only.",
    confirmations: [...operationPolicy.confirmations, "diversity"],
  });
  assert.ok(!policyBlockers(safe).includes("non-demographic diversity rubric"));
  assert.ok(
    policyBlockers({ ...safe, diversityAssessment: "unconfirmed" }).includes(
      "non-demographic diversity rubric",
    ),
  );
  assert.throws(() =>
    policySchema.parse({ ...safe, diversityAssessment: "gender-entropy" }),
  );
  assert.throws(() =>
    policySchema.parse({ ...safe, genderWeights: { women: 10 } }),
  );
});

test("draft scope hints do not cross-enable operations; legacy full activation enables both with one versioned policy", async () => {
  const { db, service } = await setup();
  try {
    await service("owner").command("settings", {
      policy: { ...operationPolicy, operationScopes: ["checkin"] },
      reason: "Synthetic draft scope hint",
    });
    await enable(service, "submissions");
    let settings = await service("owner").settings();
    assert.deepEqual(settings.policy.operationScopes, ["submissions"]);
    await db.prepare("UPDATE event_settings SET active=0").all();
    const { rehearsalPolicy } = await import("./helpers");
    await service("owner").command("settings", {
      policy: { ...rehearsalPolicy, operationScopes: [] },
      reason: "Synthetic complete legacy activation",
    });
    const before = await service("owner").settings();
    await service("owner").command("activate", {
      reason: "Synthetic full activation",
    });
    settings = await service("owner").settings();
    assert.equal(settings.version, before.version + 1);
    assert.deepEqual(settings.policy.operationScopes, [
      "submissions",
      "checkin",
    ]);
    assert.equal(
      setupReadiness(settings, "2026-11-01T04:00:00.000Z").scoring.ready,
      true,
    );
  } finally {
    db.close();
  }
});
