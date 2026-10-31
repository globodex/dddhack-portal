import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Portal, {
  AdminParticipants,
  AdminList,
  Review,
  Settings,
  Projects,
  adminParticipantProjection,
  adminProjectProjection,
  portalTargetName,
  portalConfirmationFor,
  privateReviewValues,
} from "../app/portal";
import { filterAdminParticipants } from "../app/admin-participant-actions";
import AdminImportDialog from "../app/admin-import-dialog";
const run = async () => {
  throw new Error("Static render must not mutate");
};
const admin = {
  id: "fixture-admin",
  name: "Admin",
  email: "admin@example.invalid",
  role: "admin",
  owner: false,
  mode: "staff",
  canEngage: true,
};
const participant = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  email: `${id}@example.invalid`,
  status: "Registered",
  team_id: `team-${id}`,
  team_name: `Team ${id}`,
  teamLocked: true,
  teamStatus: "Locked",
  teamLockedAt: "2026-10-25T10:00:00Z",
  approval: "pending",
  canDeleteParticipant: true,
  teamReadiness: { total: 2, approved: 1 },
  ...extra,
});
const html = (component: any, props: any) =>
  renderToStaticMarkup(createElement(component, props));
const versions = [
  { id: "fixture-v1", attempt: 1, deleted_at: null },
  { id: "fixture-v2", attempt: 2, deleted_at: "2026-11-01T12:00:00Z" },
];
const project = {
  id: "fixture-project",
  slug: "fixture",
  projectName: "Fixture Project",
  teamName: "Fixture Team",
  team_id: "fixture-team",
  status: "Submitted",
  versions,
  draft: { projectName: "Fixture Project", description: "Fixture body" },
};
test("team management mounts named crown transfer with explicit old and new leaders", () => {
  const data = {
    me: { ...admin, mode: "staff" as const },
    items: [
      {
        id: "locked-team",
        name: "Locked Team",
        leader_id: "old-leader",
        locked: true,
        members: [
          { id: "old-leader", name: "Absent Leader" },
          { id: "new-leader", name: "Present Teammate" },
        ],
      },
    ],
  };
  const markup = html(AdminList, { data, path: "/admin/teams", run });
  assert.match(markup, /Make Present Teammate team leader for Locked Team/);
  assert.doesNotMatch(markup, /Make Absent Leader team leader/);
  const values = {
    teamId: "locked-team",
    userId: "new-leader",
    expectedLeaderId: "old-leader",
  };
  const confirmation = portalConfirmationFor(
    "transfer-team-leader",
    values,
    portalTargetName(data, values),
  );
  assert.equal(
    confirmation.target,
    "Locked Team · Absent Leader → Present Teammate",
  );
  assert.equal(confirmation.confirmLabel, "Transfer crown");
  assert.equal(confirmation.critical, true);
});
test("admin row adapter preserves server removal metadata and composes Registered/Locked defaults with earliest lock ordering", () => {
  const projected = [
    participant("later"),
    participant("earlier", { teamLockedAt: "2026-10-24T10:00:00Z" }),
    participant("forming", { teamLocked: false, teamStatus: "Forming" }),
    participant("going", { status: "Going" }),
  ].map(adminParticipantProjection);
  const selected = filterAdminParticipants(projected);
  assert.deepEqual(
    selected.map((row) => row.id),
    ["earlier", "later"],
  );
  assert.equal(selected[0].teamId, "team-earlier");
  assert.equal(selected[0].teamName, "Team earlier");
  assert.equal(
    adminParticipantProjection(
      participant("removed", { deactivated_at: "2026-10-23T10:00:00Z" }),
    ).removed,
    true,
  );
  assert.equal(
    adminParticipantProjection({ email: "unsigned@example.invalid" }).id,
    "",
  );
});
test("participant admin page wires reviewed imports and only individual removal, excluding removed records by default", () => {
  const markup = html(AdminParticipants, {
    data: {
      me: admin,
      items: [
        participant("active"),
        participant("removed", { deactivated_at: "2026-10-23T10:00:00Z" }),
      ],
    },
    run,
  });
  for (const text of [
    "Filter participants",
    "Participation record",
    '<option value="removed">Removed</option>',
    "Delete participant",
    "active@example.invalid",
    "Export filtered participants (1)",
  ])
    assert.ok(markup.includes(text), text);
  assert.doesNotMatch(
    markup,
    /removed@example.invalid|Preview registered emails|Bulk delete|Delete selected/,
  );
  assert.match(markup, /Add participants/);
  assert.match(markup, /Locked at/);
  assert.match(markup, /admin-team-identity/);
  const dialogMarkup = html(AdminImportDialog, { run, close: () => {} });
  for (const mode of ["Single email", "Email list", "CSV"])
    assert.ok(dialogMarkup.includes(mode));
  assert.match(dialogMarkup, /aria-label="Close add participants"/);

  assert.doesNotMatch(markup, /Exports all|CSV export includes/);
  const volunteer = html(AdminParticipants, {
    data: {
      me: { ...admin, role: "volunteer" },
      lookupOnly: true,
      items: [participant("active")],
    },
    run,
  });
  assert.doesNotMatch(
    volunteer,
    /Add-only import|Remove participant|Manage participant|Individual approval status/,
  );
  assert.doesNotMatch(volunteer, /class="bulk-bar"/);
});
test("project adapter uses supplied exact version IDs and removed metadata without synthesizing attempts", () => {
  const values = adminProjectProjection({
    ...project,
    deleted_at: "2026-11-01T12:00:00Z",
    versions: [...versions, { attempt: 3 }],
  });
  assert.equal(values.project.removed, true);
  assert.deepEqual(values.versions, [
    { id: "fixture-v1", label: "Version 1", removed: false },
    { id: "fixture-v2", label: "Version 2", removed: true },
  ]);
  assert.deepEqual(
    adminProjectProjection({ id: "draft", draft: { projectName: "Draft" } })
      .versions,
    [],
  );
});
test("project list management is restricted to admin/owner and kept outside review links", () => {
  const management = html(AdminList, {
    data: { me: admin, items: [project] },
    path: "/admin/submissions",
    run,
  });
  assert.match(management, /Remove|Restore/);
  assert.match(management, /Fixture Project/);
  assert.doesNotMatch(management, /name="reason"/);
  assert.doesNotMatch(management, /<a[^>]*>[\s\S]*<form[\s\S]*<\/a>/);
  const reviewer = html(AdminList, {
    data: { me: { ...admin, role: "judge" }, items: [project] },
    path: "/review",
    run,
  });
  assert.doesNotMatch(
    reviewer,
    /Project and submission management|Review removal|Review restoration/,
  );
});
test("review detail wires project management for staff while mentor duties stay feedback-only", () => {
  const data = {
    me: admin,
    project,
    version: { id: versions[0].id, attempt: 1, payload: project.draft },
    versions,
    eligibility: { status: "needs_review" },
    reviewKind: "admin",
  };
  const markup = html(Review, { data, run });
  assert.match(markup, /Manage project/);
  assert.match(markup, /Score \(1 to 10\)/);
  assert.equal((markup.match(/type="radio" name="rating"/g) || []).length, 10);
  for (let score = 1; score <= 10; score++)
    assert.ok(markup.includes(`name="rating" value="${score}"`));
  assert.match(markup, /Not configured[\s\S]*?disabled=""/);
  assert.match(markup, /aria-label="Back"/);
  assert.doesNotMatch(
    markup,
    /Final judging rubric|Assign a reviewer|role="tablist"/,
  );
  const mentor = html(Review, {
    data: {
      ...data,
      me: { ...admin, role: "mentor" },
      reviewKind: "mentor",
      canRestoreEligibility: false,
    },
    run,
  });
  assert.doesNotMatch(
    mentor,
    /Project and submission management|name="rating"|AI evaluation/,
  );
  assert.match(mentor, /Private advice/);
});
test("private review accepts score-only or feedback-only for admins/judges and requires mentor text", () => {
  const form = new FormData();
  form.set("rating", "7");
  assert.deepEqual(
    privateReviewValues(form, "admin", project.id, versions[0].id),
    { projectId: project.id, versionId: versions[0].id, rating: 7 },
  );
  assert.throws(
    () => privateReviewValues(form, "mentor", project.id, versions[0].id),
    /written feedback/,
  );
  form.set("rating", "0");
  assert.throws(
    () => privateReviewValues(form, "judge", project.id, versions[0].id),
    /1 to 10/,
  );
  form.delete("rating");
  form.set("body", "Useful written feedback");
  assert.equal(
    privateReviewValues(form, "judge", project.id, versions[0].id).body,
    "Useful written feedback",
  );
  assert.throws(
    () => privateReviewValues(form, "admin", project.id, undefined),
    /committed version/,
  );
});
test("confirmation targets distinguish duplicate names, project versions, window times and global engagement scope", () => {
  const data = {
    items: [
      participant("same-one", { name: "Alex" }),
      participant("same-two", { name: "Alex" }),
    ],
    project,
    versions,
  };
  assert.match(
    portalTargetName(data, { userId: "same-two" }),
    /Alex · same-two@example.invalid · ID same-two/,
  );
  const target = portalTargetName(data, {
    projectId: project.id,
    versionId: versions[1].id,
    scope: "submission",
  });
  assert.match(
    target,
    /Fixture Project · ID fixture-project · Version 2 \(ID fixture-v2\)/,
  );
  assert.doesNotMatch(target, /Public agenda/);
  assert.match(
    portalTargetName(data, {
      open: "2026-11-01T02:30:00Z",
      close: "2026-11-01T10:30:00Z",
    }),
    /8:00 am IST.*4:00 pm IST/,
  );
  const change = portalConfirmationFor(
    "engagement-control",
    { votingPaused: true, feedbackPaused: false },
    portalTargetName(data, {
      votingPaused: true,
      feedbackPaused: false,
      version: 4,
    }),
  );
  assert.equal(change.critical, true);
  assert.match(change.target, /All projects.*version 4/);
  assert.match(
    change.description,
    /Voting will be paused; public feedback will be open/,
  );
  assert.match(change.description, /frozen scores remain unchanged/);
});
test("owner window editor replaces extension-only settings and engagement controls are versioned staff-only", () => {
  const data = {
    me: { ...admin, owner: true },
    policy: {
      submissionOpen: "2026-11-01T02:30:00Z",
      submissionClose: "2026-11-01T10:30:00Z",
      weights: {},
    },
    policyVersion: 3,
    engagement: { votingPaused: true, feedbackPaused: false, version: 2 },
  };
  const markup = html(Settings, { data, run });
  assert.match(markup, /Submission window/);
  assert.match(markup, /2026-11-01T08:00/);
  assert.match(markup, /2026-11-01T16:00/);
  assert.match(markup, /Opens \(IST\)/);
  assert.match(markup, /Closes \(IST\)/);
  assert.match(markup, /Three committed submissions/);
  assert.match(markup, />Publish<\/button>/);
  assert.doesNotMatch(markup, /name="votingEnabled"/);
  assert.doesNotMatch(markup, /name="votingEnabled" checked=""/);
  assert.match(markup, /name="feedbackEnabled" checked=""/);
  assert.match(markup, /Reveal AI scores[\s\S]*?<button[^>]*disabled=""/);
  assert.doesNotMatch(
    markup,
    /Extend submission deadline|Additional whole minutes/,
  );
  const nonOwner = html(Settings, { data: { ...data, me: admin }, run });
  assert.doesNotMatch(nonOwner, /admin-window-footer/);
  assert.doesNotMatch(nonOwner, /name="votingEnabled"/);
  assert.doesNotMatch(nonOwner, /Admin access/);
  assert.doesNotMatch(markup, /name="feedbackEnabled"|name="votingEnabled"/);
  assert.match(markup, /Voting opens and closes with participant submissions/);
});
test("public project engagement is read-only when server flags or per-row capabilities deny it, with no private score leaks", () => {
  const row = {
    ...project,
    projectName: "Fixture",
    upvotes: 4,
    comments: 1,
    canUpvote: false,
    canComment: false,
    engagementPaused: true,
    privateScore: 99,
  };
  const data = {
    me: admin,
    items: [row],
    engagement: { votingPaused: true, feedbackPaused: true, version: 2 },
    comments: [
      {
        id: "comment",
        author: "A",
        body: "Existing public text",
        created_at: "2026-11-01T12:00:00Z",
        rating: 98,
      },
    ],
  };
  const paused = html(Projects, { data, path: "/projects/fixture", run });
  assert.match(paused, /Engagement paused/);
  assert.match(paused, /Existing public text/);
  assert.doesNotMatch(paused, /Post comment|99|98|name="rating"/);
  const open = html(Projects, {
    data: {
      ...data,
      items: [
        { ...row, canComment: true, canUpvote: true, engagementPaused: false },
      ],
      engagement: { votingPaused: false, feedbackPaused: false, version: 3 },
    },
    path: "/projects/fixture",
    run,
  });
  assert.match(open, /Post comment/);
});
test("public Home retains the shared navigation and private administration does not leak into it", () => {
  const markup = html(Portal, {
    path: "/",
    initialPublic: { content: undefined },
  });
  assert.match(markup, /class="navigation-header"/);
  assert.match(markup, /aria-label="Open navigation"/);
  assert.doesNotMatch(
    markup,
    /Remove participant|Project and submission management|Submission window|Pause community voting/,
  );
});

test("admin credit overview renders metadata counts rather than bogus submission links", () => {
  const markup = html(AdminList, {
    data: {
      me: admin,
      items: [
        {
          id: "fake-credit",
          name: "Builder credit",
          active: 1,
          total: 10,
          inventory: 10,
          assigned: 3,
          available: 7,
          waiting: 0,
          exhausted: false,
        },
      ],
    },
    path: "/admin/credits",
    run,
  });
  assert.match(markup, /Credits/);
  assert.match(markup, /Builder credit/);
  assert.match(markup, /Total/);
  assert.match(markup, /Assigned/);
  assert.match(markup, /Available/);
  assert.match(markup, /Waiting/);
  assert.match(markup, /list=credits/);
  assert.doesNotMatch(
    markup,
    /Untitled draft|submissions\/undefined|Submission status|Reveal|ciphertext/,
  );
});

test("confirmation for a new named entity never borrows an existing unaddressed record", () => {
  const data = {
    items: [{ id: "existing", name: "Existing team" }],
    me: {
      id: "actor",
      name: "Actor",
      email: "actor@portal.test",
      role: "participant",
      owner: false,
    },
  };
  assert.equal(
    portalTargetName(data, { name: "New synthetic team" }),
    "New synthetic team",
  );
  assert.equal(
    portalTargetName(data, { project: { projectName: "New project" } }),
    "New project",
  );
  assert.equal(portalTargetName(data, { targetId: "unknown" }), "unknown");
  assert.match(
    portalTargetName(
      {
        items: [
          {
            id: "team",
            members: [
              {
                id: "member",
                name: "Exact member",
                email: "member@portal.test",
              },
            ],
          },
        ],
      },
      { userId: "member" },
    ),
    /^Exact member · member@portal\.test · ID member$/,
  );
});
