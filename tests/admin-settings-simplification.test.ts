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

test("Settings removes readiness section and manual attestation controls", () => {
  const html = markup(fixture);
  assert.doesNotMatch(
    html,
    /Event controls|Preview operational setup|Enable submissions|Enable check-in|I confirm these|I confirm indefinite retention/,
  );
  assert.doesNotMatch(
    html,
    /Operational setup and readiness|Operational and scoring readiness|Scoring confirmations still required|Unnecessary unresolved scoring copy|Unnecessary submission readiness copy|Unnecessary checkin readiness copy|Judging and scoring/,
  );
  assert.doesNotMatch(html, /<h2[^>]*>Operational setup</);
});

test("Settings has no manual operation controls for any role or readiness state", () => {
  for (const role of ["owner", "admin", "participant", "judge", "mentor"]) {
    for (const state of [
      { configured: false, enabled: false },
      { configured: true, enabled: true },
    ]) {
      const html = markup({
        ...fixture,
        me: { id: "synthetic-" + role, role, owner: role === "owner" },
        readiness: { ...fixture.readiness, submissions: state, checkin: state },
      });
      assert.doesNotMatch(
        html,
        /Event controls|Preview operational setup|Enable submissions|Enable check-in|rulesConfirmed|privacyConfirmed/,
      );
    }
  }
});
