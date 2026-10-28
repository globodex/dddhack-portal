import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard, Submission } from "../app/portal";
import {
  confirmationFor,
  revealConfirmation,
} from "../lib/action-confirmation";
const data = {
  me: {
    id: "synthetic-leader",
    role: "admin",
    name: "Synthetic admin",
    email: "synthetic-admin@example.invalid",
    mode: "staff" as const,
    canParticipate: false,
    owner: false,
  },
  team: {
    id: "synthetic-team",
    name: "Test team",
    leader_id: "synthetic-leader",
    locked: true,
  },
  members: [],
  submissionAccess: {
    canRead: true,
    canCommit: true,
    adminSubmissionTest: true,
    adminTimeOverride: true,
    attemptsUsed: 0,
    locked: false,
    message:
      "Admin testing: the submission time window is overridden. Other submission rules still apply.",
  },
  submissionStatus: { allowed: false, message: "Submissions are closed." },
};
const run = async () => {
  throw Error("Render must not mutate");
};
test("admin leader editor uses server-issued authority and labels the time override truthfully", () => {
  const html = renderToStaticMarkup(createElement(Submission, { data, run }));
  assert.match(html, /data-readonly="false"/);
  assert.match(html, /Admin testing · time override/);
  assert.doesNotMatch(html, /Submission window open|Submissions are closed/);
  assert.match(html, /name="projectName"/);
  const denied = renderToStaticMarkup(
    createElement(Submission, {
      data: {
        ...data,
        submissionAccess: {
          ...data.submissionAccess,
          adminSubmissionTest: false,
        },
      },
      run,
    }),
  );
  assert.match(denied, /data-readonly="true"/);
  const capped = renderToStaticMarkup(
    createElement(Submission, {
      data: {
        ...data,
        submissionAccess: {
          ...data.submissionAccess,
          canCommit: false,
          attemptsUsed: 3,
          locked: true,
        },
      },
      run,
    }),
  );
  assert.match(capped, /data-readonly="true"/);
});
test("only authorized own test-project view exposes recoverable removal and exact confirmations", () => {
  const project = {
    id: "synthetic-project",
    published_version_id: "synthetic-version",
  };
  const render = (extra: any) =>
    renderToStaticMarkup(
      createElement(Dashboard, { data: { ...data, project, ...extra }, run }),
    );
  assert.match(render({}), /Remove your test project/);
  assert.doesNotMatch(
    render({
      submissionAccess: {
        ...data.submissionAccess,
        adminSubmissionTest: false,
      },
    }),
    /Remove your test project/,
  );
  const confirmation = confirmationFor(
    "admin-remove-own-test-project",
    {},
    "Test team",
  );
  assert.match(confirmation.description, /history.*three-attempt limit/);
  assert.equal(
    revealConfirmation("admin-remove-own-test-project", {}),
    "REMOVE_TEST_PROJECT",
  );
  assert.equal(
    revealConfirmation("admin-remove-team-member", {}),
    "REMOVE_TEAM_MEMBER",
  );
  assert.match(
    confirmationFor("admin-remove-team-member", {}, "Synthetic member")
      .description,
    /participant account stays intact/,
  );
});
