import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import AdminStats from "../app/admin-stats";
import AdminSubmissionAnalytics from "../app/admin-submission-analytics";
import AdminProjectScore from "../app/admin-project-score";
import type {
  AdminParticipantBreakdown,
  AdminStatsDTO,
} from "../lib/admin-stats";
import type {
  AdminProjectScoreDTO,
  AdminSubmissionAnalyticsDTO,
} from "../lib/admin-submission-analytics";

const categories = [
  "Startup Founder",
  "Working Professional",
  "Independent Developer",
  "College Student",
  "School Student",
  "Other (non-tech)",
  "Other saved response",
  "Not provided",
];
function breakdown(value: number): AdminParticipantBreakdown {
  const missing = value > 0 ? 1 : 0;
  return {
    available: true,
    gender: [
      "Male",
      "Female",
      "Non-binary",
      "Self-described",
      "Prefer not to say",
      "Not provided",
    ].map((label, index) => ({
      key: [
        "man",
        "woman",
        "non-binary",
        "self-described",
        "prefer-not-to-say",
        "not-provided",
      ][index],
      label,
      value: index === 0 ? value - missing : index === 5 ? missing : 0,
    })),
    profession: categories.map((label, index) => ({
      key: `profession-${index}`,
      label,
      value: index === 1 ? value - missing : index === 7 ? missing : 0,
    })),
  };
}
const participants: AdminStatsDTO = {
  collection: "participants",
  scope: "Entire collection",
  cards: [
    {
      key: "roster",
      label: "Added manually",
      value: 160,
      breakdown: breakdown(160),
    },
    {
      key: "signed_in",
      label: "Signed-in",
      value: 3,
      lowerBound: true,
      caption: "Older sign-in evidence is incomplete",
      breakdown: { ...breakdown(3), scope: "Confirmed sign-ins only" },
    },
    { key: "going", label: "Going", value: 82, breakdown: breakdown(82) },
    {
      key: "checked_in",
      label: "Checked-in",
      value: 35,
      breakdown: breakdown(35),
    },
    { key: "pending", label: "Pending", value: 12, breakdown: breakdown(12) },
  ],
};
const analytics: AdminSubmissionAnalyticsDTO = {
  scope: "Current committed submissions",
  cohortTotal: 16,
  selectionMissing: 1,
  cerebras: [
    { key: "yes", label: "Yes", value: 8 },
    { key: "no", label: "No", value: 5 },
    { key: "unanswered", label: "Unanswered", value: 3 },
  ],
  eligibility: [
    { key: "eligible", label: "Eligible", value: 9 },
    { key: "ineligible", label: "Not eligible", value: 2 },
    { key: "awaiting", label: "Awaiting review", value: 5 },
  ],
  evaluation: [
    { key: "completed", label: "Evaluated", value: 6 },
    { key: "pending", label: "Awaiting evaluation", value: 4 },
    { key: "not_evaluated", label: "Not evaluated", value: 6 },
  ],
  scores: {
    complete: 7,
    awaiting: 9,
    eligibleComparable: 5,
    average: 84.75,
    minimum: 60.5,
    maximum: 103.25,
  },
  policy: {
    version: 4,
    blockers: [],
    maxTotal: 105,
    baseMaximum: 100,
    feedbackMaximum: 5,
  },
  frozen: {
    snapshotId: "synthetic-frozen",
    policyVersion: 3,
    sourceRevision: 12,
    createdAt: "2026-11-01T12:30:00.000Z",
    entryCount: 12,
    eligibleCount: 10,
    invalidEntries: 1,
  },
};
const score: AdminProjectScoreDTO = {
  projectId: "synthetic-project",
  teamId: "synthetic-team",
  versionId: "synthetic-v2",
  attempt: 2,
  total: 102.75,
  basis: "current",
  pending: [],
  eligibility: "eligible",
  policyVersion: 4,
  snapshotId: null,
  sourceRevision: null,
  createdAt: null,
  components: [
    { key: "human", label: "Human", value: 50, max: 50, status: "available" },
    { key: "astra", label: "AI", value: 30, max: 30, status: "provider" },
    { key: "voting", label: "Votes", value: 4.75, max: 5, status: "available" },
    {
      key: "diversity",
      label: "Collaboration",
      value: 10,
      max: 10,
      status: "available",
    },
    { key: "codex", label: "Codex", value: 5, max: 5, status: "available" },
    {
      key: "bonus",
      label: "Feedback bonus",
      value: 4.25,
      max: 5,
      status: "available",
    },
    {
      key: "penalties",
      label: "Penalties",
      value: 1.25,
      max: null,
      status: "available",
    },
  ],
};
const awaiting: AdminProjectScoreDTO = {
  ...score,
  projectId: "synthetic-awaiting",
  total: null,
  components: score.components.map((component) =>
    component.key === "astra"
      ? { ...component, value: null, status: "awaiting" }
      : component.key === "voting"
        ? { ...component, value: 0 }
        : component,
  ),
  pending: ["AI evaluation has not been completed."],
};
const frozen: AdminProjectScoreDTO = {
  ...score,
  basis: "frozen",
  versionId: null,
  attempt: null,
  total: 98.5,
  snapshotId: "synthetic-frozen",
  sourceRevision: 12,
  policyVersion: 3,
  createdAt: "2026-11-01T12:30:00.000Z",
  components: score.components.map((component) => ({
    ...component,
    max: null,
  })),
};

test("participant details start OFF, preserve the five original metrics and never infer demographic data from unknown sign-ins", () => {
  const html = renderToStaticMarkup(
    createElement(AdminStats, { stats: participants }),
  );
  assert.match(html, /role="switch"[^>]*aria-checked="false"/);
  assert.match(html, /Detailed view/);
  assert.equal(
    (html.match(/class="admin-collection-stats-card"/g) || []).length,
    5,
  );
  assert.doesNotMatch(html, /<h3>Gender|<h3>Profession|Working Professional/);
  assert.match(html, /≥3/);
  assert.match(html, /Older sign-in evidence is incomplete/);
});
test("submission insights keep current-selected cohort, missing selection and frozen scope explicit; scores are points and use only eligible comparable summaries", () => {
  const html = renderToStaticMarkup(
    createElement(AdminSubmissionAnalytics, { analytics }),
  );
  assert.match(html, /Current committed submissions/);
  assert.match(html, /Unanswered/);
  assert.match(html, /project has an unavailable selected submission/);
  assert.match(html, /Eligible with complete scores/);
  assert.match(html, /100 base \+ up to 5 feedback, before penalties/);
  assert.match(html, /Frozen results/);
  assert.match(html, /entry unavailable/);
  assert.doesNotMatch(html, /%|NaN|Infinity/);
  const empty = {
    ...analytics,
    cohortTotal: 0,
    selectionMissing: 0,
    cerebras: analytics.cerebras.map((row) => ({ ...row, value: 0 })),
    evaluation: analytics.evaluation.map((row) => ({ ...row, value: 0 })),
    eligibility: analytics.eligibility.map((row) => ({ ...row, value: 0 })),
    scores: {
      complete: 0,
      awaiting: 0,
      eligibleComparable: 0,
      average: null,
      minimum: null,
      maximum: null,
    },
    frozen: null,
  };
  const zero = renderToStaticMarkup(
    createElement(AdminSubmissionAnalytics, { analytics: empty }),
  );
  assert.match(zero, /<dd>0<\/dd>/);
  assert.equal((zero.match(/Not available/g) || []).length, 3);
  assert.doesNotMatch(zero, /Frozen results|NaN|Infinity/);
});
test("project scores display canonical totals without client recomputation, distinguish missing from genuine0, and label frozen values separately", () => {
  const current = renderToStaticMarkup(
    createElement(AdminProjectScore, { score }),
  );
  assert.match(current, /102\.75/);
  assert.match(current, /−1\.25/);
  assert.match(current, /Feedback bonus/);
  assert.doesNotMatch(current, /%|open=""/);
  const serverTotal = renderToStaticMarkup(
    createElement(AdminProjectScore, { score: { ...score, total: 17.125 } }),
  );
  assert.match(serverTotal, /17\.13/);
  assert.doesNotMatch(serverTotal, /102\.75/);
  const partial = renderToStaticMarkup(
    createElement(AdminProjectScore, { score: awaiting }),
  );
  assert.match(partial, /Awaiting scores/);
  assert.match(partial, /Not evaluated/);
  assert.match(partial, /<b>0<\/b>/);
  const ineligible = renderToStaticMarkup(
    createElement(AdminProjectScore, {
      score: { ...awaiting, eligibility: "ineligible" },
    }),
  );
  assert.match(ineligible, /Not eligible/);
  assert.doesNotMatch(ineligible, /Awaiting scores/);
  const snapshot = renderToStaticMarkup(
    createElement(AdminProjectScore, { score: frozen }),
  );
  assert.match(snapshot, /Frozen score/);
  assert.match(snapshot, /98\.5/);
  assert.match(snapshot, /Revision 12/);
  assert.match(snapshot, /Version not recorded/);
  assert.doesNotMatch(snapshot, /Not submitted/);
  assert.doesNotMatch(snapshot, /Current score/);
});

const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
test(
  "actual hydrated component controls preserve focus, expose0chips, make no extra requests and fit1440/768/390/320 including short mobile",
  { skip: !existsSync(chromiumPath) },
  async () => {
    const fixtures = JSON.stringify({
      participants,
      analytics,
      score,
      awaiting,
      frozen,
    });
    const bundle = await build({
      stdin: {
        contents: `
    import React,{useEffect,useState} from "react";
    import{createRoot}from"react-dom/client";
    import AdminStats from"./app/admin-stats";
    import AdminSubmissionAnalytics from"./app/admin-submission-analytics";
    import AdminProjectScore from"./app/admin-project-score";
    const f=${fixtures};
    function App(){const[scenario,setScenario]=useState("participants");useEffect(()=>{window.setScenario=setScenario;window.uiReady=true},[]);
      const p=scenario==="unknown"?{...f.participants,cards:f.participants.cards.map(c=>c.key==="signed_in"?{...c,value:null,lowerBound:false,breakdown:{available:false,gender:[],profession:[]}}:c)}:scenario==="empty"?{...f.participants,cards:f.participants.cards.map(c=>({...c,value:0,lowerBound:false,caption:undefined,breakdown:{...c.breakdown,scope:undefined,gender:c.breakdown.gender.map(b=>({...b,value:0})),profession:c.breakdown.profession.map(b=>({...b,value:0}))}}))}:f.participants;
      return <main className="app-shell"><h1>{scenario==="submissions"?"Submissions":"Participants"}</h1>{scenario==="submissions"?<><AdminSubmissionAnalytics analytics={f.analytics}/><div className="fixture-project-grid">{[f.score,f.awaiting,f.frozen].map(s=><article className="fixture-project" key={s.projectId+s.basis}><h2>Synthetic project</h2><AdminProjectScore score={s}/></article>)}</div></>:<AdminStats stats={p}/>}</main>;
    }createRoot(document.getElementById("root")).render(<App/>);`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      bundle: true,
      format: "iife",
      write: false,
      platform: "browser",
      define: { "process.env.NODE_ENV": '"production"' },
      jsx: "automatic",
    });
    const fontCss = [400, 500, 700]
      .map(
        (weight) =>
          `@font-face{font-family:"DM Sans";font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/dm-sans/files/dm-sans-latin-${weight}-normal.woff2`).toString("base64")}) format('woff2');font-display:block}`,
      )
      .join("\n");
    const css = [
      "app/style.css",
      "app/redesign.css",
      "app/admin-stats.css",
      "app/admin-submission-analytics.css",
      "app/admin-project-score.css",
    ]
      .map((file) => readFileSync(file, "utf8").replace(/^@import[^;]+;/gm, ""))
      .join("\n");
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${fontCss}\n${css}\n.app-shell{display:block;max-width:1200px;margin:auto;padding:24px;min-height:100vh}h1{font-size:36px;letter-spacing:-.04em;margin:0 0 24px}.fixture-project-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.fixture-project{min-width:0;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.fixture-project>h2{margin:0;padding:18px 16px;font-size:16px}@media(max-width:800px){.fixture-project-grid{grid-template-columns:minmax(0,1fr)}}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const artifactRoot =
      process.env.PORTAL_ANALYTICS_UI_ARTIFACT_DIR ||
      join(tmpdir(), "ddd-admin-analytics-ui");
    const output = join(artifactRoot, "after");
    mkdirSync(output, { recursive: true });
    const checks: unknown[] = [];
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        hasTouch: true,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const errors: string[] = [];
      const requests: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => requests.push(request.url()));
      await page.route("https://analytics-ui.test/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: route.request().url().endsWith("app.js")
            ? "text/javascript"
            : "text/html",
          body: route.request().url().endsWith("app.js")
            ? bundle.outputFiles[0].text
            : html,
        }),
      );
      await page.goto("https://analytics-ui.test/");
      await page.waitForFunction(() => Boolean((window as any).uiReady));
      const toggle = page.getByRole("switch", { name: "Detailed view" });
      await toggle.waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          !document.querySelector<HTMLButtonElement>('[role="switch"]')!
            .disabled,
      );
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await toggle.getAttribute("aria-checked"), "false");
      const requestCount = requests.length;
      await toggle.focus();
      await page.keyboard.press("Space");
      assert.equal(await toggle.getAttribute("aria-checked"), "true");
      assert.equal(
        await toggle.evaluate((el) => document.activeElement === el),
        true,
      );
      assert.equal(
        await page
          .getByRole("heading", { name: "Gender", exact: true })
          .count(),
        5,
      );
      assert.equal(
        await page.getByRole("region", { name: "gender breakdown" }).count(),
        5,
      );
      for (const section of await page
        .getByRole("region", { name: "gender breakdown" })
        .all()) {
        assert.deepEqual(await section.locator("li > span").allTextContents(), [
          "Male",
          "Female",
          "Non-binary",
        ]);
        assert.equal(await section.locator("li").count(), 3);
        assert.equal(
          await section.locator(".admin-stat-breakdown-note").textContent(),
          "Not provided: 1",
        );
      }
      assert.equal(
        await page
          .getByText("Confirmed sign-ins only", { exact: true })
          .count(),
        1,
      );
      assert.equal(
        (await page
          .locator(".admin-stat-breakdown b")
          .filter({ hasText: /^0$/ })
          .count()) > 0,
        true,
      );
      await page.keyboard.press("Enter");
      assert.equal(await toggle.getAttribute("aria-checked"), "false");
      await toggle.tap();
      assert.equal(await toggle.getAttribute("aria-checked"), "true");
      assert.equal(
        requests.length,
        requestCount,
        "toggling breakdown never fetches another cohort",
      );
      checks.push({
        interaction: "keyboard Space/Enter and touch toggle",
        focusRestored: true,
        extraRequests: requests.length - requestCount,
      });
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({
          width,
          height: width === 320 ? 480 : width === 390 ? 480 : 900,
        });
        const geometry = await page
          .locator(".admin-collection-stats")
          .evaluate((section) => ({
            pageOverflow: document.documentElement.scrollWidth > innerWidth,
            cards: [
              ...section.querySelectorAll(".admin-collection-stats-card"),
            ].map((card) => ({
              overflow: card.scrollWidth > card.clientWidth,
              bounds: card.getBoundingClientRect().toJSON(),
            })),
            touchHeight: section
              .querySelector('[role="switch"]')!
              .getBoundingClientRect().height,
          }));
        assert.equal(
          geometry.pageOverflow,
          false,
          JSON.stringify({ width, geometry }),
        );
        assert.equal(
          geometry.cards.some((card) => card.overflow),
          false,
        );
        assert.ok(geometry.touchHeight >= 44);
        await page.screenshot({
          path: `${output}/participants-detailed-${width}.png`,
          fullPage: true,
        });
        checks.push({ scenario: "participant detailed", width, ...geometry });
      }
      await page.evaluate(() => (window as any).setScenario("unknown"));
      const signedIn = page.locator(".admin-collection-stats-card").nth(1);
      await page.waitForFunction(() =>
        document
          .querySelectorAll(".admin-collection-stats-card")[1]
          .querySelector(".admin-stat-breakdown-unavailable"),
      );
      assert.equal(
        await signedIn.locator(".admin-stat-breakdown li").count(),
        0,
      );
      assert.equal(
        await signedIn.getByText("Not available", { exact: true }).count(),
        2,
      );
      await page.screenshot({
        path: `${output}/participants-unknown-signin-320.png`,
        fullPage: true,
      });
      await page.evaluate(() => (window as any).setScenario("empty"));
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".admin-collection-stats-card>dd")].every(
          (el) => el.textContent === "0",
        ),
      );
      assert.equal(await page.locator(".admin-stat-breakdown li").count(), 55);
      assert.equal(await page.locator(".admin-stat-breakdown-note").count(), 0);
      assert.equal(
        await page
          .locator(".admin-stat-breakdown b")
          .filter({ hasText: /^0$/ })
          .count(),
        55,
      );
      await page.screenshot({
        path: `${output}/participants-empty-320.png`,
        fullPage: true,
      });
      await page.evaluate(() => (window as any).setScenario("submissions"));
      const summaries = page.locator(".admin-project-score>summary");
      await summaries.first().waitFor();
      await summaries.first().focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.locator(".admin-project-score").first().getAttribute("open"),
        "",
      );
      assert.equal(
        await summaries.first().evaluate((el) => document.activeElement === el),
        true,
      );
      await page.keyboard.press("Space");
      assert.equal(
        await page.locator(".admin-project-score").first().getAttribute("open"),
        null,
      );
      for (const summary of await summaries.all()) await summary.tap();
      assert.equal(await page.locator(".admin-project-score[open]").count(), 3);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width <= 390 ? 480 : 900 });
        const geometry = await page
          .locator(".admin-submission-analytics")
          .evaluate((section) => ({
            pageOverflow: document.documentElement.scrollWidth > innerWidth,
            panels: [...section.querySelectorAll(".admin-analytics-panel")].map(
              (panel) => ({
                overflow: panel.scrollWidth > panel.clientWidth,
                bounds: panel.getBoundingClientRect().toJSON(),
              }),
            ),
            summaries: [...document.querySelectorAll("summary")].map(
              (summary) => ({
                height: summary.getBoundingClientRect().height,
                overflow: summary.scrollWidth > summary.clientWidth,
              }),
            ),
          }));
        assert.equal(
          geometry.pageOverflow,
          false,
          JSON.stringify({ width, geometry }),
        );
        assert.equal(
          geometry.panels.some((panel) => panel.overflow),
          false,
        );
        assert.ok(
          geometry.summaries.every(
            (summary) => summary.height >= 44 && !summary.overflow,
          ),
        );
        await page.screenshot({
          path: `${output}/submissions-scores-${width}.png`,
          fullPage: true,
        });
        checks.push({
          scenario:
            "submission insights and current/awaiting/frozen breakdowns",
          width,
          ...geometry,
        });
      }
      assert.deepEqual(errors, []);
      assert.equal(requests.length, requestCount);
      const sourceFiles = [
        "app/admin-stats.tsx",
        "app/admin-stats.css",
        "app/admin-submission-analytics.tsx",
        "app/admin-submission-analytics.css",
        "app/admin-project-score.tsx",
        "app/admin-project-score.css",
      ];
      writeFileSync(
        join(artifactRoot, "component-checks.json"),
        JSON.stringify(
          {
            kind: "Hydrated production-component harness with synthetic DTOs; not an actual app route or hosted data",
            sourceHashes: Object.fromEntries(
              sourceFiles.map((file) => [
                file,
                createHash("sha256").update(readFileSync(file)).digest("hex"),
              ]),
            ),
            checks,
            requests,
            pageErrors: errors,
          },
          null,
          2,
        ) + "\n",
      );
      await context.close();
    } finally {
      await browser.close();
    }
  },
);
