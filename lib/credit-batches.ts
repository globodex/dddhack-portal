import { z } from "zod";
import { one, rows, assertPreviousWrite, type SQL } from "./db";
import type { PortalService } from "./service";
import { demand, parseCSV, sha256 } from "./security";
import { attendancePredicate } from "./portal-status";
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
    demand(new Set(values).size === values.length, 422, "CSV_DUPLICATES");
    demand(values.length > 0, 422, "EMPTY_CREDIT_COLUMN");
    return {
      key,
      sourceHeading,
      heading: edit?.heading || sourceHeading,
      instructions: edit?.instructions || "",
      values,
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
    "SELECT c.batch_id batchId,t.id,t.id typeId,t.name heading,t.instructions,(SELECT count(*) FROM credit_inventory i WHERE i.type_id=t.id) inventory,(SELECT count(*) FROM credit_allocations a WHERE a.type_id=t.id) assigned FROM credit_batch_columns c JOIN credit_types t ON t.id=c.type_id ORDER BY CAST(c.column_key AS INTEGER)",
  );
  return batches.map((b) => ({
    ...b,
    columns: columns
      .filter((c) => c.batchId === b.id)
      .map(({ batchId, ...c }) => c),
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
  const d = inputSchema.parse(input),
    { parsed, columns } = parseBatch(d.csv, d.columns);
  const digest = await sha256(
    JSON.stringify({ kind: "credit-batch-v1", columns }),
  );
  const existing = await one<{ id: string; deleted_at: string | null }>(
    s.db,
    "SELECT id,deleted_at FROM credit_batches WHERE created_by=? AND digest=?",
    actor.id,
    digest,
  );
  if (action === "publish-credit-batch" && existing) {
    demand(!existing.deleted_at, 409, "CREDIT_BATCH_DELETED");
    return {
      message: "Credit batch was already published.",
      batchId: existing.id,
    };
  }
  for (const c of columns)
    demand(
      !(await one(
        s.db,
        "SELECT id FROM credit_types WHERE lower(name)=lower(?)",
        c.heading,
      )),
      409,
      "CREDIT_HEADING_EXISTS",
    );
  if (action === "preview-credit-batch") {
    await s.mutate(
      actor.id,
      action,
      digest,
      [
        [
          "INSERT INTO import_previews VALUES(?,?,?) ON CONFLICT(actor_id,digest) DO UPDATE SET created_at=excluded.created_at",
          actor.id,
          digest,
          s.now(),
        ],
      ],
      { columns: columns.length, rows: parsed.length - 1 },
    );
    return {
      digest,
      columns: columns.map(({ values, ...c }) => ({
        ...c,
        count: values.length,
      })),
      rows: parsed.slice(1, 6).map((r, i) => ({
        row: i + 1,
        cells: r.map((v) => (v ? "[masked]" : "")),
      })),
      rowCount: parsed.length - 1,
    };
  }
  demand(
    d.confirmation === "PUBLISH_CREDIT_BATCH",
    422,
    "CREDIT_PUBLISH_CONFIRMATION_REQUIRED",
  );
  demand(
    d.digest === digest &&
      (await one(
        s.db,
        "SELECT digest FROM import_previews WHERE actor_id=? AND digest=? AND created_at>?",
        actor.id,
        digest,
        new Date(Date.parse(s.now()) - 15 * 60_000).toISOString(),
      )),
    409,
    "PREVIEW_REQUIRED",
  );
  const batchId = crypto.randomUUID();
  const sql: SQL[] = [
    [
      "INSERT INTO credit_batches(id,digest,created_by,created_at) VALUES(?,?,?,?)",
      batchId,
      digest,
      actor.id,
      s.now(),
    ],
  ];
  for (const column of columns) {
    const typeId = crypto.randomUUID();
    sql.push(
      [
        "INSERT INTO credit_types(id,name,instructions,active) VALUES(?,?,?,1)",
        typeId,
        column.heading,
        column.instructions,
      ],
      [
        "INSERT INTO credit_batch_columns VALUES(?,?,?,?)",
        batchId,
        typeId,
        column.key,
        column.sourceHeading,
      ],
    );
    const inventory = await Promise.all(
      column.values.map(async (value) => ({
        id: crypto.randomUUID(),
        value,
        fingerprint: await sha256(value),
      })),
    );
    sql.push([
      "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) SELECT json_extract(value,'$.id'),?,'',json_extract(value,'$.fingerprint'),?,json_extract(value,'$.value') FROM json_each(?)",
      typeId,
      s.now(),
      JSON.stringify(inventory),
    ]);
    // Rank checked-in recipients and this new column's stock once; every mapping
    // is individually checked again by existing allocation triggers.
    sql.push([
      `WITH eligible AS (SELECT u.id,lower(u.email) email,row_number() OVER(ORDER BY u.created_at,u.id) rn FROM users u JOIN registrations r ON r.email=u.email AND r.status='approved' LEFT JOIN portal_roles pr ON pr.user_id=u.id WHERE ${attendancePredicate("u.id")} AND COALESCE(pr.role,u.role)<>'judge' AND EXISTS(SELECT 1 FROM luma_roster l WHERE l.email=u.email) AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=u.id AND rr.active=1)), stock AS (SELECT id,row_number() OVER(ORDER BY rowid) rn FROM credit_inventory WHERE type_id=?) INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email) SELECT stock.id,?,eligible.id,?,eligible.email FROM eligible JOIN stock ON stock.rn=eligible.rn`,
      typeId,
      typeId,
      s.now(),
    ]);
  }
  sql.push(
    [
      "DELETE FROM import_previews WHERE actor_id=? AND digest=?",
      actor.id,
      digest,
    ],
    ...assertPreviousWrite(),
  );
  try {
    await s.mutate(actor.id, action, batchId, sql, {
      columns: creditAuditMetadata(columns),
      rowCount: parsed.length - 1,
    });
  } catch (error) {
    const prior = await one<{ id: string }>(
      s.db,
      "SELECT id FROM credit_batches WHERE created_by=? AND digest=?",
      actor.id,
      digest,
    );
    if (prior)
      return {
        message: "Credit batch was already published.",
        batchId: prior.id,
      };
    throw error;
  }
  return {
    message:
      "Credit batch published. Available codes assigned to eligible checked-in recipients.",
    batchId,
  };
}
