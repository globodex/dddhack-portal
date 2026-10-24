import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { batch, one, rows } from "../lib/db";
import type { Runtime } from "../lib/http";
import { PortalService } from "../lib/service";
import { fixtures, LOCAL_CREDIT_KEY, seedLocal } from "../scripts/fixtures";
import { handleEvaluationSnapshots } from "../neon/ai/http";
import {
  evaluationLimits,
  readApprovedSnapshot,
  type ApprovedEvaluationSnapshot,
} from "../neon/ai";
import { createPostgresDatabase, type PostgresPool } from "../neon/db/adapter";
import { applyPortalMigrations } from "../neon/db/migrate";
import { loadMigrationPlan } from "../neon/migration-plan";
import { createPortalBackend } from "../neon/router";

const configured = process.env.PORTAL_TEST_POSTGRES_URL;
if (
  configured &&
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(configured).hostname)
) {
  throw new Error("POSTGRES_EVALUATION_TEST_REQUIRES_LOOPBACK");
}
const origin = "https://portal.example.test";
const proxySecret = "synthetic-evaluation-proxy-secret-with-32-characters";
const versionId = "synthetic-approved-version";
const projectId = "synthetic-approved-project";
const commitSha = "a".repeat(40);
const time = "2026-11-01T06:00:00.000Z";
const source = 'export const greeting = "synthetic-selected-source-marker";\n';
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function snapshot(version = versionId): ApprovedEvaluationSnapshot {
  return {
    versionId: version,
    commitSha,
    approved: true,
    approvedPaths: ["src/main.ts"],
    descriptions: {
      projectName: "Synthetic approved project",
      description: "Synthetic selected description marker.",
    },
    files: [
      {
        path: "src/main.ts",
        content: source,
        commitSha,
        sha256: digest(source),
      },
    ],
    commit: { sha: commitSha, committedAt: time },
  };
}
function request(
  body: unknown,
  options: { path?: string; origin?: string; proxy?: boolean } = {},
) {
  return new Request(
    (options.proxy ? "https://backend.example.test" : origin) +
      (options.path || "/api/evaluation/snapshots"),
    {
      method: "POST",
      headers: {
        origin: options.origin || origin,
        "content-type": "application/json",
        ...(options.proxy
          ? {
              "x-portal-proxy-secret": proxySecret,
              "x-portal-forwarded-origin": origin,
            }
          : {}),
      },
      body: JSON.stringify(body),
    },
  );
}
async function expectResponse(
  response: Response,
  status: number,
  code?: string,
) {
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, status, JSON.stringify(body));
  if (code) assert.equal(body.code, code);
  return body;
}

async function withEvaluationDatabase(
  run: (context: {
    db: ReturnType<typeof createPostgresDatabase>;
    runtime: (actor?: string) => Runtime;
    recordEvidence: (version?: string) => Promise<void>;
  }) => Promise<void>,
) {
  const admin = new Pool({ connectionString: configured, max: 1 });
  const schema =
    "portal_evaluation_synthetic_" + randomUUID().replaceAll("-", "");
  let created = false;
  let db: ReturnType<typeof createPostgresDatabase> | undefined;
  let evaluationCalls = 0;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    const pool = new Pool({
      connectionString: configured,
      max: 5,
      options: `-c search_path=${schema},public`,
    });
    db = createPostgresDatabase(pool as unknown as PostgresPool);
    const plan = await loadMigrationPlan();
    assert.equal(plan.at(-1)?.name, "0103_project_media_limits.sql");
    const applied = await applyPortalMigrations(
      pool as unknown as PostgresPool,
      plan,
    );
    assert.deepEqual(applied.slice(-4), [
      "0100_auth.sql",
      "0101_approved_evaluation.sql",
      "0102_credit_stock.sql",
      "0103_project_media_limits.sql",
    ]);
    assert.deepEqual(
      await applyPortalMigrations(pool as unknown as PostgresPool, plan),
      [],
    );
    await seedLocal(db);
    await batch(db, [
      ["INSERT INTO check_ins VALUES(?,?,?)", "fake_alice", "fake_admin", time],
      [
        "INSERT INTO projects(id,team_id,slug,draft,updated_at) VALUES(?,?,?,?,?)",
        projectId,
        "fake_team1",
        "synthetic-approved-project",
        "{}",
        time,
      ],
      [
        "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES(?,?,?,?,?)",
        versionId,
        "fake_team1",
        1,
        JSON.stringify({ commitSha }),
        time,
      ],
      [
        "UPDATE projects SET published_version_id=? WHERE id=?",
        versionId,
        projectId,
      ],
    ]);
    const database = db;
    const runtime = (actor = "admin"): Runtime => ({
      db: database,
      identity: fixtures[actor],
      key: LOCAL_CREDIT_KEY,
      evaluator: {
        async evaluate() {
          evaluationCalls++;
          throw new Error("PROVIDER_CALL_FORBIDDEN");
        },
      },
      background() {
        throw new Error("BACKGROUND_DISPATCH_FORBIDDEN");
      },
    });
    const recordEvidence = async (version = versionId) => {
      const staff = new PortalService(
        database,
        fixtures.admin,
        LOCAL_CREDIT_KEY,
        () => time,
      );
      const result = await staff.command("record-repository-evidence", {
        projectId,
        versionId: version,
        commitSha,
        source: "Synthetic staff metadata capture only",
        reason: "Synthetic version-bound repository evidence",
        observedAt: time,
        metadata: {
          public: true,
          createdAt: "2026-11-01T03:00:00.000Z",
          firstCommit: "2026-11-01T03:01:00.000Z",
        },
      });
      assert.equal(result.status, "eligible");
    };
    await run({ db: database, runtime, recordEvidence });
    assert.equal(
      evaluationCalls,
      0,
      "approval/revocation never dispatches provider evaluation",
    );
  } finally {
    await db?.close();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}

test(
  "native PostgreSQL snapshot API rejects unauthorized, unbound, wrong-origin and unsafe source requests through the complete migration plan",
  { skip: !configured },
  async () => {
    await withEvaluationDatabase(async ({ db, runtime, recordEvidence }) => {
      const body = { versionId, snapshot: snapshot() };
      for (const actor of ["alice", "stranger"]) {
        await expectResponse(
          await handleEvaluationSnapshots(request(body), runtime(actor)),
          403,
          "ADMIN_REQUIRED",
        );
      }
      await expectResponse(
        await handleEvaluationSnapshots(
          request(body, { origin: "https://attacker.example.test" }),
          runtime(),
        ),
        403,
        "ORIGIN_MISMATCH",
      );
      const backend = createPortalBackend(
        { APP_ORIGIN: origin, PORTAL_PROXY_SECRET: proxySecret },
        {
          runtime: async () => runtime(),
          auth: async () => new Response(null, { status: 404 }),
          evaluation: handleEvaluationSnapshots,
        },
      );
      await expectResponse(
        await backend(request(body, { proxy: true })),
        409,
        "VERIFIED_REPOSITORY_BINDING_REQUIRED",
      );
      await recordEvidence();
      const invalid: ApprovedEvaluationSnapshot[] = [];
      const oversized = snapshot();
      oversized.files[0].content = "x".repeat(evaluationLimits.fileBytes + 1);
      oversized.files[0].sha256 = digest(oversized.files[0].content);
      invalid.push(oversized);
      const secret = snapshot();
      secret.files[0].content =
        'const api_key = "synthetic-forbidden-hardcoded-value";';
      secret.files[0].sha256 = digest(secret.files[0].content);
      invalid.push(secret);
      const secretPath = snapshot();
      secretPath.approvedPaths = ["credentials.json"];
      secretPath.files[0].path = "credentials.json";
      invalid.push(secretPath);
      const wrongCommit = snapshot();
      wrongCommit.commitSha = "b".repeat(40);
      invalid.push(wrongCommit);
      for (const rejected of invalid) {
        await expectResponse(
          await handleEvaluationSnapshots(
            request({ versionId, snapshot: rejected }),
            runtime(),
          ),
          422,
          "EVALUATION_SNAPSHOT_REJECTED",
        );
      }
      // Staff evidence for an older version is insufficient while another version
      // is published, even though both immutable records still exist.
      const second = "synthetic-second-version";
      await batch(db, [
        [
          "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES(?,?,?,?,?)",
          second,
          "fake_team1",
          2,
          JSON.stringify({ commitSha }),
          time,
        ],
        [
          "UPDATE projects SET published_version_id=? WHERE id=?",
          second,
          projectId,
        ],
      ]);
      await recordEvidence(second);
      await expectResponse(
        await handleEvaluationSnapshots(request(body), runtime()),
        409,
        "VERIFIED_REPOSITORY_BINDING_REQUIRED",
      );
      assert.equal(
        (await one(db, "SELECT count(*) n FROM approved_evaluation_snapshots"))
          ?.n,
        0,
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*) n FROM audit_logs WHERE action='approve-evaluation-snapshot'",
          )
        )?.n,
        0,
      );
    });
  },
);

test(
  "native PostgreSQL approved snapshots retry idempotently, audit no source, and permit only one-way immutable revocation",
  { skip: !configured },
  async () => {
    await withEvaluationDatabase(async ({ db, runtime, recordEvidence }) => {
      await recordEvidence();
      const body = { versionId, snapshot: snapshot() };
      const approved = await expectResponse(
        await handleEvaluationSnapshots(request(body), runtime()),
        201,
      );
      assert.equal(approved.approved, true);
      assert.match(String(approved.snapshotSha256), /^[a-f0-9]{64}$/);
      assert.ok(!JSON.stringify(approved).includes(source));
      const retry = await expectResponse(
        await handleEvaluationSnapshots(request(body), runtime()),
        200,
      );
      assert.deepEqual(retry, approved);
      assert.deepEqual(await readApprovedSnapshot(db, versionId), snapshot());
      assert.equal(
        (await one(db, "SELECT count(*) n FROM approved_evaluation_snapshots"))
          ?.n,
        1,
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*) n FROM audit_logs WHERE action='approve-evaluation-snapshot'",
          )
        )?.n,
        1,
      );
      const changed = snapshot();
      changed.descriptions.description =
        "A different synthetic approval selection.";
      await expectResponse(
        await handleEvaluationSnapshots(
          request({ versionId, snapshot: changed }),
          runtime(),
        ),
        409,
        "SNAPSHOT_IMMUTABLE",
      );
      const audits = await rows<{ detail: string }>(
        db,
        "SELECT detail FROM audit_logs WHERE action='approve-evaluation-snapshot'",
      );
      assert.deepEqual(JSON.parse(audits[0].detail), {
        snapshotSha256: approved.snapshotSha256,
        selectedFiles: 1,
      });
      const allAudit = JSON.stringify(
        await rows(db, "SELECT detail,reason FROM audit_logs"),
      );
      for (const privateValue of [
        source,
        "synthetic-selected-source-marker",
        "Synthetic selected description marker.",
      ])
        assert.ok(!allAudit.includes(privateValue));
      for (const [sql, value] of [
        [
          "UPDATE approved_evaluation_snapshots SET snapshot_json=? WHERE version_id=?",
          "{}",
        ],
        [
          "UPDATE approved_evaluation_snapshots SET snapshot_sha256=? WHERE version_id=?",
          "b".repeat(64),
        ],
        [
          "UPDATE approved_evaluation_snapshots SET commit_sha=? WHERE version_id=?",
          "b".repeat(40),
        ],
        [
          "UPDATE approved_evaluation_snapshots SET approved_by=? WHERE version_id=?",
          "fake_alice",
        ],
        [
          "UPDATE approved_evaluation_snapshots SET approved_at=? WHERE version_id=?",
          "changed",
        ],
        [
          "UPDATE approved_evaluation_snapshots SET version_id=? WHERE version_id=?",
          "replacement",
        ],
      ])
        await assert.rejects(
          db.prepare(sql).bind(value, versionId).all(),
          /IMMUTABLE/,
        );
      await assert.rejects(
        db
          .prepare(
            "DELETE FROM approved_evaluation_snapshots WHERE version_id=?",
          )
          .bind(versionId)
          .all(),
        /IMMUTABLE/,
      );
      await db
        .prepare("INSERT INTO portal_roles VALUES(?,?,?,?)")
        .bind("fake_admin", "participant", "fake_owner", time)
        .all();
      await expectResponse(
        await handleEvaluationSnapshots(request(body), runtime()),
        403,
        "ADMIN_REQUIRED",
      );
      await db
        .prepare(
          "UPDATE portal_roles SET role='admin' WHERE user_id='fake_admin'",
        )
        .all();
      const revokeRequest = () =>
        request({ versionId }, { path: "/api/evaluation/snapshots/revoke" });
      await expectResponse(
        await handleEvaluationSnapshots(revokeRequest(), runtime()),
        200,
      );
      await expectResponse(
        await handleEvaluationSnapshots(revokeRequest(), runtime()),
        200,
      );
      assert.equal(await readApprovedSnapshot(db, versionId), null);
      await expectResponse(
        await handleEvaluationSnapshots(request(body), runtime()),
        409,
        "SNAPSHOT_IMMUTABLE",
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*) n FROM audit_logs WHERE action='revoke-evaluation-snapshot'",
          )
        )?.n,
        1,
      );
      await assert.rejects(
        db
          .prepare(
            "UPDATE approved_evaluation_snapshots SET revoked_at=NULL WHERE version_id=?",
          )
          .bind(versionId)
          .all(),
        /IMMUTABLE/,
      );
      await assert.rejects(
        db
          .prepare(
            "UPDATE approved_evaluation_snapshots SET revoked_at=? WHERE version_id=?",
          )
          .bind("later", versionId)
          .all(),
        /IMMUTABLE/,
      );
      await assert.rejects(
        db
          .prepare(
            "DELETE FROM approved_evaluation_snapshots WHERE version_id=?",
          )
          .bind(versionId)
          .all(),
        /IMMUTABLE/,
      );
    });
  },
);
