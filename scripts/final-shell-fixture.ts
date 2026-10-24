// Fresh disposable fixture for the final read-only submission-shell capture.
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { localRuntime } from "../lib/local-test/runtime";
import { handlePortal } from "../lib/http";
import { seedLocal } from "./fixtures";
import { seedRichVisual } from "./visual-rich-fixtures";

const path = "/tmp/ddd-final-ui-8849.sqlite";
assert.equal(process.env.PORTAL_LOCAL_TEST, "1");
assert.equal(process.env.PORTAL_LOCAL_DB, path);
assert.equal(process.env.NODE_ENV, "development");
assert.ok(!existsSync(path), "Never reset or reuse an existing fixture");
const seed = new LocalDatabase(path);
seed.migrate();
await seedLocal(seed);
await seedRichVisual(seed);
const ids = seed.raw.prepare("SELECT id FROM users").all();
assert.ok(ids.length > 10 && ids.every((row) => String(row.id).startsWith("fake_")));
const manifest = {
  syntheticOnly: true,
  freshSeedNotCopy: true,
  path,
  backendPort: 8849,
  appOrigin: "http://localhost:3007",
  users: ids.length,
  aliceRevision: seed.raw.prepare("SELECT revision FROM projects WHERE id='visual_project_alice'").get()?.revision,
  aliceVersions: seed.raw.prepare("SELECT count(*) AS n FROM submission_versions WHERE team_id='fake_team1'").get()?.n,
};
assert.equal(manifest.aliceRevision, 2);
assert.equal(manifest.aliceVersions, 2);
writeFileSync("/tmp/ddd-final-ui-8849-manifest.json", JSON.stringify(manifest, null, 2));
seed.close();

// This process cannot call providers or external services. Its HTTP surface is GET-only.
globalThis.fetch = async () => { throw new Error("EXTERNAL_FETCH_FORBIDDEN_IN_READ_ONLY_FIXTURE"); };
const server = createServer(async (incoming, outgoing) => {
  try {
    if (!["GET", "HEAD"].includes(incoming.method || "")) {
      outgoing.writeHead(405, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ code: "READ_ONLY_FIXTURE" }));
      return;
    }
    const request = new Request("http://localhost:8849" + incoming.url, {
      method: incoming.method,
      headers: incoming.headers as Record<string, string>,
    });
    const pathName = new URL(request.url).pathname;
    const runtime = await localRuntime(request);
    const response = pathName === "/api/health"
      ? Response.json({ ok: true, runtime: "synthetic-local", readOnly: true })
      : pathName === "/api/auth/session"
        ? Response.json({ user: runtime.identity ? { ...runtime.identity, emailVerified: true } : null })
        : pathName === "/api/portal"
          ? await handlePortal(request, runtime)
          : Response.json({ code: "NOT_FOUND" }, { status: 404 });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(incoming.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ code: "SYNTHETIC_FIXTURE_ERROR" }));
  }
});
server.listen(8849, "127.0.0.1", () => console.log(JSON.stringify(manifest)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
