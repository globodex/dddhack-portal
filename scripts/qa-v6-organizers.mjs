// Prepared actual-render QA only. Root owns the matching build and disposable preview.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

if (!process.argv.includes("--preview-ready")) {
  console.log(
    "PREPARED ONLY. Set ORGANIZER_QA_SOURCE, ORGANIZER_QA_WORKER_SHA and ORGANIZER_QA_ARTIFACT_ROOT after root confirms the matching disposable preview, then use --preview-ready. No browser or requests started.",
  );
  process.exit(0);
}
const source = process.env.ORGANIZER_QA_SOURCE;
const workerSha = process.env.ORGANIZER_QA_WORKER_SHA;
assert.match(source || "", /^[a-f0-9]{40}$/);
assert.match(workerSha || "", /^[a-f0-9]{64}$/);
const artifactRoot = resolve(process.env.ORGANIZER_QA_ARTIFACT_ROOT || ".");
const workerPath = join(artifactRoot, "dist/server/index.js");
const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const head = () =>
  execFileSync("git", ["-C", artifactRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
assert.equal(head(), source, "Artifact source changed before QA");
assert.equal(
  hash(workerPath),
  workerSha,
  "Worker differs from the root-confirmed artifact",
);
const origin = "http://127.0.0.1:4173";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve(
  "evidence/v6-organizers",
  `${source.slice(0, 8)}-${workerSha.slice(0, 8)}-${stamp}`,
);
mkdirSync(output, { recursive: true });
const reference =
  "/home/param302/Dev/DDEHack-portal/design-research/2026-10-23/lower-sections-cylinders/references/selected-organizers-user-73355.png";
const research = "/home/param302/Dev/DDEHack-portal/design-research/2026-10-23";
const photos = [
  [
    "Parampreet Singh",
    "Param3021",
    "remaining-pages/references/organizers/Param3021-x.jpg",
  ],
  [
    "Shivay Lamba",
    "HowDevelop",
    "live-v5-audit/references/organizers-verified/Shivay-Lamba-HowDevelop-x.jpg",
  ],
  [
    "Nikhil Shukla",
    "nikhilsbuilds",
    "remaining-pages/references/organizers/nikhilsbuilds-x.jpg",
  ],
  [
    "Shresth Shukla",
    "callmeshuklaji",
    "remaining-pages/references/organizers/callmeshuklaji-x.jpg",
  ],
];
const report = {
  source,
  workerSha,
  artifactRoot,
  output,
  origin,
  reference: {
    path: reference,
    sha256: hash(reference),
    library: "libfile_73355cbeb8b08191be77e6bcfa52ce82",
  },
  browserSandbox: true,
  syntheticOnly: true,
  startedAt: new Date().toISOString(),
  checks: [],
  captures: [],
  defects: [],
  errors: [],
  blocked: [],
  photos: [],
  motion: [],
};
const persist = () =>
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
for (const [name, handle, original] of photos) {
  const asset = join(artifactRoot, `public/organizers/${handle}-x.jpg`);
  const originalHash = hash(join(research, original));
  assert.equal(
    hash(asset),
    originalHash,
    `${name} photo must remain the verified original JPEG`,
  );
  report.photos.push({
    name,
    asset,
    sha256: originalHash,
    byteIdenticalToVerifiedOriginal: true,
  });
}
const { chromium } =
  await import("/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs");
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
report.browser = browser.version();
async function check(name, action) {
  try {
    report.checks.push({ name, passed: true, ...(await action()) });
  } catch (error) {
    const failed = { name, passed: false, error: String(error.message) };
    report.checks.push(failed);
    report.defects.push(failed);
  }
  persist();
}
async function context(viewport, reduced = false) {
  const c = await browser.newContext({
    viewport,
    serviceWorkers: "block",
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await c.route("**/*", (route) => {
    const request = route.request();
    if (
      new URL(request.url()).origin !== origin ||
      !["GET", "HEAD"].includes(request.method())
    ) {
      report.blocked.push({
        method: request.method(),
        external: new URL(request.url()).origin !== origin,
      });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  // Observe the native Web Animations API without changing frames, timing or playback.
  await c.addInitScript(() => {
    const traces = [];
    window.__organizerMotion = traces;
    const native = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = native.call(this, frames, options);
      if (this.classList.contains("organizer-unit")) {
        const unit = this;
        const index = [...document.querySelectorAll(".organizer-unit")].indexOf(
          unit,
        );
        const trace = {
          index,
          frames: animation.effect.getKeyframes(),
          timing: animation.effect.getTiming(),
          target: animation.effect.target.className,
          samples: [],
        };
        const sample = (label) => {
          const u = unit.getBoundingClientRect(),
            ring = unit
              .querySelector(".organizer-portrait-ring")
              .getBoundingClientRect(),
            image = unit
              .querySelector(".organizer-photo")
              .getBoundingClientRect();
          const matrix = new DOMMatrixReadOnly(
            getComputedStyle(unit).transform,
          );
          trace.samples.push({
            label,
            x: matrix.m41,
            y: matrix.m42,
            opacity: getComputedStyle(unit).opacity,
            ringRelative: { x: ring.x - u.x, y: ring.y - u.y },
            photoRelative: { x: image.x - u.x, y: image.y - u.y },
          });
        };
        traces.push(trace);
        sample("created");
        for (const time of [40, 120, 320, 900])
          setTimeout(() => sample(`${time}ms`), time);
        animation.addEventListener("cancel", () => {
          trace.cancelled = true;
          sample("cancelled");
        });
        animation.finished.then(
          () => {
            trace.finished = true;
            sample("finished");
          },
          () => undefined,
        );
      }
      return animation;
    };
  });
  const page = await c.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page
    .getByRole("heading", { name: "Meet the Organizers behind", exact: true })
    .waitFor();
  return { c, page };
}
async function scrollOrganizers(page) {
  await page.evaluate(() => {
    const node = document.querySelector(".organizer-tubes"),
      header = document.querySelector(".public-header");
    const offset =
      header && getComputedStyle(header).position === "sticky"
        ? header.getBoundingClientRect().height
        : 0;
    scrollTo(0, node.getBoundingClientRect().top + scrollY - offset - 12);
  });
}
async function metrics(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      portrait: matchMedia(
        "(max-width: 740px), (max-width: 1099px) and (orientation: portrait)",
      ).matches,
      scene: box(document.querySelector(".organizer-scene")),
      units: [...document.querySelectorAll(".organizer-unit")].map((unit) => {
        const ring = unit.querySelector(".organizer-portrait-ring"),
          photo = unit.querySelector(".organizer-photo"),
          labels = unit.querySelector(".organizer-labels"),
          surface = unit.querySelector(".organizer-surface");
        return {
          unit: box(unit),
          ring: box(ring),
          photo: box(photo),
          labels: box(labels),
          surface: box(surface),
          name: unit.querySelector(".organizer-name").innerText,
          src: photo.currentSrc,
          naturalWidth: photo.naturalWidth,
          objectFit: getComputedStyle(photo).objectFit,
          color: getComputedStyle(ring).backgroundColor,
          surfaceColor: getComputedStyle(surface).backgroundColor,
          transform: getComputedStyle(unit).transform,
          childTransforms: [
            getComputedStyle(ring).transform,
            getComputedStyle(photo).transform,
            getComputedStyle(labels).transform,
          ],
          activeAnimations: unit
            .getAnimations()
            .filter(
              (a) => a.playState === "running" || a.playState === "pending",
            ).length,
        };
      }),
    };
  });
}
function stable(m) {
  assert.equal(m.overflow, false, "No horizontal document overflow");
  assert.equal(m.units.length, 4);
  m.units.forEach((item, index) => {
    assert.equal(item.name, photos[index][0]);
    assert.ok(item.src.endsWith(`/organizers/${photos[index][1]}-x.jpg`));
    assert.equal(item.naturalWidth, 200);
    assert.equal(item.objectFit, "cover");
    assert.ok(
      Math.abs(item.ring.width - item.ring.height) < 1,
      "Ring stays circular",
    );
    assert.ok(
      Math.abs(
        item.ring.width - (m.portrait ? item.unit.height : item.unit.width),
      ) < 1.1,
      "Outer ring matches tube height / column width",
    );
    assert.ok(
      Math.abs(item.photo.width / item.ring.width - 0.91) < 0.015,
      "Photo is91% of outer ring",
    );
    assert.equal(
      item.color,
      item.surfaceColor,
      "Ring and tube have the exact same solid color",
    );
    assert.ok(
      item.labels.left >= item.unit.left - 1 &&
        item.labels.right <= item.unit.right + 1,
      "Labels fit horizontally",
    );
    assert.ok(
      item.labels.top >= item.unit.top - 1 &&
        item.labels.bottom <= item.unit.bottom + 1,
      "Labels fit vertically",
    );
    assert.ok(
      item.unit.left >= m.scene.left - 1 &&
        item.unit.right <= m.scene.right + 1,
      "Unit stays inside scene",
    );
    assert.equal(item.activeAnimations, 0);
    assert.ok(
      item.transform === "none" ||
        item.transform === "matrix(1, 0, 0, 1, 0, 0)",
    );
    assert.deepEqual(
      item.childTransforms,
      ["none", "none", "none"],
      "Portrait/photo/labels never animate independently",
    );
  });
}
async function shot(page, name, viewport) {
  const path = join(output, `${name}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path, animations: "disabled" });
  report.captures.push({
    name,
    path,
    viewport,
    source,
    workerSha,
    kind: "actual visible viewport",
    inspected: false,
  });
}
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    const { c, page } = await context(viewport);
    await scrollOrganizers(page);
    await page.waitForTimeout(1100);
    await check(
      `${viewport.width}: original portraits, ring size, text and settled bounds`,
      async () => {
        const m = await metrics(page);
        stable(m);
        return m;
      },
    );
    await shot(page, "organizers-settled", viewport);
    const traces = await page.evaluate(() => window.__organizerMotion);
    report.motion.push({ viewport, traces });
    await check(
      `${viewport.width}: whole-unit slide has correct origin and rigid portrait attachment`,
      async () => {
        assert.equal(traces.length, 4, "Each whole unit enters once");
        const portrait =
          viewport.width <= 740 ||
          (viewport.width <= 1099 && viewport.height > viewport.width);
        for (const trace of traces) {
          assert.equal(trace.target, "organizer-unit");
          const from = trace.frames[0].transform;
          const parts = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px,\s*0(?:px)?\)/.exec(
            from,
          );
          assert.ok(parts, from);
          const x = Number(parts[1]),
            y = Number(parts[2]);
          if (portrait) {
            assert.equal(y, 0);
            assert.ok(trace.index % 2 === 0 ? x < 0 : x > 0);
          } else {
            assert.equal(x, 0);
            assert.ok(y > 0);
          }
          assert.equal(trace.timing.duration, portrait ? 600 : 700);
          assert.ok(
            trace.samples.some((s) => Math.abs(s.x) > 5 || Math.abs(s.y) > 5),
            "Actual transformed frame sampled",
          );
          const first = trace.samples[0];
          for (const sample of trace.samples) {
            assert.equal(
              sample.opacity,
              "1",
              "Translation does not use a fade substitute",
            );
            for (const member of ["ringRelative", "photoRelative"])
              for (const axis of ["x", "y"])
                assert.ok(
                  Math.abs(sample[member][axis] - first[member][axis]) < 1.1,
                  "Photo/ring maintain their rigid position within the whole unit",
                );
          }
        }
        return { traces: traces.length };
      },
    );
    await check(
      `${viewport.width}: focus is reachable and never clipped by moving content`,
      async () => {
        for (const unit of await page.locator(".organizer-unit").all()) {
          await unit.focus();
          assert.equal(
            await unit.evaluate((el) => document.activeElement === el),
            true,
          );
          assert.equal(
            await unit.evaluate((el) => el.getAnimations().length),
            0,
          );
        }
        return { focusedUnits: 4 };
      },
    );
    if (viewport.width >= 741)
      for (const id of ["venue", "faq"]) {
        await page.locator("#" + id).scrollIntoViewIfNeeded();
        await page.waitForTimeout(950);
        await check(
          `${viewport.width}: ${id} lower-section text stays in its55% column clear of dots`,
          async () => {
            const m = await page.locator("#" + id).evaluate((section) => {
              const body = section.querySelector(".chapter-body"),
                content = section.querySelector(".chapter-content"),
                dots = section.querySelector(".chapter-decoration");
              const b = body.getBoundingClientRect(),
                d = dots.getBoundingClientRect(),
                c = content.getBoundingClientRect(),
                s = getComputedStyle(content);
              return {
                bodyRight: b.right,
                decorationLeft: d.left,
                bodyWidth: b.width,
                contentInnerWidth:
                  c.width -
                  parseFloat(s.paddingLeft) -
                  parseFloat(s.paddingRight),
                display: s.display,
              };
            });
            assert.equal(m.display, "block");
            assert.ok(
              m.bodyRight <= m.decorationLeft + 1,
              "Visible text column clears decoration field",
            );
            assert.ok(
              Math.abs(m.bodyWidth / m.contentInnerWidth - 0.55) < 0.015,
            );
            return m;
          },
        );
        await shot(page, `lower-${id}`, viewport);
      }
    await c.close();
  }
  for (const mode of ["reduced", "paused"]) {
    const viewport = { width: 390, height: 844 };
    const { c, page } = await context(viewport, mode === "reduced");
    if (mode === "paused")
      await page
        .getByRole("button", { name: "Pause animations", exact: true })
        .click();
    await scrollOrganizers(page);
    await page.waitForTimeout(1000);
    await check(
      `${mode}: immediately readable stable organizer units`,
      async () => {
        const m = await metrics(page);
        stable(m);
        assert.deepEqual(
          await page.evaluate(() => window.__organizerMotion),
          [],
        );
        return m;
      },
    );
    await shot(page, `organizers-${mode}`, viewport);
    await c.close();
  }
  {
    const viewport = { width: 1440, height: 900 };
    const { c, page } = await context(viewport);
    await scrollOrganizers(page);
    await page.waitForFunction(() => window.__organizerMotion.length > 0);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(150);
    await check(
      "offscreen: organizer compositor animations stop and no entry loop occurs",
      async () => {
        const before = await page.evaluate(
          () => window.__organizerMotion.length,
        );
        assert.equal(
          await page
            .locator(".organizer-unit")
            .evaluateAll((units) =>
              units.reduce((n, u) => n + u.getAnimations().length, 0),
            ),
          0,
        );
        await scrollOrganizers(page);
        await page.waitForTimeout(950);
        assert.equal(
          await page.evaluate(() => window.__organizerMotion.length),
          before,
        );
        return { entryCount: before };
      },
    );
    await c.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blocked, []);
} catch (error) {
  report.defects.push({ name: "runner", error: String(error.stack || error) });
} finally {
  await browser.close();
  report.browserClosed = true;
  report.completedAt = new Date().toISOString();
  report.workerUnchanged = hash(workerPath) === workerSha;
  report.sourceUnchanged = head() === source;
  persist();
}
if (report.defects.length || !report.workerUnchanged || !report.sourceUnchanged)
  process.exitCode = 1;
console.log(
  JSON.stringify({
    output,
    checks: report.checks.length,
    defects: report.defects,
    captures: report.captures.length,
    browserClosed: report.browserClosed,
    workerUnchanged: report.workerUnchanged,
    sourceUnchanged: report.sourceUnchanged,
  }),
);
