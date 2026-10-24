import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadPortalMigrations, type PortalMigration } from "./db/migrate";

// Auth has a separate ownership stream, appended after the reviewed portal and
// media baseline. One checksum ledger orders the final deployable schema.
export async function loadMigrationPlan(): Promise<PortalMigration[]> {
  const portal = await loadPortalMigrations();
  const sql = await readFile(new URL("./auth-migrations/0001_auth.sql", import.meta.url), "utf8");
  return [...portal, {
    name: "0100_auth.sql", sql,
    checksum: createHash("sha256").update(sql).digest("hex"),
  }];
}
