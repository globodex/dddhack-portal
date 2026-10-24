import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Projects, Submission } from "../app/portal";

test("server-rendered project forms cannot put private draft fields into a native GET before hydration", () => {
  const me = { id: "fake_alice", name: "Alice", email: "alice@portal.test", role: "participant", owner: false, canParticipate: true, canEngage: true };
  const editor = renderToStaticMarkup(createElement(Submission, {
    data: { me, team: { id: "fake_team", leader_id: me.id }, submissionAccess: { canRead: true, canCommit: true }, project: { draft: { projectName: "SYNTHETIC_PRIVATE_NAME", description: "SYNTHETIC_PRIVATE_DESCRIPTION" } } },
    run: async () => ({}),
  }));
  assert.match(editor, /<form[^>]*class="project-editor"[^>]*method="post"[^>]*inert=""/);
  assert.match(editor, /<fieldset disabled="">/);
  const comments = renderToStaticMarkup(createElement(Projects, {
    path: "/projects/synthetic", run: async () => ({}), data: { me, items: [{ id: "synthetic", slug: "synthetic", projectName: "Synthetic", canComment: true }] },
  }));
  assert.match(comments, /<form[^>]*class="project-comment-composer"[^>]*method="post"[^>]*inert=""/);
  assert.match(comments, /<textarea[^>]*name="body"[^>]*disabled=""/);
  assert.doesNotMatch(editor + comments, /method="get"/);
});
