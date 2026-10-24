import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConfirmationDialog from "../app/confirmation-dialog";
import { ConfirmationGate, confirmationFor, requiresActionConfirmation, revealConfirmation } from "../lib/action-confirmation";
import { portalSuccessText } from "../lib/ui-feedback";

test("submission confirmations show the committed attempt and correct remaining count", () => {
  for (const [used, expected] of [
    [0, "You’ll have 2 submissions left."],
    [1, "You’ll have 1 submission left."],
    [2, "No submissions left after this."],
  ] as const) {
    const value = confirmationFor("submit-project", { attemptsUsed: used }, "Synthetic project");
    assert.equal(value.badge, `Commit submission ${used + 1}/3`);
    assert.equal(value.description, expected);
    assert.equal(value.note, used === 2 ? "The project will be read-only." : undefined);
    const html = renderToStaticMarkup(createElement(ConfirmationDialog, { value, decide() {} }));
    assert.match(html, /id="confirmation-badge"/);
    assert.match(html, /data-tone="positive"/);
    assert.match(html, /confirmation-target confirmation-badge confirmation-description/);
    assert.doesNotMatch(html, /Draft saves|consumes one attempt|Eligible entries/);
  }
});

test("team admin confirmations retain exact identity and backend confirmation tokens", () => {
  const add = confirmationFor("admin-add-team-member", { email: "new@portal.test" }, "Team A");
  assert.equal(add.target, "new@portal.test → Team A");
  assert.match(add.description, /access.*private/);
  assert.equal(revealConfirmation("admin-add-team-member", {}), "ADD_TEAM_MEMBER");
  const rename = confirmationFor("admin-rename-team", { expectedName: "Team A", name: "Team B" }, "Team A");
  assert.equal(rename.target, "Team A → Team B");
  assert.equal(revealConfirmation("admin-rename-team", {}), "RENAME_TEAM");
});

test("concise copy retains irreversible reveal and credit deletion consequences", () => {
  for (const action of ["reveal-ai-scores", "reveal-final-scores", "unveil-winner"]) {
    assert.match(confirmationFor(action, { position: 1 }, "Synthetic target").description, /cannot be undone/);
  }
  const deletion = confirmationFor("delete-credit-column", {}, "Synthetic category");
  assert.match(deletion.description, /inventory.*recipient mappings/);
  assert.match(deletion.description, /cannot be recalled/);
  assert.equal(deletion.tone, "danger");
  assert.equal(requiresActionConfirmation("quick-check-in"), false);
  assert.equal(requiresActionConfirmation("complete-profile"), false);
  assert.equal(requiresActionConfirmation("bulk-check-in"), true);
  assert.equal(portalSuccessText("submit-project", "Old server copy"), "Project submitted successfully.");
});

test("confirmation captures the initiating control before pending rendering changes focus", async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
  const opener = { id: "synthetic-delete-credit-opener" } as HTMLElement;
  const syntheticDocument = { activeElement: opener };
  Object.defineProperty(globalThis, "document", { configurable: true, value: syntheticDocument });
  try {
    const gate = new ConfirmationGate(() => { syntheticDocument.activeElement = {} as HTMLElement; });
    const pending = gate.ask(confirmationFor("delete-credit-column", {}, "Synthetic category"));
    assert.equal(gate.pending!.opener, opener);
    gate.decide(false);
    assert.equal(await pending, false);
  } finally {
    if (prior) Object.defineProperty(globalThis, "document", prior);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
