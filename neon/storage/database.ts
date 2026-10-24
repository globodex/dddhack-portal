import { createHash, randomUUID } from "node:crypto";
import { one, type Database, type Statement } from "../../lib/db";
import { demand, PortalError } from "../../lib/security";
import { validateProjectImage } from "../../lib/project-media";
import { validateUploadedImage } from "./image";
import {
  parseProjectMediaReference,
  projectMediaMarker as marker,
  type ProjectMediaReference as Reference,
} from "./reference";
import {
  MAX_IMAGE_BYTES,
  type MediaKind,
  type MediaObjectStore,
} from "./types";

type Bound = { sql: string; args: unknown[] };
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const compact = (sql: string) =>
  sql.replace(/\s+/g, "").replace(/;$/, "").toLowerCase();

/**
 * Decorates the existing Database boundary so service/UI data URIs remain identical
 * while only bounded immutable object references are persisted in project JSON.
 * This is storage, not authorization: wrap the backend DB used by PortalService;
 * the service's existing permission checks and DB guards remain mandatory.
 */
export function createMediaDatabase(
  db: Database,
  options: {
    objectStore: MediaObjectStore;
    mediaBucket?: string;
    uuid?: () => string;
  },
): Database {
  const bucket = options.mediaBucket ?? "project-media";
  demand(
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket),
    503,
    "STORAGE_BUCKETS_INVALID",
  );
  const uuid = options.uuid ?? randomUUID;
  const statements = new WeakMap<Statement, Bound>();

  async function storePayload(
    value: unknown,
    teamId: unknown,
    cache: Map<string, Promise<Reference>>,
  ) {
    demand(
      typeof teamId === "string" &&
        teamId.length > 0 &&
        teamId.length <= 200 &&
        typeof value === "string" &&
        Buffer.byteLength(value) <= 400_000,
      422,
      "INVALID_MEDIA_PAYLOAD",
    );
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(value);
    } catch {
      throw new PortalError(422, "INVALID_MEDIA_PAYLOAD");
    }
    demand(
      payload && typeof payload === "object" && !Array.isArray(payload),
      422,
      "INVALID_MEDIA_PAYLOAD",
    );
    for (const kind of ["logo", "banner"] as const) {
      const image = payload[kind];
      if (image === undefined || image === "") continue;
      // A client must never submit a reference to an object it did not upload.
      demand(typeof image === "string", 422, "INVALID_MEDIA_PAYLOAD");
      validateProjectImage(image, kind);
      const match =
        /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
          image,
        )!;
      const bytes = Buffer.from(match[2], "base64");
      const digest = hash(bytes);
      const cacheKey = `${teamId}:${kind}:${digest}`;
      let pending = cache.get(cacheKey);
      if (!pending) {
        pending = (async () => {
          const decoded = await validateUploadedImage(
            bytes,
            match[1] as Reference["contentType"],
            kind,
            { preserveOriginal: true },
          );
          // Keep original bytes so hydration preserves existing request hashes and API
          // values exactly. Full decoding above verifies the input; HTTP image serving
          // retains the portal's fixed raster MIME, nosniff and sandbox headers.
          const prefix = kind === "logo" ? "logos" : "banners";
          const key = `${prefix}/objects/teams/${hash(teamId).slice(0, 32)}/d${digest}/${uuid()}.${match[1] === "image/png" ? "png" : "jpg"}`;
          const metadata = {
            ...decoded,
            bytes,
            byteLength: bytes.length,
            sha256: digest,
          };
          await options.objectStore.write(bucket, key, metadata);
          return {
            storage: marker,
            version: 1,
            bucket,
            key,
            kind,
            contentType: decoded.contentType,
            byteLength: bytes.length,
            width: decoded.width,
            height: decoded.height,
            sha256: digest,
          } as Reference;
        })();
        cache.set(cacheKey, pending);
      }
      payload[kind] = await pending;
    }
    return JSON.stringify(payload);
  }

  async function transform(
    bound: Bound,
    cache: Map<string, Promise<Reference>>,
  ) {
    const sql = compact(bound.sql);
    const args = [...bound.args];
    if (
      sql.startsWith("insertintoprojects") ||
      sql.startsWith("updateprojectssetdraft=")
    ) {
      if (
        sql ===
        "insertintoprojects(id,team_id,slug,draft,updated_at)values(?,?,?,?,?)"
      ) {
        args[3] = await storePayload(args[3], args[1], cache);
      } else if (
        sql ===
        "updateprojectssetdraft=?,revision=revision+1,updated_at=?whereid=?andrevision=?"
      ) {
        const project = await one<{ team_id: string }>(
          db,
          "SELECT team_id FROM projects WHERE id=?",
          args[2],
        );
        demand(project, 409, "PROJECT_CHANGED_RELOAD");
        args[0] = await storePayload(args[0], project.team_id, cache);
      } else throw new PortalError(500, "UNSUPPORTED_MEDIA_WRITE");
    } else if (sql.startsWith("insertintosubmission_versions")) {
      if (
        sql ===
        "insertintosubmission_versionsselect?,?,coalesce(max(attempt),0)+1,?,?fromsubmission_versionswhereteam_id=?"
      ) {
        demand(args[1] === args[4], 422, "INVALID_MEDIA_PAYLOAD");
        args[2] = await storePayload(args[2], args[1], cache);
      } else if (
        sql ===
        "insertintosubmission_versions(id,team_id,attempt,payload,created_at)values(?,?,?,?,?)"
      ) {
        args[3] = await storePayload(args[3], args[1], cache);
      } else throw new PortalError(500, "UNSUPPORTED_MEDIA_WRITE");
    } else if (
      /^(?:insertor\w+into|replaceinto)(?:projects|submission_versions)/.test(
        sql,
      ) ||
      /^update(?:or\w+)?submission_versions/.test(sql) ||
      (sql.startsWith("updateprojectsset") &&
        /(?:^|,)draft=/.test(sql.slice("updateprojectsset".length)))
    ) {
      throw new PortalError(500, "UNSUPPORTED_MEDIA_WRITE");
    }
    return db.prepare(bound.sql).bind(...args);
  }

  async function readReference(
    value: unknown,
    kind: MediaKind,
    cache: Map<string, Promise<string>>,
    teamId?: string,
  ) {
    const reference = parseProjectMediaReference(value, kind, {
      mediaBucket: bucket,
      teamId,
    });
    const cacheKey = JSON.stringify(reference);
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        const object = await options.objectStore.read(
          bucket,
          reference.key,
          MAX_IMAGE_BYTES,
        );
        demand(
          object.contentType === reference.contentType &&
            object.contentLength === reference.byteLength &&
            object.bytes.byteLength === reference.byteLength &&
            hash(object.bytes) === reference.sha256,
          422,
          "STORED_IMAGE_CHANGED",
        );
        const uri = `data:${reference.contentType};base64,${Buffer.from(object.bytes).toString("base64")}`;
        const dimensions = validateProjectImage(uri, kind);
        demand(
          dimensions.width === reference.width &&
            dimensions.height === reference.height,
          422,
          "STORED_IMAGE_CHANGED",
        );
        return uri;
      })();
      cache.set(cacheKey, pending);
    }
    return pending;
  }

  async function hydrate<T>(
    sql: string,
    result: { results: T[]; meta?: { changes: number } },
    cache: Map<string, Promise<string>>,
  ) {
    if (!/\b(?:projects|submission_versions)\b/i.test(sql)) return result;
    const results = await Promise.all(
      result.results.map(async (row) => {
        if (!row || typeof row !== "object") return row;
        const output = { ...row } as Record<string, unknown>;
        // This explicit projection is for the already-authorized public image query.
        // Public-list payload aliases remain raw metadata and trigger no object reads.
        if ("project_image_value" in output) {
          const value = output.project_image_value;
          demand(
            (output.project_image_kind === "logo" ||
              output.project_image_kind === "banner") &&
              typeof output.project_image_team_id === "string" &&
              output.project_image_team_id.length > 0 &&
              output.project_image_team_id.length <= 200,
            422,
            "INVALID_STORED_MEDIA_REFERENCE",
          );
          const kind = output.project_image_kind;
          if (typeof value === "string" && value.startsWith("data:")) {
            validateProjectImage(value, kind);
          } else {
            let reference: unknown = value;
            if (typeof value === "string") {
              demand(
                Buffer.byteLength(value) <= 4096,
                422,
                "INVALID_STORED_MEDIA_REFERENCE",
              );
              try {
                reference = JSON.parse(value);
              } catch {
                throw new PortalError(422, "INVALID_STORED_MEDIA_REFERENCE");
              }
            }
            output.project_image_value = await readReference(
              reference,
              kind,
              cache,
              output.project_image_team_id,
            );
          }
        }
        for (const field of ["draft", "payload"] as const) {
          const value = output[field];
          if (typeof value !== "string" || !value.includes(marker)) continue;
          demand(
            Buffer.byteLength(value) <= 400_000,
            422,
            "INVALID_STORED_MEDIA_REFERENCE",
          );
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(value);
          } catch {
            throw new PortalError(422, "INVALID_STORED_MEDIA_REFERENCE");
          }
          demand(
            payload && typeof payload === "object" && !Array.isArray(payload),
            422,
            "INVALID_STORED_MEDIA_REFERENCE",
          );
          for (const kind of ["logo", "banner"] as const) {
            if (payload[kind] && typeof payload[kind] === "object")
              payload[kind] = await readReference(payload[kind], kind, cache);
          }
          output[field] = JSON.stringify(payload);
        }
        return output as T;
      }),
    );
    return { ...result, results };
  }

  return {
    prepare(sql) {
      const bound: Bound = { sql, args: [] };
      const statement: Statement = {
        bind(...args) {
          bound.args = args;
          return statement;
        },
        async all<T>() {
          const raw = await transform(bound, new Map());
          return hydrate(sql, await raw.all<T>(), new Map());
        },
      };
      statements.set(statement, bound);
      return statement;
    },
    async batch<T>(input: Statement[]) {
      const writes = new Map<string, Promise<Reference>>();
      const bounds = input.map((statement) => {
        const bound = statements.get(statement);
        demand(bound, 500, "FOREIGN_MEDIA_STATEMENT");
        return bound;
      });
      // Upload before opening the DB transaction; failure leaves no partial DB write.
      // Rolled-back transactions can leave private orphan objects for explicit cleanup.
      const raw = await Promise.all(
        bounds.map((bound) => transform(bound, writes)),
      );
      const results = await db.batch<T>(raw);
      const reads = new Map<string, Promise<string>>();
      return Promise.all(
        results.map((result, index) =>
          hydrate(bounds[index].sql, result, reads),
        ),
      );
    },
  };
}
