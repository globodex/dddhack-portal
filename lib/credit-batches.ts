import { z } from "zod";
import { one, rows, assertPreviousWrite, type SQL } from "./db";
import type { PortalService } from "./service";
import { demand, parseCSV } from "./security";
import { importCreditStock } from "./credit-stock-import";
import { creditSummaries } from "./credit-stock";
import { creditAuditMetadata } from "./credit-audit";
const columnSchema = z
  .object({
    key: z.string().regex(/^\d{1,2}$/),
    heading: z.string().trim().min(1).max(100),
    instructions: z.string().max(10_000),
  })
  .strict();
const inputSchema = z
  .object({
    csv: z.string().max(512_000),
    columns: z.array(columnSchema).max(20).optional(),
    digest: z.string().max(64).optional(),
    confirmation: z.literal("PUBLISH_CREDIT_BATCH").optional(),
  })
  .strict();
function parseBatch(csv: string, provided?: z.infer<typeof columnSchema>[]) {
  const parsed = parseCSV(csv.replace(/^\uFEFF/, ""));
  demand(parsed[0].length <= 20, 422, "CREDIT_COLUMN_LIMIT");
  demand(
    parsed[0].every((h) => h.length > 0 && h.length <= 100),
    422,
    "CREDIT_HEADER_REQUIRED",
  );
  demand(new Set(parsed[0].map(header => header.trim().toLowerCase())).size === parsed[0].length, 422, "CREDIT_HEADER_DUPLICATE");
  const columns = parsed[0].map((sourceHeading, index) => {
    const key = String(index),
      edit = provided?.find((c) => c.key === key);
    const values = parsed
      .slice(1)
      .map((r) => r[index])
      .filter((v) => v.length > 0);
    demand(
      values.every((v) => v.length <= 4000),
      422,
      "INVALID_CREDIT_VALUE",
    );
    demand(values.length > 0, 422, "EMPTY_CREDIT_COLUMN");
    return {
      key,
      sourceHeading,
      heading: edit?.heading || sourceHeading,
      instructions: edit?.instructions || "",
      values: [...new Set(values)],
      incomingCount: values.length,
    };
  });
  demand(
    !provided ||
      (provided.length === columns.length &&
        new Set(provided.map((c) => c.key)).size === columns.length &&
        provided.every((c) => columns.some((v) => v.key === c.key))),
    422,
    "CREDIT_COLUMNS_CHANGED",
  );
  demand(
    new Set(columns.map((c) => c.heading.toLowerCase())).size ===
      columns.length,
    422,
    "CREDIT_HEADING_DUPLICATE",
  );
  return { parsed, columns };
}
export async function creditBatchesView(s: PortalService) {
  await s.staff();
  const batches = await rows<{ id: string; createdAt: string }>(
    s.db,
    "SELECT id,created_at createdAt FROM credit_batches WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC",
  );
  const columns = await rows<Record<string, any>>(
    s.db,
    "SELECT c.batch_id batchId,c.source_heading sourceHeading,t.id,t.id typeId,t.name heading,t.instructions,(SELECT count(*) FROM credit_inventory i WHERE i.type_id=t.id) inventory,(SELECT count(*) FROM credit_allocations a WHERE a.type_id=t.id) assigned FROM credit_batch_columns c JOIN credit_types t ON t.id=c.type_id ORDER BY CAST(c.column_key AS INTEGER)",
  );
  const summaries = new Map((await creditSummaries(s)).map(row => [row.id, row]));
  return batches.map((b) => ({
    ...b,
    columns: columns
      .filter((c) => c.batchId === b.id)
      .map(({ batchId, ...c }) => ({ ...c, ...summaries.get(c.id), heading: c.heading })),
  }));
}
export async function creditBatchCommand(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (
    ![
      "preview-credit-batch",
      "publish-credit-batch",
      "delete-credit-batch",
      "delete-credit-column",
    ].includes(action)
  )
    return null;
  const actor = await s.staff();
  if (action === "delete-credit-batch" || action === "delete-credit-column") {
    const d = z
      .object({
        batchId: z.string().min(1).max(200),
        columnId: z.string().min(1).max(200).optional(),
        confirmation: z.enum(["DELETE_CREDIT_BATCH", "DELETE_CREDIT_COLUMN"]),
      })
      .strict()
      .parse(input);
    demand(
      d.confirmation ===
        (action === "delete-credit-batch"
          ? "DELETE_CREDIT_BATCH"
          : "DELETE_CREDIT_COLUMN"),
      422,
      "CREDIT_DELETE_CONFIRMATION_REQUIRED",
    );
    const batch = await one<{ id: string; deleted_at: string | null }>(
      s.db,
      "SELECT id,deleted_at FROM credit_batches WHERE id=?",
      d.batchId,
    );
    demand(batch, 404, "CREDIT_BATCH_NOT_FOUND");
    if (batch.deleted_at)
      return { message: "Credit batch was already deleted.", deleted: true };
    demand(
      action !== "delete-credit-column" || !!d.columnId,
      422,
      "CREDIT_COLUMN_REQUIRED",
    );
    demand(
      action !== "delete-credit-batch" || d.columnId === undefined,
      422,
      "CREDIT_DELETE_TARGET_MISMATCH",
    );
    const selected = await rows<{
      id: string;
      heading: string;
      instructions: string;
    }>(
      s.db,
      "SELECT t.id,t.name heading,t.instructions FROM credit_batch_columns c JOIN credit_types t ON t.id=c.type_id WHERE c.batch_id=? AND (? IS NULL OR t.id=?)",
      d.batchId,
      d.columnId || null,
      d.columnId || null,
    );
    demand(selected.length > 0, 404, "CREDIT_COLUMN_NOT_FOUND");
    const metadata = [];
    const sql: SQL[] = [];
    for (const column of selected) {
      const values = await rows<{ voucher_value: string | null }>(
        s.db,
        "SELECT voucher_value FROM credit_inventory WHERE type_id=? ORDER BY created_at,id",
        column.id,
      );
      metadata.push({
        heading: column.heading,
        instructions: column.instructions,
        values: values.map((v) => v.voucher_value || ""),
      });
      sql.push(
        [
          "UPDATE credit_types SET active=0 WHERE id=? AND name=? AND instructions=?",
          column.id,
          column.heading,
          column.instructions,
        ],
        ...assertPreviousWrite(),
        ["DELETE FROM credit_allocations WHERE type_id=?", column.id],
        ["DELETE FROM credit_inventory WHERE type_id=?", column.id],
        [
          "DELETE FROM credit_batch_columns WHERE batch_id=? AND type_id=?",
          d.batchId,
          column.id,
        ],
        ["DELETE FROM credit_category_keys WHERE type_id=?", column.id],
        ["DELETE FROM credit_types WHERE id=?", column.id],
      );
    }
    sql.push([
      "UPDATE credit_batches SET deleted_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM credit_batch_columns WHERE batch_id=?)",
      s.now(),
      d.batchId,
      d.batchId,
    ]);
    await s.mutate(actor.id, action, d.batchId, sql, {
      columns: creditAuditMetadata(metadata),
      externalRedemptionRevoked: false,
    });
    return {
      message:
        action === "delete-credit-batch"
          ? "Credit batch deleted."
          : "Credit column deleted.",
      deleted: true,
    };
  }
  const d = inputSchema.parse(input), { parsed, columns } = parseBatch(d.csv, d.columns);
  return importCreditStock(s, actor, action, d, columns, parsed.length - 1);
}

/** Compatibility for the existing one-category value-column import API. */
export async function legacyCreditStockImport(s: PortalService, action: string, input: unknown) {
  const actor = await s.staff();
  const d = z.object({ kind: z.literal("credits"), csv: z.string().max(512_000), typeId: z.string().min(1), digest: z.string().optional() }).strict().parse(input);
  const parsed = parseCSV(d.csv);
  demand(parsed[0].length === 1 && parsed[0][0] === "value", 422, "CSV_HEADER_EXPECTED", "Use a single value column.");
  const category = await one<{ name: string; instructions: string; sourceKey: string | null }>(s.db, "SELECT t.name,t.instructions,k.source_key sourceKey FROM credit_types t LEFT JOIN credit_category_keys k ON k.type_id=t.id WHERE t.id=?", d.typeId);
  demand(category, 422, "CREDIT_TYPE_REQUIRED");
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const csv = [quote(category.sourceKey || category.name), ...parsed.slice(1).map(row => quote(row[0]))].join("\n");
  const converted = parseBatch(csv, [{ key: "0", heading: category.name, instructions: category.instructions }]);
  return importCreditStock(s, actor, action === "preview-import" ? "preview-credit-batch" : "publish-credit-batch", { digest: d.digest, confirmation: "PUBLISH_CREDIT_BATCH", auditAction: action }, converted.columns, parsed.length - 1);
}
