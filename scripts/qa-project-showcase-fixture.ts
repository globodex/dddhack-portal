// Disposable synthetic-only fixture for rendered showcase QA. Never production input.
import { LocalDatabase } from "../lib/local-test/sqlite";
import { seedRichVisual } from "./visual-rich-fixtures";
const target = "/tmp/ddd-discover-refinement.sqlite";
if (process.env.PORTAL_LOCAL_TEST !== "1" || process.env.PORTAL_LOCAL_DB !== target) throw new Error("OWNED_SYNTHETIC_TARGET_REQUIRED");
const db = new LocalDatabase(target);
try {
  if (db.raw.prepare("SELECT count(*) n FROM projects").get()?.n) throw new Error("FRESH_PROJECT_COLLECTION_REQUIRED");
  await seedRichVisual(db);
  console.log("Two real synthetic eligible fixture entries seeded on the owned local database only.");
} finally { db.close(); }
