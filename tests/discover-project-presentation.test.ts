import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscoverTeamDialog, Projects } from "../app/portal";

const run = async () => ({});
const identity = { id: "fake", name: "Fixture", email: "fixture@portal.test", role: "participant", owner: false };
const projects = (data: Record<string, any>) => renderToStaticMarkup(createElement(Projects, { path: "/projects", data, run }));

test("an actually empty collection has no search or fake project and offers the actor's real next route", () => {
  const participant = projects({ items: [], me: { ...identity, canParticipate: true } });
  assert.doesNotMatch(participant, /Search projects|project-row-link|Clear search/);
  assert.match(participant, /href="\/dashboard#project"/);
  assert.match(participant, /Your workspace/);
  const viewer = projects({ items: [], me: { ...identity, canParticipate: false } });
  assert.match(viewer, /href="\/discover\/teams"/);
  assert.match(viewer, /Meet the teams/);
  assert.doesNotMatch(viewer, /Your workspace|Your project/);
  const anonymous = projects({ items: [] });
  assert.match(anonymous, /href="\/signin\?returnTo=%2Fprojects"/);
  assert.match(anonymous, /Explore the portal/);
});

test("a real collection retains search, canonical detail/comment links and existing engagement counts", () => {
  const html = projects({ items: [{ id: "real", slug: "real-saved-slug", projectName: "Real saved project", teamName: "Saved team", problemSolution: "Real summary", teamColorKey: "violet", logo: "/real.png", upvotes: 7, comments: 3 }] });
  assert.match(html, /Search projects/);
  assert.match(html, /href="\/projects\/real-saved-slug"/);
  assert.match(html, /href="\/projects\/real-saved-slug#comments"/);
  assert.match(html, /3 comments on Real saved project/);
  assert.match(html, /Real saved project/);
  assert.doesNotMatch(html, /No projects yet/);
});

test("team details render only authoritative current member identities and safe existing profile routes", () => {
  const html = renderToStaticMarkup(createElement(DiscoverTeamDialog, { onClose: () => {}, team: { name: "Saved team", palette: "violet", readiness: { total: 2 }, members: [{ id: "fake_member", name: "Saved member", avatarColor: "orange", avatarExpression: "plus", profileUrl: "/discover/participants#person-fake_member", phone: "PRIVATE_PHONE", email: "PRIVATE_EMAIL", credits: "PRIVATE_CREDITS", idea: "PRIVATE_IDEA" }, { id: "hidden", name: "Unsafe link", profileUrl: "javascript:alert(1)" }] } }));
  assert.match(html, /Saved member/);
  assert.match(html, /href="\/discover\/participants#person-fake_member"/);
  assert.match(html, /2\/5 members/);
  assert.doesNotMatch(html, /PRIVATE_|javascript:|fake_member<|hidden</);
  assert.match(html, /aria-label="Close team"/);
});

test("an older safe team response does not invent members from readiness count", () => {
  const html = renderToStaticMarkup(createElement(DiscoverTeamDialog, { onClose: () => {}, team: { name: "Saved team", readiness: { total: 5 } } }));
  assert.match(html, /Member details are unavailable/);
  assert.doesNotMatch(html, /discover-team-members/);
});
