import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setup, submission, attend, activate } from "./helpers";
import { PortalService } from "../lib/service";
import {
  publicProjectMembers,
  adminSubmissionMembers,
} from "../lib/project-member-profiles";
import {
  ParticipantProfiles,
  ProfileInfoButton,
  ProjectTeamMembers,
  SelectedProfileRequest,
  ProfileLookupError,
} from "../app/participant-profile-info";
import { AdminParticipants, AdminList, Projects, Review } from "../app/portal";
import DiscoveryProfile from "../app/discovery-profile";

const run = async () => ({});
const wrap = (
  children: ReturnType<typeof createElement>,
  actor = "fake_owner",
) =>
  createElement(ParticipantProfiles, {
    actorKey: actor,
    actorId: actor,
    returnTo: "/projects/synthetic",
    children,
  });
async function projectFixture() {
  const f = await setup();
  await activate(f.db);
  await attend(f.db, "fake_bob");
  const payload = JSON.stringify(submission);
  const sql = f.db.raw;
  sql
    .prepare(
      "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('info_project','fake_team3','synthetic-info',?,1,'2026-11-01T08:00:00Z')",
    )
    .run(payload);
  sql
    .prepare(
      "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES('info_v1','fake_team3',1,?,'2026-11-01T08:00:00Z')",
    )
    .run(payload);
  sql
    .prepare(
      "UPDATE projects SET published_version_id='info_v1' WHERE id='info_project'",
    )
    .run();
  sql
    .prepare(
      "INSERT INTO project_eligibility(project_id,version_id,status,reason,decided_by,updated_at) VALUES('info_project','info_v1','eligible','Synthetic approved project','fake_owner','2026-11-01T08:00:00Z')",
    )
    .run();
  sql
    .prepare(
      "UPDATE profiles SET bio='PRIVATE_BIO',socials='[]',public=0,gender='woman',gender_description='PRIVATE_DESCRIPTION' WHERE user_id='fake_bob'",
    )
    .run();
  sql
    .prepare(
      "UPDATE profile_details SET organization='PRIVATE_ORG',openai_org_id='org-private-synthetic',phone='+12025550123' WHERE user_id='fake_bob'",
    )
    .run();
  return f;
}

test("public project SSR member payload is allowlisted for anonymous, Viewer and admin; lists remain unchanged", async () => {
  const f = await projectFixture();
  try {
    const anonymous = new PortalService(f.db, null, undefined);
    for (const service of [
      anonymous,
      f.service("stranger"),
      f.service("owner"),
    ]) {
      const page: any = await service.view("/projects/synthetic-info");
      assert.equal(page.teamMembers.length, 3);
      assert.doesNotMatch(
        JSON.stringify(page),
        /PRIVATE_|org-private-synthetic|12025550123/,
      );
      for (const member of page.teamMembers)
        assert.deepEqual(
          Object.keys(member).sort(),
          ["id", "name", "avatarColor", "avatarExpression"].sort(),
        );
      assert.doesNotMatch(
        JSON.stringify(page.teamMembers),
        /PRIVATE_|org-private|12025550123|status|approval|email|phone|Checked in|Absent/,
      );
    }
    const list: any = await anonymous.view("/projects");
    assert.ok(!("teamMembers" in list));
    await assert.rejects(
      anonymous.view("/discover/participants", { person: "fake_bob" }),
      { code: "SIGN_IN_REQUIRED" },
    );
  } finally {
    f.db.close();
  }
});

test("admin submission detail shows every current member and authoritative personal statuses only to owner/admin", async () => {
  const f = await projectFixture();
  try {
    for (const [id, status] of [
      ["fake_bob", "Checked in"],
      ["fake_carol", "Going"],
      ["fake_dave", "Absent"],
    ])
      f.db.raw
        .prepare(
          "INSERT INTO participant_status_overrides(user_id,status,reason,actor_id,updated_at) VALUES(?,?,'Synthetic state','fake_owner','2026-11-01T08:00:00Z')",
        )
        .run(id, status);
    for (const who of ["owner", "admin"]) {
      const page: any = await f
        .service(who)
        .view("/admin/submissions/info_project");
      assert.deepEqual(
        page.teamMembers.map((r: any) => r.status).sort(),
        ["Absent", "Checked in", "Going"].sort(),
      );
      assert.ok(
        page.teamMembers.every(
          (r: any) => !("email" in r) && !("phone" in r) && !("details" in r),
        ),
      );
    }
    await assert.rejects(
      f.service("alice").view("/admin/submissions/info_project"),
      { code: "PROJECT_ASSIGNMENT_REQUIRED" },
    );

    f.db.raw
      .prepare(
        "INSERT INTO project_assignments(project_id,user_id,kind) VALUES('info_project','fake_judge','judge')",
      )
      .run();
    const judge = (await f
      .service("judge")
      .view("/review/info_project")) as any;
    assert.ok(!("teamMembers" in judge));
    const publicRows = await publicProjectMembers(f.db, "fake_team3");
    assert.ok(publicRows.every((row) => !("status" in row)));
  } finally {
    f.db.close();
  }
});

test("staff selected lookup includes existing incomplete accounts, while directory cards and ordinary audience stay constrained", async () => {
  const f = await setup();
  try {
    f.db.raw
      .prepare("DELETE FROM participant_profiles WHERE user_id='fake_bob'")
      .run();
    for (const who of ["owner", "admin"]) {
      const page: any = await f
        .service(who)
        .view("/discover/participants", { person: "fake_bob" });
      assert.equal(page.focusedPerson.id, "fake_bob");
      assert.ok(!page.items.some((r: any) => r.id === "fake_bob"));
    }
    const ordinary: any = await f
      .service("alice")
      .view("/discover/participants", { person: "fake_bob" });
    assert.equal(ordinary.focusedPerson, null);
    const viewer: any = await f
      .service("stranger")
      .view("/discover/participants", { person: "fake_bob" });
    assert.equal(viewer.focusedPerson, null);
  } finally {
    f.db.close();
  }
});

test("selected details preserve admin-only orgID, current-member phone and saved public gender with immediate role/member revocation", async () => {
  const f = await projectFixture();
  try {
    const read = async (who: string) =>
      (
        (await f
          .service(who)
          .view("/discover/participants", { person: "fake_bob" })) as any
      ).focusedPerson;
    assert.equal(
      (await read("admin")).details.openaiOrgId,
      "org-private-synthetic",
    );
    assert.deepEqual((await read("alice")).details, { gender: "woman" });
    assert.deepEqual((await read("stranger")).details, { gender: "woman" });
    assert.equal((await read("carol")).details.phone, "+12025550123");
    f.db.raw
      .prepare("DELETE FROM memberships WHERE user_id='fake_carol'")
      .run();
    assert.deepEqual((await read("carol")).details, { gender: "woman" });
    f.db.raw
      .prepare(
        "INSERT INTO portal_roles(user_id,role,granted_by,updated_at) VALUES('fake_admin','volunteer','fake_owner','2026-11-01T08:00:00Z') ON CONFLICT(user_id)DO UPDATE SET role='volunteer'",
      )
      .run();
    assert.deepEqual((await read("admin")).details, { gender: "woman" });
  } finally {
    f.db.close();
  }
});

test("public members re-read removal/roster gates; staff can inspect recoverable account but not terminally deleted profile", async () => {
  const f = await projectFixture();
  try {
    f.db.raw
      .prepare(
        "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at)VALUES('participant','fake_bob',1,'Synthetic removal','fake_owner','2026-11-01T08:00:00Z')",
      )
      .run();
    assert.ok(
      !(await publicProjectMembers(f.db, "fake_team3")).some(
        (r) => r.id === "fake_bob",
      ),
    );
    const staff: any = await f
      .service("owner")
      .view("/discover/participants", { person: "fake_bob" });
    assert.equal(staff.focusedPerson.id, "fake_bob");
    // Use the existing guarded command in this disposable in-memory fixture;
    // no terminal deletion implementation or live record is changed by this feature.
    await f.service("owner").command("admin-delete-participant", {
      userId: "fake_carol",
      expectedLeaderTeamIds: [],
      confirmation: "DELETE_PARTICIPANT",
    });
    assert.equal(
      (
        (await f
          .service("owner")
          .view("/discover/participants", { person: "fake_carol" })) as any
      ).focusedPerson,
      null,
    );
    assert.ok(
      !(await adminSubmissionMembers(f.db, "fake_team3")).some(
        (r) => r.id === "fake_carol",
      ),
    );
  } finally {
    f.db.close();
  }
});

test("info controls are labeled, omit idless rows and anonymous audiences get sign-in links without preload dialogs", () => {
  const child = createElement(
    "div",
    {},
    createElement(ProfileInfoButton, {
      personId: "synthetic-id",
      name: "Synthetic Person",
    }),
    createElement(ProfileInfoButton, { personId: null, name: "No account" }),
  );
  const anonymous = renderToStaticMarkup(wrap(child, ""));
  assert.match(anonymous, /Sign in to view Synthetic Person/);
  assert.match(anonymous, /\/signin\?returnTo=/);
  assert.doesNotMatch(anonymous, /No account|<dialog|org-/);
  const admin = renderToStaticMarkup(wrap(child));
  assert.match(admin, /View Synthetic Person/);
  assert.match(admin, /lucide-info/);
  assert.match(admin, /disabled=""/);
  assert.doesNotMatch(admin, /<dialog/);
});

test("all four requested surfaces include profile info controls and public rows never render private status", () => {
  const member = {
    id: "p1",
    name: "Synthetic Person",
    avatarColor: "orange",
    avatarExpression: "mixed-plus",
    status: "Absent",
  };
  const me = {
    id: "fake_owner",
    name: "Owner",
    email: "owner@portal.test",
    owner: true,
    role: "admin",
  };
  const roster = renderToStaticMarkup(
    wrap(
      createElement(AdminParticipants, {
        data: {
          me,
          items: [{ ...member, email: "person@portal.test", status: "Going" }],
        },
        run,
      }),
    ),
  );
  assert.match(roster, /View Synthetic Person/);
  const teams = renderToStaticMarkup(
    wrap(
      createElement(AdminList, {
        path: "/admin/teams",
        data: {
          me,
          items: [{ id: "t1", name: "Team", members: [member], readiness: {} }],
        },
        run,
      }),
    ),
  );
  assert.match(teams, /View Synthetic Person/);
  const review = renderToStaticMarkup(
    wrap(
      createElement(Review, {
        data: {
          me,
          project: {
            id: "project",
            teamName: "Team",
            draft: { projectName: "Synthetic Project" },
          },
          teamMembers: [member],
        },
        run,
      }),
    ),
  );
  assert.match(review, /Team members/);
  assert.match(review, /Absent/);
  assert.match(review, /View Synthetic Person/);
  const project = renderToStaticMarkup(
    wrap(
      createElement(Projects, {
        path: "/projects/synthetic",
        data: {
          items: [
            {
              id: "project",
              slug: "synthetic",
              projectName: "Synthetic Project",
            },
          ],
          teamMembers: [member],
        },
        run,
      }),
      "",
    ),
  );
  assert.match(project, /Sign in to view Synthetic Person/);
  assert.doesNotMatch(project, /Absent/);
});

test("empty optional team/member details create no empty UI; loading/failure dialog contains no raw person fields", () => {
  assert.equal(
    renderToStaticMarkup(createElement(ProjectTeamMembers, { members: [] })),
    "",
  );
  const person = {
    name: "Synthetic Person",
    bio: "",
    socials: [],
    avatarColor: "grey",
    avatarExpression: "neutral",
  };
  const pending = renderToStaticMarkup(
    createElement(DiscoveryProfile, { person, pending: true, onClose() {} }),
  );
  assert.match(pending, /aria-busy="true"/);
  assert.match(pending, /Loading profile/);
  assert.doesNotMatch(pending, /OpenAI organization ID|Social links/);
  const failed = renderToStaticMarkup(
    createElement(DiscoveryProfile, {
      person,
      error: "Connection failed",
      onRetry() {},
      onClose() {},
    }),
  );
  assert.match(failed, /role="alert"/);
  assert.match(failed, />Retry<\/button>/);
});

test("selected profile request makes exactly one no-store, same-origin request and uses returned allowlist only", async () => {
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      focusedPerson: {
        id: "p1",
        name: "Synthetic Person",
        bio: "",
        socials: [],
        email: "PRIVATE_EMAIL",
        details: { gender: "woman", phone: "PRIVATE_PHONE" },
      },
    });
  };
  try {
    const result = await new SelectedProfileRequest().read("p1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(calls[0].options.credentials, "same-origin");
    assert.equal(
      new URL(calls[0].url, "http://local.test").searchParams.get("person"),
      "p1",
    );
    assert.equal(
      new URL(calls[0].url, "http://local.test").searchParams.get("limit"),
      "1",
    );
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
  } finally {
    globalThis.fetch = original;
  }
});

test("account/target cancellation rejects stale private response even when transport ignores abort", async () => {
  const original = globalThis.fetch;
  const resolvers: ((r: Response) => void)[] = [];
  globalThis.fetch = () => new Promise<Response>((r) => resolvers.push(r));
  try {
    const request = new SelectedProfileRequest();
    const first = request.read("p1");
    const second = request.read("p2");
    resolvers[0](
      Response.json({ focusedPerson: { id: "p1", name: "PRIVATE_STALE" } }),
    );
    await assert.rejects(first, { name: "AbortError" });
    resolvers[1](
      Response.json({
        focusedPerson: { id: "p2", name: "Current", socials: [] },
      }),
    );
    assert.equal((await second).name, "Current");
    const closed = request.read("p3");
    request.cancel();
    resolvers[2](
      Response.json({ focusedPerson: { id: "p3", name: "PRIVATE_CLOSED" } }),
    );
    await assert.rejects(closed, { name: "AbortError" });
  } finally {
    globalThis.fetch = original;
  }
});

test("real authorization errors and mismatched/not-found profiles remain actionable; retry is a fresh request", async () => {
  const original = globalThis.fetch;
  let count = 0;
  try {
    globalThis.fetch = async () => {
      count++;
      return Response.json({ message: "Denied" }, { status: 401 });
    };
    await assert.rejects(
      new SelectedProfileRequest().read("p1"),
      (e: unknown) =>
        e instanceof ProfileLookupError &&
        e.status === 401 &&
        /Sign in/.test(e.message),
    );
    globalThis.fetch = async () => {
      count++;
      return Response.json({
        focusedPerson: { id: "another", name: "PRIVATE_WRONG" },
      });
    };
    await assert.rejects(
      new SelectedProfileRequest().read("p1"),
      (e: unknown) => e instanceof ProfileLookupError && e.status === 404,
    );
    assert.equal(count, 2);
  } finally {
    globalThis.fetch = original;
  }
});
