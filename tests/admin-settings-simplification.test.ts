import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Settings } from "../app/portal";

const run = async () => {
  throw new Error("Rendering cannot mutate");
};
const fixture = {
  me: { id: "synthetic-owner", role: "participant", owner: true },
  policyVersion: 4,
  policy: {
    submissionOpen: "2026-11-01T02:30:00.000Z",
    submissionClose: "2026-11-01T10:30:00.000Z",
  },
  readiness: {
    initialized: true,
    submissions: {
      configured: true,
      enabled: false,
      message: "Unnecessary submission readiness copy",
    },
    checkin: {
      configured: true,
      enabled: false,
      message: "Unnecessary checkin readiness copy",
    },
    scoring: { ready: false },
  },
  unresolved: ["Unnecessary unresolved scoring copy"],
  blockers: ["Unnecessary scoring blocker copy"],
};
const markup = (data: any) =>
  renderToStaticMarkup(createElement(Settings, { data, run }));

test("Settings removes readiness section and lists while retaining explicit owner event controls", () => {
  const html = markup(fixture);
  assert.match(html, /Event controls/);
  assert.match(html, /Preview operational setup/);
  assert.match(html, /Enable submissions/);
  assert.match(html, /Enable check-in/);
  assert.match(html, /I confirm these/);
  assert.match(html, /I confirm indefinite retention/);
  assert.doesNotMatch(
    html,
    /Operational setup and readiness|Operational and scoring readiness|Scoring confirmations still required|Unnecessary|Judging and scoring/,
  );
  assert.doesNotMatch(html, /<h2[^>]*>Operational setup</);
});

test("Settings event configuration and enable controls remain owner-only and readiness gated", () => {
  for (const role of ["admin", "participant", "judge", "mentor"]) {
    const html = markup({
      ...fixture,
      me: { id: "synthetic-" + role, role, owner: false },
    });
    assert.doesNotMatch(
      html,
      /Event controls|Preview operational setup|Enable submissions|Enable check-in/,
    );
  }
  for (const state of [
    { configured: false, enabled: false },
    { configured: true, enabled: true },
  ]) {
    const html = markup({
      ...fixture,
      readiness: { ...fixture.readiness, submissions: state, checkin: state },
    });
    assert.doesNotMatch(html, /Enable submissions|Enable check-in/);
    assert.match(html, /Preview operational setup/);
  }
});
