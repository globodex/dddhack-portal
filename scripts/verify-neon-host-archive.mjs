// Read-only archive/host smoke. Does not build, deploy, migrate, query a DB or send mail.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const syntheticOrigin = "https://portal.example.test";
const syntheticSecret = "synthetic-host-smoke-proxy-secret-at-least-32";

if (process.argv[2] === "--child") {
  const index = resolve(process.argv[3]);
  assert.equal(process.env.APP_ORIGIN, syntheticOrigin);
  assert.equal(process.env.PORTAL_PROXY_SECRET, syntheticSecret);
  assert.deepEqual(
    Object.keys(process.env).sort(),
    [
      "APP_ORIGIN",
      "LANG",
      "NODE_ENV",
      "PATH",
      "PORTAL_PROXY_SECRET",
      "TZ",
    ].sort(),
  );
  const environmentKeysAtStart = Object.keys(process.env).sort();
  const attempts = [];
  const block = (kind) => () => {
    attempts.push(kind);
    throw new Error("OUTBOUND_DISABLED_FOR_HOST_SMOKE");
  };
  const net = (await import("node:net")).default;
  const tls = (await import("node:tls")).default;
  const http = (await import("node:http")).default;
  const https = (await import("node:https")).default;
  net.connect = block("net.connect");
  net.createConnection = block("net.createConnection");
  net.Socket.prototype.connect = block("net.Socket.connect");
  tls.connect = block("tls.connect");
  http.request = block("http.request");
  http.get = block("http.get");
  https.request = block("https.request");
  https.get = block("https.get");
  globalThis.fetch = block("fetch");
  syncBuiltinESMExports();

  const module = await import(pathToFileURL(index).href);
  assert.equal(typeof module.default?.fetch, "function");
  const request = (path, trusted = true) =>
    new Request(`https://backend.example.test${path}`, {
      headers: trusted
        ? {
            "x-portal-proxy-secret": syntheticSecret,
            "x-portal-forwarded-origin": syntheticOrigin,
          }
        : {},
    });
  const checks = [];
  for (const [name, path, trusted, expected] of [
    ["trusted-health", "/api/health", true, 200],
    ["untrusted-health", "/api/health", false, 403],
    ["unconfigured-portal", "/api/portal?view=%2Fdashboard", true, 503],
  ]) {
    const response = await module.default.fetch(request(path, trusted));
    const body = await response.json();
    assert.equal(response.status, expected, name);
    assert.match(
      response.headers.get("cache-control") || "",
      /private.*no-store/,
    );
    if (name === "trusted-health")
      assert.deepEqual(body, { ok: true, runtime: "neon-functions" });
    else {
      assert.deepEqual(Object.keys(body), ["code"]);
      assert.equal(typeof body.code, "string");
      assert.doesNotMatch(
        JSON.stringify(body),
        /stack|password|secret|smtp|https?:\/\//i,
      );
      if (name === "untrusted-health")
        assert.equal(body.code, "UNTRUSTED_PROXY");
    }
    checks.push({
      name,
      method: "GET",
      path,
      status: response.status,
      body,
      cacheControl: response.headers.get("cache-control"),
    });
  }
  assert.deepEqual(attempts, []);
  const require = createRequire(index);
  const sharp = require("sharp");
  const loadedNativeAddons = Object.keys(require.cache)
    .filter((path) => path.endsWith(".node"))
    .map((path) => {
      const bytes = readFileSync(path);
      assert.equal(bytes.subarray(0, 4).toString("hex"), "7f454c46");
      return {
        file: path.split("/node_modules/").at(-1),
        elfMachine: bytes.readUInt16LE(18),
      };
    });
  assert.ok(
    loadedNativeAddons.some(
      (file) => file.file.includes("sharp-linux-x64") && file.elfMachine === 62,
    ),
  );
  assert.ok(
    Object.keys(process.env).every(
      (key) => environmentKeysAtStart.includes(key) || key === "VIPSHOME",
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      environmentKeysAtStart,
      environmentKeysAfterImport: Object.keys(process.env).sort(),
      guards: [
        "fetch",
        "net.connect",
        "net.createConnection",
        "net.Socket.connect",
        "tls.connect",
        "http.request/get",
        "https.request/get",
      ],
      outboundAttempts: attempts,
      checks,
      sharp: {
        version: sharp.versions.sharp,
        vips: sharp.versions.vips,
        resolvedModule: realpathSync(require.resolve("sharp")),
        loadedNativeAddons,
      },
    }),
  );
} else {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, value, index, values) => {
      if (value.startsWith("--"))
        pairs.push([value.slice(2), values[index + 1]]);
      return pairs;
    }, []),
  );
  for (const name of ["archive", "receipt", "extracted", "host", "report"])
    assert.ok(args[name], `--${name} required`);
  const archive = resolve(args.archive),
    receiptPath = resolve(args.receipt);
  const originalIndex = resolve(args.extracted, "index.mjs"),
    hostIndex = resolve(args.host, "index.mjs");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const archiveHash = hash(archive);
  assert.equal(archiveHash, receipt.sha256);
  assert.equal(hash(originalIndex), receipt.indexSha256);
  assert.equal(hash(hostIndex), receipt.indexSha256);
  const zipScan = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import zipfile,hashlib,json,sys,struct
with zipfile.ZipFile(sys.argv[1]) as archive:
 files=[entry for entry in archive.infolist() if not entry.is_dir()]
 native=[]
 for entry in files:
  content=archive.read(entry)
  if content[:4]==b'\\x7fELF': native.append({'path':entry.filename,'bytes':len(content),'elfMachine':struct.unpack('<H',content[18:20])[0],'sha256':hashlib.sha256(content).hexdigest()})
 forbidden=[entry.filename for entry in files if any(part in ('tests','fixtures','.git','.local') or part.startswith('.env') for part in entry.filename.split('/'))]
 print(json.dumps({'files':len(files),'uncompressedBytes':sum(entry.file_size for entry in files),'nativeFiles':native,'forbiddenPaths':forbidden}))`,
        archive,
      ],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH || "/usr/bin:/bin",
          LANG: "C.UTF-8",
          TZ: "UTC",
        },
      },
    ),
  );
  assert.equal(zipScan.files, receipt.fileCount);
  assert.equal(zipScan.uncompressedBytes, receipt.uncompressedBytes);
  assert.equal(zipScan.nativeFiles.length, 2);
  assert.ok(zipScan.nativeFiles.every((file) => file.elfMachine === 183));
  assert.deepEqual(zipScan.forbiddenPaths, []);
  for (const file of zipScan.nativeFiles)
    assert.equal(hash(resolve(args.extracted, file.path)), file.sha256);
  const execution = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), "--child", hostIndex],
    {
      cwd: args.host,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        LANG: "C.UTF-8",
        TZ: "UTC",
        NODE_ENV: "production",
        APP_ORIGIN: syntheticOrigin,
        PORTAL_PROXY_SECRET: syntheticSecret,
      },
    },
  );
  assert.equal(
    execution.status,
    0,
    execution.stderr || execution.error?.message,
  );
  const hostSmoke = JSON.parse(execution.stdout.trim());
  assert.equal(hash(archive), archiveHash);
  assert.equal(hash(originalIndex), receipt.indexSha256);
  assert.equal(hash(hostIndex), receipt.indexSha256);
  for (const file of zipScan.nativeFiles)
    assert.equal(hash(resolve(args.extracted, file.path)), file.sha256);
  const report = {
    runtimeSource: receipt.runtimeSource,
    archive: {
      path: archive,
      bytes: readFileSync(archive).length,
      sha256: archiveHash,
      ...zipScan,
    },
    indexSha256: receipt.indexSha256,
    identicalUnmodifiedJavaScript: true,
    hostDependencySubstitution: {
      path: args.host,
      nodeModulesTarget: realpathSync(resolve(args.host, "node_modules")),
      purpose:
        "Resolve sharp against installed host x86_64 native dependencies; original ARM64 archive and extracted tree remain unchanged.",
    },
    hostSmoke,
    noRebuild: true,
    noDeploy: true,
    noMailSent: true,
    noDatabaseConfigured: true,
    receiptGraphOnly: {
      inputs: receipt.graphInputCount,
      forbiddenInputs: receipt.forbiddenInputs,
      recomputed: false,
    },
    nativeARM64Execution: "unverified",
    manualBackendRedeploy: "required after user review",
    limitations: [
      "This is JavaScript loading/routing with an explicitly substituted host sharp dependency, not execution of the unmodified ARM64 archive.",
      "Outbound guards are installed on Node fetch/TCP/TLS/HTTP APIs. No provider, DB, SMTP, Google or storage credential is supplied.",
      "Hosted ARM64 decoding, storage, SMTP delivery and full login remain unverified.",
    ],
  };
  mkdirSync(dirname(resolve(args.report)), { recursive: true });
  writeFileSync(args.report, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      runtimeSource: report.runtimeSource,
      archiveSha256: archiveHash,
      checks: hostSmoke.checks.map(({ name, status }) => ({ name, status })),
      outboundAttempts: hostSmoke.outboundAttempts,
      nativeARM64Execution: report.nativeARM64Execution,
    }),
  );
}
