import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminParticipants } from "../app/portal";
const participant = {
  id: "synthetic-review",
  email: "review@portal.test",
  name: "Synthetic Review",
  status: "Going",
  approval: "approved",
  teamId: "synthetic-team",
  teamName: "Synthetic Team",
  teamLocked: true,
  teamStatus: "Locked",
};
const render = (status: string, role = "admin", owner = false) =>
  renderToStaticMarkup(
    createElement(AdminParticipants, {
      data: {
        me: {
          id: "synthetic-staff",
          name: "Synthetic Staff",
          email: "staff@portal.test",
          role,
          owner,
        },
        checkInConfigured: true,
        items: [{ ...participant, status }],
      },
      run: async () => {
        throw new Error("Rendering cannot mutate");
      },
    }),
  );
test("row quick check-in is limited to Going participants and retains manual status controls", () => {
  const going = render("Going");
  assert.match(going, /aria-label="Check in Synthetic Review"/);
  assert.match(going, /Change Synthetic Review status/);
  assert.doesNotMatch(
    render("Registered"),
    /aria-label="Check in Synthetic Review"/,
  );
  assert.doesNotMatch(
    render("Absent"),
    /aria-label="Check in Synthetic Review"/,
  );
  const checked = render("Checked in");
  assert.doesNotMatch(checked, /aria-label="Check in Synthetic Review"/);
  assert.match(checked, /lucide-check/);
});
test("existing volunteer check-in does not expose manual participant administration", () => {
  const html = render("Going", "volunteer");
  assert.match(html, /aria-label="Check in Synthetic Review"/);
  assert.doesNotMatch(html, /Change Synthetic Review status|Add participants/);
});
test("empty roster has one concise recovery action and no selection toolbar", () => {
  const html = renderToStaticMarkup(
    createElement(AdminParticipants, {
      data: {
        me: {
          id: "synthetic-staff",
          name: "Synthetic Staff",
          email: "staff@portal.test",
          role: "admin",
          owner: false,
        },
        items: [],
      },
      run: async () => ({}),
    }),
  );
  assert.match(html, /No matches/);
  assert.equal((html.match(/>Clear filters<\/button>/g) || []).length, 1);
  assert.doesNotMatch(
    html,
    /Selected participants|No participants match your filters|Choose a page/,
  );
});
