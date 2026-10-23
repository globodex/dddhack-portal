import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExpressiveHeading, {
  HeadingDot,
  headingMarkOffset,
} from "../app/expressive-heading";
import CenteredLoader from "../app/centered-loader";
import Home from "../app/home";
import { dotColors, dotExpressions } from "../lib/avatar-contract";

const render = (component: any, props: any) =>
  renderToStaticMarkup(createElement(component, props));
test("heading dots retain all eight approved symbolic expressions and eight palette values as decorative marks", () => {
  assert.equal(Object.keys(dotColors).length, 8);
  assert.equal(Object.keys(dotExpressions).length, 8);
  for (const [color, fill] of Object.entries(dotColors)) {
    const html = render(HeadingDot, { color });
    assert.ok(html.includes(`fill="${fill}"`), color);
    assert.match(html, /class="expressive-heading-dot" aria-hidden="true"/);
    assert.equal((html.match(/<circle/g) || []).length, 1);
  }
  const expressions = Object.keys(dotExpressions).map((expression) =>
    render(HeadingDot, { expression }),
  );
  assert.equal(new Set(expressions).size, 8);
  for (const html of expressions) {
    assert.equal((html.match(/<text/g) || []).length, 1);
    assert.equal((html.match(/<circle/g) || []).length, 1);
  }
  const heading = render(ExpressiveHeading, {
    children: "Participants",
    color: "orange",
    expression: "plus",
    paused: true,
  });
  assert.match(heading, /<h1[^>]*>Participants/);
  assert.match(heading, /data-paused="true"/);
});

test("cursor attention is bounded in both axes, follows direction, and resets invalid coordinates safely", () => {
  for (const dx of [-1e6, -1000, -120, 0, 120, 1000, 1e6])
    for (const dy of [-1e6, -1000, -120, 0, 120, 1000, 1e6]) {
      const point = headingMarkOffset(dx, dy);
      assert.ok(Math.abs(point.x) <= 6);
      assert.ok(Math.abs(point.y) <= 4);
      if (dx) assert.equal(Math.sign(point.x), Math.sign(dx));
      if (dy) assert.equal(Math.sign(point.y), Math.sign(dy));
    }
  assert.deepEqual(headingMarkOffset(0, 0), { x: 0, y: 0 });
  assert.deepEqual(headingMarkOffset(NaN, Infinity), { x: 0, y: 0 });
});

test("centered loader has one accessible status and supports content or viewport placement and pause", () => {
  for (const scope of ["container", "viewport"]) {
    const html = render(CenteredLoader, {
      scope,
      label: "Checking registration",
      paused: true,
    });
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.ok(html.includes(`data-scope="${scope}"`));
    assert.equal((html.match(/Checking registration/g) || []).length, 1);
    assert.equal((html.match(/<i>/g) || []).length, 3);
    assert.match(html, /class="centered-loader-dots" aria-hidden="true"/);
    assert.match(html, /data-paused="true"/);
  }
});

test("Schedule removes the rejected helper line while approved artwork and ordinary chapter order stay present", () => {
  const html = render(Home, {});
  assert.ok(!html.includes("One day. Many possibilities."));
  assert.match(html, /fallback-approved-v3\.png/);
  assert.match(html, /metro-static\.png/);
  assert.ok(html.indexOf('id="schedule"') < html.indexOf('id="venue"'));
  assert.ok(html.indexOf('id="venue"') < html.indexOf('id="rules"'));
  assert.ok(html.indexOf('id="rules"') < html.indexOf('id="faq"'));
});
