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
  const editorForm = editor.match(/<form[^>]*class="project-editor"[^>]*>/)?.[0] || "";
  assert.match(editorForm, /method="post"/);
  assert.match(editorForm, /inert=""/);
  assert.match(editor, /<fieldset disabled="">/);
  const comments = renderToStaticMarkup(createElement(Projects, {
    path: "/projects/synthetic", run: async () => ({}), data: { me, items: [{ id: "synthetic", slug: "synthetic", projectName: "Synthetic", canComment: true }] },
  }));
  const commentForm = comments.match(/<form[^>]*class="project-comment-composer"[^>]*>/)?.[0] || "";
  assert.match(commentForm, /method="post"/);
  assert.match(commentForm, /inert=""/);
  assert.match(comments, /<textarea[^>]*name="body"[^>]*disabled=""/);
  assert.doesNotMatch(editor + comments, /method="get"/);
});

test("project detail omits a team caption when no authoritative team name is supplied", () => {
  const html = renderToStaticMarkup(createElement(Projects, {
    path: "/projects/synthetic", run: async () => ({}), data: { items: [{ id: "synthetic", slug: "synthetic", projectName: "Synthetic", problemSolution: "Fixture summary", description: "Fixture description" }] },
  }));
  assert.doesNotMatch(html, /Team project team|by project team/);
  assert.match(html, /<h1>Synthetic<\/h1>/);
});
