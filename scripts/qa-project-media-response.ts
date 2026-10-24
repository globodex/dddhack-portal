// Disposable local-only fixture server for measuring real Next HTML/RSC responses.
import { createServer } from "node:http";
import { mock } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "./fixtures";
import { PortalService } from "../lib/service";
import { createMediaDatabase, type MediaObjectStore } from "../neon/storage";
import { createPortalBackend } from "../neon/router";
import { activate, attend } from "../tests/helpers";
import { jpegAtByteLength } from "../tests/fixture-images";
import { projectImageByteLimit } from "../lib/project-media-policy";

assert.equal(
  process.env.PORTAL_MEDIA_RESPONSE_FIXTURE,
  "1",
  "Explicit synthetic fixture switch required",
);
assert.notEqual(process.env.NODE_ENV, "production");
const appOrigin = process.env.APP_ORIGIN || "http://localhost:3015";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(appOrigin).hostname));
const port = Number(process.env.PORTAL_LOCAL_API_PORT || 8898);
assert.ok(port >= 1024 && port <= 65535);
const secret = "synthetic-media-response-local-secret-only";
const jpeg = await sharp({
  create: { width: 64, height: 128, channels: 3, background: "teal" },
})
  .jpeg()
  .toBuffer();
const fixturesByCase: {
  fixtureName: string;
  db: LocalDatabase;
  wrapped: ReturnType<typeof createMediaDatabase>;
  projectId: string;
  versionId: string;
  saveRequestBytes: number;
}[] = [];
for (const fixtureName of [
  "two-commits-and-different-draft",
  "three-commits-history",
]) {
  const db = new LocalDatabase(":memory:");
  db.migrate();
  await seedLocal(db);
  await activate(db);
  await attend(db, "fake_alice", "fake_bob");
  const objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string; contentLength: number }
  >();
  const store: MediaObjectStore = {
    async signPut() {
      throw Error("No upload signing in synthetic fixture");
    },
    async read(_bucket, key, maxBytes) {
      const image = objects.get(key);
      assert.ok(image);
      assert.ok(image.bytes.length <= maxBytes);
      return image;
    },
    async write(_bucket, key, image) {
      objects.set(key, {
        bytes: image.bytes,
        contentType: image.contentType,
        contentLength: image.byteLength,
      });
    },
  };
  const wrapped = createMediaDatabase(db, { objectStore: store });
  const alice = new PortalService(
    wrapped,
    fixtures.alice,
    LOCAL_CREDIT_KEY,
    () => "2026-11-01T04:30:00.000Z",
  );
  const owner = new PortalService(
    wrapped,
    fixtures.owner,
    LOCAL_CREDIT_KEY,
    () => "2026-11-01T04:30:00.000Z",
  );
  const image = (kind: "logo" | "banner", variation: number) => {
    const bytes = jpegAtByteLength(jpeg, projectImageByteLimit(kind));
    bytes[10] = variation;
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  };
  const project = (variation: number) => ({
    projectName: "Synthetic Size " + "<".repeat(105),
    problemSolution: "<".repeat(500),
    description: "<".repeat(6000),
    github: "https://github.com/" + "x".repeat(1000) + "/" + "y".repeat(990),
    demo: "https://example.test/" + "x".repeat(2000),
    tools: "<".repeat(2000),
    logo: image("logo", variation),
    banner: image("banner", variation + 10),
    attestation: true,
  });
  let projectId = "",
    versionId = "";
  for (let revision = 0; revision < 2; revision++) {
    const result = (await alice.command("submit-project", {
      revision,
      project: project(revision + 1),
    })) as { projectId: string; versionId: string };
    projectId = result.projectId;
    versionId = result.versionId;
  }
  if (fixtureName === "three-commits-history") {
    const result = (await alice.command("submit-project", {
      revision: 2,
      project: project(3),
    })) as { versionId: string };
    versionId = result.versionId;
  } else
    await alice.command("save-project", { revision: 2, project: project(4) });
  await owner.command("set-project-eligibility", {
    projectId,
    versionId,
    status: "eligible",
  });
  fixturesByCase.push({
    fixtureName,
    db,
    wrapped,
    projectId,
    versionId,
    saveRequestBytes: Buffer.byteLength(
      JSON.stringify({
        action: "save-project",
        data: { revision: 2, project: project(4) },
      }),
    ),
  });
}
mock.timers.enable({
  apis: ["Date"],
  now: new Date("2026-11-01T11:00:00.000Z"),
});
const backend = createPortalBackend(
  { APP_ORIGIN: appOrigin, PORTAL_PROXY_SECRET: secret },
  {
    async runtime(request) {
      const view = new URL(request.url).searchParams.get("view") || "";
      const entry = fixturesByCase[view === "/project-history" ? 1 : 0];
      const name = request.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)portal_local_fixture=([a-z0-9]+)/)?.[1];
      return {
        db: entry.wrapped,
        identity: name && name in fixtures ? fixtures[name] : null,
        key: LOCAL_CREDIT_KEY,
        localTest: true,
      };
    },
    async auth(request) {
      const name = request.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)portal_local_fixture=([a-z0-9]+)/)?.[1];
      const person = name && name in fixtures ? fixtures[name] : null;
      return Response.json({
        user: person
          ? {
              id: person.id,
              email: person.email,
              name: person.name,
              emailVerified: true,
            }
          : null,
      });
    },
  },
);
const server = createServer(async (input, output) => {
  try {
    assert.equal(input.method, "GET", "Read-only fixture server");
    const headers = new Headers();
    for (const [name, value] of Object.entries(input.headers)) {
      if (Array.isArray(value))
        value.forEach((item) => headers.append(name, item));
      else if (value) headers.set(name, value);
    }
    const response = await backend(
      new Request(new URL(input.url || "/", `http://127.0.0.1:${port}`), {
        headers,
      }),
    );
    output.writeHead(response.status, Object.fromEntries(response.headers));
    output.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    output.writeHead(500, { "content-type": "application/json" });
    output.end(JSON.stringify({ code: "SYNTHETIC_FIXTURE_ERROR" }));
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    JSON.stringify({
      synthetic: true,
      appOrigin,
      port,
      secret,
      cases: fixturesByCase.map(
        ({ fixtureName, projectId, versionId, saveRequestBytes }) => ({
          fixtureName,
          projectId,
          versionId,
          saveRequestBytes,
        }),
      ),
      canonicalBytes: { logo: 131072, banner: 393216 },
    }),
  ),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    server.close();
    for (const entry of fixturesByCase) entry.db.close();
    process.exit(0);
  });
