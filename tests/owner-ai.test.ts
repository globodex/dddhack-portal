import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import {
  ownerAIView,
  providerUsage,
  recordProviderUsage,
  selectedAIModel,
} from "../lib/owner-ai";
import { batch, one, rows } from "../lib/db";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OwnerAIControls from "../app/owner-ai-controls";
const at = "2026-10-28T08:00:00.000Z",
  model = "synthetic-owner-only-model",
  evaluator = {
    model,
    available: true,
    provenance: "provider" as const,
    evaluate: async () => {
      throw Error("NO_PAID_CALLS");
    },
  };
for (const engine of ["sqlite", "postgres"] as const) {
  const fixture = async () => {
    if (engine === "sqlite") {
      const f = await setup();
      return {
        db: f.db,
        service: (who = "owner") =>
          new PortalService(
            f.db,
            fixtures[who],
            LOCAL_CREDIT_KEY,
            () => at,
            evaluator,
          ),
      };
    }
    const f = await createPGliteFixture();
    await seedLocal(f.db);
    return {
      db: f.db,
      service: (who = "owner") =>
        new PortalService(
          f.db,
          fixtures[who],
          LOCAL_CREDIT_KEY,
          () => at,
          evaluator,
        ),
    };
  };
  test(`${engine}: only owner reads/changes model with revision CAS; administrators retain ordinary controls without model metadata`, async () => {
    const f = await fixture();
    try {
      const owner = f.service();
      const first = await ownerAIView(owner);
      assert.equal(first.model, model);
      assert.equal(first.input.tokens, null);
      assert.equal(first.costUSD, null);
      assert.equal(first.responses, 0);
      for (const who of ["admin", "alice", "stranger"]) {
        await assert.rejects(ownerAIView(f.service(who)), {
          code: "OWNER_REQUIRED",
        });
        await assert.rejects(
          f.service(who).command("change-ai-model", {
            model: "new-model",
            expectedRevision: 0,
            confirmation: "CHANGE_AI_MODEL",
          }),
        );
      }
      const adminSettings = (await f
        .service("admin")
        .view("/admin/settings")) as any;
      assert.equal(adminSettings.ownerAI, undefined);
      assert.ok(!JSON.stringify(adminSettings).includes(model));
      const ownerSettings = (await owner.view("/admin/settings")) as any;
      assert.equal(ownerSettings.ownerAI.model, model);
      await owner.command("change-ai-model", {
        model: "synthetic-second-model",
        expectedRevision: 0,
        confirmation: "CHANGE_AI_MODEL",
      });
      assert.equal(
        (await selectedAIModel(f.db, model)).model,
        "synthetic-second-model",
      );
      await assert.rejects(
        owner.command("change-ai-model", {
          model: "stale",
          expectedRevision: 0,
          confirmation: "CHANGE_AI_MODEL",
        }),
        { code: "AI_MODEL_CHANGED" },
      );
      await owner.command("change-ai-model", {
        model: "synthetic-third-model",
        expectedRevision: 1,
        confirmation: "CHANGE_AI_MODEL",
      });
      assert.equal((await ownerAIView(owner)).revision, 2);
      await assert.rejects(
        owner.command("change-ai-model", {
          model: "https://unsafe.invalid/model",
          expectedRevision: 2,
          confirmation: "CHANGE_AI_MODEL",
        }),
      );
      assert.equal(
        (await selectedAIModel(f.db)).model,
        "synthetic-third-model",
      );
      const logs = await rows(
        f.db,
        "SELECT detail FROM audit_logs WHERE action='change-ai-model'",
      );
      assert.equal(logs.length, 2);
      assert.ok(!JSON.stringify(logs).includes("synthetic-third-model"));
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: selected-model token coverage preserves zero/unknown/partial, excludes other models and deduplicates provider responses`, async () => {
    const f = await fixture();
    try {
      const u = providerUsage(
        {
          id: "resp_zero",
          model,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            input_tokens_details: { cached_tokens: 0 },
            total_tokens: 0,
          },
        },
        "synthetic-version",
        model,
      );
      await recordProviderUsage(f.db, u, at);
      await recordProviderUsage(f.db, u, at);
      await recordProviderUsage(
        f.db,
        providerUsage(
          {
            id: "resp_known",
            model,
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              input_tokens_details: { cached_tokens: 40 },
              total_tokens: 120,
            },
          },
          "synthetic-version",
          model,
        ),
        at,
      );
      await recordProviderUsage(
        f.db,
        providerUsage(
          {
            id: "resp_missing",
            model,
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
          "synthetic-version",
          model,
        ),
        at,
      );
      await recordProviderUsage(
        f.db,
        providerUsage(
          { id: "resp_other", model: "other", usage: { input_tokens: 9999 } },
          "synthetic-version",
          "other",
        ),
        at,
      );
      const stats = await ownerAIView(f.service());
      assert.equal(stats.responses, 3);
      assert.deepEqual(stats.input, { tokens: 110, knownResponses: 3 });
      assert.deepEqual(stats.output, { tokens: 25, knownResponses: 3 });
      assert.deepEqual(stats.cached, { tokens: 40, knownResponses: 2 });
      assert.deepEqual(stats.total, { tokens: 135, knownResponses: 3 });
      assert.equal(stats.costUSD, null);
      assert.match(stats.coverage, /Historical calls/);
      assert.match(stats.costReason, /not an invoice/);
      assert.equal(
        (await one<any>(f.db, "SELECT count(*) n FROM ai_provider_usage"))?.n,
        4,
      );
      const invalid = providerUsage(
        {
          id: "resp_invalid",
          usage: {
            input_tokens: -3,
            output_tokens: NaN,
            total_tokens: "3",
            input_tokens_details: { cached_tokens: 1.5 },
          },
        },
        "v",
        model,
      );
      assert.equal(invalid.input, null);
      assert.equal(invalid.output, null);
      assert.equal(invalid.cached, null);
      assert.equal(invalid.total, null);
      const inconsistent = providerUsage(
        {
          id: "resp_bad",
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 2,
            input_tokens_details: { cached_tokens: 11 },
          },
        },
        "v",
        model,
      );
      assert.equal(inconsistent.cached, null);
      assert.equal(inconsistent.total, null);
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: completed provider model and config key never reach nonowner project/job projections`, async () => {
    const f = await fixture();
    try {
      await attend(f.db, "fake_bob");
      const sha = "a".repeat(40),
        report = {
          versionId: "owner-privacy-version",
          status: "finalized",
          model,
          rubricVersion: 1,
          revision: sha,
          checks: [
            {
              id: "approved-snapshot",
              status: "PASS",
              evidence: ["commit:" + sha],
              explanation: "Synthetic approved source",
            },
          ],
          dimensions: {
            functionality: 0,
            complexity: 0,
            openai: 0,
            cerebras: 0,
            ux: 0,
            docs: 0,
            contributors: 0,
            deployment: 0,
            readiness: 0,
            seo: 0,
          },
          suspectedFalseClaims: [],
        };
      await batch(f.db, [
        [
          "INSERT INTO submission_versions VALUES('owner-privacy-version','fake_team3',1,'{}','2026-11-01T04:00:00.000Z')",
        ],
        [
          "INSERT INTO projects(id,team_id,slug,draft,revision,published_version_id,updated_at) VALUES('owner-privacy-project','fake_team3','owner-privacy-project','{}',1,'owner-privacy-version',?)",
          at,
        ],
        [
          "INSERT INTO astra_jobs(id,version_id,state,attempts,report,updated_at) VALUES('owner-privacy-job','owner-privacy-version','finalized',1,?,?)",
          JSON.stringify(report),
          at,
        ],
        [
          "INSERT INTO evaluation_runs(id,project_id,version_id,config_key,state,report,score,provenance,created_at,updated_at) VALUES('owner-privacy-run','owner-privacy-project','owner-privacy-version',?,'completed',?,0,'provider',?,?)",
          "openai-rubric-v2:" + model,
          JSON.stringify(report),
          at,
          at,
        ],
      ]);
      const owner = (await f
        .service()
        .view("/admin/submissions/owner-privacy-project")) as any;
      assert.equal(owner.evaluation.report.model, model);
      for (const path of [
        "/admin/submissions/owner-privacy-project",
        "/admin/astra",
      ]) {
        const admin = (await f.service("admin").view(path)) as any;
        assert.ok(!JSON.stringify(admin).includes(model), path);
        if (path.includes("submissions")) {
          assert.equal(admin.evaluation.score, 0);
          assert.equal(admin.evaluation.report.model, undefined);
          assert.equal(admin.runs[0].config_key, undefined);
        }
      }
    } finally {
      await f.db.close();
    }
  });
}
test("owner UI distinguishes missing totals from genuine zero and shows no controls to nonowner", () => {
  const metric = { tokens: null, knownResponses: 0 },
    data = {
      model,
      revision: 0,
      source: "environment",
      responses: 0,
      input: metric,
      output: metric,
      cached: metric,
      total: metric,
      costUSD: null,
      coverage: "Recorded portal responses only",
      costReason: "Charged cost unavailable",
    };
  const render = (owner: boolean, override = {}) =>
    renderToStaticMarkup(
      createElement(OwnerAIControls, {
        owner,
        data: { ...data, ...override },
        run: async () => {
          throw Error("RENDER_ONLY");
        },
      }),
    );
  assert.equal(render(false), "");
  const h = render(true);
  assert.match(h, /Owner only/);
  assert.match(h, /Unavailable/);
  assert.match(h, /Model ID/);
  assert.match(
    render(true, { input: { tokens: 0, knownResponses: 1 }, responses: 1 }),
    /Input<\/span><strong>0/,
  );
});
