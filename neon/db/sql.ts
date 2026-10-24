/** Small, explicit SQLite compatibility layer for trusted portal SQL.
 * Parameters and string literals are never interpreted as SQL source.
 * Unsupported syntax throws before a connection or transaction is opened.
 */
export class UnsupportedPortalSql extends Error {
  constructor(message: string) {
    super(`UNSUPPORTED_PORTAL_SQL: ${message}`);
    this.name = "UnsupportedPortalSql";
  }
}

type Token = {
  text: string;
  kind: "word" | "string" | "quoted" | "symbol" | "parameter";
};
function tokenize(source: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const start = i++;
      let closed = false;
      while (i < source.length) {
        if (source[i++] !== c) continue;
        if (source[i] === c) {
          i++;
          continue;
        }
        closed = true;
        break;
      }
      if (!closed) throw new UnsupportedPortalSql("unterminated quote");
      out.push({
        text: source.slice(start, i),
        kind: c === "'" ? "string" : "quoted",
      });
      continue;
    }
    if (c === "?") {
      out.push({ text: c, kind: "parameter" });
      i++;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z_0-9]*/.exec(source.slice(i));
    if (word) {
      out.push({ text: word[0], kind: "word" });
      i += word[0].length;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/.exec(source.slice(i));
    if (number) {
      out.push({ text: number[0], kind: "symbol" });
      i += number[0].length;
      continue;
    }
    const pair = source.slice(i, i + 2);
    if (["--", "/*"].includes(pair))
      throw new UnsupportedPortalSql(
        "SQL comments are outside the runtime contract",
      );
    if (["<>", "<=", ">=", "!=", "||"].includes(pair)) {
      out.push({ text: pair, kind: "symbol" });
      i += 2;
      continue;
    }
    if ("(),.*+-/%=<>;".includes(c)) {
      out.push({ text: c, kind: "symbol" });
      i++;
      continue;
    }
    throw new UnsupportedPortalSql(
      `unsupported character ${JSON.stringify(c)}`,
    );
  }
  if (out.at(-1)?.text === ";") out.pop();
  if (out.some((t) => t.text === ";"))
    throw new UnsupportedPortalSql("multiple statements are forbidden");
  return out;
}

const functions: Record<string, string> = {
  json_extract: "portal_json_extract",
  json_each: "portal_json_each",
  json_array: "portal_json_array",
  json_valid: "portal_json_valid",
  instr: "portal_instr",
};
const compatibleFunctions = new Set([
  ...Object.keys(functions),
  "changes",
  "coalesce",
  "nullif",
  "lower",
  "length",
  "trim",
  "count",
  "sum",
  "max",
  "min",
  "row_number",
  "cast",
]);
const groupingKeywords = new Set([
  "values",
  "conflict",
  "in",
  "exists",
  "and",
  "or",
  "not",
  "as",
  "over",
  "by",
  "where",
  "when",
  "then",
  "else",
  "select",
  "from",
  "on",
  "having",
]);
const forbidden = new Set([
  "pragma",
  "attach",
  "detach",
  "vacuum",
  "replace",
  "abort",
  "raise",
  "sqlite_master",
  "sqlite_schema",
  "last_insert_rowid",
  "total_changes",
  "julianday",
  "datetime",
  "strftime",
  "json_type",
  "json_tree",
  "glob",
  "begin",
  "commit",
  "rollback",
  "savepoint",
  "release",
  "copy",
  "call",
  "create",
  "alter",
  "drop",
  "truncate",
  "grant",
  "revoke",
  "set",
  "reset",
]);
// SET is allowed only as part of UPDATE, never as a session command.
forbidden.delete("set");

export type CompiledPortalSql = {
  text: string;
  values: unknown[];
  mutation: boolean;
  previousWriteGuard: boolean;
};
export function compilePortalSql(
  source: string,
  args: readonly unknown[],
  previousChanges?: number,
): CompiledPortalSql {
  const tokens = tokenize(source);
  const words = tokens.map((t) =>
    t.kind === "word" ? t.text.toLowerCase() : t.text,
  );
  if (!["select", "insert", "update", "delete", "with"].includes(words[0]))
    throw new UnsupportedPortalSql(
      "only SELECT/INSERT/UPDATE/DELETE/WITH are supported",
    );
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === "word" && forbidden.has(words[i]))
      throw new UnsupportedPortalSql(
        `unsupported keyword/function ${words[i]}`,
      );
    if (
      tokens[i].kind === "quoted" &&
      tokens[i + 1]?.text === "(" &&
      words[i - 1] !== "into"
    )
      throw new UnsupportedPortalSql("quoted function calls are unsupported");
    if (
      tokens[i].kind === "word" &&
      tokens[i + 1]?.text === "(" &&
      !compatibleFunctions.has(words[i]) &&
      !groupingKeywords.has(words[i]) &&
      words[i - 1] !== "into"
    )
      throw new UnsupportedPortalSql(`unsupported function ${words[i]}`);
    if (words[i] === "insert" && words[i + 1] === "or")
      throw new UnsupportedPortalSql(
        "INSERT OR requires an explicit ON CONFLICT clause",
      );
  }
  let previousWriteGuard = false;
  const canonical = words.join(" ");
  if (words.includes("changes")) {
    if (canonical !== "insert into write_guards values ( ? , changes ( ) )")
      throw new UnsupportedPortalSql(
        "changes() is supported only in assertPreviousWrite guard",
      );
    if (previousChanges === undefined)
      throw new UnsupportedPortalSql(
        "a previous-write guard requires an immediately preceding batch mutation",
      );
    previousWriteGuard = true;
  }
  if (tokens.filter((t) => t.kind === "parameter").length !== args.length)
    throw new UnsupportedPortalSql("parameter count mismatch");
  if (
    args.some(
      (v) =>
        v !== null &&
        typeof v !== "string" &&
        typeof v !== "number" &&
        typeof v !== "boolean",
    )
  )
    throw new UnsupportedPortalSql(
      "parameters must be scalar strings, numbers, booleans or null",
    );
  if (args.some((v) => typeof v === "number" && !Number.isFinite(v)))
    throw new UnsupportedPortalSql("non-finite numeric parameter");

  const values = args.map((v) => (typeof v === "boolean" ? Number(v) : v));
  let parameter = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === "parameter") {
      token.text = `$${++parameter}`;
      if (words[i + 1] === "is" && ["null", "not"].includes(words[i + 2]))
        token.text += "::text";
    } else if (token.kind === "word") {
      if (words[i] === "changes") {
        values.push(previousChanges!);
        token.text = `$${values.length}`;
        tokens.splice(i + 1, 2);
        words.splice(i + 1, 2);
      } else if (functions[words[i]] && tokens[i + 1]?.text === "(")
        token.text = functions[words[i]];
      else if (words[i] === "window") token.text = '"window"';
      else if (
        token.text !== token.text.toLowerCase() &&
        token.text !== token.text.toUpperCase()
      )
        token.text = `"${token.text}"`;
    }
  }
  // The only runtime COLLATE form is a name/COALESCE expression in directory
  // pagination. Cast that complete expression to citext, retaining comparison and
  // ordering semantics. Other collations fail closed.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== "word" || tokens[i].text.toLowerCase() !== "collate")
      continue;
    if (tokens[i + 1]?.text.toLowerCase() !== "nocase")
      throw new UnsupportedPortalSql("unsupported collation");
    let start = i - 1;
    if (tokens[start]?.text === ")") {
      let depth = 1;
      while (--start >= 0) {
        if (tokens[start].text === ")") depth++;
        if (tokens[start].text === "(" && --depth === 0) break;
      }
      if (start < 1 || tokens[start - 1].kind !== "word")
        throw new UnsupportedPortalSql("unsupported collated expression");
      start--;
    } else {
      if (!["word", "quoted"].includes(tokens[start]?.kind))
        throw new UnsupportedPortalSql("unsupported collated expression");
      if (tokens[start - 1]?.text === ".") start -= 2;
    }
    const expression = tokens
      .slice(start, i)
      .map((t) => t.text)
      .join(" ");
    tokens.splice(start, i + 2 - start, {
      text: `(${expression})::citext`,
      kind: "symbol",
    });
    i = start;
  }
  let text = tokens.map((t) => t.text).join(" ");
  // SQLite permits this single known boolean aggregate in teamGoing().
  text = text.replace(
    /sum \( r \. status = 'approved' \)/gi,
    "sum(CASE WHEN r.status='approved' THEN 1 ELSE 0 END)",
  );
  // Explicit repairs for SQLite's permissive grouping and ON CONFLICT scope.
  if (
    canonical ===
    "select t . id , t . name , t . leader_id , count ( m . user_id ) members , i . title , i . hash from teams t left join memberships m on m . team_id = t . id left join ideas i on i . team_id = t . id group by t . id"
  )
    text += ", i.title, i.hash";
  if (
    canonical.startsWith(
      "insert into request_buckets values ( ? , ? , 1 ) on conflict ( actor_id , window ) do update set count = count + 1",
    )
  )
    text = text.replace(
      /SET count = count \+ 1/i,
      "SET count = request_buckets.count + 1",
    );
  const mutation = words.some((w) =>
    ["insert", "update", "delete"].includes(w),
  );
  return { text, values, mutation, previousWriteGuard };
}
