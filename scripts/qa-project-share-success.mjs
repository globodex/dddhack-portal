// Source-built production components; synthetic API responses only, zero writes.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const root = process.cwd(),
  temp = "/tmp/ddd-project-share-source-build",
  out = "evidence/project-share-success",
  origin = "http://localhost:3016";
mkdirSync(temp, { recursive: true });
mkdirSync(out, { recursive: true });
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const fixture = {
  me: {
    id: "synthetic_leader",
    name: "Synthetic Builder",
    email: "builder@portal.test",
    role: "participant",
    canParticipate: true,
  },
  team: {
    id: "synthetic_team",
    name: "Small Wonder",
    leader_id: "synthetic_leader",
    palette: "forest",
  },
  members: [],
  attempts: [],
  project: {
    revision: 1,
    draft: {
      projectName: "Small Wonder",
      problemSolution: "A synthetic fixture",
      description: "Synthetic local browser fixture only.",
      github: "https://github.com/example/synthetic",
      logo: image,
      banner: image,
      attestation: false,
    },
  },
  submissionAccess: { canRead: true, canCommit: true, attemptsUsed: 0 },
  submissionStatus: { allowed: true },
  feedback: [],
  projectStats: { upvotes: 0 },
  projectPublicPath: null,
};
const styles = [
  ...readFileSync("app/layout.tsx", "utf8").matchAll(
    /import "(\.\/[^"\n]+\.css)"/g,
  ),
]
  .map((match) => `import ${JSON.stringify("./app/" + match[1].slice(2))};`)
  .join("\n");
await build({
  stdin: {
    contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import ProjectShare from './app/project-share';import Success from './app/project-submission-success';import Portal from './app/portal';${styles}
function Harness(){const[success,setSuccess]=useState(false);const q=new URLSearchParams(location.search);if(q.get('case')?.startsWith('portal'))return <Portal path="/dashboard" initialView={${JSON.stringify(fixture)}}/>;return <div className="app-shell"><main id="main" tabIndex={-1} style={{padding:32,minHeight:1600}}><h1>Synthetic project fixture</h1><ProjectShare publicPath="/projects/small-wonder" projectName="Small Wonder"/><button id="open-success" onClick={()=>setSuccess(true)}>Open success</button>{success&&<Success value={{attempt:1,publicPath:q.get('case')==='private'?null:'/projects/small-wonder'}} onClose={()=>setSuccess(false)}/>}</main></div>}createRoot(document.getElementById('root')).render(<Harness/>);`,
    resolveDir: root,
    loader: "tsx",
  },
  banner: {
    js: "var process={env:{NODE_ENV: 'production'},browser:true,nextTick:queueMicrotask};",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  outfile: join(temp, "bundle.js"),
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".woff2": "file", ".woff": "file" },
  external: ["/art/*", "/fonts/*", "/home/*", "/icons/*", "/brand/*"],
  logLevel: "warning",
});
const html =
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server = createServer((request, response) => {
  if (request.method !== "GET") {
    response.writeHead(405);
    response.end();
    return;
  }
  const path = new URL(request.url, origin).pathname;
  let file = join(temp, path.slice(1));
  if (!path.includes("..") && !existsSync(file))
    file = join(root, "public", path.slice(1));
  if (existsSync(file) && extname(file)) {
    response.setHeader(
      "content-type",
      {
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".png": "image/png",
      }[extname(file)] || "application/octet-stream",
    );
    response.end(readFileSync(file));
  } else {
    response.setHeader("content-type", "text/html");
    response.end(html);
  }
});
await new Promise((resolve) => server.listen(3016, "127.0.0.1", resolve));
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceBuiltProductionComponents: true,
  syntheticResponsesOnly: true,
  applicationWrites: 0,
  providerRequests: [],
  errors: [],
  checks: [],
  screenshots: [],
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2) + "\n");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const contexts = [];
const contextFor = async (viewport) => {
  const context = await browser.newContext({
    viewport,
    hasTouch: viewport.width < 768,
    isMobile: viewport.width < 768,
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  contexts.push(context);
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      report.providerRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  return context;
};
const shot = async (page, name) => {
  const path = `${out}/${name}.png`;
  await page.screenshot({ path, animations: "disabled" });
  report.screenshots.push(path);
  save();
};
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 480 },
  ]) {
    const context = await contextFor(viewport),
      page = await context.newPage(),
      name = `${viewport.width}x${viewport.height}`;
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.goto(origin);
    const trigger = page.getByRole("button", { name: "Share", exact: true });
    await trigger.click();
    const dialog = page.locator(".project-share-dialog");
    await dialog.waitFor();
    assert.equal(
      await page
        .locator(".project-dialog-close")
        .evaluate((node) => node === document.activeElement),
      true,
    );
    const services = await page
        .locator(".project-share-services")
        .boundingBox(),
      copyRow = await page.locator(".project-share-copy-row").boundingBox();
    assert.ok(
      services.y + services.height <= copyRow.y,
      "Social icons precede URL copy row",
    );
    assert.equal(
      await page.getByRole("link", { name: "Share on X", exact: true }).count(),
      1,
    );
    for (const service of ["X", "Facebook", "LinkedIn"]) {
      const link = page.getByRole("link", {
        name: `Share on ${service}`,
        exact: true,
      });
      assert.equal(await link.getAttribute("target"), "_blank");
      assert.match(await link.getAttribute("rel"), /noopener/);
    }
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Link copied." })
      .waitFor();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      origin + "/projects/small-wonder",
    );
    await page
      .getByRole("button", { name: "Copy post text", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Post text copied." })
      .waitFor();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "Check out this hackathon project, built at DevDay Exchange Community Hackathon New Delhi\n\n#DevDayCommunity #DevDayCommunityDelhi\n" +
        origin +
        "/projects/small-wonder",
    );
    await shot(page, `share-${name}`);
    const copyButton = page.getByRole("button", { name: "Copy", exact: true });
    await copyButton.focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator(".project-dialog-close")
        .evaluate((node) => node === document.activeElement),
      true,
      "Tab wraps inside share",
    );
    await page.evaluate(() =>
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async () => {
          throw Error("Synthetic clipboard denial");
        },
      }),
    );
    await copyButton.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Could not copy." })
      .waitFor();
    assert.equal(
      await page
        .locator(".project-share-copy-row input")
        .evaluate(
          (node) =>
            node.selectionStart === 0 &&
            node.selectionEnd === node.value.length,
        ),
      true,
    );
    await shot(page, `copy-error-${name}`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Share",
    );
    await page.locator("#open-success").click();
    await page.locator(".project-submission-success").waitFor();
    await shot(page, `success-${name}`);
    assert.equal(
      await page.locator(".project-success-attempt").innerText(),
      "Submission 1/3",
    );
    assert.equal(
      await page
        .getByRole("heading", {
          name: "Project submitted successfully",
          exact: true,
        })
        .count(),
      1,
    );
    await page
      .getByRole("button", { name: "Share", exact: true })
      .last()
      .click();
    await dialog.waitFor();
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll("dialog:modal").length,
      ),
      2,
    );
    await shot(page, `nested-share-${name}`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(
      await page.locator(".project-submission-success").isVisible(),
      true,
    );
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .locator(".project-submission-success")
      .waitFor({ state: "detached" });
    await page.waitForFunction(() => document.body.style.overflow !== "hidden");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    report.checks.push({
      name: `${name}: social order, exact copy, error fallback, modal focus/Escape, nested modal and scroll lock, success1/3`,
      passed: true,
    });
    save();
    await context.close();
  }
  {
    const context = await contextFor({ width: 390, height: 844 }),
      page = await context.newPage();
    await page.goto(origin);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const instagram = page.getByRole("button", {
      name: "Share to Instagram using your device or copy post text",
      exact: true,
    });
    await page.evaluate(() =>
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (payload) => {
          window.__nativeShare = payload;
        },
      }),
    );
    await instagram.click();
    const native = await page.evaluate(() => window.__nativeShare);
    assert.equal(native.url, origin + "/projects/small-wonder");
    assert.equal(
      native.text,
      "Check out this hackathon project, built at DevDay Exchange Community Hackathon New Delhi\n\n#DevDayCommunity #DevDayCommunityDelhi",
    );
    await page.evaluate(() =>
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async () => {
          throw new DOMException("Cancelled", "AbortError");
        },
      }),
    );
    await instagram.click();
    assert.equal(await page.getByRole("alert").count(), 0);
    await page.evaluate(() =>
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      }),
    );
    await instagram.click();
    await page
      .getByRole("status")
      .filter({ hasText: "Open Instagram to paste it." })
      .waitFor();
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /#DevDayCommunity #DevDayCommunityDelhi/,
    );
    await page.evaluate(() =>
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async () => {
          throw Error("Synthetic denial");
        },
      }),
    );
    await instagram.click();
    await page.locator(".project-share-manual textarea").waitFor();
    assert.match(
      await page.locator(".project-share-manual textarea").inputValue(),
      /Check out this hackathon project/,
    );
    await shot(page, "instagram-manual-fallback-390x844");
    await page.waitForFunction(() => !!history.state?.portalDialog);
    await page.goBack();
    await page.locator(".project-share-dialog").waitFor({ state: "detached" });
    assert.equal(page.url(), origin + "/");
    await page.locator("#open-success").click();
    await page.locator(".project-submission-success").waitFor();
    await page.waitForFunction(() => !!history.state?.portalDialog);
    const parentMarker = await page.evaluate(() => history.state.portalDialog);
    await page
      .getByRole("button", { name: "Share", exact: true })
      .last()
      .click();
    await page.waitForFunction(
      (marker) =>
        history.state?.portalDialog && history.state.portalDialog !== marker,
      parentMarker,
    );
    await page.goBack();
    await page.locator(".project-share-dialog").waitFor({ state: "detached" });
    assert.equal(
      await page.locator(".project-submission-success").isVisible(),
      true,
    );
    await page.goBack();
    await page
      .locator(".project-submission-success")
      .waitFor({ state: "detached" });
    await page.waitForFunction(() => document.body.style.overflow !== "hidden");
    report.checks.push({
      name: "Controlled nativeShare payload/cancel, Instagram copy/manual fallback, browserBack nested dismissal and scroll restoration",
      passed: true,
    });
    save();
    await context.close();
  }
  for (const variant of [
    "portal-private",
    "portal-public",
    "portal-refresh-failure",
    "portal-submit-failure",
  ]) {
    const context = await contextFor({ width: 390, height: 844 }),
      page = await context.newPage();
    let commits = 0;
    await context.route("**/api/portal?**", async (route) => {
      if (variant === "portal-refresh-failure" && commits)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Synthetic refresh unavailable" }),
        });
      const fresh = commits
        ? {
            ...fixture,
            project: {
              ...fixture.project,
              published_version_id: "synthetic_commit",
              revision: 2,
            },
            attempts: [
              {
                id: "synthetic_commit",
                attempt: 1,
                created_at: "2026-10-24T12:00:00Z",
              },
            ],
            submissionAccess: { ...fixture.submissionAccess, attemptsUsed: 1 },
            projectPublicPath:
              variant === "portal-public" ? "/projects/small-wonder" : null,
          }
        : fixture;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fresh),
      });
    });
    await context.route("**/api/portal", (route) => {
      assert.equal(route.request().method(), "POST");
      const body = route.request().postDataJSON();
      assert.equal(body.action, "submit-project");
      commits++;
      assert.equal(commits, 1, "No extra automatic submit");
      return route.fulfill({
        status: variant === "portal-submit-failure" ? 400 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          variant === "portal-submit-failure"
            ? { message: "Synthetic submit denied" }
            : {
                message: "Project submitted successfully.",
                versionId: "synthetic_commit",
                attemptsUsed: 1,
              },
        ),
      });
    });
    await page.goto(origin + "/?case=" + variant);
    await page.getByRole("tab", { name: "Project", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.locator("#submission-attestation-control").check();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.locator(".confirmation-dialog[open]").waitFor();
    await page
      .getByRole("button", { name: "Submit project", exact: true })
      .click();
    if (variant === "portal-submit-failure") {
      await page
        .getByRole("alert")
        .filter({ hasText: "Synthetic submit denied" })
        .waitFor();
      assert.equal(
        await page.locator(".project-submission-success").count(),
        0,
      );
    } else {
      const success = page.locator(".project-submission-success");
      await success.waitFor();
      assert.equal(
        await success.locator(".project-success-attempt").innerText(),
        "Submission 1/3",
      );
      assert.equal(
        await page.locator(".action-message[data-tone='success']").count(),
        0,
        "No duplicate success toast",
      );
      assert.equal(
        await success
          .getByRole("link", { name: "View project", exact: true })
          .count(),
        variant === "portal-public" ? 1 : 0,
      );
      assert.equal(
        await success
          .getByRole("button", { name: "Share", exact: true })
          .count(),
        variant === "portal-public" ? 1 : 0,
      );
      await shot(page, `${variant}-390x844`);
    }
    report.checks.push({
      name: `${variant}: persisted receipt/fresh public projection gates popup/actions; no duplicate toast or extra submit`,
      passed: true,
      interceptedSyntheticSubmits: commits,
    });
    save();
    await context.close();
  }
  assert.equal(report.errors.length, 0);
  assert.equal(report.providerRequests.length, 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  save();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    failure: report.failure,
  }),
);
