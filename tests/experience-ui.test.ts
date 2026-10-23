import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { teamPalettes, avatarPresets } from "../lib/experience-contract";
import Portal from "../app/portal";
import TeamAvatar from "../app/team-avatar";
test("original preset shapes, safe contrast and semantic responsive shell render without rejected artwork or private data", () => {
  const shapes = avatarPresets.map((avatar) =>
    renderToStaticMarkup(createElement(TeamAvatar, { avatar })),
  );
  assert.equal(new Set(shapes).size, 16);
  const luminance = (hex: string) => {
    const c = hex
      .slice(1)
      .match(/../g)!
      .map((n) => parseInt(n, 16) / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  for (const p of Object.values(teamPalettes))
    assert.ok(1.05 / (luminance(p.ink) + 0.05) >= 4.5, p.label);
  const html = renderToStaticMarkup(
    createElement(Portal, { path: "/", localTest: false }),
  );
  for (const name of [
    "Parampreet Singh",
    "Shivay L",
    "Nikhil Shukla",
    "Shresth Shukla",
    "Pause motion",
    "Skip to content",
    "IIIT Delhi",
  ])
    assert.ok(html.includes(name), name);
  assert.ok(!html.includes("delhi-architecture-backdrop"));
  assert.ok(!html.includes("new-delhi-wordmark"));
  assert.ok(!html.includes("SYNTHETIC-PRIVATE-ROOM"));
  assert.ok(!html.includes("onboarding"));
  const css = readFileSync("app/style.css", "utf8");
  assert.ok(css.includes("prefers-reduced-motion"));
  assert.ok(css.includes("font-style: normal"));
});
