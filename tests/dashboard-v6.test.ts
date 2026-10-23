import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard, TeamWorkspace } from "../app/portal";

const run = async () => ({});
const me = {
  id: "synthetic_leader",
  name: "Synthetic Leader",
  email: "leader@example.invalid",
  role: "participant",
  owner: false,
  canParticipate: true,
};
const team = {
  id: "synthetic_team",
  name: "Synthetic Builders",
  leader_id: me.id,
  locked: true,
};

test("Dashboard tab panels keep default Team visible and published project mutations fail closed after three attempts", () => {
  const html = renderToStaticMarkup(
    createElement(Dashboard, {
      run,
      data: {
        me,
        team,
        members: [],
        individualStatus: "Checked in",
        project: {
          slug: "synthetic-project",
          published_version_id: "synthetic_version",
          draft: {
            projectName: "Actual synthetic project",
            description: "Actual permitted description",
          },
        },
        projectStats: { upvotes: 12 },
        submissionAccess: {
          canRead: true,
          canCommit: false,
          attemptsUsed: 3,
          locked: true,
        },
        eligibility: { status: "eligible" },
      },
    }),
  );
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="dashboard-tab-team"[^>]+aria-selected="true"/);
  assert.match(html, /id="credits"[^>]+hidden=""/);
  assert.match(html, /id="project"[^>]+hidden=""/);
  assert.match(html, /Versions 3\/3/);
  assert.match(html, /aria-label="12 upvotes"/);
  assert.match(html, /href="\/projects\/synthetic-project"/);
  assert.doesNotMatch(
    html,
    /Update project|Commit submission|Save draft|aria-label="Upvote/,
  );
  assert.doesNotMatch(html, /Your arrival details/);
});

test("Team rows show one expression avatar each, keep initials only on the team badge and take arrival details only from safe server data", () => {
  const members = [
    {
      id: me.id,
      name: me.name,
      role: "leader",
      avatarColor: "purple",
      avatarExpression: "plus",
      socials: ["https://github.com/synthetic-builder"],
    },
    {
      id: "synthetic_member",
      name: "Synthetic Member",
      role: "member",
      avatarColor: "orange",
      avatarExpression: "sleepy",
      socials: [],
    },
  ];
  const html = renderToStaticMarkup(
    createElement(TeamWorkspace, {
      run,
      data: {
        me,
        team,
        members,
        privateVenue: {
          location: "SERVER-PRIVATE-ARRIVAL",
          directions: "Server-controlled directions",
          mapUrl: "javascript:alert(1)",
        },
      },
    }),
  );
  assert.equal((html.match(/aria-label="[^"]+ avatar"/g) || []).length, 2);
  assert.equal((html.match(/team badge/g) || []).length, 1);
  assert.doesNotMatch(html, /person-monogram|initials avatar|href="javascript/);
  assert.match(html, /SERVER-PRIVATE-ARRIVAL/);
  assert.match(html, /Server-controlled directions/);
  assert.match(html, /aria-label="Synthetic Leader on GitHub"/);
  assert.doesNotMatch(html, /Remove .* from team|Rename team|Save team idea/);
});
