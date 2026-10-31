import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Submission, Dashboard, AdminTeamIdea } from "../app/portal";
import { submissionContentHidden } from "../app/submission-welcome";
import {
  confirmationFor,
  revealConfirmation,
} from "../lib/action-confirmation";
const run = async () => {
  throw Error("Render must never mutate");
};
const data = {
  me: {
    id: "synthetic",
    name: "Synthetic person",
    email: "synthetic@example.invalid",
    owner: false,
    role: "participant",
    canParticipate: true,
  },
  team: {
    id: "synthetic-team",
    name: "Synthetic team",
    leader_id: "synthetic",
  },
  members: [],
  submissionAccess: {
    contentHidden: true,
    canRead: false,
    canCommit: false,
    opensAt: "2026-11-01T02:30:00.000Z",
    serverNow: "2026-10-31T08:00:00.000Z",
  },
  project: { draft: { projectName: "PRIVATE_DRAFT_MARKER" } },
  attempts: [{ snapshot: { projectName: "PRIVATE_HISTORY_MARKER" } }],
};
test("dashboard and direct submission render welcoming card without stale draft/history/form before opening", () => {
  for (const C of [Submission, Dashboard]) {
    const html = renderToStaticMarkup(createElement(C, { data, run }));
    assert.match(html, /We’re looking forward to your project/);
    assert.doesNotMatch(
      html,
      /PRIVATE_DRAFT_MARKER|PRIVATE_HISTORY_MARKER|name="projectName"/,
    );
  }
  assert.equal(submissionContentHidden({}), true);
  assert.equal(
    submissionContentHidden({
      submissionAccess: { adminSubmissionTest: true },
    }),
    false,
  );
  const unknown = renderToStaticMarkup(
    createElement(Submission, {
      data: { ...data, submissionAccess: { contentHidden: true } },
      run,
    }),
  );
  assert.doesNotMatch(unknown, /Invalid Date/);
});
test("missing-idea card exposes explicit team-bound create action; saved idea remains update-only", () => {
  const empty = renderToStaticMarkup(
    createElement(AdminTeamIdea, {
      team: { id: "synthetic-team", name: "Synthetic target" },
      run,
    }),
  );
  assert.match(empty, /Add idea to Synthetic target/);
  assert.match(empty, /name="title"/);
  assert.match(empty, /maxLength="500"/);
  assert.doesNotMatch(empty, /Override idea/);
  const saved = renderToStaticMarkup(
    createElement(AdminTeamIdea, {
      team: {
        id: "synthetic-team",
        name: "Synthetic target",
        idea: { title: "Existing", description: "Saved" },
      },
      run,
    }),
  );
  assert.doesNotMatch(saved, /Add idea to Synthetic target/);
  assert.equal(revealConfirmation("admin-add-team-idea", {}), "ADD_TEAM_IDEA");
  assert.match(
    JSON.stringify(
      confirmationFor("admin-add-team-idea", {}, "Synthetic target"),
    ),
    /Add team idea/,
  );
});
