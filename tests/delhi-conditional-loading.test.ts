import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DelhiWordmark from "../app/delhi-wordmark";

test("Delhi SSR is the exact immediate fallback without unused motion image requests", () => {
  for (const paused of [false, true]) {
    const html = renderToStaticMarkup(createElement(DelhiWordmark, { paused }));
    assert.match(html, /data-motion="false"/);
    assert.match(html, /src="\/art\/delhi-v3\/fallback-approved-v3.png"/);
    assert.match(html, /fetchPriority="high"/i);
    assert.match(html, /width="2048" height="768"/);
    assert.doesNotMatch(
      html,
      /class="delhi-mask"|class="delhi-fill"|class="delhi-metro"/,
    );
    assert.doesNotMatch(
      html,
      /delhi-fill-overscan.png|metro-static.png|text-mask-alpha.png/,
    );
  }
});
