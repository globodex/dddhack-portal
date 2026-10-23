import { test } from "node:test";
import assert from "node:assert/strict";
import {
  portraitPile,
  portraitDotPool,
  backdropRepulsion,
} from "../lib/portrait-backdrop";

test("portrait backdrop is deterministic and grows from four dots to a capped36-dot pile near80% viewport height", () => {
  assert.equal(portraitDotPool.length, 36);
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [834, 1194],
  ]) {
    const sparse = portraitPile(width, height, 0),
      dense = portraitPile(width, height, 1);
    assert.equal(sparse.count, 4);
    assert.equal(dense.count, 36);
    assert.equal(dense.fillHeight, height * 0.8);
    assert.deepEqual(dense, portraitPile(width, height, 1));
    let previous = 4;
    for (let n = 0; n <= 20; n++) {
      const pile = portraitPile(width, height, n / 20);
      assert.ok(pile.count >= previous && pile.count <= 36);
      previous = pile.count;
      for (const dot of pile.dots.filter((d) => d.active)) {
        assert.ok(
          dot.x - dot.diameter / 2 >= -0.01 &&
            dot.x + dot.diameter / 2 <= width + 0.01,
        );
        assert.ok(
          dot.y - dot.diameter / 2 >= 0 &&
            dot.y + dot.diameter / 2 <= height + 0.01,
        );
      }
    }
    const top = Math.min(...dense.dots.map((dot) => dot.y - dot.diameter / 2));
    assert.ok(
      top >= height * 0.18 && top <= height * 0.25,
      "The pile reaches about80% of viewport height without filling the reading area opaquely",
    );
  }
});
test("portrait pointer displacement stays local and settles without a pointer", () => {
  assert.deepEqual(backdropRepulsion(10, 20, null), { x: 0, y: 0 });
  assert.deepEqual(backdropRepulsion(10, 20, { x: 500, y: 500 }), {
    x: 0,
    y: 0,
  });
  for (let x = -140; x <= 140; x += 10)
    for (let y = -140; y <= 140; y += 10) {
      const push = backdropRepulsion(x, y, { x: 0, y: 0 });
      assert.ok(Math.hypot(push.x, push.y) <= 24.0001);
    }
});
