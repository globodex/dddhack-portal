import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, attend } from "./helpers";
import { one, rows, batch } from "../lib/db";
const csv =
  "OpenAI vouchers,Cloud vouchers\nSYNTHETIC-CODE-ONE,SYNTHETIC-CLOUD-ONE\nSYNTHETIC-CODE-TWO,SYNTHETIC-CLOUD-TWO";
const columns = [
  {
    key: "0",
    heading: "Synthetic OpenAI credits",
    instructions: "Use SYNTHETIC-CODE-ONE with your own account.",
  },
  {
    key: "1",
    heading: "Synthetic cloud credits",
    instructions: "**Private voucher** setup instructions.",
  },
];
test("CSV review/publish assigns checked-in recipients once; column/batch deletion removes mappings and masks audit", async () => {
  const { db, service } = await setup();
  try {
    await attend(db, "fake_alice", "fake_bob");
    const preview = await service("admin").command("preview-credit-batch", {
      csv,
      columns,
    });
    assert.equal((preview.rows as any[]).length, 2);
    assert.ok(!JSON.stringify(preview).includes("SYNTHETIC-CODE-TWO"));
    assert.equal((await rows(db, "SELECT * FROM credit_batches")).length, 0);
    const publish = {
      csv,
      columns,
      digest: preview.digest,
      confirmation: "PUBLISH_CREDIT_BATCH",
    };
    const result = await service("admin").command(
      "publish-credit-batch",
      publish,
    );
    const batchId = String(result.batchId);
    assert.equal((await rows(db, "SELECT * FROM credit_batches")).length, 1);
    const defs = await rows<{ id: string }>(
      db,
      "SELECT type_id id FROM credit_batch_columns WHERE batch_id=? ORDER BY column_key",
      batchId,
    );
    assert.equal(defs.length, 2);
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM credit_allocations WHERE type_id IN (?,?)",
          defs[0].id,
          defs[1].id,
        )
      ).length,
      4,
    );
    const again = await service("admin").command(
      "publish-credit-batch",
      publish,
    );
    assert.equal(again.batchId, batchId);
    const bob = await service("bob").command("reveal-credit", {
      typeId: defs[0].id,
    });
    assert.ok(String(bob.value).startsWith("SYNTHETIC-CODE-"));
    await assert.rejects(
      service("carol").command("reveal-credit", { typeId: defs[0].id }),
    );
    const projection = await service("admin").view("/admin/credits");
    assert.equal((projection.creditBatches as any[])[0].columns.length, 2);
    assert.ok(!JSON.stringify(projection).includes("SYNTHETIC-CODE-TWO"));
    await assert.rejects(
      service("admin").command("delete-credit-batch", {
        batchId,
        confirmation: "DELETE_CREDIT_COLUMN",
      }),
      { code: "CREDIT_DELETE_CONFIRMATION_REQUIRED" },
    );
    await service("admin").command("delete-credit-column", {
      batchId,
      columnId: defs[0].id,
      confirmation: "DELETE_CREDIT_COLUMN",
    });
    assert.equal(
      await one(db, "SELECT id FROM credit_types WHERE id=?", defs[0].id),
      undefined,
    );
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM credit_allocations WHERE type_id=?",
          defs[0].id,
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM credit_inventory WHERE type_id=?",
          defs[0].id,
        )
      ).length,
      0,
    );
    assert.ok(
      await one(db, "SELECT id FROM credit_types WHERE id=?", defs[1].id),
    );
    await service("admin").command("delete-credit-batch", {
      batchId,
      confirmation: "DELETE_CREDIT_BATCH",
    });
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM credit_batch_columns WHERE batch_id=?",
          batchId,
        )
      ).length,
      0,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM credit_types WHERE id=?", defs[1].id))
        .length,
      0,
    );
    await assert.rejects(
      service("admin").command("publish-credit-batch", publish),
      { code: "CREDIT_BATCH_DELETED" },
    );
    const audit = JSON.stringify(
      await rows(
        db,
        "SELECT detail FROM audit_logs WHERE action IN ('publish-credit-batch','delete-credit-batch','delete-credit-column')",
      ),
    );
    for (const code of [
      "SYNTHETIC-CODE-ONE",
      "SYNTHETIC-CODE-TWO",
      "SYNTHETIC-CLOUD-ONE",
      "SYNTHETIC-CLOUD-TWO",
    ])
      assert.ok(!audit.includes(code));
    assert.ok(audit.includes("[masked]"));
    assert.ok(audit.includes("Synthetic OpenAI credits"));
  } finally {
    db.close();
  }
});
test("credit batch publish rejects stale/tampered preview and unauthorized actors without partial records", async () => {
  const { db, service, clock } = await setup();
  try {
    await assert.rejects(
      service("alice").command("preview-credit-batch", { csv }),
      { code: "ADMIN_REQUIRED" },
    );
    const p = await service("admin").command("preview-credit-batch", {
      csv,
      columns,
    });
    await assert.rejects(
      service("admin").command("publish-credit-batch", {
        csv,
        columns: [{ ...columns[0], heading: "Changed" }, columns[1]],
        digest: p.digest,
        confirmation: "PUBLISH_CREDIT_BATCH",
      }),
      { code: "PREVIEW_REQUIRED" },
    );
    clock("2026-10-22T08:16:00.000Z");
    await assert.rejects(
      service("admin").command("publish-credit-batch", {
        csv,
        columns,
        digest: p.digest,
        confirmation: "PUBLISH_CREDIT_BATCH",
      }),
      { code: "PREVIEW_REQUIRED" },
    );
    assert.equal((await rows(db, "SELECT * FROM credit_batches")).length, 0);
    const deduplicated = await service("admin").command(
      "preview-credit-batch",
      { csv: "Code\nDUP\nDUP" },
    );
    assert.deepEqual(deduplicated.totals, {
      added: 1,
      duplicates: 1,
      retired: 0,
    });
  } finally {
    db.close();
  }
});
