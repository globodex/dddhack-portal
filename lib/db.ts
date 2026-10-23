export interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    meta?: { changes: number };
  }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<{ results: T[]; meta?: { changes: number } }[]>;
}
export async function rows<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  ...args: unknown[]
): Promise<T[]> {
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
}
export async function one<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  ...args: unknown[]
): Promise<T | undefined> {
  return (await rows<T>(db, sql, ...args))[0];
}
export type SQL = [string, ...unknown[]];
// Place immediately after a conditional write in a batch. A stale revision
// rolls back the entire transaction, rather than committing later statements.
export function assertPreviousWrite(): SQL[] {
  const token = crypto.randomUUID();
  return [
    ["INSERT INTO write_guards VALUES(?,changes())", token],
    ["DELETE FROM write_guards WHERE token=?", token],
  ];
}
export function batch(db: Database, statements: SQL[]) {
  return db.batch(
    statements.map(([sql, ...args]) => db.prepare(sql).bind(...args)),
  );
}
