import { Pool } from "pg";
import { createPostgresDatabase, type PostgresPool } from "./adapter";

export { createPostgresDatabase, PostgresDatabase } from "./adapter";
export type {
  PostgresPool,
  PostgresConnection,
  PostgresResult,
} from "./adapter";
export { compilePortalSql, UnsupportedPortalSql } from "./sql";

export type NeonDatabaseEnvironment = {
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
};

/** Backend-only adapter. A Node Function can reuse the module-scope pool; call
 * db.close() only when the owning process is shutting down.
 * Never import this module in browser/Next frontend code or forward these URLs.
 */
export function createNeonDatabase(env: NeonDatabaseEnvironment) {
  const connectionString = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!connectionString) throw new Error("NEON_DATABASE_URL_REQUIRED");
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error("INVALID_NEON_DATABASE_URL");
  }
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
  });
  return createPostgresDatabase(pool as unknown as PostgresPool);
}
