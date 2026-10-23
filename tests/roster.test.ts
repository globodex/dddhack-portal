import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { PortalService } from "../lib/service";
import { one, rows } from "../lib/db";
import { normalizeRosterEmail } from "../lib/roster";
const profile = {
  displayName: "Synthetic Builder",
  gender: "non-binary",
  bio: "Builds tools",
};
async function imported(service: any, csv: string) {
  const preview = await service("admin").command("preview-import", {
    kind: "roster",
    csv,
  });
  return {
    preview,
    result: await service("admin").command("commit-import", {
      kind: "roster",
      csv,
      digest: preview.digest,
    }),
  };
}
test("verified email must match imported roster before profile/member access; owner/admin bootstrap and public browsing remain safe", async () => {
  const { db, service } = await setup();
  try {
    const outsider = service("stranger");
    for (const path of ["/dashboard", "/profile", "/submission"])
      await assert.rejects(outsider.view(path), {
        code: "LUMA_EMAIL_MISMATCH",
      });
    await assert.rejects(outsider.command("complete-profile", profile), {
      code: "VIEWER_READ_ONLY",
    });
    await service("admin").command("participant-bulk", {
      emails: ["stranger@portal.test"],
      status: "approved",
      reason: "Synthetic manual approval only",
    });
    await assert.rejects(outsider.view("/profile"), {
      code: "LUMA_EMAIL_MISMATCH",
    });
    assert.ok((await new PortalService(db, null, undefined).view("/")).content);
    assert.ok((await service("owner").view("/admin/settings")).policy);
    assert.ok((await service("admin").view("/admin/participants")).items);
    await imported(service, "email\n STRANGER@portal.test \n");
    await outsider.command("complete-profile", profile);
    assert.equal(
      (await outsider.view("/profile")).profileIncomplete,
      undefined,
    );
  } finally {
    db.close();
  }
});
test("repeat roster imports are strictly add-only across existing statuses, profile edits and attendance; aliases are never merged", async () => {
  const { db, service } = await setup();
  try {
    await service().command("complete-profile", {
      ...profile,
      displayName: "Alice Edited",
      socialLinks: [{ type: "Website", url: "https://example.com" }],
    });
    await service("admin").command("admin-status", {
      kind: "person",
      targetId: "fake_alice",
      status: "Checked in",
      reason: "Synthetic checked-in identity",
      confirmation: "CHANGE_STATUS",
    });
    const snapshot = async () =>
      JSON.stringify({
        registration: await one(
          db,
          "SELECT * FROM registrations WHERE email='alice@portal.test'",
        ),
        profile: await one(
          db,
          "SELECT * FROM profiles WHERE user_id='fake_alice'",
        ),
        details: await one(
          db,
          "SELECT * FROM participant_profiles WHERE user_id='fake_alice'",
        ),
        status: await one(
          db,
          "SELECT * FROM participant_status_overrides WHERE user_id='fake_alice'",
        ),
        attendance: await rows(
          db,
          "SELECT * FROM manual_checkins WHERE user_id='fake_alice'",
        ),
      });
    const before = await snapshot();
    const csv =
      "email\n ALICE@portal.test \nnew.person+tag@example.invalid\nnewperson+tag@example.invalid\n";
    const first = await imported(service, csv);
    assert.equal(first.preview.rows[0].existing, true);
    assert.match(first.preview.rows[0].action, /Skip/);
    await imported(service, csv);
    assert.equal(await snapshot(), before);
    assert.equal(
      (
        await rows(
          db,
          "SELECT email FROM registrations WHERE email LIKE '%tag@%'",
        )
      ).length,
      2,
    );
    assert.equal(
      (await one<{ status: string }>(
        db,
        "SELECT status FROM registrations WHERE email='new.person+tag@example.invalid'",
      ))!.status,
      "pending",
    );
    await assert.rejects(
      db
        .prepare(
          "UPDATE luma_roster SET email='tamper' WHERE email='alice@portal.test'",
        )
        .all(),
      /ROSTER_ADD_ONLY/,
    );
    assert.equal(
      normalizeRosterEmail(" A.B+Tag@Example.COM "),
      "a.b+tag@example.com",
    );
  } finally {
    db.close();
  }
});
test("new profile requires phone, protects private organization fields and uses exactly three profile steps without a personal picker", async () => {
  const { db, service } = await setup();
  try {
    const identity = {
      id: "fresh_rostered",
      email: "fresh@example.invalid",
      name: "Alex Rao",
      source: "sites" as const,
    };
    await imported(service, "email\nfresh@example.invalid\n");
    const fresh = new PortalService(db, identity, undefined);
    await assert.rejects(fresh.command("complete-profile", profile), {
      code: "PHONE_REQUIRED",
    });
    await assert.rejects(
      fresh.command("complete-profile", { ...profile, phone: "not-a-number" }),
      { code: "PHONE_REQUIRED" },
    );
    await fresh.command("complete-profile", {
      ...profile,
      phone: "+1 202 555 0100",
      organization: "PRIVATE-ORG-MARKER",
      openaiOrgId: "org-private-marker",
      socialLinks: [{ type: "GitHub", url: "https://github.com/example" }],
    });
    const w = (await fresh.view("/profile")) as Record<string, any>;
    assert.equal(w.profile.complete, true);
    assert.equal(w.profile.phone, "+12025550100");
    assert.equal(w.profile.organization, "PRIVATE-ORG-MARKER");
    await assert.rejects(
      fresh.command("complete-profile", {
        ...profile,
        bestDescription: "Invented category",
      }),
      { code: "PROFILE_DESCRIPTION_INVALID" },
    );
    const publicJSON = JSON.stringify(
      await new PortalService(db, null, undefined).view("/projects"),
    );
    assert.ok(
      !publicJSON.includes("PRIVATE-ORG-MARKER") &&
        !publicJSON.includes("org-private-marker") &&
        !publicJSON.includes("555 0100"),
    );
    const { createElement } = await import("react"),
      { renderToStaticMarkup } = await import("react-dom/server"),
      { default: ProfileFlow } = await import("../app/profile-flow");
    const html = renderToStaticMarkup(
      createElement(ProfileFlow, {
        data: {
          me: { name: "Alex Rao", email: "fresh@example.invalid" },
          profile: {},
        },
        run: async () => ({}),
      }),
    );
    assert.ok(
      html.includes("Step 1 of 3") &&
        html.toLowerCase().includes("readonly") &&
        html.includes("One-line bio") &&
        html.includes("Sex"),
    );
    assert.ok(!html.includes("avatar picker") && !html.includes("optional"));
    const { nameInitials } = await import("../lib/profile-contract");
    assert.equal(nameInitials("Alex Rao"), "AR");
  } finally {
    db.close();
  }
});
