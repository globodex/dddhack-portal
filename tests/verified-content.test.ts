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
test("organizer photos match verified public sources, including the requested Param302 GitHub avatar", () => {
  const photos = {
    "HowDevelop-x.jpg":
      "e01d0b72a4c2ae65fa48cd3e9222d4517407885d4d9626261bfbac0814af7fb4",
    "Param302-github.webp":
      "84da5a6a1eb28b5777c48d7706ab660b9b9fbb0afec39d88721a8d9cb85359d8",
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
  const provenance = JSON.parse(readFileSync("public/organizers/PARAM302-GITHUB-SOURCE.json", "utf8"));
  assert.equal(provenance.login, "Param302");
  assert.equal(provenance.githubUserId, 76559816);
  assert.equal(provenance.sourceURL, "https://avatars.githubusercontent.com/u/76559816?v=4");
  for (const file of Object.keys(photos))
    assert.ok(html.includes("/organizers/" + file));
  assert.match(html, /Shivay Lamba/);
  assert.match(html, /https:\/\/x\.com\/HowDevelop/);
  assert.doesNotMatch(html, /Shivay Lamba: photo pending/);
  assert.doesNotMatch(
    html,
    /Full surname awaiting confirmation|pbs\.twimg\.com|lumacdn/,
  );
  assert.doesNotMatch(
    html,
    /people marked Going or Checked in|Built for people who build/,
  );
});
