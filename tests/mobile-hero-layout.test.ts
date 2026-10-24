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
