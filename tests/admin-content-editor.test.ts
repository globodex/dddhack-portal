import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentEditor, Settings } from "../app/portal";
import { defaultPublicContent } from "../lib/event-content-contract";

const run = async () => {
  throw new Error("Rendering cannot mutate");
};
test("content editor renders actual Lucide controls with exact accessible row targets and guarded publish", () => {
  const html = renderToStaticMarkup(
    createElement(ContentEditor, {
      data: {
        content: { draft: JSON.stringify(defaultPublicContent), revision: 0 },
      },
      scope: "public",
      run,
    }),
  );
  for (const name of [
    "lucide-plus",
    "lucide-trash-2",
    "lucide-save",
    "lucide-send",
  ])
    assert.ok(html.includes(name), name);
  assert.match(html, /aria-label="Remove agenda entry 1: A day to build"/);
  assert.match(html, /aria-label="Remove question 1: When is it\?"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*>[\s\S]*?Publish saved draft/,
  );
  assert.match(html, /aria-busy="false"/);
});

test("Results controls keep unavailable gates and explain each disabled action accessibly", () => {
  const html = renderToStaticMarkup(
    createElement(Settings, {
      data: {
        me: {
          id: "synthetic-owner",
          name: "Synthetic owner",
          email: "owner@portal.test",
          owner: true,
          role: "participant",
        },
        readiness: {
          scoring: { ready: false, blockers: ["confirmed scoring rules"] },
        },
        resultSnapshots: [],
      },
      run,
    }),
  );
  const controls = [
    ...html.matchAll(
      /<button class="button" disabled="" title="([^"]+)" aria-describedby="([^"]+)">([^<]+)<\/button>/g,
    ),
  ];
  assert.equal(controls.length, 3);
  for (const [, reason, id] of controls) {
    assert.match(reason, /Confirm scoring policy/);
    assert.ok(html.includes(`id="${id}"`));
  }
});
