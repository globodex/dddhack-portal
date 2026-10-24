import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard, Submission, TeamWorkspace } from "../app/portal";

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
          published_version_id: "synthetic_version2",
          draft: {
            projectName: "Actual synthetic project",
            description: "Actual permitted description",
          },
        },
        projectStats: { upvotes: 12 },
        attempts: [3, 2, 1].map((attempt) => ({
          id: `synthetic_version${attempt}`,
          attempt,
          created_at: `2026-11-01T0${attempt}:30:00.000Z`,
        })),
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
  assert.equal((html.match(/<details class="committed-submission"/g) || []).length, 3);
  assert.equal((html.match(/class="committed-submission-current"/g) || []).length, 1);
  assert.match(html, /Submission 2<span class="committed-submission-current">Current/);
  assert.match(html, /dateTime="2026-11-01T03:30:00.000Z"/);
  assert.doesNotMatch(html, /Actual permitted description|dashboard-project-card|Versions 3\/3/);
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
  const privateVenue = {
    location: "SERVER-PRIVATE-ARRIVAL",
    directions: "Server-controlled directions",
    mapUrl: "javascript:alert(1)",
  };
  const html = renderToStaticMarkup(
    createElement(TeamWorkspace, {
      run,
      data: {
        me,
        team,
        members,
        privateVenue,
      },
    }),
  );
  assert.equal((html.match(/aria-label="[^"]+ avatar"/g) || []).length, 2);
  assert.equal((html.match(/team badge/g) || []).length, 1);
  assert.doesNotMatch(html, /person-monogram|initials avatar|href="javascript/);
  assert.doesNotMatch(html, /SERVER-PRIVATE-ARRIVAL/);
  const dashboard = renderToStaticMarkup(createElement(Dashboard, { run, data: { me, team, members, privateVenue } }));
  assert.match(dashboard, /SERVER-PRIVATE-ARRIVAL/);
  assert.match(dashboard, /Server-controlled directions/);
  assert.doesNotMatch(dashboard, /href="javascript/);
  assert.match(html, /aria-label="Synthetic Leader on GitHub"/);
  assert.doesNotMatch(html, /Remove .* from team|Rename team|Save team idea/);
});

test("focused project editor has a real button exit without duplicate history actions", () => {
  for (const exitLabel of ["Back to your project", "Back to Team"]) {
    const html = renderToStaticMarkup(
      createElement(Submission, {
        data: {
          me,
          team,
          submissionAccess: { canRead: true, canCommit: true, attemptsUsed: 1 },
        },
        run,
        onExit: () => {},
        exitLabel,
      }),
    );
    assert.match(
      html,
      new RegExp(
        `<button type="button" class="submission-back" aria-label="${exitLabel}"`,
      ),
    );
    assert.doesNotMatch(
      html,
      /submission-history-actions|View committed history|href="\/dashboard#project"/,
    );
    assert.match(html, /Step 1 of 3/);
  }
});

test("nonleader retains authorized read access to an unpublished saved draft", () => {
  const data = {
    me: { ...me, id: "synthetic_member" },
    team,
    members: [],
    project: {
      revision: 1,
      draft: {
        projectName: "Saved team draft",
        problemSolution: "A shared read-only summary",
        description: "Existing unpublished work remains readable to the team.",
        github: "https://github.com/example/existing-draft",
      },
    },
    submissionAccess: { canRead: true, canCommit: false, attemptsUsed: 0 },
  };
  const html = renderToStaticMarkup(createElement(Dashboard, { data, run }));
  assert.match(html, /name="projectName"[^>]*value="Saved team draft"/);
  assert.match(html, /A shared read-only summary/);
  assert.match(
    html,
    /Existing unpublished work remains readable to the team\./,
  );
  assert.match(html, /https:\/\/github\.com\/example\/existing-draft/);
  assert.match(html, /<fieldset disabled="">/);
  assert.doesNotMatch(html, /Update project|Save draft|>Submit</);
  const denied = renderToStaticMarkup(
    createElement(Dashboard, {
      data: { ...data, submissionAccess: { canRead: false, canCommit: false } },
      run,
    }),
  );
  assert.doesNotMatch(
    denied,
    /Saved team draft|A shared read-only summary|existing-draft/,
  );
});
