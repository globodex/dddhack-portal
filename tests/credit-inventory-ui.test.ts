import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminCreditBatches, { creditBatchPublishValues, type CreditBatchPreview } from "../app/admin-credit-batches";
import { Credit, PersonalCreditsContent } from "../app/personal-credits";
import { pageMetadata } from "../lib/seo";

test("restocking keeps server metadata exactly and new categories still require instructions", () => {
  const preview: CreditBatchPreview = {
    digest: "synthetic-receipt", rowCount: 3,
    columns: [{ key: "0", sourceHeading: "Original CSV", heading: "Published heading", instructions: "  ```text\nkeep indentation\n```\n", count: 3, mode: "restock", typeId: "synthetic_type", added: 2, duplicates: 1 }],
    totals: { added: 2, duplicates: 1, retired: 0 }, rows: [],
  };
  const values = creditBatchPublishValues("Original CSV\nFAKE-NEW", preview, [{ key: "0", heading: "Unexpected edit", instructions: "Unexpected edit", count: 3, mode: "restock" }]);
  assert.deepEqual(values.columns, [{ key: "0", heading: "Published heading", instructions: preview.columns[0].instructions }]);
  assert.equal("totals" in values, false);
  assert.equal("typeId" in values.columns[0], false);
  const newPreview = { ...preview, columns: [{ ...preview.columns[0], mode: "new" as const }] };
  assert.throws(() => creditBatchPublishValues("Original CSV\nFAKE-NEW", newPreview, [{ key: "0", heading: "New", instructions: "", count: 3 }]));
});

test("stock overview is bounded metadata with counters and no plaintext inventory fields", () => {
  const html = renderToStaticMarkup(createElement(AdminCreditBatches, {
    run: async () => ({}), categories: [{ id: "synthetic_type", name: "Synthetic stock", active: true, total: 50, assigned: 10, available: 40, waiting: 0, exhausted: false, value: "FAKE-DO-NOT-RENDER" } as any],
  }));
  for (const label of ["Total", "Assigned", "Available", "Waiting", "Add more", "View stock"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /FAKE-DO-NOT-RENDER|Allocation status|credit-stock-table-frame/);
});

test("unallocated personal categories never imply that a private secret exists", () => {
  for (const [exhausted, label] of [[false, "Waiting for a code"], [true, "Out of stock"]] as const) {
    const html = renderToStaticMarkup(createElement(Credit, { credit: { type_id: "synthetic", name: "Synthetic credits", instructions: "**Keep these instructions**", allocated: 0, exhausted } }));
    assert.match(html, new RegExp(label));
    assert.match(html, /Keep these instructions/);
    assert.doesNotMatch(html, /••|<code|Reveal my allocation|Copy allocation/);
  }
});

test("personal display stays masked for assigned recipients and closed before check-in", () => {
  const credit = { type_id: "synthetic", name: "Synthetic credits", instructions: "", allocated: 1, value: "FAKE-DO-NOT-RENDER" };
  const html = renderToStaticMarkup(createElement(Credit, { credit }));
  assert.match(html, /Allocation hidden/);
  assert.match(html, /Reveal my allocation/);
  assert.doesNotMatch(html, /FAKE-DO-NOT-RENDER/);
  const denied = renderToStaticMarkup(createElement(PersonalCreditsContent, { checkedIn: false, credits: [credit] }));
  assert.match(denied, /Credits unlock at check-in/);
  assert.doesNotMatch(denied, /Synthetic credits|Allocation hidden|Reveal my allocation/);
  const metadata = pageMetadata("/personal/credits");
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal("openGraph" in metadata, false);
  assert.equal("twitter" in metadata, false);
});
