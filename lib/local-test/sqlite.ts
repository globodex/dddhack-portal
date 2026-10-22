// LOCAL TEST ADAPTER. Imported by scripts and development only; never a hosted database.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Database, Statement } from "../db";
export class LocalDatabase implements Database {
  raw: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;");
    if (path !== ":memory:") this.raw.exec("PRAGMA journal_mode=WAL;");
  }
  prepare(sql: string): Statement {
    let args: unknown[] = [];
    const raw = this.raw;
    const execute = () => {
      const st = raw.prepare(sql);
      const results = st.all(...(args as (string | number | null)[]));
      return {
        results,
        meta: {
          changes: Number(
            (raw.prepare("SELECT changes() AS n").get() as { n: number }).n,
          ),
        },
      };
    };
    const s: Statement & { execute: typeof execute } = {
      bind(...v) {
        args = v;
        return s;
      },
      async all<T>() {
        return execute() as { results: T[]; meta: { changes: number } };
      },
      execute,
    };
    return s;
  }
  async batch<T>(statements: Statement[]) {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const out = statements.map((s) =>
        (
          s as Statement & {
            execute: () => { results: T[]; meta: { changes: number } };
          }
        ).execute(),
      );
      this.raw.exec("COMMIT");
      return out;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }
  migrate() {
    this.raw.exec(
      readFileSync(
        new URL("../../db/migrations/0001_portal.sql", import.meta.url),
        "utf8",
      ),
    );
  }
  close() {
    this.raw.close();
  }
}
