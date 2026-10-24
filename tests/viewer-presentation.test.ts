import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Portal from "../app/portal";
import ViewerWelcome, { eventRegistrationURL } from "../app/viewer-welcome";
import { AdminParticipantFilters } from "../app/admin-participant-actions";
import { filterParticipants } from "../lib/participant-filters";
import { portalLoadFailure } from "../lib/portal-load-state";
import { readFileSync } from "node:fs";
const viewer = { id: "synthetic-viewer", email: "viewer@example.invalid", name: "Synthetic viewer", role: "participant", owner: false, mode: "viewer" as const, canParticipate: false, canEngage: false };
const render = (component: any, props: any) => renderToStaticMarkup(createElement(component, props));

test("all signed-in Viewer workspace entry points render one registration invitation, without errors or participant actions", () => {
  assert.ok(readFileSync(new URL("../app/home.tsx", import.meta.url), "utf8").includes(eventRegistrationURL));
  for (const path of ["/dashboard", "/profile", "/submission", "/personal/credits"]) {
    const html = render(Portal, { path, initialView: { me: viewer, registrationRequired: true } });
    assert.match(html, /Take a look around\./);
    assert.equal((html.match(/>Register on Luma</g) || []).length, 1);
    assert.match(html, /href="https:\/\/luma.com\/6t5uk4lo" target="_blank" rel="noopener noreferrer"/);
    for (const destination of ["/discover/participants", "/discover/teams", "/projects"]) assert.ok(html.includes(`href="${destination}"`));
    assert.doesNotMatch(html, /role="alert"|route-skeleton|My credits|Create team|Join team|Step 1 of 3|Save profile/);
    assert.match(html, /account-logout/);
  }
});

test("removed access has an organizer contact instead of suggesting re-registration will bypass it", () => {
  const html = render(ViewerWelcome, { removed: true });
  assert.match(html, /mailto:hey@itsparam.in/);
  assert.doesNotMatch(html, /Register on Luma|https:\/\/luma/);
});

test("real server/session failures render immediately with accessible recovery and no misleading Viewer or simultaneous skeleton", () => {
  for (const [status, code] of [[503, "BACKEND_UNAVAILABLE"], [401, "SIGN_IN_REQUIRED"], [403, "ADMIN_REQUIRED"]] as const) {
    const initialFailure = portalLoadFailure(status, { code });
    const html = render(Portal, { path: "/dashboard", initialFailure });
    assert.match(html, /role="alert" aria-busy="false"/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /route-skeleton|Register on Luma|Take a look around/);
    assert.ok(!html.includes(`>${code}<`));
    if (status === 401) assert.match(html, /Sign in to continue/);
  }
  assert.equal(portalLoadFailure(409, { code: "SCORING_CHANGED_RETRY", message: "Scores changed. Reload before publishing." }).message, "Scores changed. Reload before publishing.");
});

test("Not registered filter is an admin option and matches separate Viewer records without classifying ordinary registrations", () => {
  assert.match(render(AdminParticipantFilters, { onChange() {}, showUnregistered: true }), /value="not registered">Not registered/);
  assert.doesNotMatch(render(AdminParticipantFilters, { onChange() {} }), /value="not registered"/);
  const rows = [{ id: "v", name: "Viewer", email: "viewer@example.invalid", status: "Not registered", registered: false }, { id: "p", name: "Participant", status: "Registered", registered: true }];
  const filters = { status: "not registered", team: "all" as const, individual: "", teamQuery: "" };
  assert.deepEqual(filterParticipants(rows, filters).map(row => row.id), ["v"]);
  assert.deepEqual(filterParticipants(rows, { ...filters, individual: "no match" }), []);
});
