import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import AdminStats from "../app/admin-stats";
import type { AdminStatsDTO } from "../lib/admin-stats";

const examples: AdminStatsDTO[] = [
  {
    collection: "participants",
    scope: "Entire collection",
    cards: [
      { key: "roster", label: "On roster", value: 160 },
      { key: "accounts", label: "Portal accounts", value: 130 },
      { key: "without_account", label: "No portal account", value: 30 },
    ],
  },
  {
    collection: "teams",
    scope: "Entire collection",
    cards: [
      { key: "formed", label: "Teams formed", value: 40 },
      { key: "locked", label: "Locked teams", value: 28 },
      { key: "approved", label: "All members approved", value: 30 },
    ],
    note: "Locked and approved counts can overlap.",
  },
  {
    collection: "submissions",
    scope: "Entire collection",
    cards: [
      { key: "projects", label: "Active projects", value: 30 },
      { key: "submitted_teams", label: "Submitted teams", value: 25 },
      { key: "versions", label: "Visible versions", value: 56 },
    ],
  },
];

test("each count has a semantic label and entire-collection scope without filters or actions", () => {
  for (const stats of examples) {
    const html = renderToStaticMarkup(createElement(AdminStats, { stats }));
    assert.equal((html.match(/<dt>/g) || []).length, 3);
    assert.equal((html.match(/<dd>/g) || []).length, 3);
    assert.equal((html.match(/Entire collection/g) || []).length, 1);
    assert.match(html, /aria-label="(Participant|Team|Submission) statistics"/);
    assert.doesNotMatch(
      html,
      /<button|<input|<select|Loading|NaN|Not registered|pending AI|Current page/,
    );
    assert.equal(
      html.includes("counts can overlap"),
      stats.collection === "teams",
    );
  }
});

test("real zeroes render as zero rather than absent data", () => {
  const stats = {
    ...examples[0],
    cards: examples[0].cards.map((card) => ({ ...card, value: 0 })),
  };
  const html = renderToStaticMarkup(createElement(AdminStats, { stats }));
  assert.equal((html.match(/<dd>0<\/dd>/g) || []).length, 3);
});

const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
test(
  "three compact cards and values remain aligned without overflow at desktop, tablet and narrow mobile widths",
  {
    skip: !existsSync(chromiumPath),
  },
  async () => {
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const stats of examples) {
        await page.setContent(
          `<style>*{box-sizing:border-box}body{margin:0;background:#f8f7f3;font-family:Arial,sans-serif}.app-shell{max-width:1100px;margin:auto;padding:24px}</style><div class="app-shell">${renderToStaticMarkup(createElement(AdminStats, { stats }))}</div>`,
        );
        await page.addStyleTag({
          content: readFileSync("app/admin-stats.css", "utf8"),
        });
        for (const viewport of [
          { width: 1440, height: 900 },
          { width: 768, height: 900 },
          { width: 390, height: 844 },
          { width: 320, height: 480 },
        ]) {
          await page.setViewportSize(viewport);
          const geometry = await page
            .locator(".admin-collection-stats")
            .evaluate((section) => {
              const cards = [
                ...section.querySelectorAll(".admin-collection-stats-card"),
              ].map((card) => {
                const rect = card.getBoundingClientRect(),
                  value = card.querySelector("dd")!.getBoundingClientRect();
                return {
                  x: rect.x,
                  right: rect.right,
                  top: rect.top,
                  bottom: rect.bottom,
                  valueTop: value.top,
                  valueBottom: value.bottom,
                  overflow: card.scrollWidth > card.clientWidth,
                };
              });
              return {
                cards,
                overflow:
                  document.documentElement.scrollWidth > window.innerWidth,
              };
            });
          assert.equal(
            geometry.overflow,
            false,
            JSON.stringify({ stats, viewport, geometry }),
          );
          assert.equal(
            new Set(geometry.cards.map((card) => card.valueTop)).size,
            1,
          );
          assert.equal(new Set(geometry.cards.map((card) => card.top)).size, 1);
          for (const card of geometry.cards) {
            assert.equal(card.overflow, false);
            assert.ok(card.x >= 0 && card.right <= viewport.width);
            assert.ok(card.valueBottom < card.bottom);
          }
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    } finally {
      await browser.close();
    }
  },
);
