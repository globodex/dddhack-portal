import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminCreditBatches, {
  PublishedCreditBatches,
  creditBatchPublishValues,
  creditBatchDeleteValues,
  type CreditBatchPreview,
} from "../app/admin-credit-batches";

const preview: CreditBatchPreview = {
  digest: "synthetic-digest",
  rowCount: 8,
  columns: [
    { key: "0", heading: "Synthetic Alpha", count: 8 },
    { key: "1", heading: "Synthetic Beta", count: 7 },
  ],
  rows: Array.from({ length: 8 }, (_, i) => ({
    row: i + 1,
    cells: [
      "SYNTHETIC-DO-NOT-RENDER-ALPHA",
      i ? "SYNTHETIC-DO-NOT-RENDER-BETA" : "",
    ],
  })),
};
const run = async () => ({});

test("publish values retain exact column mapping and final digest while omitting display-only preview samples", () => {
  const values = creditBatchPublishValues(
    "Synthetic Alpha,Synthetic Beta\nSYNTHETIC-A,SYNTHETIC-B",
    preview,
    [
      {
        ...preview.columns[0],
        heading: " Synthetic Alpha ",
        instructions: " # Redeem Alpha\nUse your own credit. ",
      },
      { ...preview.columns[1], instructions: "**Synthetic Beta** steps" },
    ],
  );
  assert.equal(values.confirmation, "PUBLISH_CREDIT_BATCH");
  assert.equal(values.digest, preview.digest);
  assert.deepEqual(values.columns, [
    {
      key: "0",
      heading: "Synthetic Alpha",
      instructions: "# Redeem Alpha\nUse your own credit.",
    },
    {
      key: "1",
      heading: "Synthetic Beta",
      instructions: "**Synthetic Beta** steps",
    },
  ]);
  assert.equal("rows" in values, false);
  assert.equal("rowCount" in values, false);
  assert.equal("count" in values.columns[0], false);
  assert.throws(() => creditBatchPublishValues("", preview, []));
  assert.throws(() =>
    creditBatchPublishValues("CSV", preview, [
      { ...preview.columns[1], instructions: "Instructions" },
      { ...preview.columns[0], instructions: "Instructions" },
    ]),
  );
  assert.throws(() =>
    creditBatchPublishValues(
      "CSV",
      preview,
      preview.columns.map((column) => ({ ...column, instructions: "" })),
    ),
  );
});

test("deletion identifies exactly a batch or its selected column with distinct confirmation tokens", () => {
  assert.deepEqual(creditBatchDeleteValues("synthetic_batch"), {
    batchId: "synthetic_batch",
    confirmation: "DELETE_CREDIT_BATCH",
  });
  assert.deepEqual(
    creditBatchDeleteValues("synthetic_batch", "synthetic_column"),
    {
      batchId: "synthetic_batch",
      columnId: "synthetic_column",
      confirmation: "DELETE_CREDIT_COLUMN",
    },
  );
  assert.throws(() => creditBatchDeleteValues(""));
});

test("CSV upload and paste lead directly to Add credits without Preview or Review controls", () => {
  const html = renderToStaticMarkup(createElement(AdminCreditBatches, { run }));
  assert.match(
    html,
    /type="file" accept="\.csv,text\/csv" aria-label="Upload credits CSV"/,
  );
  assert.match(html, /Paste CSV[\s\S]*?<textarea name="creditsCSV"/);
  assert.match(html, />Add credits<\/button>/);
  assert.match(html, /class="credit-batch-new-upload" open=""/);
  assert.doesNotMatch(
    html,
    /Publish credits|SYNTHETIC-DO-NOT-RENDER|>Preview<|>Review<|credit-batch-samples/,
  );
});

test("published columns render safe Markdown with separately named delete buttons and no raw voucher properties", () => {
  const html = renderToStaticMarkup(
    createElement(PublishedCreditBatches, {
      run,
      batches: [
        {
          id: "synthetic_batch",
          createdAt: "2026-10-23T20:00:00Z",
          columns: [
            {
              id: "synthetic_column",
              typeId: "synthetic_column",
              heading: "Synthetic Alpha",
              inventory: 8,
              assigned: 2,
              instructions:
                "# Redeem\n**Follow the steps**\n<script>bad()</script>\n[unsafe](javascript:alert(1))\n[help](https://example.test/help)",
              voucher_value: "SYNTHETIC-DO-NOT-RENDER",
              maps: ["SYNTHETIC-DO-NOT-RENDER"],
            },
          ],
        },
      ],
    } as any),
  );
  assert.match(html, /<h4>Redeem<\/h4>/);
  assert.match(html, /<strong>Follow the steps<\/strong>/);
  assert.doesNotMatch(html, /<script>|href="javascript:|DO-NOT-RENDER/);
  assert.match(html, /href="https:\/\/example.test\/help"/);
  assert.match(html, /aria-label="Delete column: Synthetic Alpha"/);
  assert.match(html, /aria-label="Delete credit batch: synthetic_batch"/);
  // Native controls stay inactive until the confirmation-aware handlers attach.
  assert.equal((html.match(/disabled=/g) || []).length, 2);
});
