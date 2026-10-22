// Independent processes share one SQLite WAL file. Synthetic SQL race rehearsal only.
import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
const db = new DatabaseSync(workerData.path);
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=15000;");
parentPort.postMessage({ ready: true });
parentPort.once("message", () => {
  const outcomes = [];
  for (const operation of workerData.operations) {
    try {
      db.exec("BEGIN IMMEDIATE");
      for (const [sql, ...args] of operation) db.prepare(sql).run(...args);
      db.exec("COMMIT");
      outcomes.push(true);
    } catch {
      try {
        db.exec("ROLLBACK");
      } catch {}
      outcomes.push(false);
    }
  }
  db.close();
  parentPort.postMessage({ outcomes });
  parentPort.close();
});
