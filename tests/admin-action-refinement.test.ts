import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminParticipants } from "../app/portal";
import { PublishedCreditBatches } from "../app/admin-credit-batches";
import AdminTeamCard from "../app/admin-team-card";
import { requiresActionConfirmation } from "../lib/action-confirmation";

const run = async () => {
  throw new Error("Rendering must not mutate");
};
function participant(status: string, role = "admin", viewer = false) {
  return renderToStaticMarkup(
    createElement(AdminParticipants, {
      data: {
        me: {
          id: "fake_staff",
          name: "Staff",
          email: "staff@portal.test",
          role,
          owner: false,
        },
        checkInConfigured: true,
        items: [
          {
            id: "fake_person",
            name: "Synthetic Person",
            email: "person@portal.test",
            status,
            viewer,
            registered: !viewer,
            approval: status === "Going" ? "approved" : "pending",
          },
        ],
      },
      run,
    }),
  );
}
test("Going status stands alone and primary UserCheck action precedes admin menu", () => {
  const html = participant("Going");
  const statusCell = html.match(
    /<td class="admin-personal-status-cell">([\s\S]*?)<\/td>/,
  )?.[1];
  assert.ok(statusCell);
  assert.doesNotMatch(statusCell, /Check in|<button/);
  const actions =
    html.match(/<td class="admin-manage-cell"[\s\S]*?<\/td>/)?.[0] || "";
  assert.match(actions, /class="button admin-quick-check-in"/);
  assert.match(actions, /lucide-user-check/);
  assert.ok(
    actions.indexOf('aria-label="Check in Synthetic Person"') <
      actions.indexOf('aria-label="Change Synthetic Person status"'),
  );
  assert.equal(requiresActionConfirmation("quick-check-in"), false);
  assert.equal(requiresActionConfirmation("bulk-check-in"), true);
});
test("volunteers retain their separate action cell without admin menu; ineligible rows have no quick action", () => {
  const html = participant("Going", "volunteer");
  assert.match(html, /<td class="admin-manage-cell"/);
  assert.match(html, /aria-label="Check in Synthetic Person"/);
  assert.doesNotMatch(html, /Change Synthetic Person status/);
  for (const status of ["Registered", "Absent", "Checked in"])
    assert.doesNotMatch(
      participant(status),
      /aria-label="Check in Synthetic Person"/,
    );
  assert.doesNotMatch(
    participant("Not registered", "admin", true),
    /Check in Synthetic Person|Change Synthetic Person status/,
  );
});
test("column trash is icon-only and retains its exact accessible name and tooltip; batch delete keeps text", () => {
  const html = renderToStaticMarkup(
    createElement(PublishedCreditBatches, {
      batches: [
        {
          id: "fake_batch",
          createdAt: "2026-10-24T08:00:00.000Z",
          columns: [
            {
              id: "fake_column",
              typeId: "fake_type",
              heading: "Synthetic credits",
              instructions: "Synthetic only",
              inventory: 3,
              assigned: 0,
            },
          ],
        },
      ],
      run,
    }),
  );
  const button = html.match(
    /<button[^>]*aria-label="Delete column: Synthetic credits"[^>]*>([\s\S]*?)<\/button>/,
  );
  assert.ok(button);
  assert.equal(button[1].replace(/<[^>]+>/g, "").trim(), "");
  assert.match(button[0], /title="Delete column: Synthetic credits"/);
  assert.match(html, />Delete batch<\/button>/);
});
test("team header has sibling disclosure and menu controls and preserves literal team names", () => {
  for (const name of ["null", "Volunteer", "New"]) {
    const html = renderToStaticMarkup(
      createElement(AdminTeamCard, {
        name,
        avatar: createElement("span", {}, "Avatar"),
        caption: "Forming",
        menu: createElement("button", { type: "button" }, "Menu"),
        defaultOpen: false,
        children: createElement("p", {}, "Members"),
      }),
    );
    assert.match(html, new RegExp(`<strong>${name}<\\/strong>`));
    assert.match(html, /aria-expanded="false"/);
    assert.match(
      html,
      /<\/button><div class="admin-team-card-menu"[^>]*><button/,
    );
    assert.doesNotMatch(html, /<summary/);
  }
});
