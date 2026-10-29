import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TeamPreparation, { type TeamPreparationProps } from "../app/team-preparation";
import { draftPolicy } from "../lib/policy";

const render = (props: Partial<TeamPreparationProps> = {}) =>
  renderToStaticMarkup(createElement(TeamPreparation, {
    hasTeam: false, ideaSaved: false, locked: false, ...props,
  }));

test("preparation shows exactly three semantic steps across no-team, created, idea-saved and locked states", () => {
  for (const [props, completed, current] of [
    [{}, 0, "Create your team"],
    [{ hasTeam: true }, 1, "Submit your idea"],
    [{ hasTeam: true, ideaSaved: true }, 2, "Lock your team"],
    [{ hasTeam: true, ideaSaved: true, locked: true }, 3, null],
  ] as const) {
    const html = render(props);
    assert.match(html, /<ol[^>]+aria-label="Team preparation progress"/);
    assert.equal((html.match(/<li\b/g) || []).length, 3);
    assert.equal((html.match(/data-state="complete"/g) || []).length, completed);
    assert.equal((html.match(/aria-current="step"/g) || []).length, current ? 1 : 0);
    if (current) assert.match(html, new RegExp('aria-current="step"[\\s\\S]*?<h3>' + current + '</h3>'));
    assert.match(html, /Even if you’re solo/);
    assert.doesNotMatch(html, /Sign in|Sign-in|<button|<input/);
  }
});

test("the displayed preparation date is exact and does not change the actual29October policy cutoff", () => {
  const policyCutoff = draftPolicy.ideaLock;
  const html = render();
  assert.match(html, /dateTime="2026-10-28T23:59:00\+05:30"/);
  assert.match(html, /28 October 2026/);
  assert.match(html, /11:59 PM IST/);
  assert.equal(policyCutoff, "2026-10-29T18:29:00.000Z");
  assert.equal(draftPolicy.ideaLock, policyCutoff);
});

test("profile prerequisite is explicit without adding another progress step", () => {
  assert.match(render({ hasTeam: true, ideaSaved: true }), /Every member needs a complete profile/);
  assert.match(render({ hasTeam: true, memberProfilesComplete: false }), /Complete every member’s profile first/);
  assert.doesNotMatch(render({ hasTeam: true, memberProfilesComplete: true }), /Complete every member’s profile first/);
  assert.doesNotMatch(render({ hasTeam: true, locked: true }), /profile first|profiles complete/);
});

test("lock explanation preserves the admin-unlock exception and approval stays separate from the three steps", () => {
  const html = render({ hasTeam: true, ideaSaved: true, locked: true });
  assert.match(html, /you can’t change the team, members or idea/);
  assert.match(html, /An admin can unlock eligible teams/);
  assert.match(html, /<\/ol>[\s\S]*<aside[^>]+aria-label="Team approval"/);
  assert.match(html, /Your team is not approved yet/);
  assert.match(html, /Your team is in review/);
  assert.match(html, /Locking does not confirm attendance/);
  assert.match(html, /Venue details and rules will be shared in the portal/);
  assert.match(html, /Be ready with your idea. All the best/);
  assert.match(html, /<em>~ Codex Ambassadors<\/em>/);
  assert.doesNotMatch(html, /Your arrival details|Venue unlocked|All members can access|location|directions/);
});

test("approved status requires a locked real team and a nonempty complete authoritative approval count", () => {
  assert.match(render({ hasTeam: true, locked: true, approvalTotal: 3, approvalGoing: 3 }), /<h3>Team approved<\/h3>/);
  for (const props of [
    { hasTeam: true, locked: true, approvalTotal: 3, approvalGoing: 2 },
    { hasTeam: true, locked: false, approvalTotal: 3, approvalGoing: 3 },
    { hasTeam: true, approvalTotal: 0, approvalGoing: 0 },
    { hasTeam: false, approvalTotal: 1, approvalGoing: 1 },
    { hasTeam: true },
  ]) assert.match(render(props), /<h3>Your team is not approved yet<\/h3>/);
});

test("preparation is self-contained responsive presentation without fixed content heights or network effects", () => {
  const css = readFileSync(new URL("../app/team-preparation.css", import.meta.url), "utf8");
  const component = readFileSync(new URL("../app/team-preparation.tsx", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1\.62fr\) minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.studio-team\b|\.app-shell\b|@import|animation:|transition:/);
  assert.doesNotMatch(component, /fetch\(|useEffect|useState|window\.|document\.|\/api\//);
});
