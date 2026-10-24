import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Settings } from "../app/portal";

test("stored zero scoring weights remain visible as zero in editable controls", () => {
  const html = renderToStaticMarkup(createElement(Settings, {
    data: { me: { id: "fixture-owner", name: "Synthetic Owner", email: "owner@portal.test", owner: true, role: "admin" }, policy: { weights: { human: 0, ai: 100, votes: 0 } } },
    run: async () => { throw new Error("No write during render"); },
  }));
  assert.match(html, /name="human"[^>]*value="0"/);
  assert.match(html, /name="votes"[^>]*value="0"/);
  assert.match(html, /name="ai"[^>]*value="100"/);
});
