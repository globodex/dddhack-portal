// Fresh synthetic local fixture. Never imported by application code.
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { localRuntime } from "../lib/local-test/runtime";
import { handlePortal } from "../lib/http";
import { seedLocal } from "./fixtures";
import { seedRichVisual } from "./visual-rich-fixtures";

const path = "/tmp/ddd-submission-consent-8858.sqlite";
const origin = "http://localhost:3013";
assert.equal(process.env.PORTAL_LOCAL_TEST, "1");
assert.equal(process.env.PORTAL_LOCAL_DB, path);
assert.equal(process.env.NODE_ENV, "development");
assert.ok(!existsSync(path), "A new synthetic database is required");
const seed = new LocalDatabase(path);
seed.migrate();
await seedLocal(seed);
await seedRichVisual(seed);
const manifest = {
  syntheticOnly: true,
  freshSeedNotCopy: true,
  path,
  backendPort: 8858,
  origin,
  versionsBefore: seed.raw
    .prepare(
      "SELECT count(*) AS n FROM submission_versions WHERE team_id='fake_team1'",
    )
    .get()?.n,
};
assert.equal(manifest.versionsBefore, 2);
writeFileSync(
  "/tmp/ddd-submission-consent-8858-manifest.json",
  JSON.stringify(manifest, null, 2),
);
seed.close();
globalThis.fetch = async () => {
  throw new Error("EXTERNAL_FETCH_FORBIDDEN_IN_SYNTHETIC_FIXTURE");
};
const server = createServer(async (incoming, outgoing) => {
  try {
    let body: string | undefined;
    const mutation = !["GET", "HEAD"].includes(incoming.method || "");
    if (mutation) {
      assert.equal(incoming.method, "POST");
      assert.equal(incoming.url, "/api/portal");
      assert.equal(incoming.headers.origin, origin);
      assert.equal(
        incoming.headers["x-portal-proxy-secret"],
        "submission-consent-synthetic-proxy-only-8858",
      );
      assert.ok(
        /(?:^|;\s*)portal_local_fixture=alice(?:;|$)/.test(
          incoming.headers.cookie || "",
        ),
      );
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of incoming) {
        bytes += Buffer.byteLength(chunk);
        assert.ok(bytes < 1_000_000);
        chunks.push(Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString("utf8");
      const command = JSON.parse(body);
      assert.ok(["save-project", "submit-project"].includes(command.action));
      assert.equal(command.data.project.projectName, "Small Wonder");
    }
    const request = new Request(
      (mutation ? origin : "http://localhost:8858") + incoming.url,
      {
        method: incoming.method,
        headers: incoming.headers as Record<string, string>,
        ...(body === undefined ? {} : { body }),
      },
    );
    const pathName = new URL(request.url).pathname;
    const runtime = await localRuntime(request);
    const response =
      pathName === "/api/health"
        ? Response.json({ ok: true, runtime: "synthetic-local", ...manifest })
        : pathName === "/api/auth/session"
          ? Response.json({
              user: runtime.identity
                ? { ...runtime.identity, emailVerified: true }
                : null,
            })
          : pathName === "/api/portal"
            ? await handlePortal(request, runtime)
            : Response.json({ code: "NOT_FOUND" }, { status: 404 });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(
      incoming.method === "HEAD"
        ? undefined
        : Buffer.from(await response.arrayBuffer()),
    );
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ code: "SYNTHETIC_FIXTURE_ERROR" }));
  }
});
server.listen(8858, "127.0.0.1", () => console.log(JSON.stringify(manifest)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
