import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OrganizerSection from "../app/organizer-section";
import { organizerEntry } from "../lib/organizer-motion";

test("measured organizer units begin fully beyond their origin edge, including the attached portrait", () => {
  for (const [width, height] of [
    [200, 600],
    [260, 700],
    [298, 112],
    [368, 118],
    [812, 164],
  ]) {
    for (let index = 0; index < 4; index++) {
      const desktop = organizerEntry(false, index, width, height);
      assert.ok(
        desktop.y > height,
        "the whole desktop unit clears the scene bottom",
      );
      assert.equal(desktop.x, 0);
      assert.equal(desktop.duration, 700);
      const mobile = organizerEntry(true, index, width, height);
      assert.equal(mobile.y, 0);
      assert.ok(
        index % 2 === 0 ? mobile.x + width < 0 : mobile.x > width,
        "both portrait and tube clear the alternating origin edge",
      );
      assert.equal(mobile.duration, 600);
    }
  }
});

test("organizer content remains immediately readable without motion or JS and uses only verified original photos", () => {
  const html = renderToStaticMarkup(
    createElement(OrganizerSection, { paused: true }),
  );
  assert.match(html, /Meet the Organizers behind/);
  for (const name of [
    "Parampreet Singh",
    "Shivay Lamba",
    "Nikhil Shukla",
    "Shresth Shukla",
  ])
    assert.ok(html.includes(name));
  for (const handle of [
    "HowDevelop",
    "nikhilsbuilds",
    "callmeshuklaji",
  ])
    assert.ok(html.includes(`/organizers/${handle}-x.jpg`));
  assert.ok(html.includes("/organizers/Param302-github.webp"));
  assert.equal((html.match(/class="organizer-unit"/g) || []).length, 4);
  assert.equal(
    (html.match(/class="organizer-portrait-ring"/g) || []).length,
    4,
  );
  assert.equal((html.match(/Codex Ambassador/g) || []).length, 3);
  assert.equal((html.match(/Cerebras Ambassador/g) || []).length, 1);
  assert.match(html, /Co-partner: Cerebras/);
  assert.doesNotMatch(
    html,
    /aria-hidden="true"[^>]*class="organizer-unit"|opacity:0|visibility:hidden|translate|Shuklaw|—/,
  );
});
