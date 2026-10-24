import type { PortalService } from "./service";
import { one, rows, assertPreviousWrite, type SQL } from "./db";
import { demand, sha256, PortalError } from "./security";
import { creditAuditMetadata } from "./credit-audit";
import { creditAssignmentStatements } from "./credit-stock";

export type StockColumn = {
  key: string;
  sourceHeading: string;
  heading: string;
  instructions: string;
  values: string[];
  incomingCount: number;
};
type Existing = {
  id: string;
  name: string;
  instructions: string;
  active: number;
  batchId: string | null;
};
type History = { fingerprint: string; currentId: string | null };

async function analyze(s: PortalService, columns: StockColumn[]) {
  const prepared = await Promise.all(
    columns.map(async (column) => ({
      ...column,
      sourceKey: column.sourceHeading.trim().toLowerCase(),
      codes: await Promise.all(
        column.values.map(async (value) => ({
          value,
          fingerprint: await sha256(value),
        })),
      ),
    })),
  );
  const fingerprints = [
    ...new Set(
      prepared.flatMap((column) =>
        column.codes.map((code) => code.fingerprint),
      ),
    ),
  ];
  const history = new Map(
    (
      await rows<History>(
        s.db,
        "SELECT h.fingerprint,i.id currentId FROM credit_code_history h LEFT JOIN credit_inventory i ON i.id=h.inventory_id WHERE h.fingerprint IN (SELECT value FROM json_each(?))",
        JSON.stringify(fingerprints),
      )
    ).map((row) => [row.fingerprint, row]),
  );
  const seen = new Set<string>();
  const result = [];
  for (const column of prepared) {
    const existing = await one<Existing>(
      s.db,
      "SELECT t.id,t.name,t.instructions,t.active,c.batch_id batchId FROM credit_types t LEFT JOIN credit_category_keys k ON k.type_id=t.id LEFT JOIN credit_batch_columns c ON c.type_id=t.id WHERE k.source_key=? OR (k.source_key IS NULL AND lower(trim(t.name))=?)",
      column.sourceKey,
      column.sourceKey,
    );
    if (!existing)
      demand(
        !(await one(
          s.db,
          "SELECT id FROM credit_types WHERE lower(name)=lower(?)",
          column.heading,
        )),
        409,
        "CREDIT_HEADING_EXISTS",
        "This display heading belongs to another CSV header.",
      );
    let duplicates = column.incomingCount - column.values.length,
      retired = 0;
    const fresh = [];
    for (const code of column.codes) {
      const prior = history.get(code.fingerprint);
      if (prior && !prior.currentId) retired++;
      else if (prior || seen.has(code.fingerprint)) duplicates++;
      else {
        seen.add(code.fingerprint);
        fresh.push(code);
      }
    }
    result.push({
      ...column,
      existing,
      heading: existing?.name || column.heading,
      instructions: existing?.instructions ?? column.instructions,
      fresh,
      duplicates,
      retired,
    });
  }
  const contentDigest = await sha256(
    JSON.stringify({
      kind: "credit-stock-v2",
      columns: prepared.map((column) => ({
        sourceKey: column.sourceKey,
        fingerprints: column.codes.map((code) => code.fingerprint),
      })),
    }),
  );
  const digest = await sha256(
    JSON.stringify({
      contentDigest,
      columns: result.map((column) => ({
        sourceKey: column.sourceKey,
        typeId: column.existing?.id,
        heading: column.heading,
        instructions: column.instructions,
        fresh: column.fresh.map((code) => code.fingerprint),
        duplicates: column.duplicates,
        retired: column.retired,
      })),
    }),
  );
  return { columns: result, contentDigest, digest };
}

export async function importCreditStock(
  s: PortalService,
  actor: { id: string },
  action: string,
  input: { digest?: string; confirmation?: string; auditAction?: string },
  columns: StockColumn[],
  rowCount: number,
): Promise<Record<string, unknown>> {
  const analysis = await analyze(s, columns);
  const added = analysis.columns.reduce(
    (sum, column) => sum + column.fresh.length,
    0,
  );
  const duplicates = analysis.columns.reduce(
    (sum, column) => sum + column.duplicates,
    0,
  );
  const retired = analysis.columns.reduce(
    (sum, column) => sum + column.retired,
    0,
  );
  if (action === "preview-credit-batch") {
    await s.mutate(
      actor.id,
      input.auditAction || action,
      analysis.digest,
      [
        [
          "DELETE FROM import_previews WHERE created_at<=?",
          new Date(Date.parse(s.now()) - 15 * 60_000).toISOString(),
        ],
        [
          "INSERT INTO import_previews VALUES(?,?,?) ON CONFLICT(actor_id,digest) DO UPDATE SET created_at=excluded.created_at",
          actor.id,
          analysis.digest,
          s.now(),
        ],
      ],
      { columns: columns.length, added, duplicates, retired, rowCount },
    );
    return {
      digest: analysis.digest,
      rowCount,
      columns: analysis.columns.map((column) => ({
        key: column.key,
        sourceHeading: column.sourceHeading,
        heading: column.heading,
        instructions: column.instructions,
        typeId: column.existing?.id,
        mode: column.existing ? "restock" : "new",
        count: column.incomingCount,
        added: column.fresh.length,
        duplicates: column.duplicates,
        retired: column.retired,
      })),
      totals: { added, duplicates, retired },
      rows: Array.from({ length: Math.min(5, rowCount) }, (_, index) => ({
        row: index + 1,
        cells: columns.map((column) =>
          index < column.incomingCount ? "[masked]" : "",
        ),
      })),
    };
  }
  demand(
    input.confirmation === "PUBLISH_CREDIT_BATCH",
    422,
    "CREDIT_PUBLISH_CONFIRMATION_REQUIRED",
  );
  const prior = await one<{ result: string }>(
    s.db,
    "SELECT result FROM credit_stock_imports WHERE digest=?",
    analysis.contentDigest,
  );
  if (prior) {
    const result = JSON.parse(prior.result);
    for (const id of result.batchIds || [])
      demand(
        await one(
          s.db,
          "SELECT id FROM credit_batches WHERE id=? AND deleted_at IS NULL",
          id,
        ),
        409,
        "CREDIT_BATCH_DELETED",
      );
    return {
      ...result,
      added: 0,
      alreadyImported: true,
      message: "Credits were already imported.",
    };
  }
  demand(
    input.digest === analysis.digest &&
      (await one(
        s.db,
        "SELECT digest FROM import_previews WHERE actor_id=? AND digest=? AND created_at>?",
        actor.id,
        analysis.digest,
        new Date(Date.parse(s.now()) - 15 * 60_000).toISOString(),
      )),
    409,
    "PREVIEW_REQUIRED",
    "Stock or category details changed. Confirm the updated import counts.",
  );
  const newColumns = analysis.columns.filter(
    (column) => !column.existing && column.fresh.length,
  );
  const batchId = newColumns.length ? crypto.randomUUID() : undefined;
  const batchIds = [
    ...new Set(
      analysis.columns.flatMap((column) =>
        column.existing?.batchId ? [column.existing.batchId] : [],
      ),
    ),
  ];
  if (batchId) batchIds.push(batchId);
  const sql: SQL[] = batchId
    ? [
        [
          "INSERT INTO credit_batches(id,digest,created_by,created_at) VALUES(?,?,?,?)",
          batchId,
          analysis.contentDigest,
          actor.id,
          s.now(),
        ],
      ]
    : [];
  const typeIds: string[] = [];
  for (const column of analysis.columns) {
    if (!column.existing && !column.fresh.length) continue;
    const typeId = column.existing?.id || crypto.randomUUID();
    typeIds.push(typeId);
    if (!column.existing)
      sql.push(
        [
          "INSERT INTO credit_types(id,name,instructions,active) VALUES(?,?,?,1)",
          typeId,
          column.heading,
          column.instructions,
        ],
        [
          "INSERT INTO credit_batch_columns VALUES(?,?,?,?)",
          batchId!,
          typeId,
          column.key,
          column.sourceHeading,
        ],
      );
    sql.push([
      "INSERT INTO credit_category_keys VALUES(?,?) ON CONFLICT(source_key) DO NOTHING",
      column.sourceKey,
      typeId,
    ]);
    if (column.fresh.length) {
      const stock = column.fresh.map((code) => ({
        id: crypto.randomUUID(),
        value: code.value,
        fingerprint: code.fingerprint,
      }));
      sql.push([
        "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) SELECT json_extract(value,'$.id'),?,'',json_extract(value,'$.fingerprint'),?,json_extract(value,'$.value') FROM json_each(?)",
        typeId,
        s.now(),
        JSON.stringify(stock),
      ]);
    }
  }
  sql.push(...(await creditAssignmentStatements(s)));
  const result = {
    message: `${added} ${added === 1 ? "credit" : "credits"} added. Available credits assigned to checked-in recipients.`,
    batchId: batchId || batchIds[0],
    batchIds,
    typeIds,
    added,
    duplicates,
    retired,
  };
  sql.push(
    [
      "DELETE FROM import_previews WHERE actor_id=? AND digest=?",
      actor.id,
      analysis.digest,
    ],
    ...assertPreviousWrite(),
    [
      "INSERT INTO credit_stock_imports VALUES(?,?,?)",
      analysis.contentDigest,
      s.now(),
      JSON.stringify(result),
    ],
    ...assertPreviousWrite(),
  );
  // Existing Markdown may itself contain a voucher. Mask all current stock too,
  // and keep raw CSV/codes out of receipt and audit payloads.
  const knownValues = (
    await rows<{ voucher_value: string }>(
      s.db,
      "SELECT voucher_value FROM credit_inventory WHERE voucher_value IS NOT NULL",
    )
  ).map((row) => row.voucher_value);
  try {
    await s.mutate(
      actor.id,
      input.auditAction || "publish-credit-batch",
      batchId || analysis.contentDigest,
      sql,
      {
        columns: creditAuditMetadata(columns, knownValues),
        added,
        duplicates,
        retired,
        rowCount,
      },
    );
  } catch (error) {
    const saved = await one<{ result: string }>(
      s.db,
      "SELECT result FROM credit_stock_imports WHERE digest=?",
      analysis.contentDigest,
    );
    if (saved)
      return {
        ...JSON.parse(saved.result),
        added: 0,
        alreadyImported: true,
        message: "Credits were already imported.",
      };
    const message = error instanceof Error ? error.message : String(error);
    const constraint =
      typeof error === "object" && error !== null && "constraint" in error
        ? String(error.constraint)
        : "";
    if (
      /CREDIT_CODE_RETIRED/.test(message) ||
      (/UNIQUE constraint failed:/i.test(message) &&
        /credit_(inventory|types|category_keys|code_history)/.test(message)) ||
      (/duplicate key value violates unique constraint/i.test(message) &&
        /credit_(inventory|types|category_keys|code_history)/.test(
          constraint || message,
        ))
    )
      throw new PortalError(
        409,
        "PREVIEW_REQUIRED",
        "Stock changed during the import. Confirm the updated import counts.",
      );
    throw error;
  }
  return result;
}
