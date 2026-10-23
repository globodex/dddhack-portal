import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminParticipantActions, {
  AdminIcon,
  participantActionValues,
} from "../app/admin-participant-actions";
import AdminProjectActions, {
  projectActionValues,
} from "../app/admin-project-actions";
const noRun = async () => {
  throw new Error("Rendering cannot mutate");
};

test("trash actions have exact accessible targets and retained confirmation payloads", () => {
  const html = renderToStaticMarkup(
    createElement(AdminParticipantActions, {
      participant: {
        id: "person-1",
        name: "Person One",
        email: "one@example.test",
      },
      run: noRun,
      compact: true,
    }),
  );
  assert.ok(
    html.includes(
      'aria-label="Remove participant: Person One (one@example.test)"',
    ),
  );
  assert.ok(html.includes('title="Remove Person One"'));
  assert.ok(html.includes("is-compact"));
  assert.ok(html.includes("<svg"));
  assert.ok(!html.includes('type="textarea"'));
  assert.deepEqual(
    participantActionValues({ id: "person-1", name: "Person One" }),
    { userId: "person-1", confirmation: "REMOVE_PARTICIPANT" },
  );
  const project = renderToStaticMarkup(
    createElement(AdminProjectActions, {
      project: { id: "project-1", name: "Project One" },
      versions: [],
      run: noRun,
    }),
  );
  assert.ok(project.includes('aria-label="Remove project: Project One"'));
  assert.ok(project.includes("<svg"));
  assert.deepEqual(
    projectActionValues("project-1", "submission", "version-2", "", false),
    {
      projectId: "project-1",
      scope: "submission",
      versionId: "version-2",
      confirmation: "REMOVE_SUBMISSION",
    },
  );
});
test("approved Lucide trash geometry is decorative to screen readers", () => {
  const html = renderToStaticMarkup(
    createElement(AdminIcon, { name: "trash" }),
  );
  assert.ok(html.includes('aria-hidden="true"'));
  for (const path of [
    "M10 11v6",
    "M14 11v6",
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    "M3 6h18",
    "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  ])
    assert.ok(html.includes(`d="${path}"`));
});
