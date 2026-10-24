import type { Database, Statement } from "../../lib/db";
import { compilePortalSql, UnsupportedPortalSql } from "./sql";

export type PostgresResult = {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
  affectedRows?: number;
  fields?: { name: string; dataTypeID?: number }[];
};
export interface PostgresConnection {
  query(text: string, values?: unknown[]): Promise<PostgresResult>;
  release(error?: Error): void;
}
export interface PostgresPool {
  connect(): Promise<PostgresConnection>;
  end(): Promise<unknown>;
}
type Result<T> = { results: T[]; meta: { changes: number } };
const retryable = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  ["40001", "40P01"].includes(String(error.code));

function compatibleRows<T>(result: PostgresResult): T[] {
  const bigintFields = new Set(
    result.fields?.filter((f) => f.dataTypeID === 20).map((f) => f.name),
  );
  return result.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (typeof value === "boolean") return [key, Number(value)];
        if (
          typeof value === "bigint" ||
          (bigintFields.has(key) && typeof value === "string")
        ) {
          const number = Number(value);
          if (!Number.isSafeInteger(number))
            throw new RangeError("POSTGRES_INTEGER_OUT_OF_SAFE_RANGE");
          return [key, number];
        }
        return [key, value];
      }),
    ),
  ) as T[];
}

class PortalStatement implements Statement {
  constructor(
    readonly owner: PostgresDatabase,
    readonly source: string,
    readonly values: readonly unknown[] = [],
  ) {}
  bind(...values: unknown[]): Statement {
    return new PortalStatement(this.owner, this.source, values);
  }
  async all<T>(): Promise<Result<T>> {
    return (await this.owner.batch<T>([this]))[0];
  }
}

/** Executes every batch on one connection in one SERIALIZABLE transaction.
 * Only serialization failures/deadlocks are retried. Connection/COMMIT failures
 * have an uncertain outcome and are never replayed by this adapter.
 */
export class PostgresDatabase implements Database {
  private closed = false;
  constructor(
    private readonly pool: PostgresPool,
    private readonly retries = 6,
  ) {
    if (!Number.isInteger(retries) || retries < 0 || retries > 10)
      throw new RangeError("INVALID_TRANSACTION_RETRIES");
  }
  prepare(source: string): Statement {
    return new PortalStatement(this, source);
  }
  async batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<Result<T>[]> {
    if (this.closed) throw new Error("DATABASE_CLOSED");
    const compiled = statements.map((statement) => {
      if (!(statement instanceof PortalStatement) || statement.owner !== this)
        throw new UnsupportedPortalSql(
          "batch statements must belong to this database",
        );
      // Compile all input before BEGIN; actual row counts are supplied below.
      return {
        statement,
        sql: compilePortalSql(statement.source, statement.values, 0),
      };
    });
    for (let i = 0; i < compiled.length; i++) {
      if (
        compiled[i].sql.previousWriteGuard &&
        (i === 0 ||
          !compiled[i - 1].sql.mutation ||
          compiled[i - 1].sql.previousWriteGuard)
      )
        throw new UnsupportedPortalSql(
          "a previous-write guard must immediately follow a batch mutation",
        );
    }
    if (compiled.length === 0) return [];
    for (let attempt = 0; ; attempt++) {
      const connection = await this.pool.connect();
      let began = false;
      let releaseError: Error | undefined;
      try {
        await connection.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        began = true;
        await connection.query("SET LOCAL statement_timeout = '15s'");
        await connection.query(
          "SET LOCAL idle_in_transaction_session_timeout = '15s'",
        );
        const out: Result<T>[] = [];
        let previousChanges: number | undefined;
        for (const { statement, sql: initial } of compiled) {
          const sql = initial.previousWriteGuard
            ? compilePortalSql(
                statement.source,
                statement.values,
                previousChanges,
              )
            : initial;
          const result = await connection.query(sql.text, sql.values);
          const changes = sql.mutation
            ? (result.rowCount ?? result.affectedRows ?? 0)
            : 0;
          out.push({ results: compatibleRows<T>(result), meta: { changes } });
          previousChanges = sql.mutation ? changes : undefined;
        }
        await connection.query("COMMIT");
        began = false;
        return out;
      } catch (error) {
        if (began) {
          try {
            await connection.query("ROLLBACK");
          } catch (rollbackError) {
            releaseError =
              rollbackError instanceof Error
                ? rollbackError
                : new Error("ROLLBACK_FAILED");
          }
        }
        if (releaseError || !retryable(error) || attempt >= this.retries)
          throw error;
      } finally {
        connection.release(releaseError);
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(4 * 2 ** attempt, 100) + Math.floor(Math.random() * 8),
        ),
      );
    }
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }
}

export function createPostgresDatabase(
  pool: PostgresPool,
  options: { retries?: number } = {},
) {
  return new PostgresDatabase(pool, options.retries);
}
