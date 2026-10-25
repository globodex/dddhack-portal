import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCSV } from "../lib/security";
import { setup } from "./helpers";
import { one, rows } from "../lib/db";
import {
  rosterPrefillColumns,
  rosterEmailColumns,
} from "../lib/roster-import-columns";
import {
  importRequest,
  addParticipants,
  adminPreviewError,
} from "../app/admin-import-controls";

const team =
  "Please share your Team Name followed by Team member details (name & Email ID). Upto 5 members";
const org =
  "Please share your OpenAI org ID (Find: https://platform.openai.com/settings/organization/general)";
const headers = [
  "email",
  "name",
  "Product / Portfolio website",
  team,
  org,
  "Terms and Conditions",
  "Optional unused question",
];
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const teamAnswer = (eol: string) =>
  `Team "Synthetic, Together"${eol}${eol}Member 1: Synthetic One, embedded-one@example.test${eol}${eol}Member 2: Synthetic Two, embedded-two@example.test`;
const record = (
  email: string,
  answer: string,
  website = "https://portfolio.example.test",
) => [
  email,
  "Synthetic Builder",
  website,
  answer,
  "org-synthetic-trailing",
  "Accepted, yes",
  "An unused answer",
];
const encode = (records: string[][], eol: string) =>
  "\uFEFF" +
  [headers, ...records].map((row) => row.map(quote).join(",")).join(eol) +
  eol;

for (const eol of ["\n", "\r\n"]) {
  test(`CSV ${JSON.stringify(eol)}: quoted multiline/BOM/commas/escaped quotes keep records and trailing columns intact`, async () => {
    const source = encode(
      [
        record("csv-one@example.test", teamAnswer(eol)),
        record("csv-two@example.test", "Solo"),
      ],
      eol,
    );
    const parsed = parseCSV(source);
    assert.deepEqual(parsed[0], headers);
    assert.equal(parsed.length, 3);
    assert.ok(parsed.every((row) => row.length === headers.length));
    assert.equal(parsed[1][3], teamAnswer(eol));
    assert.deepEqual(parsed[1].slice(4), [
      "org-synthetic-trailing",
      "Accepted, yes",
      "An unused answer",
    ]);
    assert.equal(parsed[2][0], "csv-two@example.test");
    assert.deepEqual(rosterEmailColumns(parsed[0]), ["email", team]);
    const map = rosterPrefillColumns(parsed[0]);
    assert.equal(map.openaiOrgId, org);
    assert.ok(!Object.values(map).includes(team));
    assert.ok(!Object.values(map).includes("Optional unused question"));
    // The file reader and transport preserve the complete CSV, without splitting lines.
    const fileText = await new File([source], "synthetic-luma.csv", {
      type: "text/csv",
    }).text();
    assert.equal(fileText, source.replace(/^\uFEFF/, ""));
    assert.equal(importRequest(fileText, { email: "email" }).csv, fileText);
    const calls: unknown[] = [];
    await addParticipants(
      fileText,
      { email: "email" },
      "csv",
      async (request) => {
        assert.equal(request.csv, fileText);
        return {
          digest: "synthetic-digest",
          headers,
          fieldMap: { email: "email" },
          counts: {
            new: 2,
            existing: 0,
            invalid: 0,
            duplicates: 0,
            prefills: 2,
          },
          rows: [
            {
              row: 2,
              email: "csv-one@example.test",
              existing: false,
              action: "Add",
            },
            {
              row: 3,
              email: "csv-two@example.test",
              existing: false,
              action: "Add",
            },
          ],
          errors: [],
        };
      },
      async (action, values) => {
        calls.push({ action, values });
        return {};
      },
    );
    assert.equal((calls[0] as any).values.csv, fileText);
  });

  test(`Luma ${JSON.stringify(eol)}: explicitly chosen participant email imports once, ignores team free text and preserves trailing prefill`, async () => {
    const { db, service } = await setup();
    try {
      const source = encode(
        [
          record("csv-one@example.test", teamAnswer(eol)),
          record("csv-two@example.test", "Solo"),
        ],
        eol,
      );
      const request = {
        kind: "roster",
        csv: source,
        fieldMap: { email: "email" },
      };
      const preview = (await service("admin").command(
        "preview-import",
        request,
      )) as any;
      assert.deepEqual(preview.errors, []);
      assert.deepEqual(
        preview.rows.map((row: any) => [row.row, row.email]),
        [
          [2, "csv-one@example.test"],
          [3, "csv-two@example.test"],
        ],
      );
      assert.equal(preview.fieldMap.openaiOrgId, org);
      await service("admin").command("commit-import", {
        ...request,
        digest: preview.digest,
      });
      for (const email of ["csv-one@example.test", "csv-two@example.test"]) {
        const row = await one<{ payload: string }>(
          db,
          "SELECT payload FROM roster_prefills WHERE email=?",
          email,
        );
        const prefill = JSON.parse(row!.payload);
        assert.equal(prefill.openaiOrgId, "org-synthetic-trailing");
        assert.equal(prefill.displayName, "Synthetic Builder");
        assert.deepEqual(prefill.socialLinks, [
          { type: "Website", url: "https://portfolio.example.test" },
        ]);
        assert.ok(!JSON.stringify(prefill).includes("embedded-one"));
      }
      assert.equal(
        await one(
          db,
          "SELECT email FROM registrations WHERE email='embedded-one@example.test' OR email='embedded-two@example.test'",
        ),
        undefined,
      );
      const removedQuestion = encode(
        [record("csv-copy@example.test", teamAnswer(eol))],
        eol,
      );
      const spreadsheetCopy = parseCSV(removedQuestion)
        .map((row) =>
          row
            .filter((_, i) => i !== 3)
            .map(quote)
            .join(","),
        )
        .join(eol);
      const cleanPreview = (await service("admin").command("preview-import", {
        kind: "roster",
        csv: spreadsheetCopy,
      })) as any;
      assert.deepEqual(cleanPreview.errors, []);
      assert.equal(cleanPreview.fieldMap.email, "email");
    } finally {
      db.close();
    }
  });
}

test("CSV malformed quotes and widths reject with logical row numbers, not embedded physical line counts", () => {
  const head = 'email,team,terms\n"one@example.test","first\n\nsecond","Yes"\n';
  for (const [tail, code, message] of [
    [
      '"two@example.test","not closed\n\nmember',
      "INVALID_CSV_QUOTE",
      "A quoted field is not closed",
    ],
    [
      '"two@example.test"stray,"team","Yes"',
      "INVALID_CSV_QUOTE",
      "Text follows a closing quote",
    ],
    [
      '"two@example.test","team""bad","Yes"garbage',
      "INVALID_CSV_QUOTE",
      "Text follows a closing quote",
    ],
    [
      'two@example.test,bad"quote,Yes',
      "INVALID_CSV_QUOTE",
      "A quote appears inside an unquoted field",
    ],
    ["two@example.test,missing", "CSV_COLUMN_MISMATCH", "Expected 3 columns"],
  ])
    assert.throws(
      () => parseCSV(head + tail),
      (error: any) =>
        error.code === code &&
        error.message.startsWith("Row 3:") &&
        error.message.includes(message),
    );
  assert.deepEqual(parseCSV('email,team\n"one@example.test" \t,""'), [
    ["email", "team"],
    ["one@example.test", ""],
  ]);
});

test("Luma: Website row23 is independent of multiline team answers; failures never partially import", async () => {
  const { db, service } = await setup();
  try {
    const before = await rows(
      db,
      "SELECT email FROM registrations ORDER BY email",
    );
    const records = Array.from({ length: 22 }, (_, index) =>
      record(
        `synthetic-${index}@example.test`,
        index === 0 ? teamAnswer("\r\n") : "Solo",
        index === 21
          ? "ftp://portfolio.example.test & https://safe.example.test"
          : "https://portfolio.example.test",
      ),
    );
    const request = {
      kind: "roster",
      csv: encode(records, "\r\n"),
      fieldMap: { email: "email" },
    };
    const preview = (await service("admin").command(
      "preview-import",
      request,
    )) as any;
    assert.deepEqual(preview.errors, [
      { row: 23, message: "Website requires a safe HTTPS URL." },
    ]);
    assert.equal(preview.rows[21].email, "synthetic-21@example.test");
    await assert.rejects(
      service("admin").command("commit-import", {
        ...request,
        digest: preview.digest,
      }),
      { code: "PREVIEW_REQUIRED" },
    );
    assert.deepEqual(
      await rows(db, "SELECT email FROM registrations ORDER BY email"),
      before,
    );
    assert.equal(
      await one(
        db,
        "SELECT email FROM roster_prefills WHERE email LIKE 'synthetic-%@example.test'",
      ),
      undefined,
    );
    for (const bad of [
      'email,team\n"safe@example.test","Valid\n\nteam"\n"bad@example.test","Unclosed',
      'email,team\n"safe@example.test","Valid\n\nteam"\n"bad@example.test"stray,"No"',
    ]) {
      const invalid = { kind: "roster", csv: bad };
      for (const action of ["preview-import", "commit-import"])
        await assert.rejects(
          service("admin").command(action, {
            ...invalid,
            ...(action === "commit-import" ? { digest: "forged" } : {}),
          }),
          (error: any) =>
            error.code === "INVALID_CSV_QUOTE" &&
            error.message.startsWith("Row 3:"),
        );
      assert.deepEqual(
        await rows(db, "SELECT email FROM registrations ORDER BY email"),
        before,
      );
    }
  } finally {
    db.close();
  }
});

test("admin import keeps contextual parser repair messages and fallback copy", () => {
  for (const code of ["INVALID_CSV_QUOTE", "CSV_COLUMN_MISMATCH"]) {
    const message = "Row 23: Re-export the CSV with correctly quoted cells.";
    assert.equal(
      adminPreviewError("preview-import", { code, message }),
      message,
    );
  }
  assert.equal(
    adminPreviewError("preview-import", {
      code: "INVALID_CSV_QUOTE",
      message: "INVALID_CSV_QUOTE",
    }),
    "Check CSV quotes and try again.",
  );
});
