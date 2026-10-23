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

test("dense portrait piles stagger their lanes and vary row heights without changing the fill envelope", () => {
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [834, 1194],
  ]) {
    const dense = portraitPile(width, height, 1);
    // The previous pile aligned every row to four fixed vertical lanes.
    for (let row = 1; row < 8; row++) {
      const current = dense.dots.slice(row * 4, row * 4 + 4);
      const previous = dense.dots.slice((row - 1) * 4, row * 4);
      const laneShift =
        current.reduce(
          (sum, dot, index) => sum + Math.abs(dot.x - previous[index].x),
          0,
        ) / 4;
      assert.ok(
        laneShift > width * 0.045,
        "adjacent rows do not form fixed lanes",
      );
      const bases = current.map((dot) => dot.y + dot.diameter / 2);
      assert.ok(
        Math.max(...bases) - Math.min(...bases) > 8,
        "seeded rows have irregular heights rather than horizontal shelves",
      );
    }
    for (const dot of dense.dots) {
      assert.ok(dot.y - dot.diameter / 2 >= height * 0.2 - 0.01);
      assert.ok(dot.y + dot.diameter / 2 <= height + 0.01);
    }
  }
});
