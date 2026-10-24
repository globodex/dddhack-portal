// Fresh local synthetic fixture only. No recovered or hosted database is used.
import assert from "node:assert/strict";
import { existsSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { LocalDatabase } from "../../lib/local-test/sqlite";
import { localRuntime } from "../../lib/local-test/runtime";
import { handlePortal } from "../../lib/http";
import { PortalService } from "../../lib/service";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../../scripts/fixtures";
import { seedRichVisual } from "../../scripts/visual-rich-fixtures";
import { revealConfirmation } from "../../lib/action-confirmation";

const database = "/tmp/ddd-admin-action-refinement-8856.sqlite";
const origin = "http://localhost:3011";
assert.equal(process.env.PORTAL_LOCAL_TEST, "1");
assert.equal(process.env.PORTAL_LOCAL_DB, database);
assert.equal(process.env.NODE_ENV, "development");
assert.equal(existsSync(database), false, "A brand-new fixture database is required");
globalThis.fetch = async () => { throw new Error("SYNTHETIC_FIXTURE_EXTERNAL_FETCH_DISABLED"); };
const seed = new LocalDatabase(database);
seed.migrate();
await seedLocal(seed);
await seedRichVisual(seed);
fixtures.volunteer = { id: "fake_volunteer", email: "volunteer@portal.test", name: "Synthetic volunteer", source: "local-test" };
const longNames = {
  fake_carol: "Alexandria Montgomery Richardson with a deliberately long synthetic participant display name",
  fake_dave: "D".repeat(100),
};
for (const [id, name] of Object.entries(longNames))
  await seed.prepare("UPDATE participant_profiles SET display_name=? WHERE user_id=?").bind(name, id).all();
const owner = new PortalService(seed, fixtures.owner, LOCAL_CREDIT_KEY);
const absent = { kind: "person", targetId: "fake_frank", status: "Absent", reason: "Synthetic local action-layout fixture" };
await owner.command("admin-status", { ...absent, confirmation: revealConfirmation("admin-status", absent) });
const csv = "OpenAI credits,Builder resources\nSYNTHETIC-ACTION-OPENAI-1,SYNTHETIC-ACTION-BUILDER-1\nSYNTHETIC-ACTION-OPENAI-2,SYNTHETIC-ACTION-BUILDER-2\nSYNTHETIC-ACTION-OPENAI-3,SYNTHETIC-ACTION-BUILDER-3";
const columns = [
  { key: "0", heading: "OpenAI credits", instructions: "Synthetic local credits for action-layout verification." },
  { key: "1", heading: "Builder resources", instructions: "Synthetic local second column; no real vouchers." },
];
const preview = await owner.command("preview-credit-batch", { csv, columns });
await owner.command("publish-credit-batch", { csv, columns, digest: preview.digest, confirmation: "PUBLISH_CREDIT_BATCH" });
const users = seed.raw.prepare("SELECT id FROM users").all();
assert(users.every((row) => String(row.id).startsWith("fake_")));
writeFileSync("evidence/admin-action-refinement/fixture-manifest.json", JSON.stringify({
  source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  database, origin, backendPort: 8856, freshSeedNotCopy: true, syntheticOnly: true, users: users.length, longNames,
}, null, 2) + "\n");
seed.close();
const allowed = new Set(["quick-check-in", "bulk-check-in", "delete-credit-column"]);
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    if (!["GET", "HEAD"].includes(incoming.method || "")) {
      assert.equal(incoming.method, "POST");
      assert.equal(incoming.url, "/api/portal");
      assert.equal(incoming.headers.origin, origin);
      const command = JSON.parse(body.toString());
      assert(allowed.has(command.action), "Unexpected synthetic mutation");
      if (["quick-check-in", "bulk-check-in"].includes(command.action))
        assert(command.data.emails.every((email: string) => ["bob@portal.test", "carol@portal.test", "dave@portal.test"].includes(email)));
      appendFileSync("evidence/admin-action-refinement/backend-actions.jsonl", JSON.stringify(command) + "\n");
    }
    const request = new Request((incoming.method === "POST" ? origin : "http://localhost:8856") + incoming.url, {
      method: incoming.method, headers: incoming.headers as Record<string, string>,
      ...(body.length ? { body } : {}),
    });
    const runtime = await localRuntime(request);
    const pathname = new URL(request.url).pathname;
    const response = pathname === "/api/health" ? Response.json({ ok: true, runtime: "synthetic-local", freshSeedNotCopy: true })
      : pathname === "/api/auth/session" ? Response.json({ user: runtime.identity ? { ...runtime.identity, emailVerified: true } : null })
      : pathname === "/api/portal" ? await handlePortal(request, runtime)
      : Response.json({ code: "NOT_FOUND" }, { status: 404 });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ code: "SYNTHETIC_FIXTURE_ERROR", message: String(error) }));
  }
});
server.listen(8856, "127.0.0.1", () => console.log("Fresh synthetic admin fixture8856 ready"));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
