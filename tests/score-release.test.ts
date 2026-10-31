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
test("each public response reads score disclosure once and refilters the next response after eligibility revocation", async () => {
  const ctx = await data(6);
  const prepare = ctx.db.prepare.bind(ctx.db);
  let releaseReads = 0,
    validityScans = 0;
  ctx.db.prepare = (sql) => {
    if (sql.includes("FROM score_releases")) releaseReads++;
    if (sql.startsWith("SELECT p.id,p.published_version_id versionId"))
      validityScans++;
    return prepare(sql);
  };
  try {
    const community = (await ctx.publicService.view("/projects")) as Row;
    assert.equal(community.items.length, 6);
    assert.equal(releaseReads, 1);
    assert.equal(validityScans, 0);
    assert.ok(community.items.every((item: Row) => !item.result));

    await ctx.db
      .prepare("INSERT INTO score_releases VALUES(?,'ai',?,?,NULL,?,'fake_admin')")
      .bind(
        "synthetic-performance-release",
        "synthetic-source",
        JSON.stringify([
          {
            projectId: "stage-project-1",
            versionId: "stage-version-1",
            teamId: "stage-team-1",
            score: 12,
          },
        ]),
        "2026-11-01T13:00:00Z",
      )
      .all();
    releaseReads = validityScans = 0;
    const legacyHidden = (await ctx.publicService.view("/projects")) as Row;
    assert.equal(legacyHidden.scoreStage,"community");assert.ok(legacyHidden.items.every((item:Row)=>!item.result));assert.equal(validityScans,0);
    await ctx.db.prepare("INSERT INTO score_releases VALUES(?,'final',?,?,NULL,?,'fake_owner')").bind("synthetic-final-performance-release","synthetic-historical-source",JSON.stringify([{projectId:"stage-project-1",versionId:"stage-version-1",teamId:"stage-team-1",score:12,position:1}]),"2026-11-01T13:00:00Z").all();
    releaseReads = validityScans = 0;
    const disclosed = (await ctx.publicService.view("/projects")) as Row;
    assert.equal(releaseReads, 1);
    assert.equal(validityScans, 1);
    assert.equal(
      disclosed.items.find((item: Row) => item.id === "stage-project-1").result
        .score,
      12,
    );
    await ctx.db
      .prepare("UPDATE project_eligibility SET status='ineligible',reason='Synthetic revocation' WHERE project_id='stage-project-1'")
      .all();
    releaseReads = validityScans = 0;
    const revoked = (await ctx.publicService.view("/projects")) as Row;
    assert.equal(releaseReads, 1);
    assert.equal(validityScans, 1);
    assert.equal(revoked.items.length, 5);
    assert.ok(revoked.items.every((item: Row) => !item.result));
    assert.ok(!JSON.stringify(revoked).includes("stage-project-1"));
  } finally {
    ctx.db.prepare = prepare;
    ctx.db.close();
  }
});

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
test("retired AI-only actions never reveal marks, including historical provider records",async()=>{const {db,service,publicService}=await data(2);try{for(const actor of ["alice","judge","pending","admin"])await assert.rejects(service(actor).command("reveal-ai-scores",intent),{code:"OWNER_REQUIRED"});await assert.rejects(publicService.command("reveal-ai-scores",intent),{code:"SIGN_IN_REQUIRED"});await evaluations(db,2);await assert.rejects(service("owner").command("reveal-ai-scores",intent),{code:"USE_OWNER_SCORE_REVEAL"});await batch(db,[["INSERT INTO score_releases VALUES('synthetic-old-ai','ai','synthetic-source',?,NULL,'2026-11-01','fake_admin')",JSON.stringify([{projectId:"stage-project-1",versionId:"stage-version-1",teamId:"stage-team-1",score:3}])]]);const board=await publicService.view("/leaderboard") as Row;assert.equal(board.scoreStage,"community");assert.ok(board.items.every((p:Row)=>!p.result));assert.equal(board.scoringInfo,undefined);for(const key of ["dimensions","provider-response","provenance","source_id"])assert.ok(!JSON.stringify(board).includes(key));await assert.rejects(batch(db,[["UPDATE score_releases SET payload='[]'"]]),/IMMUTABLE/)}finally{db.close()}});
test("owner final reveal publishes every canonical position together without award-by-award withholding",async()=>{const {db,service,publicService}=await data();try{const command={snapshotId:"stage-frozen",confirmation:"PUBLIC_FINAL",reason:"Synthetic explicit final disclosure"};await assert.rejects(service("admin").command("reveal-final-scores",command),{code:"OWNER_REQUIRED"});await assert.rejects(service("owner").command("reveal-final-scores",command),{code:"CURRENT_FROZEN_SNAPSHOT_REQUIRED"});await snapshot(db,6);const policy=JSON.parse((await one<Row>(db,"SELECT policy FROM event_settings WHERE id=1"))!.policy);await batch(db,[["UPDATE event_settings SET policy=?",JSON.stringify({...policy,scoringDisclosure:null})]]);await assert.rejects(service("owner").command("reveal-final-scores",command),{code:"SCORING_DISCLOSURE_UNCONFIRMED"});await batch(db,[["UPDATE event_settings SET policy=?",JSON.stringify(policy)]]);const release=await service("owner").command("reveal-final-scores",command);await service("owner").command("reveal-final-scores",command);const board=await publicService.view("/leaderboard") as Row;assert.deepEqual(board.items.map((p:Row)=>p.result.position),[1,2,3,4,5,6]);assert.equal(board.finalCountdownComplete,true);assert.equal((await publicService.view("/winners") as Row).items.length,6);assert.equal(board.scoringInfo,undefined);const detail=await publicService.view("/projects/stage-1") as Row;assert.ok(detail.scoringInfo.weightage.includes("maximum 105"));assert.equal((await rows(db,"SELECT * FROM winner_reveals")).length,0);await assert.rejects(service("owner").command("unveil-winner",{releaseId:release.releaseId,position:1,confirmation:"UNVEIL_1",reason:"Synthetic retired action"}),{code:"USE_OWNER_SCORE_REVEAL"});assert.equal((await rows(db,"SELECT * FROM score_releases")).length,1);await assert.rejects(batch(db,[["UPDATE score_releases SET payload='[]'"]]),/IMMUTABLE/)}finally{db.close()}});
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
    "reveal-scores",
    { token: "synthetic-ready-token" },
    "Scores for 6 projects",
  );
  assert.match(specification.description, /Publish current total and category scores/);
  assert.match(specification.description, /cannot/);
  assert.equal(
    revealConfirmation("reveal-scores", {}),
    "REVEAL_SCORES",
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
  assert.match(html, /All current eligible projects/);
  assert.doesNotMatch(html, /Scores for 6 projects/);
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
    assert.ok(source.includes('fetch("/api/auth/signout"'));
    assert.ok(source.includes('credentials: "same-origin"'));
    assert.ok(source.includes("pageshow"));
    assert.ok(!source.includes("localStorage"));
    const auth = readFileSync("app/chatgpt-auth.ts", "utf8");
    assert.ok(auth.includes("readBackendSession"));
    assert.ok(!auth.includes("localStorage"));
  } finally {
    db.close();
  }
});
