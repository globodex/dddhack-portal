import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Discover,
  SharedRules,
  discoveryProfileProjection,
} from "../app/portal";
import DiscoveryProfile from "../app/discovery-profile";
import { participantRules } from "../lib/participant-rules";
const run = async () => ({});
const teams = [
  {
    id: "open",
    name: "Open team",
    locked: false,
    status: "Forming",
    readiness: { total: 3 },
  },
  {
    id: "full",
    name: "Full team",
    locked: false,
    status: "Forming",
    readiness: { total: 5 },
  },
  {
    id: "locked",
    name: "Locked team",
    locked: true,
    status: "Locked",
    readiness: { total: 2 },
  },
];
type Me = NonNullable<Parameters<typeof Discover>[0]["data"]["me"]>;
const renderTeams = (me: Partial<Me>, team?: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(Discover, {
      path: "/discover/teams",
      data: {
        me: {
          id: "fixture",
          name: "Fixture",
          email: "fixture@portal.test",
          role: "participant",
          owner: false,
          ...me,
        },
        team,
        items: teams,
      },
      run,
    }),
  );
test("redesigned team discovery keeps viewer browsing read-only and offers safe team details", () => {
  const html = renderTeams({ canParticipate: false, mode: "viewer" });
  assert.doesNotMatch(html, /Request to join|Create team/);
  assert.equal((html.match(/>View team</g) || []).length, 3);
  assert.match(html, /3\/5 members/);
});
test("only eligible teamless members receive join/create controls, and full/locked teams remain read-only", () => {
  const available = renderTeams({ canParticipate: true });
  assert.equal((available.match(/>Request to join</g) || []).length, 1);
  assert.match(available, /Create team/);
  const member = renderTeams({ canParticipate: true }, { id: "open" });
  assert.doesNotMatch(member, /Request to join|Create team/);
  assert.match(member, /Your team/);
});
test("profile Team card copies only safe team identity and never private row fields", () => {
  const person = discoveryProfileProjection({
    name: "Alex",
    bio: "Visible bio",
    socials: [],
    teamName: "GreenLoop",
    teamPalette: "blue",
    email: "private@example.test",
    phone: "private-phone",
    idea: "private-idea",
    team: { secret: "private-team" },
  });
  assert.deepEqual(person.team, { name: "GreenLoop", palette: "blue" });
  const html = renderToStaticMarkup(
    createElement(DiscoveryProfile, { person, onClose: () => {} }),
  );
  assert.match(html, /GreenLoop/);
  assert.match(html, /In a team/);
  assert.doesNotMatch(
    html,
    /private@example|private-phone|private-idea|private-team|You are viewing this profile|View only/,
  );
});
test("shared Rules exposes every authoritative category and rule in scannable groups", () => {
  const categories = participantRules(
    "2026-11-01T02:30:00Z",
    "2026-11-01T10:30:00Z",
  );
  const html = renderToStaticMarkup(createElement(SharedRules, { categories }));
  assert.equal((html.match(/class="rule-group"/g) || []).length, 5);
  assert.doesNotMatch(html, /<details|<summary/);
  for (const category of categories) {
    assert.ok(html.includes(category.title));
    for (const item of category.items) assert.ok(html.includes(item.replaceAll("&", "&amp;")));
  }
  assert.match(html, /Exactly three committed submissions per team/);
  assert.match(html, /both be strictly after 1 November 2026, 08:00 IST/);
  assert.doesNotMatch(html, /private@example|—/);
});
