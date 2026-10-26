import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceDot, airblowerTarget, type DotState } from "../app/home-motion";

test("cropped hero expressions return to rest without a perpetual animation loop", () => {
  for (const homeX of [0, 390, 404]) {
    const dot: DotState = {
      homeX,
      homeY: 90,
      x: 195,
      y: 90,
      r: 40,
      vx: 0,
      vy: 0,
    };
    const target = airblowerTarget(dot, null, 390, 168, true, true);
    let moving = true;
    for (let frame = 0; frame < 400 && moving; frame++) {
      moving = advanceDot(dot, target, 1, 390, 168, true, true);
      assert.ok(dot.x >= -14 && dot.x <= 404);
    }
    assert.equal(moving, false, `cropped home ${homeX} settles`);
    assert.ok(Math.abs(dot.x - homeX) < 0.1);
  }
});

test("contained bottom expressions remain whole during pointer repulsion and settle on short viewport stages", () => {
  for (const [width, height] of [
    [320, 58],
    [390, 152],
    [1440, 166],
  ]) {
    const r = Math.min(40, (height - 16) / 2);
    for (const homeX of [r, width / 2, width - r]) {
      const dot: DotState = {
        homeX,
        homeY: height - r - 8,
        x: homeX,
        y: height - r - 8,
        r,
        vx: 0,
        vy: 0,
      };
      const target = airblowerTarget(
        dot,
        { x: homeX, y: height / 2 },
        width,
        height,
        true,
        true,
        true,
      );
      for (let frame = 0; frame < 180; frame++) {
        advanceDot(dot, target, 1, width, height, true, true, true);
        assert.ok(dot.x >= r && dot.x + r <= width);
        assert.ok(dot.y >= r && dot.y + r <= height);
      }
      const home = airblowerTarget(dot, null, width, height, true, true, true);
      let moving = true;
      for (let frame = 0; frame < 500 && moving; frame++)
        moving = advanceDot(dot, home, 1, width, height, true, true, true);
      assert.equal(moving, false);
      assert.ok(Math.hypot(dot.x - homeX, dot.y - dot.homeY) < 0.1);
    }
  }
});
