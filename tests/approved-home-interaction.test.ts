import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/home";
import {
  stackGeometry,
  agendaGeometry,
  agendaDestination,
  confirmedAgenda,
} from "../app/home-geometry";
import {
  airblowerTarget,
  advanceDot,
  type DotState,
  desktopDots,
  mobileDots,
  stripDots,
} from "../app/home-motion";
import { defaultPublicContent } from "../lib/event-content-contract";
test("all four chapters share fitting viewport geometry on laptop and tablet; tall content and motion fallback coherently", () => {
  for (const [width, height] of [
    [1440, 900],
    [1440, 800],
    [1194, 834],
    [834, 1194],
  ]) {
    const result = stackGeometry(width, height, [400, 350, 460, 610]);
    assert.equal(result.enabled, true, `${width}x${height}`);
    assert.equal(result.tops.length, 4);
    assert.ok(
      result.tops.every((top, i) => height - top - 24 === result.stages[i]),
    );
    assert.ok(result.tops.every((top, i) => !i || top > result.tops[i - 1]));
  }
  for (const [w, h, tall, disabled] of [
    [390, 844, 600, false],
    [844, 390, 300, false],
    [1440, 800, 900, false],
    [1440, 900, 400, true],
  ] as const)
    assert.equal(
      stackGeometry(w, h, [350, 350, 350, tall], disabled).enabled,
      false,
    );
});
test("confirmed agenda uses measured distance, variable item offsets and the actual sticky start", () => {
  assert.equal(confirmedAgenda(defaultPublicContent.agenda).length, 0);
  const start = 850,
    distance = 630;
  assert.deepEqual(agendaGeometry(start, distance, 0), {
    travel: 630,
    progress: 0,
    translation: 0,
  });
  assert.deepEqual(agendaGeometry(start, distance, start + 315), {
    travel: 630,
    progress: 0.5,
    translation: -315,
  });
  assert.equal(agendaGeometry(start, distance, 99999).translation, -630);
  assert.equal(agendaDestination(start, distance, 480), 1330);
  assert.equal(agendaDestination(start, distance, 980), 1480);
  assert.deepEqual(agendaGeometry(start, 0, 99999), {
    travel: 0,
    progress: 0,
    translation: 0,
  });
});
test("airblower substantially moves multiple nearby dots and settles home inside its own stage", () => {
  const dots: DotState[] = [350, 450, 550, 650, 750].map((homeX) => ({
    homeX,
    homeY: 180,
    x: homeX,
    y: 180,
    r: 30,
    vx: 0,
    vy: 0,
  }));
  const pointer = { x: 550, y: 195 };
  const targets = dots.map((dot) =>
    airblowerTarget(dot, pointer, 1100, 200, true),
  );
  assert.ok(
    targets.filter(
      (target, i) =>
        Math.hypot(target.x - dots[i].homeX, target.y - dots[i].homeY) > 40,
    ).length >= 3,
  );
  for (let i = 0; i < dots.length; i++) {
    for (let frame = 0; frame < 160; frame++)
      advanceDot(dots[i], targets[i], 1, 1100, 200, true);
    assert.ok(
      dots[i].x >= 30 &&
        dots[i].x <= 1070 &&
        dots[i].y >= 30 &&
        dots[i].y <= 180.5,
    );
    const home = airblowerTarget(dots[i], null, 1100, 200, true);
    for (let frame = 0; frame < 200; frame++)
      advanceDot(dots[i], home, 1, 1100, 200, true);
    assert.ok(
      Math.hypot(dots[i].x - dots[i].homeX, dots[i].y - dots[i].homeY) < 0.1,
    );
  }
  assert.equal(desktopDots.length, 8);
  assert.equal(mobileDots.length, 8);
  assert.equal(stripDots.length, 18);
});
test("approved Home SSR has exact day/actions, real organizers and unenhanced readable chapters with no fabricated agenda", () => {
  const html = renderToStaticMarkup(createElement(Home));
  assert.match(html, /Sunday, 1 November 2026<\/span>/);
  assert.match(html, /Hosted by Codex Ambassadors<\/span>/);
  assert.doesNotMatch(html, /—/);
  assert.match(html, /Continue to portal/);
  assert.match(html, /https:\/\/luma.com\/6t5uk4lo/);
  assert.match(html, /Agenda to follow/);
  assert.doesNotMatch(
    html,
    /Previous|Use scroll progression|A day to build|photo pending/,
  );
  assert.ok(
    html.indexOf('class="home-motion-strip"') < html.indexOf('id="schedule"'),
  );
  assert.match(html, /HowDevelop-x.jpg/);
  assert.match(html, /Entry requires Going on portal/);
  for (const id of ["schedule", "venue", "rules", "faq"])
    assert.ok(html.includes(`id="${id}"`));
  const authenticated = renderToStaticMarkup(
    createElement(Home, { signedIn: true }),
  );
  assert.match(authenticated, /Open your Dashboard/);
  assert.match(authenticated, /href="\/dashboard"/);
});
