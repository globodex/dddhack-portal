import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Projects } from "../app/portal";
const run = async () => ({});
const entry = { id: "published", slug: "saved-public-slug", projectName: "Saved public project", teamName: "Saved team", problemSolution: "Public summary", teamColorKey: "violet", upvotes: 4, comments: 2 };
function render(path: string, data: Record<string, any>) {
  return renderToStaticMarkup(createElement(Projects, { path, data, run }));
}
test("only supplied public entries get icon-only sharing controls outside their detail links", () => {
  for (const path of ["/projects", "/leaderboard"]) {
    const html = render(path, { items: [entry] });
    assert.equal((html.match(/aria-label="Share"/g) || []).length, 1);
    assert.match(html, /class="public-project-card-actions"/);
    assert.match(html, /href="\/projects\/saved-public-slug"/);
    assert.doesNotMatch(html, /<a[^>]*class="project-row-link"[^>]*>[\s\S]*?<button[\s\S]*?<\/a>/);
    assert.doesNotMatch(html, /project-share-dialog/);
  }
});
test("public detail shares from its header only when the server entry contains a valid public slug", () => {
  const html = render("/projects/saved-public-slug", { items: [entry] });
  const header = html.match(/<header class="project-detail-topline">([\s\S]*?)<\/header>/)?.[1] || "";
  assert.match(header, /aria-label="Share"/);
  assert.equal((html.match(/aria-label="Share"/g) || []).length, 1);
  for (const slug of [undefined, "../admin", "saved?phone=PRIVATE"]) {
    assert.doesNotMatch(render("/projects/test", { items: [{ ...entry, slug }] }), /aria-label="Share"/);
  }
});
test("a private draft supplied beside an empty public collection never creates a share control or link", () => {
  const html = render("/projects", { items: [], team: { id: "PRIVATE_TEAM" }, project: { slug: "PRIVATE_DRAFT_SLUG", draft: { projectName: "PRIVATE_NAME" } } });
  assert.doesNotMatch(html, /PRIVATE_|aria-label="Share"|project-row-link/);
  assert.match(html, /No projects yet/);
});
