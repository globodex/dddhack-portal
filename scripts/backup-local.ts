// Explicit local synthetic-data rehearsal only. Never points at a hosted binding.
import { mkdirSync } from "node:fs";
import { LocalDatabase } from "../lib/local-test/sqlite";
const db = new LocalDatabase(
  process.env.PORTAL_LOCAL_DB || ".local/portal.sqlite",
);
try {
  const unsafe = db.raw
    .prepare("SELECT count(*) n FROM users WHERE email NOT LIKE '%.test'")
    .get() as { n: number };
  if (unsafe.n)
    throw new Error(
      "Backup helper permits synthetic .test accounts only. Use the authorized Sites backup workflow for live data.",
    );
  mkdirSync(".local/backups", { recursive: true });
  const path = `.local/backups/rehearsal-${Date.now()}.sqlite`;
  db.raw.prepare("VACUUM INTO ?").run(path);
  const copy = new LocalDatabase(path);
  const status = copy.raw.prepare("PRAGMA integrity_check").get();
  const count = copy.raw.prepare("SELECT count(*) n FROM users").get();
  console.log({
    path,
    status,
    count,
    scope:
      "Synthetic local backup and restore verification; includes encrypted fake inventory.",
  });
  copy.close();
} finally {
  db.close();
}
