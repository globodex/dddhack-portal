import { test } from "node:test";
import assert from "node:assert/strict";
import { mobileStackGeometry, stackGeometry } from "../app/home-geometry";

test("normal phone chapters pin below the header with visible layer offsets", () => {
  const measured = [320, 266, 711, 621];
  const layout = mobileStackGeometry(390, 844 - 64, measured);
  assert.equal(layout.enabled, true);
  assert.deepEqual(layout.tops, [14, 22, 30, 38]);
  measured.forEach((height, index) => {
    assert.ok(layout.tops[index] >= 0);
    assert.ok(layout.tops[index] + height <= 780 - 16);
  });
});

test("short phones and an expanded FAQ can scroll every row before pinning", () => {
  const measured = [320, 266, 711, 1160];
  const layout = mobileStackGeometry(390, 480 - 64, measured);
  assert.equal(layout.enabled, true);
  assert.ok(layout.tops[2] < 0);
  assert.ok(layout.tops[3] < layout.tops[2]);
  for (const index of [2, 3])
    assert.equal(layout.tops[index] + measured[index], 416 - 16);
  assert.deepEqual(layout.stages, measured, "content height is never clipped");
});

test("motion settings, tiny viewports and desktop keep the ordinary fallback", () => {
  for (const [width, height, disabled] of [
    [390, 780, true],
    [390, 200, false],
    [768, 960, false],
    [1440, 820, false],
  ] as const)
    assert.equal(mobileStackGeometry(width, height, [320, 700], disabled).enabled, false);
  assert.equal(stackGeometry(1440, 820, [400, 350, 460, 610]).enabled, true);
  assert.equal(stackGeometry(390, 780, [320, 266, 711, 621]).enabled, false);
});
