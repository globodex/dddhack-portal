// Anonymous, bounded, GET/navigation-only diagnosis of the user-reported v5 CTA.
// No authenticated storage, synthetic identity headers, login or live mutation.
// Limitation: Playwright only routes the first request in an HTTP redirect chain.
// An auth document may load after the first-party 302; no login is attempted.
// External subresources and every non-GET/HEAD request remain blocked.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium } from "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";
const origin = "https://dddhack-portal.param3021.chatgpt.site";
const base = resolve("evidence/live-v5-touch");
mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, "anonymous-"));
const safeUrl = (raw) => {
  try {
    const u = new URL(raw);
    return {
      origin: u.origin,
      path: u.pathname.startsWith("/cdn-cgi/challenge-platform/")
        ? "/cdn-cgi/challenge-platform/[redacted]"
        : u.pathname,
      queryKeys: [...u.searchParams.keys()],
    };
  } catch {
    return { path: String(raw).slice(0, 100) };
  }
};
const safeMessage = (message) =>
  String(message)
    .replace(/https?:\/\/[^\s)"']+/g, (url) => {
      const u = safeUrl(url);
      return u.origin + u.path;
    })
    .replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/g, "[redacted]");
const report = {
  origin,
  output,
  anonymous: true,
  productionMutationsAllowed: false,
  browserSandbox: true,
  cases: [],
  browserClosed: false,
};
const persist = () =>
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
report.browser = browser.version();
try {
  for (const [name, options, settle] of [
    [
      "desktop",
      {
        viewport: { width: 1440, height: 900 },
        isMobile: false,
        hasTouch: false,
      },
      1000,
    ],
    [
      "mobile-touch",
      { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      1000,
    ],
    [
      "tablet-touch",
      {
        viewport: { width: 834, height: 1194 },
        isMobile: true,
        hasTouch: true,
      },
      1000,
    ],
    [
      "mobile-touch-early",
      { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      0,
    ],
  ]) {
    const item = {
      name,
      ...options,
      settleMs: settle,
      requests: [],
      blocked: [],
      responses: [],
      navigations: [],
      events: [],
      console: [],
      errors: [],
      screenshots: [],
    };
    report.cases.push(item);
    const context = await browser.newContext({
      ...options,
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      const request = route.request(),
        u = new URL(request.url());
      const entry = {
        method: request.method(),
        ...safeUrl(request.url()),
        navigation: request.isNavigationRequest(),
      };
      if (!["GET", "HEAD"].includes(request.method())) {
        item.blocked.push({
          ...entry,
          reason: "All production mutations prohibited",
        });
        return route.abort("blockedbyclient");
      }
      if (u.origin !== origin) {
        item.blocked.push({
          ...entry,
          reason: request.isNavigationRequest()
            ? "Stopped at external auth/redirect boundary"
            : "External resource excluded",
        });
        return route.abort("blockedbyclient");
      }
      item.requests.push(entry);
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    await page.exposeBinding("__ddeTapRecord", (_source, event) =>
      item.events.push(event),
    );
    await page.addInitScript(() => {
      const describe = (el) =>
        el instanceof Element
          ? {
              tag: el.tagName.toLowerCase(),
              id: el.id,
              className:
                typeof el.className === "string" ? el.className : "svg",
              anchorPath: el.closest("a")
                ? new URL(el.closest("a").href).pathname
                : null,
            }
          : { tag: "unknown" };
      for (const type of [
        "touchstart",
        "touchend",
        "pointerdown",
        "pointerup",
        "click",
      ]) {
        document.addEventListener(
          type,
          (event) => {
            const detail = {
              type,
              target: describe(event.target),
              trusted: event.isTrusted,
              pointerType: event.pointerType || null,
              cancelable: event.cancelable,
            };
            queueMicrotask(() =>
              window.__ddeTapRecord({
                ...detail,
                defaultPrevented: event.defaultPrevented,
              }),
            );
          },
          { capture: true, passive: true },
        );
      }
    });
    page.on("console", (event) => {
      if (["error", "warning"].includes(event.type()))
        item.console.push({
          type: event.type(),
          message: safeMessage(event.text()),
        });
    });
    page.on("pageerror", (error) =>
      item.errors.push(safeMessage(error.message)),
    );
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame())
        item.navigations.push(safeUrl(frame.url()));
    });
    page.on("response", async (response) => {
      if (
        response.request().isNavigationRequest() ||
        new URL(response.url()).pathname.startsWith("/api/")
      ) {
        const location = response.headers().location;
        item.responses.push({
          status: response.status(),
          ...safeUrl(response.url()),
          redirect: location
            ? safeUrl(new URL(location, response.url()).href)
            : null,
        });
      }
    });
    try {
      const response = await page.goto(origin + "/", {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      item.initialStatus = response?.status();
      if (settle) await page.waitForTimeout(settle);
      item.document = await page.evaluate(() => ({
        title: document.title,
        readyState: document.readyState,
        width: innerWidth,
        visualWidth: visualViewport?.width,
        maxTouchPoints: navigator.maxTouchPoints,
        pointerCoarse: matchMedia("(pointer: coarse)").matches,
        viewportMeta:
          document.querySelector('meta[name="viewport"]')?.content || null,
      }));
      item.candidates = await page.locator("a,button").evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const r = node.getBoundingClientRect();
            return (
              r.width &&
              r.height &&
              /workspace|dashboard|chatgpt/i.test(node.textContent)
            );
          })
          .map((node) => ({
            tag: node.tagName.toLowerCase(),
            text: node.textContent.trim(),
            hrefPath:
              node instanceof HTMLAnchorElement
                ? new URL(node.href).pathname
                : null,
            hrefQueryKeys:
              node instanceof HTMLAnchorElement
                ? [...new URL(node.href).searchParams.keys()]
                : [],
            target: node.getAttribute("target"),
          })),
      );
      const cta = page
        .locator("a,button")
        .filter({
          hasText:
            /Open your workspace|Continue with ChatGPT|Open your Dashboard/i,
        })
        .first();
      if (!(await cta.count()))
        throw new Error(
          "Expected legacy workspace/auth CTA not found; inspect public page evidence",
        );
      await cta.scrollIntoViewIfNeeded();
      item.cta = await cta.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          cx = r.left + r.width / 2,
          cy = r.top + r.height / 2;
        const style = getComputedStyle(el),
          anchor = el.closest("a");
        return {
          text: el.textContent.trim(),
          tag: el.tagName.toLowerCase(),
          hrefPath: anchor ? new URL(anchor.href).pathname : null,
          hrefQueryKeys: anchor
            ? [...new URL(anchor.href).searchParams.keys()]
            : [],
          target: anchor?.target,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          style: {
            pointerEvents: style.pointerEvents,
            position: style.position,
            zIndex: style.zIndex,
            touchAction: style.touchAction,
          },
          hitBelongsToCta: el.contains(document.elementFromPoint(cx, cy)),
          hits: document
            .elementsFromPoint(cx, cy)
            .slice(0, 8)
            .map((node) => {
              const s = getComputedStyle(node);
              return {
                tag: node.tagName.toLowerCase(),
                id: node.id,
                className:
                  typeof node.className === "string" ? node.className : "svg",
                pointerEvents: s.pointerEvents,
                zIndex: s.zIndex,
                position: s.position,
                touchAction: s.touchAction,
              };
            }),
        };
      });
      const before = join(output, `${name}-before-cta.png`);
      await page.screenshot({
        path: before,
        fullPage: false,
        animations: "disabled",
      });
      item.screenshots.push(before);
      const requestsBefore = item.requests.length;
      try {
        if (options.hasTouch)
          await cta.tap({ timeout: 6000, noWaitAfter: true });
        else await cta.click({ timeout: 6000, noWaitAfter: true });
        item.tapDispatched = true;
      } catch (error) {
        item.tapError = safeMessage(error.message);
      }
      await page.waitForTimeout(1600);
      item.finalUrl = safeUrl(page.url());
      item.requestsAfterTap = item.requests.slice(requestsBefore);
      item.navigationAttempted =
        item.requestsAfterTap.some((r) => r.navigation) ||
        item.blocked.some((r) => r.navigation);
      const after = join(output, `${name}-after-cta.png`);
      await page
        .screenshot({ path: after, fullPage: false, animations: "disabled" })
        .then(() => item.screenshots.push(after))
        .catch(() => {});
    } catch (error) {
      item.failure = safeMessage(error.message);
    } finally {
      await context.close();
      persist();
    }
  }
} finally {
  await browser.close();
  report.browserClosed = true;
  persist();
}
console.log(
  JSON.stringify(
    {
      output,
      report: join(output, "report.json"),
      browserClosed: report.browserClosed,
      cases: report.cases.map(
        ({
          name,
          failure,
          initialStatus,
          cta,
          navigationAttempted,
          tapError,
          finalUrl,
          blocked,
        }) => ({
          name,
          failure,
          initialStatus,
          ctaText: cta?.text,
          hitBelongsToCta: cta?.hitBelongsToCta,
          navigationAttempted,
          tapError,
          finalUrl,
          blocked,
        }),
      ),
    },
    null,
    2,
  ),
);
