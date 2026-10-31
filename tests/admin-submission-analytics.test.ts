import assert from "node:assert/strict";
import { test } from "node:test";
import { batch, one, type Database } from "../lib/db";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { PortalService } from "../lib/service";
import { score, type Report } from "../lib/evaluation";
import { qualifiedEngagement } from "../lib/engagement-scoring";
import { sha256 } from "../lib/security";
import { readAdminSubmissionAnalytics } from "../lib/admin-submission-analytics";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { rehearsalPolicy, attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";

const time = "2026-11-01T06:00:00.000Z";
const weights = {
  human: 40,
  ai: 20,
  votes: 10,
  diversity: 15,
  codex: 10,
  feedback: 7,
};
const policy = { ...rehearsalPolicy, weights };
async function prepared(engine: "sqlite" | "postgres" = "sqlite") {
  const local = engine === "sqlite" ? new LocalDatabase(":memory:") : null;
  local?.migrate();
  const pg = local ? null : await createPGliteFixture();
  const db = local || pg!.db;
  await seedLocal(db);
  await batch(db, [
    [
      "UPDATE event_settings SET active=1,version=7,policy=? WHERE id=1",
      JSON.stringify(policy),
    ],
  ]);
  await attend(db, "fake_alice", "fake_bob", "fake_eve");
  for (const [id, team, cerebras] of [
    ["p1", "fake_team1", "yes"],
    ["p2", "fake_team3", "no"],
    ["p3", "fake_team5", null],
  ] as const) {
    await batch(db, [
      [
        "INSERT INTO submission_versions VALUES(?,?,1,?,?)",
        id + "_v1",
        team,
        JSON.stringify({
          projectName: id,
          ...(cerebras ? { cerebrasIntegration: cerebras } : {}),
        }),
        time,
      ],
      [
        "INSERT INTO projects(id,team_id,slug,draft,published_version_id,updated_at) VALUES(?,?,?,'{}',?,?)",
        id,
        team,
        id,
        id + "_v1",
        time,
      ],
      [
        "INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?,?,?)",
        team,
        id + "_v1",
        id === "p3" ? "ineligible" : "eligible",
        15,
        id === "p2" ? null : 2.5,
        5,
        0,
        "Private synthetic review evidence",
        "fake_admin",
        time,
      ],
      [
        "INSERT INTO project_review_history(id,project_id,version_id,author_id,kind,body,rating,created_at) VALUES(?,?,?,'fake_admin','admin','Synthetic rating',8,?)",
        id + "_human",
        id,
        id + "_v1",
        time,
      ],
    ]);
  }
  const service = (name = "admin", database: Database = db) =>
    new PortalService(database, fixtures[name], LOCAL_CREDIT_KEY, () => time);
  return {
    db,
    service,
    close: async () => {
      local?.close();
      await pg?.pool.end();
    },
  };
}
const values = (rows: { key: string; value: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.key, r.value]));
const expected = () =>
  score({
    weights,
    human: [8],
    astra: 15,
    codex: 2.5,
    diversity: 5,
    votes: 0,
    maxVotes: 0,
    voteFormula: "sqrt-relative",
    voteTarget: 10,
    feedback: 0,
    feedbackTarget: 10,
    falseClaims: 0,
    eligible: true,
  })!;
function report(versionId: string, total = 10): Report {
  return {
    versionId,
    status: "finalized",
    model: "synthetic-provider-contract",
    rubricVersion: 1,
    revision: "a".repeat(40),
    checks: [
      {
        id: "approved-snapshot",
        status: "PASS",
        evidence: ["commit:" + "a".repeat(40)],
        explanation: "Synthetic bound snapshot",
      },
    ],
    dimensions: {
      functionality: total === 0 ? 0 : 1,
      complexity: total === 0 ? 0 : 1,
      openai: total === 0 ? 0 : 1,
      cerebras: total === 0 ? 0 : 1,
      ux: total === 0 ? 0 : 1,
      docs: total === 0 ? 0 : 1,
      contributors: total === 0 ? 0 : 1,
      deployment: total === 0 ? 0 : 1,
      readiness: total === 0 ? 0 : 1,
      seo: total === 0 ? 0 : 1,
    },
    suspectedFalseClaims: [],
  };
}

test("staff authorization precedes collection SQL and removed or downgraded staff cannot reuse a reader", async () => {
  let reads = 0;
  await assert.rejects(
    readAdminSubmissionAnalytics({
      db: {
        prepare() {
          reads++;
          throw new Error("No collection read");
        },
      } as unknown as Database,
      staff: async () => {
        throw Object.assign(new Error("Denied"), { code: "ADMIN_REQUIRED" });
      },
      settings: async () => {
        throw new Error("No settings read");
      },
    }),
    { code: "ADMIN_REQUIRED" },
  );
  assert.equal(reads, 0);
  const f = await prepared();
  try {
    for (const who of ["alice", "judge", "stranger"])
      await assert.rejects(readAdminSubmissionAnalytics(f.service(who)), {
        code: "ADMIN_REQUIRED",
      });
    const reused = f.service();
    await readAdminSubmissionAnalytics(reused);
    await batch(f.db, [
      [
        "INSERT INTO portal_roles VALUES('fake_admin','participant','fake_owner',?)",
        time,
      ],
    ]);
    await assert.rejects(readAdminSubmissionAnalytics(reused), {
      code: "ADMIN_REQUIRED",
    });
  } finally {
    await f.close();
  }
});

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: selected committed cohort, canonical partial coverage, zeroes and frozen scores stay distinct`, async (t) => {
    const f = await prepared(engine);
    try {
      await t.test(
        "one selected version per project, custom weights, incomplete project does not block complete eligible mean",
        async () => {
          const result = await readAdminSubmissionAnalytics(f.service());
          assert.equal(result.analytics.cohortTotal, 3);
          assert.deepEqual(values(result.analytics.cerebras), {
            yes: 1,
            no: 1,
            unanswered: 1,
          });
          assert.deepEqual(values(result.analytics.eligibility), {
            eligible: 2,
            ineligible: 1,
            needs_review: 0,
          });
          assert.equal(
            result.scores.find((s) => s.projectId === "p1")!.total,
            expected().total,
          );
          const partial = result.scores.find((s) => s.projectId === "p2")!;
          assert.equal(partial.total, null);
          assert.equal(
            partial.components.find((c) => c.key === "codex")!.value,
            null,
          );
          assert.equal(
            partial.components.find((c) => c.key === "human")!.value,
            32,
          );
          assert.equal(
            result.scores.find((s) => s.projectId === "p3")!.total,
            null,
          );
          assert.equal(result.analytics.scores.average, expected().total);
          assert.equal(result.analytics.scores.eligibleComparable, 1);
          assert.deepEqual(result.analytics.policy, {
            version: 7,
            blockers: [],
            maxTotal: 102,
            baseMaximum: 95,
            feedbackMaximum: 7,
          });
          assert.equal(result.frozenScores.length, 0);
          const output = JSON.stringify(result);
          for (const secret of [
            "Private synthetic review evidence",
            "alice@portal.test",
            "ciphertext",
            "projectName",
            "description",
            "report",
            "suspectedFalseClaims",
          ])
            assert.ok(!output.includes(secret), secret);
        },
      );
      await t.test(
        "later text-only review preserves latest non-null rating; unassigned judge and self reviewer are excluded",
        async () => {
          await batch(f.db, [
            [
              "INSERT INTO project_review_history(id,project_id,version_id,author_id,kind,body,rating,created_at) VALUES('text-only','p1','p1_v1','fake_admin','admin','Text only',NULL,?)",
              time,
            ],
            [
              "INSERT INTO project_review_history(id,project_id,version_id,author_id,kind,body,rating,created_at) VALUES('unassigned','p1','p1_v1','fake_judge','judge','Unassigned',0,?)",
              time,
            ],
            [
              "INSERT INTO portal_roles VALUES('fake_alice','admin','fake_owner',?)",
              time,
            ],
            [
              "INSERT INTO project_review_history(id,project_id,version_id,author_id,kind,body,rating,created_at) VALUES('self','p1','p1_v1','fake_alice','admin','Own team',0,?)",
              time,
            ],
          ]);
          assert.equal(
            (await readAdminSubmissionAnalytics(f.service())).scores[0].total,
            expected().total,
          );
        },
      );
      await t.test(
        "validated provider provenance binds exact version; newest invalid numeric provider prevents older fallback; manual zero wins",
        async () => {
          await batch(f.db, [
            ["UPDATE reviews SET astra=NULL WHERE team_id='fake_team1'"],
            [
              "INSERT INTO evaluation_runs(id,project_id,version_id,config_key,state,report,score,provenance,created_at,updated_at) VALUES('valid-provider','p1','p1_v1','synthetic','completed',?,10,'provider',?,?)",
              JSON.stringify(report("p1_v1")),
              time,
              time,
            ],
          ]);
          let r = await readAdminSubmissionAnalytics(f.service());
          assert.equal(
            r.scores[0].components.find((c) => c.key === "astra")!.value,
            (10 / 30) * 20,
          );
          assert.equal(values(r.analytics.evaluation).validated, 1);
          await batch(f.db, [
            [
              "INSERT INTO evaluation_runs(id,project_id,version_id,config_key,state,report,score,provenance,created_at,updated_at) VALUES('wrong-version','p1','p1_v1','synthetic','completed',?,10,'provider',?,?)",
              JSON.stringify(report("p1_v0")),
              time,
              "2026-11-01T06:01:00.000Z",
            ],
          ]);
          r = await readAdminSubmissionAnalytics(f.service());
          assert.equal(r.scores[0].total, null);
          assert.equal(
            r.scores[0].components.find((c) => c.key === "astra")!.value,
            null,
          );
          assert.equal(values(r.analytics.evaluation).validated, 0);
          await batch(f.db, [
            ["UPDATE reviews SET astra=0 WHERE team_id='fake_team1'"],
          ]);
          r = await readAdminSubmissionAnalytics(f.service());
          assert.equal(
            r.scores[0].components.find((c) => c.key === "astra")!.value,
            0,
          );
          assert.equal(
            r.scores[0].components.find((c) => c.key === "astra")!.status,
            "manual",
          );
          assert.notEqual(r.scores[0].total, null);
        },
      );
      await t.test(
        "real complete zero is preserved; required missing Codex remains unknown even weight zero",
        async () => {
          await batch(f.db, [
            [
              "UPDATE reviews SET astra=0,codex=0,diversity=0 WHERE team_id='fake_team1'",
            ],
            [
              "INSERT INTO project_review_history(id,project_id,version_id,author_id,kind,body,rating,created_at) VALUES('zero','p1','p1_v1','fake_admin','admin','Genuine zero',0,?)",
              time,
            ],
          ]);
          let r = await readAdminSubmissionAnalytics(f.service());
          assert.equal(r.scores[0].total, 0);
          assert.equal(r.analytics.scores.average, 0);
          await batch(f.db, [
            [
              "UPDATE event_settings SET policy=? WHERE id=1",
              JSON.stringify({ ...policy, weights: { ...weights, codex: 0 } }),
            ],
            ["UPDATE reviews SET codex=NULL WHERE team_id='fake_team1'"],
          ]);
          r = await readAdminSubmissionAnalytics(f.service());
          assert.equal(r.scores[0].total, null);
          assert.equal(
            r.scores[0].components.find((c) => c.key === "codex")!.value,
            null,
          );
          await batch(f.db, [
            [
              "UPDATE event_settings SET policy=? WHERE id=1",
              JSON.stringify(policy),
            ],
            ["UPDATE reviews SET codex=0 WHERE team_id='fake_team1'"],
          ]);
        },
      );
      await t.test(
        "current selection is never replaced by later or hidden historical answers, and removed versions do not become drafts",
        async () => {
          await batch(f.db, [
            [
              "INSERT INTO submission_versions VALUES('p1_v2','fake_team1',2,?,?)",
              JSON.stringify({
                projectName: "Later",
                cerebrasIntegration: "no",
              }),
              time,
            ],
          ]);
          let r = await readAdminSubmissionAnalytics(f.service());
          assert.deepEqual(values(r.analytics.cerebras), {
            yes: 1,
            no: 1,
            unanswered: 1,
          });
          assert.equal(r.scores[0].versionId, "p1_v1");
          assert.equal(r.scores[0].total, null);
          assert.ok(
            r.scores[0].pending.some((p) => p.includes("not the latest")),
          );
          await batch(f.db, [
            [
              "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('submission','p1_v1',1,'Synthetic hidden selection','fake_owner',?)",
              time,
            ],
          ]);
          r = await readAdminSubmissionAnalytics(f.service());
          assert.equal(r.analytics.cohortTotal, 2);
          assert.equal(r.analytics.selectionMissing, 1);
          assert.deepEqual(values(r.analytics.cerebras), {
            yes: 0,
            no: 1,
            unanswered: 1,
          });
          assert.ok(!r.scores.some((s) => s.projectId === "p1"));
          await batch(f.db, [
            ["UPDATE record_removals SET active=0 WHERE target_id='p1_v1'"],
            ["UPDATE projects SET published_version_id='p1_v2' WHERE id='p1'"],
            [
              "UPDATE reviews SET version_id='p1_v2' WHERE team_id='fake_team1'",
            ],
          ]);
        },
      );
      await t.test(
        "stored frozen snapshot never borrows current version or policy weights",
        async () => {
          const components = expected();
          const rev = (await one<{ version: number }>(
            f.db,
            "SELECT version FROM scoring_revision WHERE id=1",
          ))!.version;
          await batch(f.db, [
            [
              "INSERT INTO result_snapshots VALUES('synthetic-frozen',3,?,?,?,'fake_owner')",
              rev,
              JSON.stringify([
                {
                  teamId: "fake_team1",
                  policyVersion: 3,
                  eligibility: "eligible",
                  components,
                  rank: 1,
                },
              ]),
              time,
            ],
          ]);
          const r = await readAdminSubmissionAnalytics(f.service());
          assert.equal(r.analytics.frozen!.policyVersion, 3);
          assert.equal(r.analytics.frozen!.sourceRevision, rev);
          assert.equal(r.frozenScores[0].total, components.total);
          assert.equal(r.frozenScores[0].versionId, null);
          assert.ok(r.frozenScores[0].components.every((c) => c.max === null));
          assert.equal(r.frozenScores[0].basis, "frozen");
          assert.notEqual(r.analytics.scores.average, components.total);
        },
      );
    } finally {
      await f.close();
    }
  });
}

for (const engine of ["sqlite", "postgres"] as const)
  test(`${engine}: scored engagement bulk pages match canonical qualified counts, body hashes, distinct authors and relative full cohort denominator`, async () => {
    const f = await prepared(engine);
    try {
      const scored = {
        ...policy,
        engagementOpen: "2026-11-01T04:00:00.000Z",
        projectEngagementRule: "score-with-approved-normalization" as const,
        engagementQualification: {
          confirmed: true,
          version: 2,
          voters: "other-team" as const,
          feedbackAuthors: "other-team" as const,
          feedbackReview: "staff-qualified" as const,
          feedbackDuplicates: "exclude-exact-normalized-copies" as const,
        },
      };
      await batch(f.db, [
        [
          "UPDATE event_settings SET policy=? WHERE id=1",
          JSON.stringify({...scored,submissionClose:"2026-11-01T13:00:00.000Z"}),
        ],
        ["UPDATE reviews SET codex=2.5 WHERE team_id='fake_team3'"],
        ["INSERT INTO project_upvotes VALUES('p1','fake_bob',?)", time],
        ["INSERT INTO project_upvotes VALUES('p1','fake_carol',?)", time],
        ["INSERT INTO project_upvotes VALUES('p2','fake_alice',?)", time],
        ["INSERT INTO project_upvotes VALUES('p1','fake_alice',?)", time],
        [
          "INSERT INTO project_upvotes VALUES('p1','fake_dave','2026-11-01T12:00:00.000Z')",
        ],
      ]);
      // Existing votes survive a later owner window adjustment; new writes still obey 0113.
      await batch(f.db,[["UPDATE event_settings SET policy=? WHERE id=1",JSON.stringify(scored)]]);
      const text =
        "A detailed synthetic comment which meets the approved quality bounds.";
      const hash = await sha256(text);
      const statements: [string, ...unknown[]][] = [];
      for (let n = 0; n < 205; n++) {
        const id = "bulk" + String(n).padStart(3, "0");
        statements.push(
          [
            "INSERT INTO project_comments VALUES(?,'p1','fake_bob',?,?)",
            id,
            text,
            time,
          ],
          [
            "INSERT INTO project_feedback_reviews VALUES(?,?,'p1_v1',2,1,?,'fake_admin','Synthetic qualification',?)",
            "q" + id,
            id,
            hash,
            time,
          ],
        );
      }
      statements.push(
        [
          "INSERT INTO project_comments VALUES('pending','p1','fake_bob','Unreviewed but same valid author',?)",
          time,
        ],
        [
          "INSERT INTO project_comments VALUES('bad-hash','p2','fake_eve',?,?)",
          text,
          time,
        ],
        [
          "INSERT INTO project_feedback_reviews VALUES('q-bad','bad-hash','p2_v1',2,1,'not-the-body-hash','fake_admin','Synthetic mismatch',?)",
          time,
        ],
      );
      await batch(f.db, statements);
      let queries = 0;
      const measured: Database = {
        prepare(sql) {
          queries++;
          return f.db.prepare(sql);
        },
        batch: f.db.batch.bind(f.db),
      };
      const r = await readAdminSubmissionAnalytics(
        f.service("admin", measured),
      );
      assert.ok(
        queries < 25,
        `Bounded bulk queries including fresh actor: ${queries}`,
      );
      const canonical = await qualifiedEngagement(f.db, scored, "p1", "p1_v1");
      assert.deepEqual(canonical, {
        votes: 2,
        feedback: 1,
        pendingFeedback: 0,
      });
      assert.equal(
        r.scores[0].components.find((c) => c.key === "voting")!.value,
        10,
      );
      assert.equal(
        r.scores[0].components.find((c) => c.key === "bonus")!.value,
        7 * (1 / 10),
      );
      const second = r.scores.find((s) => s.projectId === "p2")!;
      assert.equal(second.total, null);
      assert.equal(
        second.components.find((c) => c.key === "bonus")!.value,
        null,
      );
      assert.equal(
        second.components.find((c) => c.key === "voting")!.value,
        10 * Math.sqrt(1 / 2),
      );
      await batch(f.db, [
        [
          "UPDATE reviews SET eligibility='needs_review' WHERE team_id='fake_team3'",
        ],
      ]);
      const uncertain = await readAdminSubmissionAnalytics(f.service());
      assert.equal(uncertain.scores[0].total, null);
      assert.equal(
        uncertain.scores[0].components.find((c) => c.key === "voting")!.value,
        null,
      );
    } finally {
      await f.close();
    }
  });

test("concurrent scoring revision or policy change fails cleanly instead of returning mixed totals", async () => {
  const f = await prepared();
  try {
    let changed = false;
    const wrapped: Database = {
      prepare(sql) {
        const statement = f.db.prepare(sql);
        return {
          bind(...args) {
            statement.bind(...args);
            return this;
          },
          async all<T>() {
            const result = await statement.all<T>();
            if (!changed && sql.includes("SELECT s.*,r.version_id")) {
              changed = true;
              await batch(f.db, [
                ["UPDATE reviews SET astra=7 WHERE team_id='fake_team1'"],
              ]);
            }
            return result;
          },
        };
      },
      batch: f.db.batch.bind(f.db),
    };
    const real = f.service();
    await assert.rejects(
      readAdminSubmissionAnalytics({
        db: wrapped,
        staff: real.staff.bind(real),
        settings: real.settings.bind(real),
      }),
      { code: "ANALYTICS_CHANGED_REFRESH" },
    );
    assert.equal(changed, true);
  } finally {
    await f.close();
  }
});

test("bulk query count does not grow per project and canonical complete components match compute without calling it in the reader", async () => {
  const f = await prepared();
  try {
    await batch(f.db, [
      ["UPDATE reviews SET codex=2.5 WHERE team_id='fake_team3'"],
    ]);
    const canonical = await f.service().compute(true);
    const first = await readAdminSubmissionAnalytics(f.service());
    for (const entry of canonical) {
      const projected = first.scores.find((s) => s.teamId === entry.teamId)!;
      assert.equal(projected.total, entry.components?.total ?? null);
      for (const part of projected.components)
        assert.equal(
          part.value,
          entry.components?.[part.key as keyof typeof entry.components] ?? null,
        );
    }
    let queryCount = 0;
    const measured: Database = {
      prepare(sql) {
        queryCount++;
        return f.db.prepare(sql);
      },
      batch: f.db.batch.bind(f.db),
    };
    const service = f.service();
    const reader = {
      db: measured,
      staff: service.staff.bind(service),
      settings: service.settings.bind(service),
    };
    await readAdminSubmissionAnalytics(reader);
    const small = queryCount;
    queryCount = 0;
    for (let n = 0; n < 20; n++)
      await batch(f.db, [
        [
          "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)",
          "bulk_user" + n,
          `bulk${n}@portal.test`,
          "Bulk " + n,
          time,
        ],
        [
          "INSERT INTO registrations(email,status) VALUES(?,'approved')",
          `bulk${n}@portal.test`,
        ],
        [
          "INSERT INTO teams VALUES(?,?,?,'Synthetic analytics team',?)",
          "bulk_team" + n,
          "Bulk " + n,
          "bulk_user" + n,
          time,
        ],
        [
          "INSERT INTO memberships VALUES(?,?,'2026-10-22T06:00:00.000Z')",
          "bulk_user" + n,
          "bulk_team" + n,
        ],
        [
          "INSERT INTO manual_checkins VALUES(?,?,'fake_admin',?)",
          "bulk_user" + n,
          `bulk${n}@portal.test`,
          time,
        ],
        [
          "INSERT INTO submission_versions VALUES(?,?,1,?,?)",
          "bulk_v" + n,
          "bulk_team" + n,
          JSON.stringify({ cerebrasIntegration: n % 2 ? "yes" : "no" }),
          time,
        ],
        [
          "INSERT INTO projects(id,team_id,slug,published_version_id,updated_at) VALUES(?,?,?,?,?)",
          "bulk_p" + n,
          "bulk_team" + n,
          "bulk-p" + n,
          "bulk_v" + n,
          time,
        ],
      ]);
    const large = await readAdminSubmissionAnalytics(reader);
    assert.equal(large.analytics.cohortTotal, 23);
    assert.equal(queryCount, small);
    assert.equal(
      queryCount,
      6,
      "Six bulk reads after fresh authorization/settings, independent of project count",
    );
  } finally {
    await f.close();
  }
});

test("empty or policy-incomplete collection never invents zero averages, and malformed frozen components stay unavailable", async () => {
  const db = new LocalDatabase(":memory:");
  db.migrate();
  try {
    await seedLocal(db);
    const service = new PortalService(
      db,
      fixtures.admin,
      LOCAL_CREDIT_KEY,
      () => time,
    );
    let r = await readAdminSubmissionAnalytics(service);
    assert.equal(r.analytics.cohortTotal, 0);
    assert.equal(r.analytics.scores.average, null);
    assert.equal(r.analytics.scores.minimum, null);
    assert.ok(r.analytics.policy.blockers.length > 0);
    const rev = (await one<{ version: number }>(
      db,
      "SELECT version FROM scoring_revision WHERE id=1",
    ))!.version;
    await batch(db, [
      [
        "INSERT INTO result_snapshots VALUES('malformed-frozen',1,?,?,?,'fake_owner')",
        rev,
        JSON.stringify([
          { teamId: "fake_team1", eligibility: "eligible", components: null },
          {
            teamId: "fake_team3",
            eligibility: "eligible",
            components: { ...expected(), total: 999 },
          },
          { teamId: "fake_team5", eligibility: "ineligible", components: null },
        ]),
        time,
      ],
    ]);
    r = await readAdminSubmissionAnalytics(service);
    assert.equal(r.analytics.frozen!.invalidEntries, 2);
    assert.equal(r.frozenScores.length, 1);
    assert.equal(r.frozenScores[0].total, null);
    assert.equal(r.frozenScores[0].versionId, null);
  } finally {
    db.close();
  }
});
