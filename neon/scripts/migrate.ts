import { Pool } from "pg";
import { applyPortalMigrations, loadPortalMigrations } from "../db/migrate";
import type { PostgresPool } from "../db/adapter";

// Inspect mode is harmless and default. Apply only to an approved empty/synthetic
// local branch; production movement/provisioning remains a separate operation.
const migrations = await loadPortalMigrations();
if (process.argv.includes("--apply-synthetic")) {
  if (process.env.PORTAL_SYNTHETIC_DATABASE !== "1")
    throw new Error("SYNTHETIC_DATABASE_CONFIRMATION_REQUIRED");
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED_REQUIRED");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const applied = await applyPortalMigrations(
      pool as unknown as PostgresPool,
      migrations,
    );
    console.log(JSON.stringify({ applied }));
  } finally {
    await pool.end();
  }
} else {
  console.log(
    JSON.stringify(
      {
        mode: "inspect-only",
        migrations: migrations.map(({ name, checksum }) => ({
          name,
          checksum,
        })),
      },
      null,
      2,
    ),
  );
}
