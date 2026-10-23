import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { handlePortal } from "../lib/http";
import { fixtures } from "../scripts/fixtures";
import { one } from "../lib/db";

const payload = {
  displayName: "Alice HTTP QA",
  gender: "non-binary",
  bio: "Synthetic saved profile verification",
  phone: "+1 (202) 555-0100",
  bestDescription: "Independent Developer",
  organization: "Synthetic QA organization",
  openaiOrgId: "org-synthetic-fixture",
  avatarColor: "purple",
  avatarExpression: "mixed-plus",
  socialLinks: [{ type: "Website", url: "https://example.test/profile-save" }],
  public: false,
};

test("positive profile Save crosses HTTP boundary and persists every field without private audit values", async () => {
  const { db } = await setup();
  const runtime = { db, identity: fixtures.alice, key: undefined };
  try {
    const bobBefore = await handlePortal(new Request("https://portal.test/api/portal?view=/profile"), {
      ...runtime, identity: fixtures.bob,
    });
    const otherProfile = (await bobBefore.json() as any).profile;
    const response = await handlePortal(new Request("https://portal.test/api/portal", {
      method: "POST",
      headers: { Origin: "https://portal.test", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete-profile", data: payload }),
    }), runtime);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal((await response.json() as any).message, "Profile saved. Your workspace is ready.");

    const read = await handlePortal(new Request("https://portal.test/api/portal?view=/profile"), runtime);
    assert.equal(read.status, 200);
    assert.match(read.headers.get("cache-control")!, /no-store/);
    const { me, profile } = await read.json() as any;
    assert.equal(me.email, "alice@portal.test");
    assert.equal(profile.complete, true);
    assert.equal(profile.display_name, payload.displayName);
    assert.equal(profile.bio, payload.bio);
    assert.equal(profile.gender, payload.gender);
    assert.equal(profile.gender_confirmed, 1);
    assert.equal(profile.phone, "+12025550100");
    assert.equal(profile.best_description, payload.bestDescription);
    assert.equal(profile.organization, payload.organization);
    assert.equal(profile.openai_org_id, payload.openaiOrgId);
    assert.equal(profile.avatar_color, payload.avatarColor);
    assert.equal(profile.avatar_expression, payload.avatarExpression);
    assert.equal(profile.public, 0);
    assert.deepEqual(profile.socials, payload.socialLinks.map((link) => link.url));
    const bobAfter = await handlePortal(new Request("https://portal.test/api/portal?view=/profile"), {
      ...runtime, identity: fixtures.bob,
    });
    assert.deepEqual((await bobAfter.json() as any).profile, otherProfile);

    const audit = await one<any>(db,
      "SELECT count(*) n,detail FROM audit_logs WHERE actor_id='fake_alice' AND action='complete-profile'",
    );
    assert.equal(audit.n, 1);
    for (const value of [payload.phone, "+12025550100", payload.gender, payload.openaiOrgId])
      assert.ok(!audit.detail.includes(value), "Audit contains field names only");
  } finally {
    db.close();
  }
});

test("invalid Save cannot partially replace an already saved profile or emit a successful audit", async () => {
  const { db, service } = await setup();
  const runtime = { db, identity: fixtures.alice, key: undefined };
  try {
    await service().command("complete-profile", payload);
    const before = (await service().view("/profile") as any).profile;
    for (const change of [
      { phone: "123" },
      { socialLinks: [{ type: "Website", url: "http://example.test/unsafe" }] },
      { bestDescription: "Invented category" },
      { email: "bob@portal.test" },
    ]) {
      const response = await handlePortal(new Request("https://portal.test/api/portal", {
        method: "POST",
        headers: { Origin: "https://portal.test", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete-profile", data: {
          ...payload, displayName: "Must not persist", bio: "Must not persist", ...change,
        } }),
      }), runtime);
      assert.equal(response.status, 422);
      assert.deepEqual((await service().view("/profile") as any).profile, before);
    }
    assert.equal((await one<any>(db,
      "SELECT count(*) n FROM audit_logs WHERE actor_id='fake_alice' AND action='complete-profile'",
    )).n, 1);
  } finally {
    db.close();
  }
});
