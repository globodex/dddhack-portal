import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/home";
import { viewportChapterGeometry } from "../app/home-geometry";

test("every breakpoint reserves at least one whole viewport and pins readable content below the real header", () => {
  for (const [width, height, header] of [
    [1440, 900, 80],
    [768, 1024, 80],
    [390, 844, 69],
    [320, 480, 69],
  ]) {
    const natural = [319, 265, 711, 620];
    const result = viewportChapterGeometry(width, height, header, natural);
    assert.equal(result.enabled, true);
    result.stages.forEach((stage, index) =>
      assert.ok(stage >= height && stage >= natural[index]),
    );
    assert.ok(
      result.tops[1] > header,
      "sparse Venue heading remains below sticky navigation",
    );
    result.tops.forEach((top, index) =>
      assert.ok(top + natural[index] <= height - 16),
    );
  }
});

test("long agenda and expanded FAQ pass their final line before pinning without disabling other cards", () => {
  const natural = [2400, 265, 801, 1900];
  const result = viewportChapterGeometry(320, 480, 69, natural);
  assert.equal(result.enabled, true);
  for (const index of [0, 2, 3]) {
    assert.ok(result.tops[index] < 0);
    assert.equal(result.tops[index] + natural[index], 464);
    assert.equal(result.stages[index], natural[index]);
  }
  assert.equal(result.stages[1], 480);
});

test("paused, reduced or tiny-height layouts retain full-height natural content", () => {
  for (const disabled of [true, false]) {
    const result = viewportChapterGeometry(390, 250, 69, [300, 265], disabled);
    assert.equal(result.enabled, false);
    assert.deepEqual(result.stages, [300, 265]);
  }
  const paused = viewportChapterGeometry(1440, 900, 80, [319, 265], true);
  assert.equal(paused.enabled, false);
  assert.deepEqual(paused.stages, [900, 900]);
});

test("Home keeps the lower dots and narrow desktop rail, and changes only the requested organizer portrait", () => {
  const markup = renderToStaticMarkup(createElement(Home));
  assert.doesNotMatch(markup, /class="hero-art"|class="dot-field hero-dots"/);
  assert.match(markup, /class="hero-art hero-rail"/);
  assert.match(markup, /class="hero-partner hero-brand-lockup"/);
  assert.match(markup, /openai-wordmark-official\.svg/);
  assert.match(markup, /class="home-motion-strip"/);
  assert.match(markup, /Param302-github\.webp/);
  for (const handle of ["HowDevelop", "nikhilsbuilds", "callmeshuklaji"])
    assert.match(markup, new RegExp(`${handle}-x\\.jpg`));
  assert.match(markup, /fallback-approved-v3/);
  assert.match(markup, /Continue to portal/);
});

test("Home arrival details exist only when an authorized projection is explicitly supplied", () => {
  const safe = renderToStaticMarkup(createElement(Home));
  assert.doesNotMatch(safe, /home-private-arrival|SYNTHETIC_ROOM|Google Maps/);
  const privateVenue = {
    location: "SYNTHETIC_ROOM",
    directions: "Synthetic directions only.",
    mapUrl: "https://www.google.com/maps?q=synthetic-local-fixture",
  };
  const permitted = renderToStaticMarkup(createElement(Home, { privateVenue }));
  assert.match(permitted, /SYNTHETIC_ROOM/);
  assert.match(permitted, /Synthetic directions only\./);
  assert.match(
    permitted,
    /href="https:\/\/www.google.com\/maps\?q=synthetic-local-fixture"/,
  );
  assert.match(permitted, /rel="noopener noreferrer"/);
  const unsafe = renderToStaticMarkup(
    createElement(Home, {
      privateVenue: { ...privateVenue, mapUrl: "javascript:alert(1)" },
    }),
  );
  assert.doesNotMatch(unsafe, /javascript:|Google Maps/);
});
