import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { PostgresConnection, PostgresPool } from "./adapter";

export type PortalMigration = { name: string; sql: string; checksum: string };
export async function loadPortalMigrations(
  directory = new URL("../migrations/", import.meta.url),
): Promise<PortalMigration[]> {
  return Promise.all(
    (await readdir(directory))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort()
      .map(async (name) => {
        const sql = await readFile(new URL(name, directory), "utf8");
        return {
          name,
          sql,
          checksum: createHash("sha256").update(sql).digest("hex"),
        };
      }),
  );
}

/** Apply a reviewed migration set atomically; no fixture/data import is performed.
 * Advisory lock prevents concurrent migrators. Existing checksums cannot change.
 */
export async function applyPortalMigrations(
  pool: PostgresPool,
  migrations: PortalMigration[],
  checks: {
    lockTimeoutMilliseconds?: number;
    statementTimeoutMilliseconds?: number;
    beforeApply?: (connection: PostgresConnection) => Promise<void>;
    afterApply?: (
      connection: PostgresConnection,
      applied: readonly string[],
    ) => Promise<void>;
  } = {},
) {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    for (const [setting, value] of [
      ["lock_timeout", checks.lockTimeoutMilliseconds],
      ["statement_timeout", checks.statementTimeoutMilliseconds],
    ] as const) {
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 1 || value > 600000)
        throw new Error("MIGRATION_TIMEOUT_INVALID");
      await connection.query(`SET LOCAL ${setting} = '${value}ms'`);
    }
    await connection.query("SELECT pg_advisory_xact_lock(742019, 1)");
    // Populated upgrades verify their target, existing ledger and reviewed
    // receipt under this same lock, before even creating a ledger table.
    await checks.beforeApply?.(connection);
    await connection.query(
      "CREATE TABLE IF NOT EXISTS portal_schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const existing = await connection.query(
      "SELECT name,checksum FROM portal_schema_migrations ORDER BY name",
    );
    const known = new Map(
      existing.rows.map((row) => [String(row.name), String(row.checksum)]),
    );
    const applied: string[] = [];
    for (const migration of migrations) {
      if (
        createHash("sha256").update(migration.sql).digest("hex") !==
        migration.checksum
      )
        throw new Error(`MIGRATION_INVALID_CHECKSUM: ${migration.name}`);
      if (known.has(migration.name)) {
        if (known.get(migration.name) !== migration.checksum)
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH: ${migration.name}`);
        continue;
      }
      if ([...known.keys()].some((name) => name > migration.name))
        throw new Error(`MIGRATION_OUT_OF_ORDER: ${migration.name}`);
      await connection.query(migration.sql);
      await connection.query(
        "INSERT INTO portal_schema_migrations(name,checksum) VALUES($1,$2)",
        [migration.name, migration.checksum],
      );
      known.set(migration.name, migration.checksum);
      applied.push(migration.name);
    }
    await checks.afterApply?.(connection, applied);
    await connection.query("COMMIT");
    return applied;
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch {
      /* preserve migration error */
    }
    throw error;
  } finally {
    connection.release();
  }
}
