// Read-only actual-render audit; root owns the compiled Worker and preview.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
if (!process.argv.includes("--preview-ready")) {
  console.log(
    "PREPARED ONLY. Use --preview-ready with root-confirmed ORGANIZER_QA_SOURCE, ORGANIZER_QA_WORKER_SHA, ORGANIZER_QA_ARTIFACT_ROOT.",
  );
  process.exit(0);
}
const source = process.env.ORGANIZER_QA_SOURCE,
  workerSha = process.env.ORGANIZER_QA_WORKER_SHA,
  artifactRoot = resolve(process.env.ORGANIZER_QA_ARTIFACT_ROOT || ".");
assert.match(source || "", /^[a-f0-9]{40}$/);
assert.match(workerSha || "", /^[a-f0-9]{64}$/);
const gate = () => {
  assert.equal(
    execFileSync("git", ["-C", artifactRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    source,
  );
  assert.equal(
    createHash("sha256")
      .update(readFileSync(join(artifactRoot, "dist/server/index.js")))
      .digest("hex"),
    workerSha,
  );
};
gate();
const origin = "http://127.0.0.1:4173",
  output = resolve(
    "evidence/v6-backdrop",
    `${source.slice(0, 8)}-${workerSha.slice(0, 8)}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
mkdirSync(output, { recursive: true });
const report = {
  source,
  workerSha,
  artifactRoot,
  output,
  browserSandbox: true,
  checks: [],
  defects: [],
  errors: [],
  blocked: [],
  captures: [],
  samples: [],
};
const persist = () =>
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
async function check(name, fn) {
  try {
    report.checks.push({ name, passed: true, ...(await fn()) });
  } catch (e) {
    const f = { name, passed: false, error: String(e.message) };
    report.checks.push(f);
    report.defects.push(f);
  }
  persist();
}
const { chromium } =
  await import("/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs");
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
async function context(width, height, reduced = false) {
  const c = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 1100,
    hasTouch: width < 1100,
    reducedMotion: reduced ? "reduce" : "no-preference",
    serviceWorkers: "block",
  });
  await c.route("**/*", (r) => {
    const q = r.request();
    if (
      new URL(q.url()).origin !== origin ||
      !["GET", "HEAD"].includes(q.method())
    ) {
      report.blocked.push({ method: q.method(), url: q.url() });
      return r.abort("blockedbyclient");
    }
    return r.continue();
  });
  const p = await c.newPage();
  p.on("pageerror", (e) => report.errors.push(e.message));
  await p.goto(origin, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  return { c, p };
}
const sample = (p) =>
  p.evaluate(() => {
    const n = document.querySelector(".portrait-backdrop");
    return n
      ? {
          count: +n.dataset.count,
          progress: +n.dataset.progress,
          fillHeight: +n.dataset.fillHeight,
          moving: n.dataset.moving,
          height: innerHeight,
          scrollY,
          overflow: document.documentElement.scrollWidth > innerWidth,
          pointerEvents: getComputedStyle(n).pointerEvents,
          ariaHidden: n.getAttribute("aria-hidden"),
          nodes: n.children.length,
          active: [...n.children].filter(
            (e) => getComputedStyle(e).visibility === "visible",
          ).length,
          transforms: [...n.children].map((e) => e.style.transform),
        }
      : null;
  });
const settle = (p) =>
  p.waitForFunction(
    () =>
      document.querySelector(".portrait-backdrop")?.dataset.moving === "false",
    null,
    { timeout: 10000 },
  );
async function shot(p, name) {
  const path = join(output, name + ".png");
  await p.screenshot({ path });
  report.captures.push({ path, visuallyInspected: false });
}
try {
  for (const [w, h] of [
    [390, 844],
    [320, 740],
    [834, 1194],
  ]) {
    const { c, p } = await context(w, h);
    await settle(p);
    await check(
      `${w}: one portrait layer, four initial approved dots, no overflow`,
      async () => {
        const s = await sample(p);
        assert.equal(await p.locator(".portrait-backdrop").count(), 1);
        assert.equal(s.count, 4);
        assert.equal(s.nodes, 36);
        assert.equal(s.active, 4);
        assert.equal(s.pointerEvents, "none");
        assert.equal(s.ariaHidden, "true");
        assert.equal(s.overflow, false);
        return s;
      },
    );
    const end = await p.evaluate(
      () =>
        document.querySelector(".organizers").getBoundingClientRect().top +
        scrollY -
        innerHeight * 0.2,
    );
    const samples = [];
    for (const progress of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      await p.evaluate((y) => scrollTo(0, y), end * progress);
      await p.waitForTimeout(80);
      await settle(p);
      samples.push(await sample(p));
    }
    report.samples.push({ width: w, samples });
    await check(
      `${w}: progressive accumulation caps at36 and pile target reaches80%`,
      async () => {
        assert.equal(samples[0].count, 4);
        assert.equal(samples.at(-1).count, 36);
        assert.equal(samples.at(-1).active, 36);
        assert.ok(Math.abs(samples.at(-1).fillHeight / h - 0.8) < 0.001);
        assert.ok(
          samples.every(
            (s, i) => s.count <= 36 && (!i || s.count >= samples[i - 1].count),
          ),
        );
        return {
          counts: samples.map((s) => s.count),
          fillRatios: samples.map((s) => +(s.fillHeight / h).toFixed(3)),
        };
      },
    );
    await check(
      `${w}: settled transforms stop; foreground remains hit-testable`,
      async () => {
        const before = await sample(p);
        await p.waitForTimeout(250);
        const after = await sample(p);
        assert.deepEqual(after.transforms, before.transforms);
        assert.equal(after.moving, "false");
        const fg = await p.evaluate(() => {
          const link = [...document.querySelectorAll(".organizer-unit")].find(
            (e) => {
              const r = e.getBoundingClientRect();
              return r.top > 64 && r.bottom < innerHeight;
            },
          );
          const r = link?.getBoundingClientRect();
          return {
            linkFound: !!r,
            hit: r
              ? document
                  .elementFromPoint(r.x + r.width * 0.5, r.y + r.height * 0.5)
                  ?.closest(".organizer-unit") === link
              : false,
            headingBackground: getComputedStyle(
              document.querySelector(".organizer-heading-row h2"),
            ).backgroundColor,
          };
        });
        assert.ok(fg.linkFound && fg.hit);
        assert.equal(fg.headingBackground, "rgb(255, 255, 255)");
        return fg;
      },
    );
    await shot(p, `dense-organizers-${w}x${h}`);
    // Real touch events, rather than wheel or programmatic scroll, preserve native pan.
    await p.evaluate((y) => scrollTo(0, y), end * 0.45);
    await p.waitForTimeout(100);
    await settle(p);
    const session = await c.newCDPSession(p);
    const yBefore = await p.evaluate(() => scrollY);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: w - 6, y: h * 0.78 }],
    });
    for (let i = 1; i <= 5; i++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: w - 6, y: h * (0.78 - i * 0.075) }],
      });
      await p.waitForTimeout(35);
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await p.waitForTimeout(400);
    await check(
      `${w}: real touch pan scrolls natively and releases motion`,
      async () => {
        const yAfter = await p.evaluate(() => scrollY);
        assert.ok(yAfter > yBefore + 40);
        await settle(p);
        return {
          before: yBefore,
          after: yAfter,
          hasTouch: await p.evaluate(() => navigator.maxTouchPoints > 0),
        };
      },
    );
    await p.evaluate(() =>
      document.querySelector('button[aria-label="Pause animations"]').click(),
    );
    await p.waitForTimeout(100);
    await settle(p);
    const paused = await sample(p);
    await p.evaluate(() => scrollTo(0, 0));
    await p.waitForTimeout(200);
    await check(
      `${w}: Pause freezes progress and all36 transforms during scroll`,
      async () => {
        const after = await sample(p);
        assert.deepEqual(after.transforms, paused.transforms);
        assert.equal(after.count, paused.count);
        assert.equal(after.progress, paused.progress);
        assert.equal(after.moving, "false");
        return { count: after.count, progress: after.progress };
      },
    );
    await c.close();
  }
  {
    const { c, p } = await context(390, 844, true);
    await settle(p);
    const before = await sample(p);
    await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(250);
    await check(
      "reduced motion: stable visible initial pile does not animate or accumulate on scroll",
      async () => {
        const after = await sample(p);
        assert.equal(after.count, 4);
        assert.deepEqual(after.transforms, before.transforms);
        assert.equal(after.moving, "false");
        return { count: after.count, progress: after.progress };
      },
    );
    await shot(p, "reduced-organizers-390x844");
    await c.close();
  }
  {
    const { c, p } = await context(1440, 900);
    await check("desktop: portrait backdrop absent", async () => {
      assert.equal(await p.locator(".portrait-backdrop").count(), 0);
      return { count: 0 };
    });
    await c.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blocked, []);
} catch (e) {
  report.defects.push({ name: "runner", error: String(e.stack || e) });
} finally {
  await browser.close();
  gate();
  Object.assign(report, {
    browserClosed: true,
    sourceUnchanged: true,
    workerUnchanged: true,
  });
  persist();
}
console.log(
  JSON.stringify({
    output,
    checks: report.checks.length,
    defects: report.defects,
    errors: report.errors,
    blocked: report.blocked.length,
    browserClosed: true,
  }),
);
if (report.defects.length) process.exitCode = 1;
