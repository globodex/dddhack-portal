import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminBackendNotice, {
  adminBackendUpdateMessage,
} from "../app/admin-backend-notice";
import { approvalPreviewError } from "../app/admin-team-approval";
import DiscoveryProfile from "../app/discovery-profile";

test("missing backend statistics are explicit to staff, never fabricated zero counts or notices for other roles", () => {
  for (const me of [{ role: "admin" }, { role: "participant", owner: true }]) {
    const html = renderToStaticMarkup(
      createElement(AdminBackendNotice, { me }),
    );
    assert.match(html, /role="alert"/);
    assert.match(html, /Statistics are unavailable from the backend/);
    assert.doesNotMatch(html, /<dd|>0</);
    assert.equal(
      renderToStaticMarkup(
        createElement(AdminBackendNotice, { me, stats: { cards: [] } }),
      ),
      "",
    );
  }
  for (const role of ["participant", "volunteer", "viewer", undefined])
    assert.equal(
      renderToStaticMarkup(createElement(AdminBackendNotice, { me: { role } })),
      "",
    );
});

test("only the legacy missing approval route gets the compatibility explanation; authorization and real missing teams retain their errors", () => {
  assert.equal(
    approvalPreviewError(404, {
      code: "LIST_NOT_FOUND",
      message: "LIST_NOT_FOUND",
    }),
    adminBackendUpdateMessage,
  );
  assert.equal(
    approvalPreviewError(404, {
      code: "TEAM_NOT_FOUND",
      message: "This team was removed.",
    }),
    "This team was removed.",
  );
  assert.equal(
    approvalPreviewError(403, { code: "ADMIN_REQUIRED" }),
    "This page is available to event administrators.",
  );
  assert.equal(
    approvalPreviewError(503, { code: "UNAVAILABLE", message: "Retry later." }),
    "Retry later.",
  );
});

test("missing selected email has an explicit optional staff notice and never reconstructs private email from other fields", () => {
  const person = {
    name: "Synthetic participant",
    bio: "",
    socials: [],
    avatarColor: "blue",
    avatarExpression: "squeezed",
  };
  const ordinary = renderToStaticMarkup(
    createElement(DiscoveryProfile, { person, onClose() {} }),
  );
  assert.doesNotMatch(ordinary, /Email is unavailable|backend package|@/);
  const staff = renderToStaticMarkup(
    createElement(DiscoveryProfile, {
      person,
      emailUnavailable: true,
      onClose() {},
    }),
  );
  assert.match(staff, /Email is unavailable from the backend/);
  assert.match(staff, /role="status"/);
  assert.doesNotMatch(staff, /mailto:|@/);
});
