import { test } from "node:test";
import assert from "node:assert/strict";
import { participantRules } from "../lib/participant-rules";
import { ist } from "../lib/time";

test("published submission windows change Rules without moving the repository cutoff", () => {
  const open = "2026-10-30T18:45:00Z";
  const close = "2026-10-31T19:15:00Z";
  const text = participantRules(open, close)
    .flatMap((category) => category.items)
    .join("\n");
  assert.ok(text.includes(`Submissions open ${ist(open)} and close ${ist(close)}`));
  assert.ok(text.includes("both be strictly after 1 November 2026, 08:00 IST"));
  assert.ok(text.includes("personally checked-in team leader"));
  assert.doesNotMatch(text, /Supply.*SHA|SHA256|At least one checked-in team member/);
});

test("unset submission windows remain honest rather than inventing a date", () => {
  const text = participantRules(null, null)
    .flatMap((category) => category.items)
    .join("\n");
  assert.ok(text.includes("open at the published opening time"));
  assert.ok(text.includes("close at the published deadline"));
  assert.doesNotMatch(text, /Invalid Date|undefined|null/);
});


test("media rules describe presentation frames while accepting any aspect ratio", () => {
  const text = participantRules(null, null).flatMap((category) => category.items).join("\n");
  assert.match(text, /Any image aspect ratio is accepted/);
  assert.match(text, /square logo and 16:9 banner frames without cropping/);
  assert.doesNotMatch(text, /Project logo \(1:1\) and banner \(16:9\) are required/);
});
