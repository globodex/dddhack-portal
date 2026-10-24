import { test } from "node:test";
import assert from "node:assert/strict";
import { portalErrorText, portalSuccessText } from "../lib/ui-feedback";

test("known permission errors are actionable and specific server explanations stay intact", () => {
  assert.match(portalErrorText({ code: "APPROVAL_REQUIRED", message: "APPROVAL_REQUIRED" }), /approval/);
  assert.equal(portalErrorText({ code: "TEAM_FULL", message: "This team changed. Refresh before joining." }), "This team changed. Refresh before joining.");
  assert.equal(portalErrorText({ code: "UNRECOGNIZED_ACTIONABLE_CODE" }), "UNRECOGNIZED_ACTIONABLE_CODE");
});
test("known success toasts are concise while unknown receipt messages remain available", () => {
  assert.equal(portalSuccessText("review-project", "Private review saved. Additional backend policy prose."), "Review saved.");
  assert.equal(portalSuccessText("submit-project", "Submission 2 of 3 committed."), "Submission 2 of 3 committed.");
});
