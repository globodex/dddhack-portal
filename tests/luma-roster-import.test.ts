import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { PortalService } from "../lib/service";
import { one, rows } from "../lib/db";
import {
  rosterEmailColumns,
  rosterGitHubURL,
} from "../lib/roster-import-columns";
import { RosterEmailColumnPicker } from "../app/admin-import-controls";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, LOCAL_CREDIT_KEY, seedLocal } from "../scripts/fixtures";

const teamHeader =
  "Please share your Team Name followed by Team member details (name & Email ID). Upto 5 members";
const lumaHeaders = [
  "guest_id",
  "name",
  "first_name",
  "last_name",
  "email",
  "phone_number",
  "created_at",
  "approval_status",
  "checked_in_at",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "google_click_id",
  "meta_click_id",
  "x_click_id",
  "linkedin_click_id",
  "tiktok_click_id",
  "reddit_click_id",
  "yandex_click_id",
  "referrer",
  "referred_by",
  "qr_code_url",
  "amount",
  "amount_tax",
  "amount_discount",
  "currency",
  "coupon_code",
  "eth_address",
  "solana_address",
  "survey_response_rating",
  "survey_response_feedback",
  "ticket_type_id",
  "ticket_name",
  "What best describes you?",
  "Organization",
  "Product / Portfolio website",
  "What is your LinkedIn profile?",
  "What is your GitHub username?",
  "Have you attended an OpenAI/Codex Event before?",
  "Please share your OpenAI org ID (Find: https://platform.openai.com/settings/organization/general)",
  "How are you planning to participate? (max 5 per team)",
  teamHeader,
  "Terms and Conditions",
];
const encode = (value: string) => '"' + value.replaceAll('"', '""') + '"';
function csv(headers: string[], records: Record<string, string>[]) {
  return (
    "\uFEFF" +
    [
      headers,
      ...records.map((record) => headers.map((header) => record[header] || "")),
    ]
      .map((row) => row.map(encode).join(","))
      .join("\r\n")
  );
}
const registration = (email = "luma-new@example.test") => ({
  guest_id: "SYNTHETIC-GUEST-ID-NOT-STORED",
  name: "Synthetic Luma Builder",
  first_name: "Synthetic",
  last_name: "Fallback",
  email,
  phone_number: "+1 (202) 555-0100",
  approval_status: "rejected",
  checked_in_at: "2026-11-01T08:00:00Z",
  utm_source: "SYNTHETIC-TRACKING-NOT-STORED",
  eth_address: "SYNTHETIC-WALLET-NOT-STORED",
  "What best describes you?": "Independent Developer",
  Organization: "Synthetic Organization",
  "Product / Portfolio website": "https://portfolio.example.test",
  "What is your LinkedIn profile?":
    "https://www.linkedin.com/in/synthetic-builder",
  "What is your GitHub username?": "@synthetic-builder",
  "Please share your OpenAI org ID (Find: https://platform.openai.com/settings/organization/general)":
    "org-synthetic",
  [teamHeader]: "Synthetic team: another@example.test, second@example.test",
});
async function commit(
  service: any,
  source: string,
  fieldMap?: Record<string, string>,
) {
  const request = {
    kind: "roster",
    csv: source,
    ...(fieldMap ? { fieldMap } : {}),
  };
  const preview = await service("admin").command("preview-import", request);
  assert.deepEqual(preview.errors, []);
  await service("admin").command("commit-import", {
    ...request,
    digest: preview.digest,
  });
  return preview;
}
function user(db: any, email = "luma-new@example.test") {
  return new PortalService(
    db,
    {
      id: "synthetic_luma_user",
      email,
      name: "Auth name",
      source: "local-test",
    },
    undefined,
  );
}

test("email candidates normalize BOM/case/whitespace, match the Email word, and include the team question without choosing it", () => {
  const headers = [
    "\uFEFF Contact  EMAIL \t Address ",
    "backup_email",
    "voicemail",
    "EmailAddress",
    teamHeader,
  ];
  assert.deepEqual(rosterEmailColumns(headers), [
    headers[0],
    headers[1],
    teamHeader,
  ]);
  assert.equal(
    rosterGitHubURL("@synthetic-builder"),
    "https://github.com/synthetic-builder",
  );
  assert.equal(
    rosterGitHubURL("https://github.com/synthetic-builder"),
    "https://github.com/synthetic-builder",
  );
  assert.equal(rosterGitHubURL("../unsafe"), "../unsafe");
});

test("ambiguous Luma CSV renders one select containing only Email candidates and no default team selection", () => {
  const html = renderToStaticMarkup(
    createElement(RosterEmailColumnPicker, {
      headers: lumaHeaders,
      value: "",
      onChange: () => {},
    }),
  );
  assert.equal((html.match(/<select/g) || []).length, 1);
  assert.equal((html.match(/<option/g) || []).length, 3);
  assert.match(html, /value="" selected="">Choose email column/);
  assert.match(html, /value="email"/);
  assert.ok(html.includes("Team Name followed by Team member details"));
  for (const ignored of [
    "guest_id",
    "utm_source",
    "eth_address",
    "What best describes you?",
  ])
    assert.ok(!html.includes(ignored));
  assert.equal(
    renderToStaticMarkup(
      createElement(RosterEmailColumnPicker, {
        headers: ["email", "name"],
        value: "email",
        onChange: () => {},
      }),
    ),
    "",
  );
});

test("actual quoted Luma columns require only an ambiguous email choice, then prefill approved fields and first/last name fallback", async () => {
  const { db, service } = await setup();
  try {
    const source = csv(lumaHeaders, [
      registration(),
      { ...registration("fallback@example.test"), name: "" },
    ]);
    const needs = await service("admin").command("preview-import", {
      kind: "roster",
      csv: source,
    });
    assert.deepEqual(needs.emailColumns, ["email", teamHeader]);
    assert.equal((needs.fieldMap as any).email, undefined);
    assert.deepEqual(needs.errors, [
      { message: "Choose the participant email column." },
    ]);
    assert.equal((await rows(db, "SELECT * FROM roster_prefills")).length, 0);
    const preview = await commit(service, source, { email: "email" });
    assert.deepEqual(preview.counts, {
      new: 2,
      existing: 0,
      invalid: 0,
      duplicates: 0,
      prefills: 2,
    });
    const payload = JSON.parse(
      (
        await one<any>(
          db,
          "SELECT payload FROM roster_prefills WHERE email=?",
          "luma-new@example.test",
        )
      ).payload,
    );
    assert.deepEqual(payload, {
      displayName: "Synthetic Luma Builder",
      bestDescription: "Independent Developer",
      organization: "Synthetic Organization",
      openaiOrgId: "org-synthetic",
      phone: "+12025550100",
      socialLinks: [
        {
          type: "LinkedIn",
          url: "https://www.linkedin.com/in/synthetic-builder",
        },
        { type: "GitHub", url: "https://github.com/synthetic-builder" },
        { type: "Website", url: "https://portfolio.example.test" },
      ],
    });
    const fallback = JSON.parse(
      (
        await one<any>(
          db,
          "SELECT payload FROM roster_prefills WHERE email=?",
          "fallback@example.test",
        )
      ).payload,
    );
    assert.equal(fallback.displayName, "Synthetic Fallback");
    assert.equal(
      (
        await one<any>(
          db,
          "SELECT status FROM registrations WHERE email=?",
          "luma-new@example.test",
        )
      ).status,
      "pending",
    );
    const profile = ((await user(db).view("/profile")) as any).profile;
    assert.equal(profile.display_name, payload.displayName);
    assert.equal(profile.phone, payload.phone);
    assert.equal(profile.bio, "");
    assert.equal(profile.gender_prefilled, false);
    assert.deepEqual(profile.socialLinks, payload.socialLinks);
    assert.ok(!JSON.stringify(payload).includes("NOT-STORED"));
  } finally {
    db.close();
  }
});

test("one normalized Email column is automatic; absent Email gives one actionable error, and invalid rows refuse commit", async () => {
  const { db, service } = await setup();
  try {
    const source = csv(
      ["Contact EMAIL address", "name"],
      [
        {
          "Contact EMAIL address": " AUTO@example.test ",
          name: "Synthetic Name",
        },
      ],
    );
    const preview = await commit(service, source);
    assert.equal((preview.fieldMap as any).email, "Contact EMAIL address");
    const missing = await service("admin").command("preview-import", {
      kind: "roster",
      csv: "guest_id,name\nsynthetic,Builder",
    });
    assert.deepEqual(missing.emailColumns, []);
    assert.deepEqual(missing.errors, [
      {
        message:
          "No email column found. Add a header containing the word Email.",
      },
    ]);
    const invalid = await service("admin").command("preview-import", {
      kind: "roster",
      csv: "Email\nnew@example.test\n NEW@example.test \nnot-an-email",
    });
    assert.equal((invalid.counts as any).duplicates, 1);
    assert.equal((invalid.counts as any).invalid, 1);
    await assert.rejects(
      service("admin").command("commit-import", {
        kind: "roster",
        csv: "Email\nnew@example.test\n NEW@example.test \nnot-an-email",
        digest: invalid.digest,
      }),
      { code: "PREVIEW_REQUIRED" },
    );
    assert.ok(
      !(await one(
        db,
        "SELECT email FROM registrations WHERE email='new@example.test'",
      )),
    );
    for (const plain of [
      "plain@example.test",
      "list1@example.test; LIST2@example.test\nlist1@example.test",
    ])
      await commit(service, plain);
  } finally {
    db.close();
  }
});

test("an incomplete profile with a legacy default details row still receives registration prefills", async () => {
  const { db, service } = await setup();
  try {
    await commit(
      service,
      csv(
        lumaHeaders.filter((header) => header !== teamHeader),
        [registration()],
      ),
    );
    const participant = user(db);
    await participant.actor();
    await db
      .prepare("INSERT INTO profile_details(user_id) VALUES(?)")
      .bind("synthetic_luma_user")
      .all();
    const profile = ((await participant.view("/profile")) as any).profile;
    assert.equal(profile.complete, false);
    assert.equal(profile.phone, "+12025550100");
    assert.equal(profile.organization, "Synthetic Organization");
    assert.equal(profile.display_name, "Synthetic Luma Builder");
    assert.equal(
      profile.socialLinks[1].url,
      "https://github.com/synthetic-builder",
    );
  } finally {
    db.close();
  }
});

test("reimports preserve status, all saved edits and deliberately cleared optional fields", async () => {
  const { db, service } = await setup();
  try {
    const headers = lumaHeaders.filter((header) => header !== teamHeader);
    await commit(service, csv(headers, [registration()]));
    const participant = user(db);
    await participant.command("complete-profile", {
      displayName: "Edited Builder",
      bio: "My saved portal bio",
      gender: "non-binary",
      phone: "+12025550199",
      bestDescription: "",
      organization: "",
      openaiOrgId: "",
      socialLinks: [],
    });
    await db
      .prepare("UPDATE registrations SET status='approved' WHERE email=?")
      .bind("luma-new@example.test")
      .all();
    const snapshot = async () =>
      JSON.stringify({
        registration: await one(
          db,
          "SELECT * FROM registrations WHERE email='luma-new@example.test'",
        ),
        profile: await one(
          db,
          "SELECT * FROM profiles WHERE user_id='synthetic_luma_user'",
        ),
        participant: await one(
          db,
          "SELECT * FROM participant_profiles WHERE user_id='synthetic_luma_user'",
        ),
        details: await one(
          db,
          "SELECT * FROM profile_details WHERE user_id='synthetic_luma_user'",
        ),
        prefill: await one(
          db,
          "SELECT * FROM roster_prefills WHERE email='luma-new@example.test'",
        ),
      });
    const before = await snapshot();
    await commit(
      service,
      csv(headers, [
        {
          ...registration(),
          name: "Imported overwrite",
          Organization: "Imported overwrite",
        },
      ]),
    );
    assert.equal(await snapshot(), before);
    const profile = ((await participant.view("/profile")) as any).profile;
    assert.equal(profile.display_name, "Edited Builder");
    assert.equal(profile.bio, "My saved portal bio");
    assert.equal(profile.gender, "non-binary");
    for (const field of ["organization", "openai_org_id", "best_description"])
      assert.equal(profile[field], "");
    assert.deepEqual(profile.socialLinks, []);
    assert.deepEqual(profile.socials, []);
  } finally {
    db.close();
  }
});

test("bio and gender remain portal-only even for legacy explicit maps and previously stored imported defaults", async () => {
  const { db, service } = await setup();
  try {
    await db
      .prepare("INSERT INTO luma_roster VALUES(?,?,?)")
      .bind("legacy@example.test", "fake_admin", "2026-10-22T08:00:00.000Z")
      .all();
    await db
      .prepare("INSERT INTO roster_prefills VALUES(?,?,?)")
      .bind(
        "legacy@example.test",
        JSON.stringify({
          bio: "IMPORTED-BIO",
          gender: "woman",
          organization: "Original organization",
        }),
        "2026-10-22T08:00:00.000Z",
      )
      .all();
    await commit(service, "email\nlegacy@example.test");
    const participant = new PortalService(
      db,
      {
        id: "legacy_luma",
        email: "legacy@example.test",
        name: "Legacy",
        source: "local-test",
      },
      undefined,
    );
    const profile = ((await participant.view("/profile")) as any).profile;
    assert.equal(profile.bio, "");
    assert.equal(profile.gender_prefilled, false);
    assert.notEqual(profile.gender, "woman");
    await commit(
      service,
      "Email,Bio,Sex\nportal-only@example.test,IMPORTED-BIO,Female",
      { email: "Email", bio: "Bio", sex: "Sex" },
    );
    const payload = JSON.parse(
      (
        await one<any>(
          db,
          "SELECT payload FROM roster_prefills WHERE email='portal-only@example.test'",
        )
      ).payload,
    );
    assert.equal("bio" in payload, false);
    assert.equal("gender" in payload, false);
  } finally {
    db.close();
  }
});

test("PGlite: inferred Luma fields persist as existing prefill JSON, while save/reimport preserves explicit clears and statuses", async () => {
  const { db } = await createPGliteFixture();
  await seedLocal(db);
  const service = (name = "admin") =>
    new PortalService(
      db,
      fixtures[name],
      LOCAL_CREDIT_KEY,
      () => "2026-10-22T08:00:00.000Z",
    );
  try {
    const source = csv(
      lumaHeaders.filter((header) => header !== teamHeader),
      [registration()],
    );
    await commit(service, source);
    const participant = user(db);
    const initial = ((await participant.view("/profile")) as any).profile;
    assert.equal(initial.organization, "Synthetic Organization");
    assert.equal(
      initial.socialLinks[1].url,
      "https://github.com/synthetic-builder",
    );
    await participant.command("complete-profile", {
      displayName: "Saved PG Builder",
      bio: "Saved PG bio",
      gender: "non-binary",
      phone: "+12025550199",
      organization: "",
      openaiOrgId: "",
      bestDescription: "",
      socialLinks: [],
    });
    const profile = ((await participant.view("/profile")) as any).profile;
    const status = await one(
      db,
      "SELECT * FROM registrations WHERE email='luma-new@example.test'",
    );
    await commit(service, source);
    assert.deepEqual(
      ((await participant.view("/profile")) as any).profile,
      profile,
    );
    assert.equal(profile.organization, "");
    assert.equal(profile.best_description, "");
    assert.deepEqual(profile.socials, []);
    assert.deepEqual(profile.socialLinks, []);
    assert.deepEqual(
      await one(
        db,
        "SELECT * FROM registrations WHERE email='luma-new@example.test'",
      ),
      status,
    );
  } finally {
    await db.close();
  }
});
