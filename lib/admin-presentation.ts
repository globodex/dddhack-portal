/** Request-delta optimization for safe Admin labels only. Never an authorization or database cache. */
export const adminPresentationFields = [
  "name",
  "avatarColor",
  "avatarExpression",
  "teamName",
  "teamPalette",
] as const;
type Field = (typeof adminPresentationFields)[number];
type Fields = Partial<Record<Field, string | null>>;
type Row = Record<string, any>;
export type AdminPresentationOptions = Record<
  string,
  string | number | boolean | null | undefined
>;
export type AdminPresentationMeta = {
  scope: string;
  version: string;
  unchanged: boolean;
};
type Snapshot = {
  scope: string;
  version: string;
  entries: ReadonlyMap<string, Readonly<Fields>>;
};

const canonical = (path: string) =>
  path.replace(/\/+/g, "/").replace(/\/$/, "");
const supported = new Set(["/admin/participants", "/admin/teams"]);
const owns = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const hasId = (row: Row) =>
  typeof row.id === "string" && row.id.length > 0 && row.id.length <= 150;
const fields = (row: Row): Fields =>
  Object.fromEntries(
    adminPresentationFields.flatMap((field) => {
      if (!owns(row, field)) return [];
      const value = row[field];
      return value === null ||
        (typeof value === "string" && value.length <= 500)
        ? [[field, value]]
        : [];
    }),
  );
const items = (view: Row): Row[] | null => {
  if (
    !Array.isArray(view.items) ||
    view.items.length > 10_000 ||
    view.items.some(
      (row: unknown) => !row || typeof row !== "object" || Array.isArray(row),
    )
  )
    return null;
  const ids = view.items.filter(hasId).map((row: Row) => row.id);
  return new Set(ids).size === ids.length ? view.items : null;
};
async function digest(value: unknown) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
/** Actor values must come from the freshly authorized response, never request identity claims. */
async function scopeFor(
  path: string,
  actor: Row | undefined,
  options: AdminPresentationOptions,
) {
  const route = canonical(path);
  if (
    !supported.has(route) ||
    !actor ||
    !hasId(actor) ||
    typeof actor.role !== "string" ||
    typeof actor.owner !== "boolean"
  )
    return null;
  if (!(
    actor.owner ||
    actor.role === "admin" ||
    (actor.role === "volunteer" && route === "/admin/participants")
  ))
    return null;
  const selected = Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (
    selected.length > 32 ||
    selected.some(
      ([key, value]) =>
        !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) ||
        !(
          value === null ||
          typeof value === "boolean" ||
          (typeof value === "number" && Number.isFinite(value)) ||
          (typeof value === "string" && value.length <= 2048)
        ),
    )
  )
    return null;
  // Options may contain user-entered search text. Retain only the scope digest in memory.
  return `aps1.${await digest([actor.id, actor.role, actor.owner, route, selected])}`;
}
async function snapshotFor(scope: string, rows: Row[]): Promise<Snapshot> {
  const entries = rows
    .filter(hasId)
    .map((row) => [row.id as string, Object.freeze(fields(row))] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    scope,
    version: `apv1.${await digest([scope, entries])}`,
    entries: new Map(entries),
  };
}

/** Call only after fresh service authorization/projection. Original request-shared view is untouched. */
export async function prepareAdminPresentation<T extends Row>(
  view: T,
  path: string,
  options: AdminPresentationOptions = {},
  knownVersion?: string,
): Promise<T & Row> {
  const scope = await scopeFor(path, view.me, options);
  const rows = items(view);
  if (!scope || !rows) return view;
  const snapshot = await snapshotFor(scope, rows);
  const unchanged = knownVersion === snapshot.version;
  return {
    ...view,
    items: unchanged
      ? rows.map((row) => {
          if (!hasId(row)) return row;
          const omitted = new Set(Object.keys(fields(row)));
          return Object.fromEntries(
            Object.entries(row).filter(([key]) => !omitted.has(key)),
          );
        })
      : rows,
    adminPresentation: { scope, version: snapshot.version, unchanged },
  };
}

export class AdminPresentationCacheMiss extends Error {
  constructor() {
    super("Admin presentation snapshot unavailable. Request a full view.");
    this.name = "AdminPresentationCacheMiss";
  }
}

/** One in-memory snapshot per Portal instance. Explicit clear on pagehide/logout/account change. */
export class AdminPresentationCache {
  #snapshot: Snapshot | null = null;
  #generation = 0;
  clear() {
    this.#generation++;
    this.#snapshot = null;
  }
  async knownVersion(
    path: string,
    actor: Row | undefined,
    options: AdminPresentationOptions = {},
  ) {
    const generation = this.#generation;
    const scope = await scopeFor(path, actor, options);
    if (generation !== this.#generation) return undefined;
    if (!scope || scope !== this.#snapshot?.scope) {
      this.clear();
      return undefined;
    }
    return this.#snapshot.version;
  }
  async merge<T extends Row>(
    view: T,
    path: string,
    options: AdminPresentationOptions = {},
  ): Promise<T> {
    const generation = ++this.#generation;
    try {
      const meta = view.adminPresentation as AdminPresentationMeta | undefined;
      if (!meta) {
        this.clear();
        return view;
      }
      const scope = await scopeFor(path, view.me, options);
      if (generation !== this.#generation)
        throw new AdminPresentationCacheMiss();
      const rows = items(view);
      if (
        !scope ||
        meta.scope !== scope ||
        !rows ||
        typeof meta.unchanged !== "boolean" ||
        typeof meta.version !== "string" ||
        !/^apv1\.[a-f0-9]{64}$/.test(meta.version)
      )
        throw new AdminPresentationCacheMiss();
      if (!meta.unchanged) {
        const next = await snapshotFor(scope, rows);
        if (generation !== this.#generation)
          throw new AdminPresentationCacheMiss();
        if (next.version !== meta.version)
          throw new AdminPresentationCacheMiss();
        this.#snapshot = next;
        return view;
      }
      const cached = this.#snapshot;
      const ids = rows.filter(hasId).map((row) => row.id as string);
      if (
        !cached ||
        cached.scope !== scope ||
        cached.version !== meta.version ||
        ids.length !== cached.entries.size ||
        ids.some((id) => !cached.entries.has(id)) ||
        rows.some(
          (row) =>
            hasId(row) &&
            adminPresentationFields.some((field) => owns(row, field)),
        )
      )
        throw new AdminPresentationCacheMiss();
      return {
        ...view,
        items: rows.map((row) =>
          hasId(row) ? { ...cached.entries.get(row.id), ...row } : row,
        ),
      };
    } catch (error) {
      if (generation === this.#generation) this.clear();
      throw error;
    }
  }
}
