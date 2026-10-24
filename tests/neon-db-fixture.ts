import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import {
  createPostgresDatabase,
  type PostgresPool,
  type PostgresResult,
} from "../neon/db/adapter";
import {
  applyPortalMigrations,
  loadPortalMigrations,
} from "../neon/db/migrate";

/** PGlite has one connection: useful for real PostgreSQL trigger semantics, not
 * evidence of MVCC/concurrent-connection behavior. The optional PostgreSQL test
 * runs the same production adapter against an ephemeral local native server.
 */
export async function createPGliteFixture() {
  const engine = new PGlite({ extensions: { citext } });
  let tail = Promise.resolve();
  const pool: PostgresPool = {
    async connect() {
      const previous = tail;
      let unlock!: () => void;
      tail = new Promise((resolve) => {
        unlock = resolve;
      });
      await previous;
      return {
        async query(text, values) {
          if (values)
            return (await engine.query(
              text,
              values,
            )) as unknown as PostgresResult;
          const results = await engine.exec(text);
          return (results.at(-1) as unknown as PostgresResult) || { rows: [] };
        },
        release() {
          unlock();
        },
      };
    },
    async end() {
      await engine.close();
    },
  };
  const migrations = await loadPortalMigrations();
  await applyPortalMigrations(pool, migrations);
  return { engine, pool, migrations, db: createPostgresDatabase(pool) };
}
