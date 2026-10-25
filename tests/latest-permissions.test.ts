import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, attend, submission } from "./helpers";
import { one, rows } from "../lib/db";
import { PortalExperience } from "../lib/experience";
import { personStatus, teamStatus } from "../lib/portal-status";
import { PortalService } from "../lib/service";
import { publicProjectImage } from "../lib/public-project-image";
const project = {
  projectName: submission.projectName,
  problemSolution: submission.problemSolution,
  description: submission.description,
  github: submission.github,
  commitSha: submission.commitSha,
  demo: "",
  logo: submission.logo,
  banner: submission.banner,
  tools: "Codex",
  contributions: submission.contributions,
  attestation: true,
};
const asRow = (v: unknown) => v as Record<string, any>;
async function eligible(s: PortalService, id: string, version: string) {
  await s.db
    .prepare(
      "INSERT INTO project_eligibility VALUES(?,?,'eligible','Synthetic organizer approval','fake_admin',?) ON CONFLICT(project_id) DO UPDATE SET version_id=excluded.version_id,status=excluded.status",
    )
    .bind(id, version, s.now())
    .all();
}
test("leader must personally check in for drafts/commits while a teammate can unlock read-only project/history", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    clock("2026-11-01T04:00:00.000Z");
    await attend(db, "fake_carol");
    const state = asRow(await service("bob").view("/dashboard"));
    assert.equal(state.submissionAccess.canRead, true);
    assert.equal(state.submissionAccess.canCommit, false);
    assert.equal(state.teamStatus, "Forming"); // A checked-in teammate does not lock or approve the team.
    for (const action of ["save-project", "submit-project"])
      await assert.rejects(
        service("bob").command(action, {
          revision: 0,
          project: {
            ...project,
            contributions: ["fake_bob", "fake_carol", "fake_dave"].map(
              (userId) => ({ userId, role: "Builder", codex: "Tests" }),
            ),
          },
        }),
        { code: "LEADER_CHECKIN_REQUIRED" },
      );
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      0,
    );
    await attend(db, "fake_bob");
    await service("bob").command("submit-project", {
      revision: 0,
      project: {
        ...project,
        contributions: ["fake_bob", "fake_carol", "fake_dave"].map(
          (userId) => ({ userId, role: "Builder", codex: "Tests" }),
        ),
      },
    });
    await assert.rejects(
      service("carol").command("submit-project", { revision: 1, project }),
      { code: "LEADER_REQUIRED" },
    );
    clock("2026-11-02T04:00:00.000Z");
    assert.equal(
      asRow(await service("carol").view("/project-history")).items.length,
      1,
    );
    assert.equal(
      (await teamStatus(service(), "fake_team3")).status,
      "Submitted",
    );
  } finally {
    db.close();
  }
});
test("own project votes require personal check-in; other project votes have no check-in/time window or global quota and stay idempotent", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    clock("2026-11-01T04:00:00.000Z");
    await attend(db, "fake_alice");
    const commit = await service().command("submit-project", {
      revision: 0,
      project,
    });
    await eligible(
      service(),
      String(commit.projectId),
      String(commit.versionId),
    );
    await service("admin").command("admin-status", {
      kind: "person",
      targetId: "fake_alice",
      status: "Going",
      reason: "Synthetic correction",
      confirmation: "CHANGE_STATUS",
    });
    await assert.rejects(
      service().command("upvote-project", { projectId: commit.projectId }),
      { code: "OWN_PROJECT_CHECKIN_REQUIRED" },
    );
    const own = asRow(await service().view("/projects"));
    assert.equal(own.items[0].canUpvote, false);
    await assert.rejects(
      db
        .prepare("INSERT INTO project_upvotes VALUES(?,'fake_alice',?)")
        .bind(commit.projectId, service().now())
        .all(),
      /OWN_PROJECT_CHECKIN_REQUIRED/,
    );
    // Bob never checked in; voting for another team's project remains allowed after event.
    clock("2026-11-03T04:00:00.000Z");
    await Promise.all(
      Array.from({ length: 8 }, () =>
        service("bob").command("upvote-project", {
          projectId: commit.projectId,
        }),
      ),
    );
    assert.equal((await rows(db, "SELECT * FROM project_upvotes")).length, 1);
    assert.equal(
      asRow(await service("bob").view("/projects")).items[0].upvoted,
      true,
    );
    await assert.rejects(
      service("stranger").command("upvote-project", {
        projectId: commit.projectId,
      }),
      { code: "VIEWER_READ_ONLY" },
    );
  } finally {
    db.close();
  }
});
test("sole unlocked leader can recoverably remove own team; locked/multiple-member and committed-history teams cannot self-delete", async () => {
  const { db, service } = await setup();
  try {
    await assert.rejects(
      service("bob").command("delete-own-team", {
        reason: "Leave synthetic team",
        confirmation: "DELETE_OWN_TEAM",
      }),
      { code: "SOLE_MEMBER_REQUIRED" },
    );
    await assert.rejects(
      service().command("delete-own-team", {
        reason: "Cancel target",
        confirmation: "WRONG",
      }),
    );
    assert.ok(await service().team("fake_alice"));
    await service().command("delete-own-team", {
      reason: "Leave synthetic team",
      confirmation: "DELETE_OWN_TEAM",
    });
    assert.equal(await service().team("fake_alice"), undefined);
    assert.ok(await one(db, "SELECT id FROM teams WHERE id='fake_team1'"));
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM record_removals WHERE kind='team' AND active=1",
        )
      ).length,
      1,
    );
    assert.equal(
      asRow(await service().view("/discover/teams")).items.some(
        (t: any) => t.id === "fake_team1",
      ),
      false,
    );
    await service().command("create-workspace-team", {
      name: "New synthetic team",
      bio: "",
      avatar: "initials",
      palette: "forest",
    });
    assert.ok(await service().team("fake_alice"));
  } finally {
    db.close();
  }
});
test("absence reconciles lazily once at midnight IST, preserving Registered/ever-attended and respecting later manual corrections", async () => {
  const { db, service, clock } = await setup();
  try {
    await attend(db, "fake_alice");
    clock("2026-11-01T18:29:59.999Z");
    await service().actor();
    assert.equal((await personStatus(service(), "fake_bob")).status, "Going");
    clock("2026-11-01T18:30:00.000Z");
    await Promise.all([service().actor(), service("bob").actor()]);
    assert.equal((await personStatus(service(), "fake_bob")).status, "Absent");
    assert.equal(
      (await personStatus(service(), "fake_pending")).status,
      "Registered",
    );
    assert.equal(
      (await personStatus(service(), "fake_alice")).status,
      "Checked in",
    );
    const count = (
      await rows(
        db,
        "SELECT * FROM audit_logs WHERE action='automatic-absence'",
      )
    ).length;
    await service().actor();
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM audit_logs WHERE action='automatic-absence'",
        )
      ).length,
      count,
    );
    clock("2026-11-01T18:31:00.000Z");
    await service("admin").command("admin-status", {
      kind: "person",
      targetId: "fake_bob",
      status: "Going",
      reason: "Organizer corrected absence",
      confirmation: "CHANGE_STATUS",
    });
    await service("bob").actor();
    assert.equal((await personStatus(service(), "fake_bob")).status, "Going");
  } finally {
    db.close();
  }
});
test("single participant deactivation revokes stale-session capabilities and imports cannot restore; protected owners/leaders are blocked", async () => {
  const { db, service } = await setup();
  try {
    const p = {
      userId: "fake_carol",
      reason: "Synthetic single removal",
      confirmation: "REMOVE_PARTICIPANT",
    };
    await assert.rejects(
      service("alice").command("participant-deactivate", p),
      { code: "ADMIN_REQUIRED" },
    );
    await assert.rejects(
      service("admin").command("participant-deactivate", {
        ...p,
        userIds: ["fake_carol"],
      }),
    );
    await assert.rejects(
      service("admin").command("participant-deactivate", {
        ...p,
        userId: "fake_bob",
      }),
      { code: "TEAM_LEADER_REQUIRES_TRANSFER" },
    );
    await db
      .prepare(
        "UPDATE users SET email='connectwithparam.30@gmail.com' WHERE id='fake_owner'",
      )
      .all();
    await assert.rejects(
      service("admin").command("participant-deactivate", {
        ...p,
        userId: "fake_owner",
      }),
      { code: "PROTECTED_ACCOUNT" },
    );
    const before = await one(
      db,
      "SELECT * FROM profiles WHERE user_id='fake_carol'",
    );
    await service("admin").command("participant-deactivate", p);
    await service("admin").command("participant-deactivate", p);
    assert.equal((await service("carol").actor()).canEngage, false);
    await assert.rejects(service("carol").view("/dashboard"), {
      code: "PARTICIPANT_REMOVED",
    });
    await assert.rejects(
      service("carol").command("save-workspace-idea", {
        title: "x",
        description: "y",
      }),
      { code: "VIEWER_READ_ONLY" },
    );
    assert.equal(
      asRow(await service("alice").view("/discover/participants")).items.some(
        (x: any) => x.id === "fake_carol",
      ),
      false,
    );
    const csv = "email\ncarol@portal.test",
      preview = await service("admin").command("preview-import", {
        kind: "roster",
        csv,
      });
    await service("admin").command("commit-import", {
      kind: "roster",
      csv,
      digest: preview.digest,
    });
    assert.equal((await service("carol").actor()).deactivated, true);
    await service("admin").command("participant-restore", {
      ...p,
      confirmation: "RESTORE_PARTICIPANT",
    });
    assert.equal((await service("carol").actor()).deactivated, false);
    assert.deepEqual(
      await one(db, "SELECT * FROM profiles WHERE user_id='fake_carol'"),
      before,
    );
  } finally {
    db.close();
  }
});
test("project/version soft removal suppresses public APIs and images without resetting attempts or falling back to old versions", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    clock("2026-11-01T04:00:00.000Z");
    await attend(db, "fake_alice");
    let commit = await service().command("submit-project", {
      revision: 0,
      project,
    });
    await eligible(
      service(),
      String(commit.projectId),
      String(commit.versionId),
    );
    const first = commit.versionId;
    commit = await service().command("submit-project", {
      revision: 1,
      project: { ...project, projectName: "Second" },
    });
    await eligible(
      service(),
      String(commit.projectId),
      String(commit.versionId),
    );
    const data = {
      projectId: commit.projectId,
      scope: "submission",
      versionId: commit.versionId,
      reason: "Synthetic removal",
      confirmation: "REMOVE_SUBMISSION",
    };
    await service("admin").command("project-soft-delete", data);
    assert.equal(asRow(await service().view("/projects")).items.length, 0);
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      2,
    );
    await assert.rejects(
      publicProjectImage(db, String(commit.projectId), "logo", String(first)),
      { code: "IMAGE_NOT_FOUND" },
    );
    await assert.rejects(
      publicProjectImage(
        db,
        String(commit.projectId),
        "logo",
        String(commit.versionId),
      ),
      { code: "IMAGE_NOT_FOUND" },
    );
    assert.equal(
      asRow(await service().view("/project-history")).items.length,
      2,
    );
    await service("admin").command("project-restore", {
      ...data,
      confirmation: "RESTORE_SUBMISSION",
    });
    assert.equal(
      asRow(await service().view("/projects")).items[0].projectName,
      "Second",
    );
    assert.equal(
      (
        await publicProjectImage(
          db,
          String(commit.projectId),
          "logo",
          String(commit.versionId),
        )
      ).headers.get("cache-control"),
      "private, no-store",
    );
  } finally {
    db.close();
  }
});
test("owner previews both real submission dates with version-bound confirmation, leaving fixed repository cutoff and attempts intact", async () => {
  const { db, service } = await setup();
  try {
    const request = {
      open: "2026-10-24T02:30:00.000Z",
      close: "2026-10-24T10:30:00.000Z",
    };
    await assert.rejects(
      service("admin").command("preview-submission-window", request),
      { code: "OWNER_REQUIRED" },
    );
    await assert.rejects(
      service("owner").command("preview-submission-window", {
        ...request,
        close: request.open,
      }),
      { code: "INVALID_SUBMISSION_WINDOW" },
    );
    const preview = await service("owner").command(
      "preview-submission-window",
      request,
    );
    assert.match(String(preview.openIST), /8:00 am IST/);
    assert.match(JSON.stringify(preview.warnings), /Repository creation/);
    assert.notEqual(
      (await service().settings()).policy.submissionOpen,
      request.open,
    );
    await service("owner").command("publish-submission-window", {
      ...request,
      token: preview.token,
      version: preview.version,
      reason: "Synthetic real-window test",
      confirmation: "CHANGE_SUBMISSION_WINDOW",
    });
    assert.equal(
      (await service().settings()).policy.submissionOpen,
      request.open,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM event_policy_history")).length,
      1,
    );
    await assert.rejects(
      service("owner").command("publish-submission-window", {
        ...request,
        token: preview.token,
        version: preview.version,
        reason: "Synthetic stale retry",
        confirmation: "CHANGE_SUBMISSION_WINDOW",
      }),
      { code: "POLICY_PREVIEW_CONFIRMATION_REQUIRED" },
    );
  } finally {
    db.close();
  }
});
test("pasted/single emails and explicitly mapped full CSV imports are add-only, previewed and prefill only new profiles", async () => {
  const { db, service } = await setup();
  try {
    const csv =
      "Mail,Name,Sex,Phone,Organization,Link\nnew@portal.test,New Builder,Female,+919876543210,Example,https://example.com\nalice@portal.test,Overwrite,Male,+919876543211,Overwrite,https://other.example";
    const map = {
      email: "Mail",
      displayName: "Name",
      sex: "Sex",
      phone: "Phone",
      organization: "Organization",
      website: "Link",
    };
    const needs = await service("admin").command("preview-import", {
      kind: "roster",
      csv,
    });
    assert.equal(asRow(needs.counts).invalid, 1);
    assert.deepEqual(needs.headers, [
      "Mail",
      "Name",
      "Sex",
      "Phone",
      "Organization",
      "Link",
    ]);
    const before = await one(
      db,
      "SELECT * FROM profiles WHERE user_id='fake_alice'",
    );
    const preview = await service("admin").command("preview-import", {
      kind: "roster",
      csv,
      fieldMap: map,
    });
    await service("admin").command("commit-import", {
      kind: "roster",
      csv,
      fieldMap: map,
      digest: preview.digest,
    });
    assert.deepEqual(
      await one(db, "SELECT * FROM profiles WHERE user_id='fake_alice'"),
      before,
    );
    assert.equal((await rows(db, "SELECT * FROM roster_prefills")).length, 1);
    const user = new PortalService(
      db,
      {
        id: "new",
        email: "new@portal.test",
        name: "Auth name",
        source: "local-test",
      },
      undefined,
    );
    const profile = asRow((await user.view("/profile")).profile);
    assert.equal(profile.display_name, "New Builder");
    assert.equal(profile.phone, "+919876543210");
    assert.equal(profile.complete, false);
    const single = "extra@portal.test";
    const p = await service("admin").command("preview-import", {
      kind: "roster",
      csv: single,
    });
    await service("admin").command("commit-import", {
      kind: "roster",
      csv: single,
      digest: p.digest,
    });
    assert.ok(
      await one(db, "SELECT email FROM luma_roster WHERE email=?", single),
    );
    const paste = "x@portal.test; Y@portal.test\nx@portal.test";
    const p2 = await service("admin").command("preview-import", {
      kind: "roster",
      csv: paste,
    });
    assert.equal(asRow(p2.counts).duplicates, 1);
    assert.equal(asRow(p2.counts).new, 2);
  } finally {
    db.close();
  }
});

test("profile imports stop supplying defaults after first save, preserve explicit clears, and accept only exact imported category", async () => {
  const { db, service } = await setup();
  try {
    const csv =
        "Email,Name,Category,Website\nfresh@portal.test,Fresh Builder,Host supplied category,https://imported.example",
      fieldMap = {
        email: "Email",
        displayName: "Name",
        bestDescription: "Category",
        website: "Website",
      };
    const preview = await service("admin").command("preview-import", {
      kind: "roster",
      csv,
      fieldMap,
    });
    await service("admin").command("commit-import", {
      kind: "roster",
      csv,
      fieldMap,
      digest: preview.digest,
    });
    const user = new PortalService(
      db,
      {
        id: "fresh",
        email: "fresh@portal.test",
        name: "Fresh Auth",
        source: "local-test",
      },
      undefined,
    );
    await user.command("complete-profile", {
      displayName: "Edited Name",
      gender: "non-binary",
      bio: "Fresh bio",
      phone: "+919876543210",
      bestDescription: "Host supplied category",
      organization: "",
      openaiOrgId: "",
      socialLinks: [{ type: "Website", url: "https://edited.example" }],
    });
    let p = asRow((await user.view("/profile")).profile);
    assert.equal(p.best_description, "Host supplied category");
    assert.deepEqual(p.socialLinks, []);
    assert.deepEqual(p.socials, ["https://edited.example"]);
    await user.command("complete-profile", {
      displayName: "Edited Name",
      gender: "non-binary",
      bio: "Fresh bio",
      phone: "+919876543210",
      bestDescription: "",
      organization: "",
      openaiOrgId: "",
      socialLinks: [],
    });
    p = asRow((await user.view("/profile")).profile);
    assert.equal(p.best_description, "");
    assert.deepEqual(p.socials, []);
    assert.deepEqual(p.socialLinks, []);
  } finally {
    db.close();
  }
});
test("in-flight mutation cannot persist after single participant deactivation commits", async () => {
  const { db, service } = await setup();
  try {
    const carol = service("carol"),
      original = carol.mutate.bind(carol);
    let reached!: () => void, resume!: () => void;
    const ready = new Promise<void>((r) => (reached = r)),
      gate = new Promise<void>((r) => (resume = r));
    carol.mutate = async (...args) => {
      reached();
      await gate;
      return original(...args);
    };
    const pending = carol.command("complete-profile", {
      displayName: "Carol",
      gender: "non-binary",
      bio: "Must never persist after removal",
      phone: "+12025550100",
    });
    await ready;
    await service("admin").command("participant-deactivate", {
      userId: "fake_carol",
      reason: "Synthetic revocation race",
      confirmation: "REMOVE_PARTICIPANT",
    });
    resume();
    await assert.rejects(pending, /CHECK|PARTICIPANT_REMOVED/);
    assert.notEqual(
      (
        await one<{ bio: string }>(
          db,
          "SELECT bio FROM profiles WHERE user_id='fake_carol'",
        )
      )?.bio,
      "Must never persist after removal",
    );
  } finally {
    db.close();
  }
});
test("approved never-login registrants become Absent without inventing a user and retain this state at first sign-in", async () => {
  const { db, service, clock } = await setup();
  try {
    await db
      .prepare(
        "INSERT INTO registrations(email,status) VALUES('never@portal.test','approved')",
      )
      .all();
    clock("2026-11-01T18:30:00.000Z");
    const list = asRow(await service("admin").view("/admin/participants"));
    assert.equal(
      list.items.find((x: any) => x.email === "never@portal.test").status,
      "Absent",
    );
    assert.equal(
      await one(db, "SELECT id FROM users WHERE email='never@portal.test'"),
      undefined,
    );
    const user = new PortalService(
      db,
      {
        id: "never",
        email: "never@portal.test",
        name: "Never",
        source: "local-test",
      },
      undefined,
      () => "2026-11-02T04:00:00.000Z",
    );
    await user.actor();
    assert.equal((await personStatus(user, "never")).status, "Absent");
  } finally {
    db.close();
  }
});
test("admin engagement pause is versioned, backend enforced, and reopening preserves one vote per project", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    clock("2026-11-01T04:00:00.000Z");
    await attend(db, "fake_alice");
    const commit = await service().command("submit-project", {
      revision: 0,
      project,
    });
    await eligible(
      service(),
      String(commit.projectId),
      String(commit.versionId),
    );
    const pause = {
      votingPaused: true,
      feedbackPaused: true,
      version: 0,
      reason: "Synthetic pause",
      confirmation: "CHANGE_ENGAGEMENT",
    };
    await assert.rejects(service().command("engagement-control", pause), {
      code: "ADMIN_REQUIRED",
    });
    await service("admin").command("engagement-control", pause);
    for (const action of ["upvote-project", "comment-project"])
      await assert.rejects(
        service("bob").command(action, {
          projectId: commit.projectId,
          body: "This is a synthetic comment with enough characters.",
        }),
        { code: "ENGAGEMENT_PAUSED" },
      );
    let row = asRow(await service("bob").view("/projects")).items[0];
    assert.equal(row.canUpvote, false);
    assert.equal(row.canComment, false);
    await service("admin").command("engagement-control", {
      ...pause,
      votingPaused: false,
      feedbackPaused: false,
      version: 1,
    });
    await service("bob").command("upvote-project", {
      projectId: commit.projectId,
    });
    await service("bob").command("upvote-project", {
      projectId: commit.projectId,
    });
    assert.equal((await rows(db, "SELECT * FROM project_upvotes")).length, 1);
    await assert.rejects(
      service("bob").command("comment-project", {
        projectId: commit.projectId,
        body: "too short",
      }),
    );
    await service("bob").command("comment-project", {
      projectId: commit.projectId,
      body: "Any feedback longer than thirty characters.",
    });
  } finally {
    db.close();
  }
});

test("unreviewed removed projects do not block active scoring coverage and cannot be edited, while history remains", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    clock("2026-11-01T04:00:00.000Z");
    await attend(db, "fake_alice");
    const commit = await service().command("submit-project", {
      revision: 0,
      project,
    });
    await service("admin").command("project-soft-delete", {
      projectId: commit.projectId,
      scope: "project",
      reason: "Synthetic removed unreviewed project",
      confirmation: "REMOVE_PROJECT",
    });
    assert.deepEqual(await service("owner").compute(), []);
    assert.equal(
      asRow(await service().view("/dashboard")).submissionAccess.canCommit,
      false,
    );
    await assert.rejects(
      service().command("save-project", { revision: 1, project }),
      { code: "RECORD_REMOVED" },
    );
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      1,
    );
  } finally {
    db.close();
  }
});
