import { createNeonDatabase } from "../db/index";
import { seedLocal } from "../../scripts/fixtures";
import { one } from "../../lib/db";

if (process.env.PORTAL_SYNTHETIC_DATABASE !== "1")
  throw new Error("SYNTHETIC_DATABASE_CONFIRMATION_REQUIRED");
const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED_REQUIRED");
// This rehearsal command intentionally refuses remote hosts or URL credentials
// in logs. It only seeds the fake *.test identities and inert fixture jobs.
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(connectionString).hostname,
  )
)
  throw new Error("SYNTHETIC_SEED_REQUIRES_LOOPBACK");
const db = createNeonDatabase({ DATABASE_URL_UNPOOLED: connectionString });
try {
  if ((await one<{ n: number }>(db, "SELECT count(*) n FROM users"))?.n !== 0)
    throw new Error("SYNTHETIC_SEED_REQUIRES_EMPTY_USERS");
  await seedLocal(db);
  console.log(
    JSON.stringify({
      synthetic: true,
      users: (await one(db, "SELECT count(*) n FROM users"))?.n,
      teams: (await one(db, "SELECT count(*) n FROM teams"))?.n,
    }),
  );
} finally {
  await db.close();
}
