import { LocalDatabase } from "../lib/local-test/sqlite";
import { seedLocal } from "./fixtures";
const db = new LocalDatabase(
  process.env.PORTAL_LOCAL_DB || ".local/portal.sqlite",
);
const existing = db.raw
  .prepare("SELECT name FROM sqlite_master WHERE name='users'")
  .get();
db.migrate();
if (existing)
  console.log(
    "Existing local database preserved. Use a new PORTAL_LOCAL_DB path for a fresh rehearsal.",
  );
else {
  await seedLocal(db);
  console.log(
    "Created local SQLite rehearsal with fake users, 1/3/5-member teams and non-redeemable credits.",
  );
}
db.close();
