import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RouteSkeleton, { routeSkeletonLayout } from "../app/route-skeleton";
import Portal from "../app/portal";

test("route skeletons describe one busy region and keep decorative placeholders outside the accessibility tree", () => {
  for (const path of ["/dashboard", "/profile", "/discover/participants", "/discover/teams", "/projects", "/projects/fake", "/admin/participants", "/admin/settings", "/review/fake"]) {
    const html = renderToStaticMarkup(createElement(RouteSkeleton, { path }));
    assert.match(html, /aria-busy="true" aria-label="Page loading"/);
    assert.equal((html.match(/role="status"/g) || []).length, 1);
    assert.match(html, /class="route-skeleton-shapes" aria-hidden="true"/);
    assert.doesNotMatch(html, /<(button|input|a|img|svg|h1)[\s>]/);
    assert.doesNotMatch(html, /https?:|fake_|@portal\.test/);
  }
});

test("route shapes preserve distinct profile, dashboard, cards, table and form structures", () => {
  assert.equal(routeSkeletonLayout("/profile"), "profile");
  assert.equal(routeSkeletonLayout("/dashboard/profile"), "profile");
  assert.equal(routeSkeletonLayout("/dashboard"), "dashboard");
  assert.equal(routeSkeletonLayout("/discover/participants"), "people");
  assert.equal(routeSkeletonLayout("/admin/participants"), "table");
  assert.equal(routeSkeletonLayout("/admin/settings"), "form");
  assert.equal(routeSkeletonLayout("/projects/fake"), "detail");
  assert.equal(routeSkeletonLayout("/discover/teams"), "teams");
  assert.equal(routeSkeletonLayout("/admin/teams"), "teams");
  assert.equal(routeSkeletonLayout("/admin/credits"), "credits");
  assert.equal(routeSkeletonLayout("/rules"), "rules");
});

test("initial loading keeps the shared shell, while supplied loaded content has no skeleton overlay", () => {
  const waiting = renderToStaticMarkup(createElement(Portal, { path: "/dashboard" }));
  assert.match(waiting, /class="route-skeleton" data-layout="dashboard"/);
  assert.match(waiting, /class="mobile-header"/);
  assert.match(waiting, /class="sidebar/);
  const ready = renderToStaticMarkup(createElement(Portal, { path: "/profile", initialPublic: {
    me: { id: "fake_alice", name: "Synthetic Alice", email: "alice@portal.test", role: "participant", owner: false },
    profile: { display_name: "Synthetic Alice" },
  } }));
  assert.doesNotMatch(ready, /class="route-skeleton"/);
  assert.match(ready, /class="profile-flow"/);
});
