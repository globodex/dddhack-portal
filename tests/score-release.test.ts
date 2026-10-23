import { attend } from "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setup, activate } from "./helpers";
import { syntheticImage } from "./fixture-images";
import { PortalService } from "../lib/service";
import { one, rows, batch } from "../lib/db";
import {
  ConfirmationGate,
  confirmationFor,
  revealConfirmation,
} from "../lib/action-confirmation";
import { handlePortal } from "../lib/http";
import { fixtures } from "../scripts/fixtures";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConfirmationDialog from "../app/confirmation-dialog";
type Row = Record<string, any>;
const logo = syntheticImage(64, 64),
  banner = syntheticImage(160, 90);
async function data(count = 6) {
  const ctx = await setup();
  await activate(ctx.db);
  ctx.clock("2026-11-01T13:00:00.000Z");
  for (let i = 1; i <= count; i++) {
    const k = String(i),
      t = "stage-team-" + k,
      u = "stage-user-" + k,
      v = "stage-version-" + k,
      p = "stage-project-" + k;
    await batch(ctx.db, [
      [
        "INSERT INTO users VALUES(?,?,?,'participant',?)",
        u,
        k + "@stage.invalid",
        "Public Team " + k,
        "2026-10-22",
      ],
      [
        "INSERT INTO registrations VALUES(?,'approved',1)",
        k + "@stage.invalid",
      ],
      ["INSERT INTO teams VALUES(?,?,?,'',?)", t, "Team " + k, u, "2026-10-22"],
      ["INSERT INTO memberships VALUES(?,?,?)", u, t, "2026-10-22"],
      [
        "INSERT INTO manual_checkins VALUES(?,?,?,?)",
        u,
        k + "@stage.invalid",
        "fake_admin",
        "2026-11-01T02:30:01Z",
      ],
      [
        "INSERT INTO submission_versions VALUES(?,?,1,?,?)",
        v,
        t,
        JSON.stringify({
          projectName: "Project " + k,
          problemSolution: "Synthetic example",
          description: "Synthetic public description",
          github: "https://github.com/example/rehearsal",
          commitSha: "a".repeat(40),
          demo: "",
          logo,
          banner,
        }),
        "2026-11-01T04:00:00.000Z",
      ],
      [
        "INSERT INTO projects VALUES(?,?,?,?,1,?,?)",
        p,
        t,
        "stage-" + k,
        "{}",
        v,
        "2026-11-01T04:00:00.000Z",
      ],
      [
        "INSERT INTO project_eligibility VALUES(?,?,'eligible','Synthetic verification','fake_admin',?)",
        p,
        v,
        "2026-11-01",
      ],
    ]);
  }
  return { ...ctx, publicService: new PortalService(ctx.db, null, undefined) };
}
function report(versionId: string, model = "fixture-provider-result") {
  return {
    versionId,
    status: "finalized",
    model,
    rubricVersion: 1,
    revision: "synthetic-provider-response",
    checks: [],
    dimensions: {
      functionality: 1,
      complexity: 1,
      openai: 1,
      cerebras: 1,
      ux: 1,
      docs: 1,
      contributors: 1,
      deployment: 1,
      readiness: 1,
      seo: 1,
    },
    suspectedFalseClaims: [],
  };
}
async function evaluations(db: any, count: number) {
  for (let i = 1; i <= count; i++)
    await batch(db, [
      [
        "INSERT INTO evaluation_runs(id,project_id,version_id,config_key,state,report,score,provenance,created_at,updated_at) VALUES(?,?,?,'fixture-config','completed',?,?,'provider',?,?)",
        "provider-fixture-" + i,
        "stage-project-" + i,
        "stage-version-" + i,
        JSON.stringify(report("stage-version-" + i)),
        i * 3,
        "2026-11-01",
        "2026-11-01",
      ],
    ]);
}
async function snapshot(db: any, count: number) {
  const rev = (await one<Row>(
    db,
    "SELECT version FROM scoring_revision WHERE id=1",
  ))!.version;
  const policy = (await one<Row>(
    db,
    "SELECT version FROM event_settings WHERE id=1",
  ))!.version;
  await batch(db, [
    [
      "INSERT INTO result_snapshots VALUES('stage-frozen',?,?,?,?, 'fake_owner')",
      policy,
      rev,
      JSON.stringify(
        Array.from({ length: count }, (_, i) => ({
          teamId: "stage-team-" + (i + 1),
          rank: i + 1,
          eligibility: "eligible",
          components: { total: 97 - i * 7 },
        })),
      ),
      "2026-11-01T13:00:00Z",
    ],
  ]);
}
const intent = {
  reason: "Synthetic reviewed public release",
  confirmation: "PUBLIC_AI",
};
test("AI reveal requires admin, explicit intent, actual persisted provider score and finalized current-version report", async () => {
  const { db, service, publicService } = await data(2);
  try {
    for (const actor of ["alice", "judge", "pending"])
      await assert.rejects(
        service(actor).command("reveal-ai-scores", intent),
        /ADMIN_REQUIRED/,
      );
    await assert.rejects(
      publicService.command("reveal-ai-scores", intent),
      /SIGN_IN_REQUIRED/,
    );
    await assert.rejects(
      service("admin").command("reveal-ai-scores", {
        ...intent,
        confirmation: "",
      }),
      /EXPLICIT_REVEAL/,
    );
    await assert.rejects(
      service("admin").command("reveal-ai-scores", intent),
      /REAL_EVALUATION_REQUIRED/,
    );
    await evaluations(db, 2);
    await batch(db, [
      [
        "UPDATE evaluation_runs SET report=? WHERE id='provider-fixture-1'",
        JSON.stringify(report("stage-version-1", "disabled-no-external-calls")),
      ],
    ]);
    await assert.rejects(
      service("admin").command("reveal-ai-scores", intent),
      /FINALIZED_EVALUATION_REQUIRED/,
    );
    await batch(db, [
      [
        "UPDATE evaluation_runs SET report=? WHERE id='provider-fixture-1'",
        JSON.stringify(report("stage-version-1")),
      ],
    ]);
    const before = (await publicService.view("/leaderboard")) as Row;
    assert.equal(before.scoreStage, "community");
    assert.ok(before.items.every((p: Row) => !p.result));
    await service("admin").command("reveal-ai-scores", intent);
    await service("owner").command("reveal-ai-scores", intent);
    const board = (await publicService.view("/leaderboard")) as Row;
    assert.equal(board.scoreStage, "ai");
    assert.deepEqual(
      board.items.map((p: Row) => p.id),
      ["stage-project-2", "stage-project-1"],
    );
    assert.equal(board.items[0].result.score, 6);
    assert.equal(board.scoringInfo, undefined);
    const json = JSON.stringify(board);
    for (const privateKey of [
      "dimensions",
      "rubricVersion",
      "weightage",
      "provider-response",
      "provenance",
      "source_id",
    ])
      assert.ok(!json.includes(privateKey));
    assert.equal((await rows(db, "SELECT * FROM score_releases")).length, 1);
    await assert.rejects(
      batch(db, [["UPDATE score_releases SET payload='[]'"]]),
      /IMMUTABLE/,
    );
    await batch(db, [
      [
        "UPDATE project_eligibility SET status='ineligible' WHERE project_id='stage-project-2'",
      ],
    ]);
    assert.equal(
      ((await publicService.view("/leaderboard")) as Row).items.length,
      1,
    );
  } finally {
    db.close();
  }
});
test("final stage withholds every undisclosed position, allows manual award order, then enables full final ordering and confirmed Info", async () => {
  const { db, service, publicService } = await data();
  try {
    const before = (await publicService.view("/leaderboard")) as Row;
    const intent = {
      snapshotId: "stage-frozen",
      confirmation: "PUBLIC_FINAL",
      reason: "Synthetic explicit final disclosure",
    };
    await assert.rejects(
      service("admin").command("reveal-final-scores", intent),
      /CURRENT_FROZEN_SNAPSHOT_REQUIRED/,
    );
    await snapshot(db, 6);
    const policy = JSON.parse(
      (await one<Row>(db, "SELECT policy FROM event_settings WHERE id=1"))!
        .policy,
    );
    await batch(db, [
      [
        "UPDATE event_settings SET policy=?",
        JSON.stringify({ ...policy, scoringDisclosure: null }),
      ],
    ]);
    await assert.rejects(
      service("admin").command("reveal-final-scores", intent),
      /SCORING_DISCLOSURE_UNCONFIRMED/,
    );
    await batch(db, [
      ["UPDATE event_settings SET policy=?", JSON.stringify(policy)],
    ]);
    const release = await service("admin").command(
      "reveal-final-scores",
      intent,
    );
    await service("owner").command("reveal-final-scores", intent);
    let board = (await publicService.view("/leaderboard")) as Row;
    assert.deepEqual(
      board.items.map((p: Row) => p.id),
      before.items.map((p: Row) => p.id),
    );
    assert.ok(board.items.every((p: Row) => !p.result));
    assert.equal(board.awards.length, 0);
    assert.ok(board.scoringInfo.weightage.includes("maximum 105"));
    assert.equal(
      ((await publicService.view("/winners")) as Row).items.length,
      0,
    );
    for (const [step, n] of [3, 1, 5, 2, 4].entries()) {
      const command = {
        releaseId: release.releaseId,
        position: n,
        confirmation: "UNVEIL_" + n,
        reason: "Synthetic unveil award " + n,
      };
      await service("admin").command("unveil-winner", command);
      await service("admin").command("unveil-winner", command);
      board = (await publicService.view("/leaderboard")) as Row;
      const winner = (await publicService.view("/projects/stage-1")) as Row;
      if (step < 4) {
        assert.equal(board.finalCountdownComplete, false);
        assert.equal(
          board.items.find((p: Row) => p.id === "stage-project-6").result,
          undefined,
        );
        assert.equal(board.awards.length, step + 1);
        assert.deepEqual(
          board.items.map((p: Row) => p.id),
          before.items.map((p: Row) => p.id),
        );
        const hidden = [3, 1, 5, 2, 4].slice(step + 1);
        for (const position of hidden)
          assert.equal(
            board.items.find((p: Row) => p.id === "stage-project-" + position)
              .result,
            undefined,
          );
      }
    }
    assert.equal(board.finalCountdownComplete, true);
    assert.deepEqual(
      board.items.map((p: Row) => p.result.position),
      [1, 2, 3, 4, 5, 6],
    );
    assert.equal((await rows(db, "SELECT * FROM winner_reveals")).length, 5);
    await assert.rejects(
      batch(db, [["DELETE FROM winner_reveals"]]),
      /IMMUTABLE/,
    );
    await assert.rejects(
      service("alice").command("unveil-winner", {
        releaseId: release.releaseId,
        position: 1,
        confirmation: "UNVEIL_1",
        reason: "Synthetic unauthorized repeat",
      }),
      /ADMIN_REQUIRED/,
    );
    assert.equal((await rows(db, "SELECT * FROM score_releases")).length, 1);
  } finally {
    db.close();
  }
});
test("confirmation decisions are default-safe, single-use and block overlapping prompts; accessible dialog exposes exact target", async () => {
  const updates: any[] = [];
  const gate = new ConfirmationGate((value) => updates.push(value));
  let writes = 0;
  const action = async () => {
    if (
      await gate.ask(
        confirmationFor(
          "content-publish",
          { scope: "public" },
          "Public agenda revision 4",
        ),
      )
    )
      writes++;
  };
  let waiting = action();
  assert.equal(writes, 0);
  assert.throws(
    () => gate.ask(confirmationFor("logout", {}, "Owner session")),
    /awaiting confirmation/,
  );
  gate.decide(false);
  await waiting;
  assert.equal(writes, 0);
  waiting = action();
  gate.decide(true);
  gate.decide(true);
  await waiting;
  assert.equal(writes, 1);
  assert.equal(gate.pending, null);
  const specification = confirmationFor(
    "unveil-winner",
    { position: 5 },
    "Award 5",
  );
  assert.match(specification.description, /everyone/);
  assert.match(specification.description, /cannot/);
  assert.equal(
    revealConfirmation("unveil-winner", { position: 5 }),
    "UNVEIL_5",
  );
  const html = renderToStaticMarkup(
    createElement(ConfirmationDialog, {
      value: specification,
      decide: () => {},
    }),
  );
  assert.match(html, /<dialog/);
  assert.match(html, /aria-labelledby="confirmation-title"/);
  assert.match(html, /aria-describedby=/);
  assert.match(html, /autoFocus=""/i);
  assert.match(html, /Cancel/);
  assert.match(html, /Award 5/);
});
test("managed identity persists across ordinary requests; local logout expires its fixture cookie and anonymous private reads fail", async () => {
  const { db } = await setup();
  try {
    const runtime = {
      db,
      identity: fixtures.alice,
      key: undefined,
      localTest: true,
    };
    for (let i = 0; i < 3; i++) {
      const r = await handlePortal(
        new Request("https://portal.test/api/portal?view=/dashboard"),
        runtime,
      );
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("set-cookie"), null);
      assert.match(r.headers.get("cache-control")!, /no-store/);
    }
    const response = await handlePortal(
      new Request("https://portal.test/api/portal", {
        method: "POST",
        headers: {
          origin: "https://portal.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "local-signout", data: {} }),
      }),
      runtime,
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal(
      (
        await handlePortal(
          new Request("https://portal.test/api/portal?view=/dashboard"),
          { ...runtime, identity: null },
        )
      ).status,
      401,
    );
    const source = readFileSync("app/portal.tsx", "utf8");
    assert.ok(source.includes("/signout-with-chatgpt?return_to=%2F"));
    assert.ok(source.includes('link.target = "_top"'));
    assert.ok(source.includes("pageshow"));
    assert.ok(!source.includes("localStorage"));
    const auth = readFileSync("app/chatgpt-auth.ts", "utf8");
    assert.ok(auth.includes('const SIGN_OUT_PATH = "/signout-with-chatgpt"'));
    assert.ok(!auth.includes("localStorage"));
  } finally {
    db.close();
  }
});
