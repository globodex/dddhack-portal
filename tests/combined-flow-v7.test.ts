import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, submission } from "./helpers";
import { one, rows } from "../lib/db";
import { PortalService } from "../lib/service";
import { handlePortal } from "../lib/http";
import { queueEvaluations } from "../lib/evaluation-background";
import { fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";

const row = (value: unknown) => value as Record<string, any>;
const project = (name: string) => ({
  projectName: name,
  problemSolution: submission.problemSolution,
  description: submission.description,
  github: submission.github,
  demo: "",
  logo: submission.logo,
  banner: submission.banner,
  tools: "Codex",
  ecosystemSelections: ["Codex"],
  cerebrasIntegration: "no",
  attestation: true,
});
const privateKeys = new Set([
  "phone",
  "phoneDisplay",
  "whatsapp",
  "whatsappUrl",
  "gender",
  "gender_description",
  "openai_org_id",
  "ciphertext",
  "voucher_value",
  "core",
  "draft",
  "rating",
  "astra",
  "codex",
  "diversity",
  "false_claims",
  "report",
]);
function publicProjection(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!privateKeys.has(key), `Private key ${key} in public projection`);
    publicProjection(item);
  }
}

test("combined synthetic journey: profile, membership, locked idea, check-in, drafts, three versions, review and public engagement", async (t) => {
  const { db, service, clock } = await setup();
  let projectId = "",
    versionId = "",
    revision = 0;
  const originalFetch = globalThis.fetch;
  let networkAttempts = 0;
  globalThis.fetch = async () => {
    networkAttempts++;
    throw new Error("Network disabled in combined synthetic journey");
  };
  try {
    await t.test(
      "profile save persists private details and explicit public consent",
      async () => {
        await service("pending").command("complete-profile", {
          displayName: "Synthetic New Builder",
          bio: "Builds local synthetic fixtures",
          phone: "+12025550177",
          gender: "non-binary",
          organization: "Synthetic organization",
          openaiOrgId: "org-synthetic-private",
          public: true,
          socialLinks: [
            { type: "Website", url: "https://builder.example.test" },
          ],
        });
        const profile = row(await service("pending").view("/profile")).profile;
        assert.equal(profile.display_name, "Synthetic New Builder");
        assert.equal(profile.phone, "+12025550177");
        assert.equal(profile.openai_org_id, "org-synthetic-private");
        assert.equal(profile.complete, true);
        await service("admin").command("registration", {
          email: "pending@portal.test",
          status: "approved",
          lumaConfirmed: true,
          reason: "Synthetic combined journey approval",
        });
      },
    );
    await t.test(
      "request acceptance gives one team membership and teammate-only contact",
      async () => {
        await service("pending").command("request-team", {
          teamId: "fake_team1",
        });
        const request = await one<{ id: string }>(
          db,
          "SELECT id FROM team_actions WHERE user_id='fake_pending' AND team_id='fake_team1'",
        );
        assert.ok(request);
        await service().command("respond-team", {
          requestId: request.id,
          accept: true,
        });
        await assert.rejects(
          service().command("respond-team", {
            requestId: request.id,
            accept: true,
          }),
          { code: "REQUEST_ALREADY_RESOLVED" },
        );
        assert.equal(
          (
            await rows(
              db,
              "SELECT * FROM memberships WHERE user_id='fake_pending'",
            )
          ).length,
          1,
        );
        const workspace = row(await service().view("/dashboard"));
        assert.equal(
          workspace.members.find((member: any) => member.id === "fake_pending")
            .phone,
          "+12025550177",
        );
        const outsider = row(
          await service("bob").view("/discover/participants"),
        );
        const target = outsider.items.find(
          (person: any) => person.id === "fake_pending",
        );
        assert.ok(target);
        publicProjection(target);
        assert.equal(
          JSON.stringify(target).includes("org-synthetic-private"),
          false,
        );
        assert.equal(JSON.stringify(target).includes("12025550177"), false);
      },
    );
    await t.test(
      "idea and roster lock together before synthetic operational setup",
      async () => {
        await service().command("idea", {
          title: "Synthetic private core",
          core: "private-core-combined-marker",
          description: "Synthetic private description",
        });
        await service().command("lock-team", { confirmation: "LOCK_TEAM" });
        await assert.rejects(
          service().command("idea", {
            title: "Attempted replacement",
            core: "Changed",
            description: "Changed",
          }),
          { code: "TEAM_LOCKED" },
        );
        assert.equal(
          (
            await rows(
              db,
              "SELECT * FROM memberships WHERE team_id='fake_team1'",
            )
          ).length,
          2,
        );
        // Explicit existing rehearsal fixture only; this is never an event policy decision.
        await activate(db);
        clock("2026-11-01T04:00:00.000Z");
      },
    );
    await t.test(
      "admin check-in allocates one personal credit and nonleader cannot commit",
      async () => {
        await assert.rejects(
          service().command("save-project", {
            revision,
            project: project("Synthetic first"),
          }),
          { code: "TEAM_CHECKIN_REQUIRED" },
        );
        await service("admin").command("check-in", {
          userId: "fake_alice",
          reason: "Synthetic attendance",
        });
        await service("admin").command("check-in", {
          userId: "fake_alice",
          reason: "Synthetic retry",
        });
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
          service("pending").command("submit-project", {
            revision,
            project: project("Forbidden"),
          }),
          { code: "LEADER_REQUIRED" },
        );
        const stranger = row(await service("bob").view("/dashboard"));
        assert.equal(
          JSON.stringify(stranger).includes("private-core-combined-marker"),
          false,
        );
        assert.equal(
          JSON.stringify(stranger).includes("org-synthetic-private"),
          false,
        );
      },
    );
    await t.test(
      "draft consumes no attempt, stale revision fails, commit retry is idempotent",
      async () => {
        await service().command("save-project", {
          revision,
          project: project("Synthetic first"),
        });
        assert.equal(
          (await rows(db, "SELECT * FROM submission_versions")).length,
          0,
        );
        await assert.rejects(
          service().command("submit-project", {
            revision,
            project: project("Stale draft"),
          }),
          { code: "PROJECT_CHANGED_RELOAD" },
        );
        revision++;
        const payload = { revision, project: project("Synthetic first") };
        const committed = await service().command("submit-project", payload);
        projectId = String(committed.projectId);
        versionId = String(committed.versionId);
        revision++;
        assert.deepEqual(await service().command("submit-project", payload), {
          message: "This submission was already committed.",
          projectId,
          versionId,
        });
        assert.equal(
          (await rows(db, "SELECT * FROM submission_versions")).length,
          1,
        );
        assert.equal(
          row(await service("bob").view("/projects")).items.length,
          0,
        );
      },
    );
    await t.test(
      "queued offline verification preserves submission and waits for human review",
      async () => {
        const pending = await rows<{ id: string; state: string }>(
          db,
          "SELECT id,state FROM astra_jobs WHERE version_id=?",
          versionId,
        );
        assert.equal(pending.length, 1);
        assert.equal(pending[0].state, "pending");
        const tasks: Promise<unknown>[] = [];
        await assert.rejects(
          queueEvaluations(service("admin"), { limit: 1 }, (task) =>
            tasks.push(task),
          ),
          { code: "SUBMISSION_WINDOW_OPEN" },
        );
        assert.equal(tasks.length, 0);
        clock("2026-11-01T10:31:00.000Z");
        const queued = await queueEvaluations(
          service("admin"),
          { limit: 1 },
          (task) => tasks.push(task),
        );
        assert.equal(queued.accepted, 1);
        assert.deepEqual(queued.jobIds, [pending[0].id]);
        assert.equal(tasks.length, 1);
        await Promise.all(tasks);
        const finished = await one<{
          state: string;
          attempts: number;
          report: string;
        }>(
          db,
          "SELECT state,attempts,report FROM astra_jobs WHERE id=?",
          pending[0].id,
        );
        assert.equal(finished!.state, "needs_review");
        assert.equal(finished!.attempts, 1);
        const report = JSON.parse(finished!.report);
        assert.equal(report.versionId, versionId);
        assert.equal(report.dimensions, null);
        assert.deepEqual(report.suspectedFalseClaims, []);
        assert.equal((await rows(db, "SELECT * FROM reviews")).length, 0);
        assert.equal(
          row(await service("bob").view("/projects")).items.length,
          0,
        );
        assert.equal(
          (await rows(db, "SELECT * FROM result_snapshots")).length,
          0,
        );
        assert.equal(networkAttempts, 0);
        clock("2026-11-01T04:00:00.000Z");
      },
    );
    await t.test(
      "offline repository evidence and private review publish only safe project fields",
      async () => {
        await service("admin").command("record-repository-evidence", {
          projectId,
          versionId,
          commitSha: "a".repeat(40),
          metadata: {
            public: true,
            createdAt: "2026-11-01T02:30:01.000Z",
            firstCommit: "2026-11-01T02:30:02.000Z",
          },
          source: "Offline synthetic repository fixture; no provider call",
          observedAt: "2026-11-01T04:00:00.000Z",
          reason: "Synthetic repository evidence review",
        });
        await service("admin").command("review-project", {
          projectId,
          versionId,
          body: "Synthetic private organizer review",
          rating: 7,
        });
        const own = row(await service().view("/dashboard"));
        assert.equal(
          own.feedback[0].body,
          "Synthetic private organizer review",
        );
        assert.equal(Object.hasOwn(own.feedback[0], "rating"), false);
        const anonymous = new PortalService(
          db,
          null,
          LOCAL_CREDIT_KEY,
          () => "2026-11-01T04:00:00.000Z",
        );
        const listed = row(await anonymous.view("/projects")).items;
        assert.equal(listed.length, 1);
        publicProjection(listed);
        assert.equal(
          JSON.stringify(listed).includes("private-core-combined-marker"),
          false,
        );
        assert.equal(
          JSON.stringify(listed).includes("Synthetic private organizer review"),
          false,
        );
      },
    );
    await t.test(
      "parallel vote retries stay unique and literal comment is preserved",
      async () => {
        await Promise.all(
          Array.from({ length: 6 }, () =>
            service("bob").command("upvote-project", { projectId }),
          ),
        );
        await service("bob").command("comment-project", {
          projectId,
          body: "Useful synthetic fixture <script>literal markup</script> with clear steps.",
        });
        assert.equal(
          (
            await rows(
              db,
              "SELECT * FROM project_upvotes WHERE project_id=?",
              projectId,
            )
          ).length,
          1,
        );
        assert.equal(
          (
            await rows(
              db,
              "SELECT * FROM project_comments WHERE project_id=?",
              projectId,
            )
          ).length,
          1,
        );
        await assert.rejects(
          service("stranger").command("upvote-project", { projectId }),
          { code: "VIEWER_READ_ONLY" },
        );
      },
    );
    await t.test(
      "new versions require current review and third commit locks edits without changing history",
      async () => {
        const first = await one<{ payload: string }>(
          db,
          "SELECT payload FROM submission_versions WHERE id=?",
          versionId,
        );
        for (const attempt of [2, 3]) {
          const payload = {
            revision,
            project: project(`Synthetic attempt ${attempt}`),
          };
          const committed = await service().command("submit-project", payload);
          revision++;
          versionId = String(committed.versionId);
          assert.equal(
            row(await service("bob").view("/projects")).items.length,
            0,
          );
          await assert.rejects(
            service("admin").command("set-project-eligibility", {
              projectId,
              versionId: "synthetic-stale-version",
              status: "eligible",
              reason: "Synthetic stale review",
            }),
            { code: "PROJECT_VERSION_CHANGED" },
          );
          await service("admin").command("set-project-eligibility", {
            projectId,
            versionId,
            status: "eligible",
            reason: "Synthetic current-version review",
          });
        }
        await assert.rejects(
          service().command("submit-project", {
            revision,
            project: project("Fourth attempt"),
          }),
          { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
        );
        await assert.rejects(
          service().command("save-project", {
            revision,
            project: project("Locked draft"),
          }),
          { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
        );
        const versions = await rows<{ attempt: number; payload: string }>(
          db,
          "SELECT attempt,payload FROM submission_versions WHERE team_id='fake_team1' ORDER BY attempt",
        );
        assert.deepEqual(
          versions.map((item) => item.attempt),
          [1, 2, 3],
        );
        assert.equal(versions[0].payload, first!.payload);
        assert.equal(
          (
            await rows(
              db,
              "SELECT * FROM project_upvotes WHERE project_id=?",
              projectId,
            )
          ).length,
          1,
        );
        const workspace = row(await service().view("/dashboard"));
        assert.equal(workspace.submissionAccess.locked, true);
        assert.equal(workspace.submissionAccess.attemptsUsed, 3);
        assert.equal(
          (await rows(db, "SELECT * FROM result_snapshots")).length,
          0,
        );
        assert.equal(networkAttempts, 0);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("HTTP flow protects synthetic profile writes, privacy headers, errors and anonymous reads", async () => {
  const { db } = await setup();
  const origin = "https://synthetic.portal.test";
  const runtime = { db, identity: fixtures.alice, key: LOCAL_CREDIT_KEY };
  const payload = {
    action: "complete-profile",
    data: {
      displayName: "HTTP Synthetic Builder",
      bio: "Synthetic HTTP profile",
      phone: "+12025550178",
      gender: "non-binary",
      public: false,
    },
  };
  try {
    const rejected = await handlePortal(
      new Request(origin + "/api/portal", {
        method: "POST",
        headers: {
          Origin: "https://outside.example.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }),
      runtime,
    );
    assert.equal(rejected.status, 403);
    assert.notEqual(
      row(
        await one(
          db,
          "SELECT display_name FROM participant_profiles WHERE user_id='fake_alice'",
        ),
      ).display_name,
      "HTTP Synthetic Builder",
    );
    const saved = await handlePortal(
      new Request(origin + "/api/portal", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      runtime,
    );
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.match(saved.headers.get("cache-control") || "", /private, no-store/);
    const read = await handlePortal(
      new Request(origin + "/api/portal?view=/profile"),
      runtime,
    );
    assert.equal(read.status, 200);
    assert.equal(
      row(await read.json()).profile.display_name,
      "HTTP Synthetic Builder",
    );
    const anon = await handlePortal(
      new Request(origin + "/api/portal?view=/dashboard"),
      { ...runtime, identity: null },
    );
    assert.equal(anon.status, 401);
    assert.match(anon.headers.get("cache-control") || "", /no-store/);
    assert.equal(row(await anon.json()).code, "SIGN_IN_REQUIRED");
    const malformed = await handlePortal(
      new Request(origin + "/api/portal", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{invalid",
      }),
      runtime,
    );
    assert.equal(malformed.status, 422);
    assert.equal(row(await malformed.json()).code, "INVALID_JSON");
  } finally {
    db.close();
  }
});
