import { z } from "zod";
import { demand, PortalError } from "../../lib/security";
import type { ProjectMediaStorage } from "./index";

const MAX_JSON_BYTES = 4096;
async function boundedJson(request: Request) {
  demand(
    request.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    415,
    "JSON_REQUIRED",
  );
  const declared = request.headers.get("content-length");
  demand(
    !declared || (/^\d+$/.test(declared) && Number(declared) <= MAX_JSON_BYTES),
    413,
    "REQUEST_TOO_LARGE",
  );
  const reader = request.body?.getReader();
  demand(reader, 400, "JSON_REQUIRED");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new PortalError(413, "REQUEST_TOO_LARGE");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PortalError(400, "INVALID_JSON");
  }
}

/** Called behind the trusted Next proxy; identity must come from verified server auth. */
export function createStorageApiHandler(options: {
  appOrigin: string;
  authenticate: (request: Request) => Promise<{ id: string } | null>;
  storageFor: (actor: {
    id: string;
  }) => ProjectMediaStorage | Promise<ProjectMediaStorage>;
}) {
  const origin = new URL(options.appOrigin);
  demand(
    origin.origin === options.appOrigin && !origin.username && !origin.password,
    503,
    "APP_ORIGIN_INVALID",
  );
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (path !== "/api/media/uploads" && path !== "/api/media/finalize")
      return null;
    const headers = {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    try {
      demand(request.method === "POST", 405, "METHOD_NOT_ALLOWED");
      demand(
        request.headers.get("origin") === options.appOrigin,
        403,
        "ORIGIN_MISMATCH",
      );
      const actor = await options.authenticate(request);
      demand(actor, 401, "SIGN_IN_REQUIRED");
      const value = await boundedJson(request);
      const storage = await options.storageFor(actor);
      const result = path.endsWith("/finalize")
        ? await storage.finalizeUpload(actor.id, value)
        : await storage.issueUpload(actor.id, value);
      return Response.json(result, {
        status: path.endsWith("/finalize") ? 200 : 201,
        headers,
      });
    } catch (error) {
      if (error instanceof PortalError)
        return Response.json(
          { error: error.code },
          { status: error.status, headers },
        );
      if (error instanceof z.ZodError)
        return Response.json(
          { error: "INVALID_MEDIA_REQUEST" },
          { status: 422, headers },
        );
      // Do not expose endpoint URLs, credentials, signed query strings or SDK errors.
      return Response.json(
        { error: "STORAGE_UNAVAILABLE" },
        { status: 503, headers },
      );
    }
  };
}
