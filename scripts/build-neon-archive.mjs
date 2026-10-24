import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const runtimePath = process.argv[2];
if (!runtimePath) throw new Error("Pass the installed @neon/config-runtime dist/v1.js path.");
const root = process.cwd();
const runtime = await import(pathToFileURL(resolve(runtimePath)).href);
const configModule = await import(pathToFileURL(join(dirname(dirname(dirname(resolve(runtimePath)))), "config/dist/index.js")).href);
const { config } = await runtime.loadConfigFromFile({ path: join(root, "neon.ts"), cwd: root, unsetFunctionEnv: "omit" });
const resolved = configModule.resolveConfig(config, { name: "local-archive-build", exists: false });
const authored = resolved.preview.functions.find(item => item.slug === "portalapi");
if (!authored || authored.runtime !== "nodejs24") throw new Error("PORTAL_FUNCTION_CONFIG_MISMATCH");
const warnings = [];
const fn = { ...authored, source: resolve(root, authored.source), env: {} };
const zip = await runtime.buildFunctionBundle(fn, { onWarning: message => warnings.push(message) });
const output = join(root, "artifacts/neon");
await mkdir(output, { recursive: true });
await writeFile(join(output, "portalapi.zip"), zip);
const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
await writeFile(join(output, "build-metadata.json"), JSON.stringify({
  runtimeSource: source, runtime: fn.runtime, source: "neon/api.ts",
  zipBytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex"),
  env: {}, warnings, buildOnly: true, deployment: "not performed",
  packager: "@neon/config-runtime@1.10.2",
  nativeExecution: "not verified on this x86_64 executor",
}, null, 2) + "\n");
console.log(JSON.stringify({ source, zipBytes: zip.length, warnings: warnings.length, deployment: "not performed" }));

