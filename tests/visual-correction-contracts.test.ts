import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { setup, activate, attend, submission } from "./helpers";
import { one, rows } from "../lib/db";
import { auditReason } from "../lib/security";
import { automaticAuditReason } from "../lib/audit-contract";
import {
  requiresActionConfirmation,
  revealConfirmation,
} from "../lib/action-confirmation";
import { Settings, Submission, portalConfirmationFor } from "../app/portal";
import {
  operationalSetupRequest,
  operationalSetupSave,
} from "../lib/operational-setup-contract";

test("only profile saves bypass confirmation; import asks for exact single/count without supporting prose", () => {
  assert.equal(requiresActionConfirmation("profile"), false);
  assert.equal(requiresActionConfirmation("complete-profile"), false);
  for (const action of [
    "logout",
    "add-admin",
    "content-save",
    "content-publish",
    "reveal-ai-scores",
    "freeze-results",
    "submit-project",
  ])
    assert.equal(requiresActionConfirmation(action), true);
  assert.equal(revealConfirmation("add-admin", {}), "ADD_ADMIN");
  for (const values of [
    { newCount: 3 },
    { newCount: 1, singleEmail: "one@example.test" },
  ]) {
    const c = portalConfirmationFor("commit-import", values, "ignored");
    assert.equal(c.description, "");
    assert.equal(c.target, values.singleEmail || "3 participants");
  }
});

test("ordinary missing/null/blank reasons become server audit text without changing authorization or stale/confirmation guards", async () => {
  for (const value of [undefined, null, "", " "])
    assert.equal(auditReason().parse(value), automaticAuditReason);
  const { db, service } = await setup();
  try {
    await service("owner").command("engagement-control", {
      votingPaused: false,
      feedbackPaused: false,
      version: 0,
      confirmation: "CHANGE_ENGAGEMENT",
    });
    const audit: any = await one(
      db,
      "SELECT * FROM audit_logs WHERE action='engagement-control'",
    );
    assert.equal(audit.actor_id, "fake_owner");
    assert.equal(audit.reason, automaticAuditReason);
    assert.ok(audit.created_at);
    await assert.rejects(
      service("alice").command("engagement-control", {
        votingPaused: false,
        feedbackPaused: false,
        version: 1,
        confirmation: "CHANGE_ENGAGEMENT",
      }),
      { code: "ADMIN_REQUIRED" },
    );
    await assert.rejects(
      service("owner").command("engagement-control", {
        votingPaused: false,
        feedbackPaused: false,
        version: 0,
        confirmation: "CHANGE_ENGAGEMENT",
      }),
      { code: "ENGAGEMENT_CHANGED_RELOAD" },
    );
    await assert.rejects(
      service("owner").command("engagement-control", {
        votingPaused: false,
        feedbackPaused: false,
        version: 1,
      }),
    );
    const request = operationalSetupRequest({
      version: 1,
      operation: "submissions",
      privacyConfirmed: true,
      rulesConfirmed: true,
    });
    assert.equal(request.reason, automaticAuditReason);
    const preview: any = await service("owner").command(
      "preview-operational-setup",
      request,
    );
    await service("owner").command(
      "save-operational-setup",
      operationalSetupSave(request, preview),
    );
    const settings: any = await service("owner").settings(true);
    assert.equal(settings.active, 0);
    assert.equal(
      settings.policy.confirmations.includes("privacyRetention"),
      true,
    );
  } finally {
    db.close();
  }
});

test("Add Admins is owner-only, email-only, current-account scoped and idempotent", async () => {
  const { db, service } = await setup();
  const payload = { email: " BOB@PORTAL.TEST ", confirmation: "ADD_ADMIN" };
  try {
    for (const name of ["admin", "alice", "stranger"])
      await assert.rejects(service(name).command("add-admin", payload));
    await assert.rejects(
      service("owner").command("add-admin", { ...payload, role: "owner" }),
    );
    await assert.rejects(
      service("owner").command("add-admin", {
        ...payload,
        confirmation: undefined,
      }),
    );
    await assert.rejects(
      service("owner").command("add-admin", {
        email: "unknown@portal.test",
        confirmation: "ADD_ADMIN",
      }),
      { code: "ACCOUNT_MUST_SIGN_IN_FIRST" },
    );
    await assert.rejects(
      service("owner").command("add-admin", {
        email: "owner@portal.test",
        confirmation: "ADD_ADMIN",
      }),
      { code: "OWNER_IDENTITY_IS_PLATFORM_MANAGED" },
    );
    await service("owner").command("add-admin", payload);
    assert.equal(
      (
        await one<any>(
          db,
          "SELECT * FROM portal_roles WHERE user_id=?",
          "fake_bob",
        )
      )?.role,
      "admin",
    );
    await service("owner").command("add-admin", payload);
    assert.equal(
      (await rows(db, "SELECT id FROM audit_logs WHERE action='add-admin'"))
        .length,
      1,
    );
    await db
      .prepare(
        "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) VALUES('participant','fake_eve',1,'synthetic','fake_owner','2026-10-23','{}')",
      )
      .all();
    await assert.rejects(
      service("owner").command("add-admin", {
        email: "eve@portal.test",
        confirmation: "ADD_ADMIN",
      }),
      { code: "PARTICIPANT_REMOVED" },
    );
    assert.equal(
      await one(db, "SELECT * FROM portal_roles WHERE user_id='fake_eve'"),
      undefined,
    );
  } finally {
    db.close();
  }
});

test("submission accepts no participant hash, keeps timing evidence separate and three-attempt enforcement", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice");
    clock("2026-11-01T03:00:00.000Z");
    const project: any = Object.fromEntries(
      [
        "projectName",
        "problemSolution",
        "description",
        "github",
        "demo",
        "logo",
        "banner",
        "tools",
        "contributions",
        "attestation",
      ].map((key) => [key, (submission as any)[key]]),
    );
    await service().command("submit-project", { revision: 0, project });
    const version: any = await one(
      db,
      "SELECT * FROM submission_versions WHERE team_id='fake_team1'",
    );
    assert.ok(version);
    assert.equal(JSON.parse(version.payload).commitSha, "");
    const html = renderToStaticMarkup(
      createElement(Submission, {
        data: {
          me: {
            id: "fake_alice",
            name: "Synthetic Alice",
            email: "alice@portal.test",
            role: "participant",
            owner: false,
            canParticipate: true,
          },
          team: { id: "fake_team1", leader_id: "fake_alice" },
          submissionAccess: { canRead: true, canCommit: true },
          members: [],
        },
        run: async () => ({}),
      }),
    );
    assert.doesNotMatch(
      html,
      /Submitted commit SHA|SHA256|pattern="\[a-fA-F0-9\]/,
    );
  } finally {
    db.close();
  }
});

test("settings keep private arrival editing capability-scoped without role selectors, reason inputs or rejected filler", async () => {
  const { db, service } = await setup();
  try {
    const data: any = await service("owner").view("/admin/settings");
    const html = renderToStaticMarkup(
      createElement(Settings, { data, run: async () => ({}) }),
    );
    assert.match(html, /Admin access/);
    assert.match(html, /type="email"/);
    assert.doesNotMatch(html, /name="role"/);
    assert.equal(data.canManageVenue, true);
    assert.match(html, /Private arrival details/);
    const adminData: any = await service("admin").view("/admin/settings");
    assert.equal(adminData.canManageVenue, false);
    assert.doesNotMatch(renderToStaticMarkup(createElement(Settings, { data: adminData, run: async () => ({}) })), /Private arrival details|Exact room or entry location|Private Google Maps URL/);
    assert.doesNotMatch(
      html,
      /name="reason"|Least-privilege roles|Private venue management|General venue|General Google Maps URL|public Luma page exposes/,
    );
    const source = readFileSync("app/portal.tsx", "utf8");
    for (const text of [
      "Find people and teams. Creating a team is optional.",
      "Signed-in community directory",
    ])
      assert.equal(source.includes(text), false);
    assert.equal(
      readFileSync("app/home.tsx", "utf8").includes(
        "One day. Many possibilities.",
      ),
      false,
    );
  } finally {
    db.close();
  }
});

test("admin addition racing participant removal rolls back and removed stored admins cannot read staff routes", async () => {
  const { db, service } = await setup();
  try {
    const owner = service("owner");
    const mutate = owner.mutate.bind(owner);
    let reached!: () => void, resume!: () => void;
    const paused = new Promise<void>((r) => (reached = r)),
      continued = new Promise<void>((r) => (resume = r));
    owner.mutate = async (...args: Parameters<typeof owner.mutate>) => {
      if (args[1] === "add-admin") {
        reached();
        await continued;
      }
      return mutate(...args);
    };
    const pending = owner.command("add-admin", {
      email: "carol@portal.test",
      confirmation: "ADD_ADMIN",
    });
    await paused;
    await service("admin").command("participant-deactivate", {
      userId: "fake_carol",
      confirmation: "REMOVE_PARTICIPANT",
    });
    resume();
    await assert.rejects(pending);
    assert.equal(
      await one(db, "SELECT * FROM portal_roles WHERE user_id='fake_carol'"),
      undefined,
    );
    assert.equal(
      (await rows(db, "SELECT id FROM audit_logs WHERE action='add-admin'"))
        .length,
      0,
    );
    // Defense in depth for a stored legacy/admin role on a removed account.
    await db
      .prepare(
        "INSERT INTO portal_roles VALUES('fake_carol','admin','fake_owner','2026-10-23')",
      )
      .all();
    assert.equal((await service("carol").actor()).role, "participant");
    for (const path of [
      "/admin/participants",
      "/admin/settings",
      "/admin/submissions",
    ])
      await assert.rejects(service("carol").view(path));
    await assert.rejects(service("carol").staff());
  } finally {
    db.close();
  }
});

test("ignored participant hashes never affect draft/version persistence or retry identity in either submission API", async () => {
  for (const legacy of [false, true]) {
    const { db, service, clock } = await setup();
    try {
      await activate(db);
      await attend(db, "fake_alice");
      clock("2026-11-01T03:00:00.000Z");
      const canonical: any = legacy
        ? { ...submission }
        : Object.fromEntries(
            [
              "projectName",
              "problemSolution",
              "description",
              "github",
              "demo",
              "logo",
              "banner",
              "tools",
              "contributions",
              "attestation",
            ].map((k) => [k, (submission as any)[k]]),
          );
      delete canonical.commitSha;
      for (const hash of [
        undefined,
        "a".repeat(40),
        "ignored participant value",
      ]) {
        const project = {
          ...canonical,
          ...(hash === undefined ? {} : { commitSha: hash }),
        };
        await service().command(
          legacy ? "submit" : "submit-project",
          legacy ? project : { revision: 0, project },
        );
      }
      const versions: any[] = await rows(
        db,
        "SELECT * FROM submission_versions WHERE team_id='fake_team1'",
      );
      assert.equal(versions.length, 1);
      assert.equal(JSON.parse(versions[0].payload).commitSha, "");
      if (!legacy) {
        const project: any = await one(
          db,
          "SELECT draft FROM projects WHERE team_id='fake_team1'",
        );
        assert.equal(JSON.parse(project.draft).commitSha, "");
      }
    } finally {
      db.close();
    }
  }
});

test("hardcoded app copy has no em dash", () => {
  const source = readFileSync("app/portal.tsx", "utf8");
  assert.equal(source.includes("\u2014"), false);
});
