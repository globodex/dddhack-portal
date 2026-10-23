import { LocalDatabase } from "./sqlite";
import type { Identity } from "../identity";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../../scripts/fixtures";
let db: LocalDatabase | undefined;
export async function localRuntime(request: Request) {
  if (
    process.env.PORTAL_LOCAL_TEST !== "1" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname)
  )
    throw new Error("LOCAL_ADAPTER_DISABLED");
  if (!db) {
    db = new LocalDatabase(
      process.env.PORTAL_LOCAL_DB || ".local/portal.sqlite",
    );
    const exists = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE name='users'")
      .get();
    db.migrate();
    if (!exists) {
      await seedLocal(db);
    }
  }
  const fixture = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)portal_local_fixture=([a-z0-9]+)/)?.[1];
  const identity: Identity | null =
    fixture && fixture in fixtures
      ? fixtures[fixture as keyof typeof fixtures]
      : null;
  return { db, identity, key: LOCAL_CREDIT_KEY, localTest: true };
}
