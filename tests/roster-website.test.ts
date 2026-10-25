import assert from "node:assert/strict";
import { test } from "node:test";
import { rosterFirstWebsite } from "../lib/roster-website";
import { setup } from "./helpers";
import { one } from "../lib/db";
import { confirmedImportValues } from "../app/admin-import-controls";
import { portalConfirmationFor } from "../app/portal";
import ConfirmationDialog from "../app/confirmation-dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

test("CSV website first-value normalization preserves URL punctuation and textual order", () => {
  for (const [input, expected] of [
    ["https://arexa.co & bharatxr.co", "https://arexa.co"],
    ["portfolio.example.test", "https://portfolio.example.test"],
    ["www.example.test", "https://www.example.test"],
    ["http://www.example.test/work", "https://www.example.test/work"],
    ["HTTPS://EXAMPLE.TEST/", "https://example.test/"],
    ["Website: (https://example.test/path)", "https://example.test/path"],
    ["Portfolio: <www.example.test/>", "https://www.example.test/"],
    ['"https://example.test/path"', "https://example.test/path"],
    [
      "https://first.example.test\nhttps://second.example.test",
      "https://first.example.test",
    ],
    ["first.example.test;second.example.test", "https://first.example.test"],
    ["first.example.test, second.example.test", "https://first.example.test"],
    ["first.example.test&second.example.test", "https://first.example.test"],
    [
      "https://first.example.test/path;https://second.example.test",
      "https://first.example.test/path",
    ],
    [
      "https://first.example.test/path, second.example.test",
      "https://first.example.test/path",
    ],
    ["https://example.test/a,b;c&d", "https://example.test/a,b;c&d"],
    ["https://example.test/?a=1&b=2", "https://example.test/?a=1&b=2"],
    [
      "https://example.test/?a=one,two;three&next=https://other.example.test",
      "https://example.test/?a=one,two;three&next=https://other.example.test",
    ],
    [
      "https://example.test/#section&other.example.test",
      "https://example.test/#section&other.example.test",
    ],
  ])
    assert.equal(rosterFirstWebsite(input), expected, input);
});

test("CSV website refuses unsafe/malformed first value instead of searching for a safe later value", () => {
  for (const input of [
    "",
    "   ",
    "Arbitrary prose https://safe.example.test",
    "ftp://first.example.test;https://safe.example.test",
    "javascript:alert(1) https://safe.example.test",
    "mailto:someone@example.test https://safe.example.test",
    "https://user:password@first.example.test https://safe.example.test",
    "https://first.example.test:8443 https://safe.example.test",
    "https:// https://safe.example.test",
    "not-a-domain, safe.example.test",
    "https://localhost/",
    "https://127.0.0.1/",
    "//example.test",
    "https://example.test\\@other.example.test",
    "(https://example.test",
  ])
    assert.equal(rosterFirstWebsite(input), undefined, input);
});

test("CSV website preview, confirmation and commit use the identical canonical first URL", async () => {
  const { db, service } = await setup();
  try {
    const teamHeader =
      "Please share your Team Name followed by Team member details (name & Email ID). Upto 5 members";
    const q = (v: string) => '"' + v.replaceAll('"', '""') + '"';
    const csv = [
      ["email", "Product / Portfolio website", teamHeader, "Organization"],
      [
        "site-import@example.test",
        "Website: http://first.example.test/?a=1&b=2 ; https://second.example.test",
        'Synthetic "Team"\r\n\r\nMember, other@example.test',
        "Synthetic Org",
      ],
    ]
      .map((row) => row.map(q).join(","))
      .join("\r\n");
    const request = { kind: "roster", csv, fieldMap: { email: "email" } };
    const preview = (await service("admin").command(
      "preview-import",
      request,
    )) as any;
    assert.deepEqual(preview.errors, []);
    assert.equal(
      preview.rows[0].website,
      "https://first.example.test/?a=1&b=2",
    );
    const values = confirmedImportValues(csv, request.fieldMap, "csv", preview);
    assert.deepEqual(values.importWebsiteReview, [
      { row: 2, url: preview.rows[0].website },
    ]);
    const confirmation = portalConfirmationFor(
      "commit-import",
      values,
      "1 participant",
    );
    assert.deepEqual(confirmation.importWebsites, values.importWebsiteReview);
    const html = renderToStaticMarkup(
      createElement(ConfirmationDialog, { value: confirmation, decide() {} }),
    );
    assert.ok(html.includes("Websites (1)"));
    assert.ok(html.includes("https://first.example.test/?a=1&amp;b=2"));
    assert.ok(!html.includes("https://second.example.test"));
    assert.ok(!html.includes("<iframe") && !html.includes("href="));
    await assert.rejects(
      service("admin").command("commit-import", {
        ...request,
        csv: csv.replace("http://first", "http://changed"),
        digest: preview.digest,
      }),
      { code: "PREVIEW_REQUIRED" },
    );
    assert.equal(
      await one(
        db,
        "SELECT email FROM registrations WHERE email='site-import@example.test'",
      ),
      undefined,
    );
    await service("admin").command("commit-import", {
      ...request,
      digest: preview.digest,
    });
    const row = await one<{ payload: string }>(
      db,
      "SELECT payload FROM roster_prefills WHERE email='site-import@example.test'",
    );
    assert.deepEqual(JSON.parse(row!.payload).socialLinks, [
      { type: "Website", url: preview.rows[0].website },
    ]);
    const empty = (await service("admin").command("preview-import", {
      kind: "roster",
      csv: "email,website\nblank-site@example.test,",
    })) as any;
    assert.deepEqual(empty.errors, []);
    assert.equal(empty.rows[0].website, undefined);
  } finally {
    db.close();
  }
});
