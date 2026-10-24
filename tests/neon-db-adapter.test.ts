import { test } from "node:test";
import assert from "node:assert/strict";
import { createPostgresDatabase, type PostgresPool } from "../neon/db/adapter";
import { compilePortalSql } from "../neon/db/sql";
import { createNeonDatabase } from "../neon/db/index";
import { assertPreviousWrite } from "../lib/db";

test("SQL compiler preserves literal question marks, aliases, case-insensitive keys and numbered parameter order", () => {
  const compiled = compilePortalSql(
    "SELECT '?' marker, 'changes()' words, u.name displayName FROM users u WHERE id=? AND (? IS NULL OR email=?)",
    ["id", null, "x@portal.test"],
  );
  assert.ok(compiled.text.includes("'?'"));
  assert.ok(compiled.text.includes('"displayName"'));
  assert.ok(compiled.text.includes("$2::text IS NULL"));
  assert.deepEqual(compiled.values, ["id", null, "x@portal.test"]);
  assert.equal(compiled.mutation, false);
  assert.match(
    compilePortalSql(
      "SELECT COALESCE(p.name,u.name) COLLATE NOCASE FROM users u ORDER BY COALESCE(p.name,u.name) COLLATE NOCASE",
      [],
    ).text,
    /::citext/,
  );
  const guard = compilePortalSql(
    "INSERT INTO write_guards VALUES(?,changes())",
    ["token"],
    1,
  );
  assert.deepEqual(guard.values, ["token", 1]);
  assert.match(guard.text, /\$2/);
});

test("SQL compiler rejects unsupported syntax and malformed guards before acquiring a connection", async () => {
  for (const [source, args] of [
    ["SELECT 1; DELETE FROM users", []],
    ["PRAGMA foreign_keys=OFF", []],
    ["INSERT OR IGNORE INTO users VALUES(?)", ["x"]],
    ["SELECT changes()", []],
    ["SELECT substr(?,1)", ["string"]],
    ["SELECT pg_sleep(?)", [1]],
    ["SELECT json_type(?)", ["{}"]],
    ["SELECT datetime(?)", ["now"]],
    ["SELECT ? -- annotation", [1]],
    ["SELECT ?", []],
    ["SELECT ?", [{}]],
    ["SELECT ?", [Infinity]],
    ["SELECT 'unterminated", []],
    ["SELECT x COLLATE BINARY FROM users", []],
  ] as [string, unknown[]][])
    assert.throws(
      () => compilePortalSql(source, args),
      /UNSUPPORTED_PORTAL_SQL/,
    );
  let connects = 0;
  const pool: PostgresPool = {
    async connect() {
      connects++;
      throw new Error("unexpected connection");
    },
    async end() {},
  };
  const db = createPostgresDatabase(pool);
  await assert.rejects(
    db.batch(
      assertPreviousWrite().map(([sql, ...args]) =>
        db.prepare(sql).bind(...args),
      ),
    ),
    /immediately follow/,
  );
  await assert.rejects(
    db.batch([db.prepare("SELECT 1"), db.prepare("SELECT changes()")]),
    /UNSUPPORTED_PORTAL_SQL/,
  );
  const other = createPostgresDatabase(pool);
  await assert.rejects(
    db.batch([other.prepare("SELECT 1")]),
    /belong to this database/,
  );
  assert.equal(connects, 0);
});

test("adapter retries a whole serializable transaction only for known-aborted serialization/deadlock failures", async () => {
  for (const code of ["40001", "40P01", "23514", "ECONNRESET"]) {
    const calls: string[] = [];
    let connections = 0;
    let releases = 0;
    const pool: PostgresPool = {
      async connect() {
        const attempt = ++connections;
        return {
          async query(text, values) {
            calls.push(`${attempt}:${text}`);
            if (text.startsWith("UPDATE") && attempt === 1)
              throw Object.assign(new Error("synthetic failure"), { code });
            if (text.startsWith("INSERT INTO write_guards"))
              assert.deepEqual(values, ["guard", 1]);
            return { rows: [], rowCount: text.startsWith("UPDATE") ? 1 : 0 };
          },
          release() {
            releases++;
          },
        };
      },
      async end() {},
    };
    const db = createPostgresDatabase(pool, { retries: 1 });
    const operation = db.batch([
      db.prepare("UPDATE users SET name=? WHERE id=?").bind("Name", "id"),
      db.prepare("INSERT INTO write_guards VALUES(?,changes())").bind("guard"),
    ]);
    if (["40001", "40P01"].includes(code)) await operation;
    else await assert.rejects(operation, /synthetic failure/);
    assert.equal(connections, ["40001", "40P01"].includes(code) ? 2 : 1);
    assert.equal(releases, connections);
    assert.ok(calls.some((call) => call === "1:ROLLBACK"));
    assert.ok(calls[0].includes("BEGIN ISOLATION LEVEL SERIALIZABLE"));
  }
});

test("ambiguous COMMIT connection loss is not replayed and credentials never appear in URL validation errors", async () => {
  let connects = 0;
  const pool: PostgresPool = {
    async connect() {
      connects++;
      return {
        async query(text) {
          if (text === "COMMIT")
            throw Object.assign(new Error("synthetic connection loss"), {
              code: "ECONNRESET",
            });
          return { rows: [], rowCount: 1 };
        },
        release() {},
      };
    },
    async end() {},
  };
  const db = createPostgresDatabase(pool);
  await assert.rejects(
    db
      .prepare("DELETE FROM import_previews WHERE actor_id=?")
      .bind("fake")
      .all(),
    /synthetic connection loss/,
  );
  assert.equal(connects, 1);
  assert.throws(
    () => createNeonDatabase({}),
    /^Error: NEON_DATABASE_URL_REQUIRED$/,
  );
  assert.throws(
    () =>
      createNeonDatabase({
        DATABASE_URL: "https://private-secret@example.invalid",
      }),
    /^Error: INVALID_NEON_DATABASE_URL$/,
  );
  await db.close();
  await assert.rejects(db.prepare("SELECT 1").all(), /DATABASE_CLOSED/);
});
