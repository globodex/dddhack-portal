import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { handlePortal } from "../lib/http";
import { batch, one, rows } from "../lib/db";

const origin = "https://portal.test";
const privateViews = [
  "/dashboard",
  "/dashboard/team",
  "/dashboard/credits",
  "/profile",
  "/dashboard/profile",
  "/submission",
  "/dashboard/submission",
  "/personal/credits",
];
for (const engine of ["sqlite", "postgres"] as const) {
  async function context() {
    if (engine === "sqlite") return setup();
    const { db } = await createPGliteFixture();
    await seedLocal(db);
    return {
      db,
      service: (who = "alice") =>
        new PortalService(
          db,
          fixtures[who],
          LOCAL_CREDIT_KEY,
          () => "2026-10-22T08:00:00.000Z",
        ),
    };
  }
  test(`${engine}: active Viewer gets registration state on private routes while discovery stays read-only`, async () => {
    const { db, service } = await context();
    const get = (view: string) =>
      handlePortal(
        new Request(`${origin}/api/portal?view=${encodeURIComponent(view)}`),
        { db, identity: fixtures.stranger, key: LOCAL_CREDIT_KEY },
      );
    try {
      const before = await rows(
        db,
        "SELECT email FROM registrations UNION SELECT email FROM luma_roster ORDER BY email",
      );
      for (const path of privateViews) {
        const response = await get(path);
        assert.equal(response.status, 200, path);
        const body = (await response.json()) as any;
        assert.equal(body.registrationRequired, true, path);
        assert.equal(body.me.mode, "viewer");
        assert.equal(body.me.canParticipate, false);
        assert.equal(body.me.canEngage, false);
        assert.deepEqual(Object.keys(body).sort(), [
          "localTest",
          "me",
          "registrationRequired",
        ]);
        assert.match(
          response.headers.get("cache-control") || "",
          /private, no-store/,
        );
      }
      assert.equal((await get("//dashboard//profile/")).status, 200);
      assert.equal((await get("/dashboard/not-a-route")).status, 404);
      // seedLocal intentionally gives even this Viewer a completed profile.
      const directory = (await (
        await get("/discover/participants")
      ).json()) as any;
      assert.ok(directory.items.length > 0);
      assert.ok(
        !directory.items.some((item: any) => item.id === "fake_stranger"),
      );
      for (const item of directory.items)
        for (const key of [
          "email",
          "phone",
          "gender",
          "organization",
          "openaiOrgId",
        ])
          assert.equal(key in item, false, key);
      for (const path of ["/discover/teams", "/projects"])
        assert.equal((await get(path)).status, 200, path);
      for (const action of [
        "upvote-project",
        "comment-project",
        "vote",
        "feedback",
        "create-team",
        "create-workspace-team",
        "request-team",
        "team-request",
        "team-respond",
        "respond-team",
        "complete-profile",
      ])
        await assert.rejects(
          service("stranger").command(action, {}),
          { code: "VIEWER_READ_ONLY" },
          action,
        );
      await assert.rejects(
        service("stranger").command("reveal-credit", { typeId: "fake_credit" }),
        { code: "CHECKIN_REQUIRED" },
      );
      assert.deepEqual(
        await rows(
          db,
          "SELECT email FROM registrations UNION SELECT email FROM luma_roster ORDER BY email",
        ),
        before,
      );
    } finally {
      await db.close();
    }
  });
  test(`${engine}: registration or Luma membership preserves legacy eligibility; staff and removals stay distinct`, async () => {
    const { db, service } = await context();
    try {
      await batch(db, [
        [
          "INSERT INTO registrations(email,status) VALUES(?,'pending')",
          fixtures.stranger.email,
        ],
      ]);
      assert.equal((await service("stranger").actor()).mode, "participant");
      const profile = await service("stranger").view("/profile");
      assert.equal(profile.registrationRequired, undefined);
      assert.ok(profile.profile);
      await service("stranger").command("complete-profile", {
        displayName: "Registered legacy builder",
        gender: "non-binary",
        bio: "Synthetic builder profile",
      });
      // A pending registration grants profile eligibility, never approval or attendance.
      await assert.rejects(service("stranger").view("/personal/credits"), {
        code: "CHECKIN_REQUIRED",
      });
      assert.equal(
        (
          await one<any>(
            db,
            "SELECT status FROM registrations WHERE email=?",
            fixtures.stranger.email,
          )
        )?.status,
        "pending",
      );
      await batch(db, [
        ["DELETE FROM registrations WHERE email=?", fixtures.pending.email],
      ]);
      assert.equal((await service("pending").actor()).mode, "participant");
      assert.ok((await service("pending").view("/profile")).profile);
      assert.equal((await service("admin").actor()).mode, "staff");
      assert.equal((await service("owner").actor()).owner, true);
      await service("admin").command("participant-deactivate", {
        userId: "fake_carol",
        confirmation: "REMOVE_PARTICIPANT",
      });
      for (const path of privateViews)
        await assert.rejects(
          service("carol").view(path),
          { code: "PARTICIPANT_REMOVED" },
          path,
        );
    } finally {
      await db.close();
    }
  });
  test(`${engine}: admin lists existing Viewers honestly and explicit roster add invalidates registration cache state`, async () => {
    const { db, service } = await context();
    const get = (presentation?: string) =>
      handlePortal(
        new Request(
          `${origin}/api/portal?view=%2Fadmin%2Fparticipants${presentation ? `&presentation=${presentation}` : ""}`,
        ),
        { db, identity: fixtures.admin, key: LOCAL_CREDIT_KEY },
      );
    try {
      // A fresh authenticated account has an existing users row, with no invented registration.
      const identity = {
        id: "synthetic_new_viewer",
        email: "new-viewer@portal.test",
        name: "New Viewer",
        source: "local-test" as const,
      };
      const viewer = new PortalService(
        db,
        identity,
        LOCAL_CREDIT_KEY,
        () => "2026-10-22T08:00:00.000Z",
      );
      await viewer.actor();
      const before = (await (await get()).json()) as any;
      const row = before.items.find((item: any) => item.id === identity.id);
      assert.equal(row.status, "Not registered");
      assert.equal(row.registered, false);
      assert.equal(row.viewer, true);
      assert.equal(row.checked_in, null);
      assert.equal(
        before.items.filter((item: any) => item.id === identity.id).length,
        1,
      );
      await batch(db, [
        [
          "INSERT INTO portal_roles(user_id,role,granted_by,updated_at) VALUES('fake_judge','volunteer','fake_owner','2026-10-22T08:00:00.000Z')",
        ],
      ]);
      const volunteer = await service("judge").view("/admin/participants");
      assert.ok(!(volunteer.items as any[]).some((item) => item.viewer));
      assert.ok(!JSON.stringify(volunteer).includes(identity.email));
      const csv = `email\n${identity.email}\n`;
      const preview = await service("admin").command("preview-import", {
        kind: "roster",
        csv,
      });
      await service("admin").command("commit-import", {
        kind: "roster",
        csv,
        digest: preview.digest,
      });
      const after = (await (
        await get(before.adminPresentation.version)
      ).json()) as any;
      const updated = after.items.find((item: any) => item.id === identity.id);
      assert.equal(updated.status, "Registered");
      assert.equal(updated.registered, true);
      assert.equal(updated.viewer, false);
      assert.equal(after.items.length, before.items.length);
      assert.equal(after.adminPresentation.unchanged, false);
      assert.notEqual(
        after.adminPresentation.version,
        before.adminPresentation.version,
      );
      const workspace = await viewer.view("/dashboard");
      assert.equal((workspace.me as any).mode, "participant");
      assert.equal(workspace.registrationRequired, undefined);
      assert.equal(workspace.profileIncomplete, true);
      assert.equal((workspace.me as any).canParticipate, false);
      assert.equal(
        (
          await one<any>(
            db,
            "SELECT status FROM registrations WHERE email=?",
            identity.email,
          )
        )?.status,
        "pending",
      );
    } finally {
      await db.close();
    }
  });
}
