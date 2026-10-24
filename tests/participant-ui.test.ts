import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Portal, {
  Credit,
  Dashboard,
  Discover,
  ProjectHistory,
  ProjectVersion,
  Submission,
  TeamWorkspace,
  UpvoteButton,
  UpvoteController,
  safeExternalUrl,
  safeProfileUrl,
  portalConfirmationFor,
} from "../app/portal";
import ProfileFlow, { profileInitialLinks } from "../app/profile-flow";
const run = async () => ({});
const me = {
  id: "fixture-leader",
  name: "Alex",
  email: "alex@example.invalid",
  role: "participant",
  owner: false,
  mode: "participant",
  canParticipate: true,
  canEngage: true,
};
const team = {
  id: "fixture-team",
  name: "Small Wonder",
  leader_id: me.id,
  locked: false,
  palette: "forest",
};
const member = {
  id: me.id,
  name: "Alex",
  role: "leader",
  avatarColor: "purple",
  avatarExpression: "mixed-slash",
  status: "Checked in",
  socials: ["https://github.com/fixture"],
  phone: "+12025550101",
  whatsappUrl: "https://wa.me/12025550101",
  profileUrl: "/discover/participants#person-fixture-leader",
};
const markup = (component: any, props: any) =>
  renderToStaticMarkup(createElement(component, props));
test("profile starts a three-step flow with authenticated email and eight approved symbolic avatar choices", () => {
  const html = markup(ProfileFlow, {
    data: {
      me,
      profile: {
        bio: "Builds useful tools",
        best_description: "Host supplied prefill",
      },
    },
    run,
  });
  assert.match(html, /Step 1 of 3/);
  assert.match(html, /readOnly=""/);
  assert.match(html, /alex@example.invalid/);
  assert.match(html, /<input[^>]*required=""[^>]*name="bio"/);
  assert.equal((html.match(/name="avatarColor"/g) || []).length, 8);
  assert.equal((html.match(/name="avatarExpression"/g) || []).length, 8);
  assert.doesNotMatch(html, /type="file"|Profile picture|Review profile/);
});
test("Dashboard consolidates Team, Credits and Project and keeps upvotes read-only and private feedback separate", () => {
  const html = markup(Dashboard, {
    data: {
      me,
      team,
      members: [member],
      idea: { title: "Useful tool", description: "A short idea" },
      projectStats: {
        upvotes: 7,
        result: { stage: "final", score: 82, rank: 2 },
      },
      feedback: [
        {
          id: "feedback",
          body: "Private review note",
          author: "Mentor",
          kind: "advice",
          created_at: "2026-11-01T12:00:00Z",
        },
      ],
      submissionAccess: { canRead: false, message: "Check-in pending" },
    },
    run,
  });
  for (const id of ["team", "credits", "project"])
    assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /7 upvotes/);
  assert.match(html, /82 final/);
  assert.match(html, /Rank 2/);
  assert.match(html, /Private team feedback/);
  assert.match(html, /Private review note/);
  assert.doesNotMatch(
    html,
    /aria-label="Upvote|href="\/submission"|>Submissions</,
  );
});
test("team idea is capped, saved before lock and uses safe teammate profiles, symbolic avatars and supplied phone links", () => {
  const html = markup(TeamWorkspace, {
    data: {
      me,
      team,
      members: [member],
      idea: { title: "Useful tool", description: "A short idea" },
    },
    run,
  });
  assert.match(html, /maxLength="500"/);
  assert.match(html, /12\/500/);
  assert.doesNotMatch(html, /name="core"|person-monogram/);
  assert.match(html, /href="\/discover\/participants#person-fixture-leader"/);
  assert.match(html, /purple mixed-slash avatar/);
  assert.match(html, /href="https:\/\/wa.me\/12025550101"/);
  assert.match(html, /Delete team/);
  assert.doesNotMatch(
    markup(TeamWorkspace, {
      data: {
        me,
        team,
        members: [member, { ...member, id: "other", role: "member" }],
      },
      run,
    }),
    /Delete team/,
  );
  assert.doesNotMatch(
    markup(TeamWorkspace, {
      data: { me, team: { ...team, locked: true }, members: [member] },
      run,
    }),
    /Rename team|Delete team|Lock team|>Remove</,
  );
});
test("viewer discovery and dashboard remain read-only without forcing profile completion", () => {
  const viewer = {
    ...me,
    mode: "viewer",
    role: "viewer",
    canParticipate: false,
    canEngage: false,
  };
  const participant = {
    ...member,
    teamName: "Small Wonder",
    bio: "Visible bio",
  };
  const html = markup(Discover, {
    path: "/discover/participants",
    data: { me: viewer, profileIncomplete: true, items: [participant] },
    run,
  });
  assert.match(html, /In a team/);
  assert.match(html, /Not in a team/);
  assert.match(html, /Visible bio/);
  assert.doesNotMatch(html, /12025550101|Create team|Request to join/);
  const shell = markup(Portal, {
    path: "/discover/participants",
    initialPublic: {
      me: viewer,
      profileIncomplete: true,
      items: [participant],
    },
  });
  assert.match(shell, /Discover/);
  assert.doesNotMatch(shell, /Signed-in community directory/);
  assert.doesNotMatch(shell, /Full name|Your profile/);
  assert.doesNotMatch(
    markup(Dashboard, { data: { me: viewer }, run }),
    /Start your team|Your profile|Save draft/,
  );
});
test("project mutation controls fail closed unless server grants canCommit to this leader, with history available after edit close", () => {
  const base = {
    me,
    team,
    members: [member],
    project: { revision: 1, draft: { projectName: "Fixture project" } },
    submissionAccess: {
      canRead: true,
      canAccess: true,
      canCommit: false,
      locked: false,
      attemptsUsed: 1,
    },
  };
  const blocked = markup(Submission, { data: base, run });
  assert.match(blocked, /<fieldset disabled="">/);
  assert.match(blocked, /View committed history/);
  assert.match(blocked, /leader’s personal check-in/);
  const allowed = markup(Submission, {
    data: {
      ...base,
      submissionAccess: { ...base.submissionAccess, canCommit: true },
    },
    run,
  });
  assert.match(allowed, /data-readonly="false"/);
  assert.match(allowed, /<form[^>]*method="post"/);
  assert.match(allowed, /<form[^>]*inert=""/);
  const other = markup(Submission, {
    data: {
      ...base,
      me: { ...me, id: "other" },
      submissionAccess: { ...base.submissionAccess, canCommit: true },
    },
    run,
  });
  assert.match(other, /<fieldset disabled="">/);
  assert.match(other, /data-readonly="true"/);
  assert.equal(markup(ProjectHistory, { canRead: false }), "");
  assert.match(
    markup(ProjectHistory, { canRead: true }),
    /View committed history/,
  );
});
test("credit allocations start masked and never expose secret fields from the projection", () => {
  const html = markup(Credit, {
    credit: {
      type_id: "fixture-credit",
      name: "Fixture allocation",
      allocated: true,
      value: "SYNTHETIC-PRIVATE-CODE",
      instructions:
        "## Steps\nUse **only your own** allocation.\n[unsafe](javascript:alert(1))",
    },
  });
  assert.match(html, /Allocation hidden/);
  assert.match(html, /Reveal my allocation/);
  assert.match(html, /Copy/);
  assert.doesNotMatch(html, /SYNTHETIC-PRIVATE-CODE|href="javascript/);
});
test("showcase votes use server capabilities and persistent pressed state without a downvote action", () => {
  const project = {
    id: "fixture-project",
    projectName: "Fixture",
    upvotes: 4,
    canUpvote: true,
    upvoted: false,
  };
  assert.match(
    markup(UpvoteButton, { project, canEngage: false, run }),
    /disabled=""/,
  );
  assert.match(
    markup(UpvoteButton, {
      project: { ...project, canUpvote: undefined },
      canEngage: true,
      run,
    }),
    /disabled=""/,
  );
  assert.doesNotMatch(
    markup(UpvoteButton, { project, canEngage: true, run }),
    /disabled=""/,
  );
  const voted = markup(UpvoteButton, {
    project: { ...project, upvoted: true },
    canEngage: true,
    run,
  });
  assert.match(voted, /aria-pressed="true"/);
  assert.match(voted, /disabled=""/);
});
test("vote controller permits one pending action, rolls back rejection and can retry after failure", async () => {
  const controller = new UpvoteController();
  let count = 4,
    calls = 0,
    finish!: () => void;
  const pending = controller.commit(
    true,
    async () => {
      calls++;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    () => {
      count++;
    },
    () => {
      count--;
    },
  );
  assert.equal(count, 5);
  assert.equal(
    await controller.commit(
      true,
      async () => {
        calls++;
      },
      () => {
        count++;
      },
      () => {
        count--;
      },
    ),
    false,
  );
  finish();
  assert.equal(await pending, true);
  assert.equal(calls, 1);
  assert.equal(controller.pending, false);
  await assert.rejects(
    controller.commit(
      true,
      async () => {
        throw new Error("Vote rejected");
      },
      () => {
        count++;
      },
      () => {
        count--;
      },
    ),
    /Vote rejected/,
  );
  assert.equal(count, 5);
  assert.equal(controller.pending, false);
  assert.equal(
    await controller.commit(
      false,
      async () => {
        calls++;
      },
      () => {
        count++;
      },
      () => {
        count--;
      },
    ),
    false,
  );
  assert.equal(
    await controller.commit(
      true,
      async () => {
        calls++;
      },
      () => {
        count++;
      },
      () => {
        count--;
      },
    ),
    true,
  );
  assert.equal(count, 6);
});
test("profile and external links are constrained; immutable version view renders explicit project fields only", () => {
  assert.equal(
    safeProfileUrl("/discover/participants#person-fixture-leader"),
    "/discover/participants#person-fixture-leader",
  );
  for (const bad of [
    "//evil.invalid",
    "javascript:alert(1)",
    "/profile?userId=other",
    "https://evil.invalid",
    "/discover/participants#person-\nother",
  ])
    assert.equal(safeProfileUrl(bad), undefined);
  for (const bad of [
    "javascript:alert(1)",
    "http://example.invalid",
    "https://user:password@example.invalid",
    "/private",
  ])
    assert.equal(safeExternalUrl(bad), undefined);
  const html = markup(ProjectVersion, {
    payload: {
      projectName: "Fixture version",
      description: "Saved description",
      github: "javascript:alert(1)",
      report: "HIDDEN-REPORT",
      rating: 99,
      evaluation: "HIDDEN-EVALUATION",
    },
  });
  assert.match(html, /Fixture version/);
  assert.match(html, /Saved description/);
  assert.doesNotMatch(html, /HIDDEN|99|javascript/);
});

test("destructive and publishing confirmations identify exact scope and preserve policy/history", () => {
  const deletion = portalConfirmationFor("delete-own-team", {}, "Small Wonder");
  assert.equal(deletion.critical, true);
  assert.match(deletion.description, /sole-member/);
  const removal = portalConfirmationFor(
    "participant-deactivate",
    {},
    "Alex · alex@example.invalid",
  );
  assert.equal(removal.target, "Alex · alex@example.invalid");
  assert.match(removal.description, /Imports cannot restore/);
  const version = portalConfirmationFor(
    "project-soft-delete",
    { scope: "submission", versionId: "fixture-version" },
    "Fixture · fixture-version",
  );
  assert.equal(version.title, "Remove selected submission");
  assert.match(version.description, /does not automatically expose/);
  assert.match(
    portalConfirmationFor("publish-submission-window", {}, "Previewed times")
      .description,
    /real portal settings/,
  );
  assert.equal(
    portalConfirmationFor("commit-import", { newCount: 2 }, "Previewed roster")
      .description,
    "",
  );
  assert.equal(
    portalConfirmationFor("commit-import", { newCount: 2 }, "Previewed roster")
      .target,
    "2 participants",
  );
});

test("explicit sex and typed social prefills are preserved for review without inventing selections", () => {
  const data = {
    me,
    profile: {
      gender: "woman",
      gender_prefilled: true,
      socialLinks: [
        { type: "GitHub", url: "https://github.com/fixture-prefill" },
        { type: "Website", url: "https://fixture.invalid" },
      ],
      socials: ["https://github.com/fixture-existing"],
    },
  };
  assert.match(
    markup(ProfileFlow, { data, run }),
    /name="sex" checked="" value="woman"/,
  );
  assert.doesNotMatch(
    markup(ProfileFlow, {
      data: { ...data, profile: { ...data.profile, gender_prefilled: false } },
      run,
    }),
    /name="sex" checked=""/,
  );
  const links = profileInitialLinks(data.profile);
  assert.equal(links.initialLinks.GitHub, "https://github.com/fixture-prefill");
  assert.equal(links.initialLinks.Website, "https://fixture.invalid");
  assert.deepEqual(links.extras, ["https://github.com/fixture-existing"]);
});
