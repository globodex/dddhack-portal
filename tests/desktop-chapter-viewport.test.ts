import { test } from "node:test";
import assert from "node:assert/strict";
import { desktopChapterGeometry, mobileStackGeometry } from "../app/home-geometry";

test("sparse desktop chapters reserve almost the full available viewport", () => {
  for (const [width, height] of [[1440, 820], [1847, 943], [1920, 1000]]) {
    const natural = [317, 275, 620, 640];
    const layout = desktopChapterGeometry(width, height, natural);
    assert.equal(layout.enabled, true);
    assert.deepEqual(layout.tops, [14, 28, 42, 56]);
    layout.stages.forEach((stage, index) => {
      assert.ok(stage >= natural[index]);
      assert.equal(layout.tops[index] + stage, height - 24);
    });
  }
});

test("long published agenda and expanded FAQ retain every row before bottom pin", () => {
  const natural = [1400, 300, 650, 1600];
  const layout = desktopChapterGeometry(1847, 943, natural);
  assert.equal(layout.enabled, true);
  for (const index of [0, 3]) {
    assert.ok(layout.tops[index] < 0);
    assert.equal(layout.stages[index], natural[index]);
    assert.equal(layout.tops[index] + natural[index], 943 - 24);
  }
});

test("short, reduced and tablet layouts retain the existing fallback", () => {
  assert.equal(desktopChapterGeometry(1440, 599, [317, 620]).enabled, false);
  assert.equal(desktopChapterGeometry(1440, 820, [317, 620], true).enabled, false);
  assert.equal(desktopChapterGeometry(999, 960, [317, 620]).enabled, false);
  assert.deepEqual(mobileStackGeometry(390, 780, [320, 266, 711, 621]).tops, [14, 22, 30, 38]);
});
