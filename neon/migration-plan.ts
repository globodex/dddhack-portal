import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadPortalMigrations, type PortalMigration } from "./db/migrate";

// Portal and auth migrations share one checksum ledger. Sort the combined plan
// so new portal migrations follow the already published auth/evaluation baseline.
export async function loadMigrationPlan(): Promise<PortalMigration[]> {
  const portal = await loadPortalMigrations();
  const sql = await readFile(
    new URL("./auth-migrations/0001_auth.sql", import.meta.url),
    "utf8",
  );
  const approved = await readFile(
    new URL("./auth-migrations/0002_approved_evaluation.sql", import.meta.url),
    "utf8",
  );
  return [
    ...portal,
    {
      name: "0100_auth.sql",
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    },
    {
      name: "0101_approved_evaluation.sql",
      sql: approved,
      checksum: createHash("sha256").update(approved).digest("hex"),
    },
  ].sort((a, b) => a.name.localeCompare(b.name));
}
