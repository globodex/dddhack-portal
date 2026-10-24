// Fresh disposable fixture for the final read-only submission-shell capture.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
const oneDraftSave = process.env.QA_ONE_DRAFT_SAVE === "8849";
if (existsSync(path)) {
  assert.ok(oneDraftSave, "Existing fixture requires the separate explicit one-save authorization");
  const prior = JSON.parse(readFileSync("/tmp/ddd-final-ui-8849-manifest.json", "utf8"));
  assert.equal(prior.path, path);
  assert.equal(prior.freshSeedNotCopy, true);
}
const seed = new LocalDatabase(path);
if (!oneDraftSave) {
  seed.migrate();
  await seedLocal(seed);
  await seedRichVisual(seed);
}
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
if (!oneDraftSave) writeFileSync("/tmp/ddd-final-ui-8849-manifest.json", JSON.stringify(manifest, null, 2));
seed.close();

// The default surface is GET-only. The separately authorized closure can forward
// exactly one normal Alice save-project at revision2, never a domain submission.
globalThis.fetch = async () => { throw new Error("EXTERNAL_FETCH_FORBIDDEN_IN_READ_ONLY_FIXTURE"); };
let forwardedSave = false;
const server = createServer(async (incoming, outgoing) => {
  try {
    let body: string | undefined;
    const mutation = !["GET", "HEAD"].includes(incoming.method || "");
    if (mutation && !oneDraftSave) {
      outgoing.writeHead(405, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ code: "READ_ONLY_FIXTURE" }));
      return;
    }
    if (mutation) {
      assert.equal(incoming.method, "POST");
      assert.equal(incoming.url, "/api/portal");
      assert.equal(forwardedSave, false, "The single save permit is exhausted");
      assert.equal(incoming.headers.origin, "http://localhost:3007");
      assert.equal(incoming.headers["x-portal-forwarded-origin"], "http://localhost:3007");
      assert.equal(incoming.headers["x-portal-proxy-secret"], "final-shell-synthetic-proxy-only-8849");
      assert.ok(/(?:^|;\s*)portal_local_fixture=alice(?:;|$)/.test(incoming.headers.cookie || ""));
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of incoming) {
        bytes += Buffer.byteLength(chunk); assert.ok(bytes < 1_000_000); chunks.push(Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString("utf8");
      const command = JSON.parse(body);
      assert.equal(command.action, "save-project");
      assert.equal(command.data.revision, 2);
      assert.equal(command.data.project.projectName, "Small Wonder");
      forwardedSave = true;
    }
    const request = new Request((mutation ? "http://localhost:3007" : "http://localhost:8849") + incoming.url, {
      method: incoming.method,
      headers: incoming.headers as Record<string, string>,
      ...(body === undefined ? {} : { body }),
    });
    const pathName = new URL(request.url).pathname;
    const runtime = await localRuntime(request);
    const response = pathName === "/api/health"
      ? Response.json({ ok: true, runtime: "synthetic-local", readOnly: !oneDraftSave, oneDraftSave, forwardedSave })
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
