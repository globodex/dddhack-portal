import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/home";
import { ProfileDescriptionField } from "../app/profile-flow";
import { profileDescriptionChoices } from "../lib/profile-contract";
import { setup } from "./helpers";
const choices = [
  "Startup Founder",
  "Working Professional",
  "Independent Developer",
  "College Student",
  "School Student",
  "Other (non-tech)",
];
test("profile description dropdown contains the exact six verified Luma choices, never invented legacy options", () => {
  assert.deepEqual(profileDescriptionChoices, choices);
  const html = renderToStaticMarkup(
    createElement(ProfileDescriptionField, {
      value: "Startup Founder",
      onChange: () => {},
    }),
  );
  assert.equal((html.match(/<option/g) || []).length, 7);
  for (const choice of choices) assert.ok(html.includes(choice));
  assert.doesNotMatch(html, /Awaiting host choices|disabled=/);
  const legacy = renderToStaticMarkup(
    createElement(ProfileDescriptionField, {
      value: "Legacy private category",
      onChange: () => {},
    }),
  );
  assert.equal((legacy.match(/<option/g) || []).length, 7);
  assert.match(legacy, /Saved: Legacy private category/);
  assert.doesNotMatch(legacy, /<option[^>]*>Legacy private category/);
});
test("server accepts verified choices and preserves optional socials while rejecting invented new categories", async () => {
  const { db, service } = await setup();
  try {
    for (const bestDescription of choices)
      await service().command("complete-profile", {
        displayName: "Synthetic Builder",
        gender: "non-binary",
        bio: "Builds useful things",
        phone: "+12025550100",
        bestDescription,
        socialLinks: [],
      });
    await assert.rejects(
      service().command("complete-profile", {
        displayName: "Synthetic Builder",
        gender: "non-binary",
        bio: "Builds useful things",
        phone: "+12025550100",
        bestDescription: "Invented category",
        socialLinks: [],
      }),
      { code: "PROFILE_DESCRIPTION_INVALID" },
    );
  } finally {
    db.close();
  }
});
test("organizer photos match verified public source hashes; Shivay uses his confirmed full name and a labelled placeholder", () => {
  const photos = {
    "Param3021-x.jpg":
      "f19b21c25dbe9eb91c2ece9027adcb1ec24d28979ca633e7607703d54297fe17",
    "nikhilsbuilds-x.jpg":
      "83bd86997050bb01ae2e5b0ade6c0090f7e3930d1dc2733b9b8f7ee8a5956b12",
    "callmeshuklaji-x.jpg":
      "f2224e0c9867efab2f1517efa441eed598dbd5d9a7f9122a27481b227e7ae48d",
  };
  for (const [file, hash] of Object.entries(photos))
    assert.equal(
      createHash("sha256")
        .update(readFileSync("public/organizers/" + file))
        .digest("hex"),
      hash,
    );
  const html = renderToStaticMarkup(createElement(Home, {}));
  for (const file of Object.keys(photos))
    assert.ok(html.includes("/organizers/" + file));
  assert.match(html, /Shivay Lamba/);
  assert.match(html, /Shivay Lamba: photo pending/);
  assert.doesNotMatch(
    html,
    /Full surname awaiting confirmation|pbs\.twimg\.com|lumacdn/,
  );
  assert.match(html, /people marked Going or Checked in/);
});
