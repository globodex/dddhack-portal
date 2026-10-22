import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
const entry = "dist/server/index.js",
  graphPath = ".sites-runtime/reachability/rsc.json";
const originalEntry = readFileSync(entry),
  originalGraph = readFileSync(graphPath);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const report = {};
const unexpectedChunk = "dist/server/portal-review-unrecorded.js";
assert(!existsSync(unexpectedChunk));
const run = () =>
  spawnSync(
    process.execPath,
    ["--max-old-space-size=256", "scripts/review-production-artifact.mjs"],
    { encoding: "utf8", timeout: 15000, maxBuffer: 128000 },
  );
function rejected(name, mutate) {
  try {
    mutate();
    const result = run();
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, name + " did not fail closed");
    report[name] = true;
  } finally {
    writeFileSync(entry, originalEntry);
    writeFileSync(graphPath, originalGraph);
    rmSync(unexpectedChunk, { force: true });
  }
}
try {
  rejected("rejectsExternalNpmImport", () =>
    writeFileSync(entry, originalEntry + '\nimport "braces";\n'),
  );
  rejected("rejectsNewNonliteralImport", () =>
    writeFileSync(
      entry,
      originalEntry + "\nvoid import(globalThis.__portal_review_module);\n",
    ),
  );
  rejected("rejectsAffectedBundledModule", () => {
    const graph = JSON.parse(originalGraph);
    graph.chunks[0].modules.push({
      id: "node_modules/braces/index.js",
      renderedLength: 1,
      sourceSha256: sha256(readFileSync("node_modules/braces/index.js")),
    });
    writeFileSync(graphPath, JSON.stringify(graph));
  });
  rejected("rejectsUnrecordedJavaScript", () =>
    writeFileSync(unexpectedChunk, "export default 1;\n"),
  );
  rejected("rejectsStaleBuildGraph", () => {
    const graph = JSON.parse(originalGraph);
    graph.lockfileSha256 = "0".repeat(64);
    writeFileSync(graphPath, JSON.stringify(graph));
  });
} finally {
  writeFileSync(entry, originalEntry);
  writeFileSync(graphPath, originalGraph);
}
assert.equal(sha256(readFileSync(entry)), sha256(originalEntry));
assert.equal(sha256(readFileSync(graphPath)), sha256(originalGraph));
const final = run();
assert.ifError(final.error);
assert.equal(final.status, 0, final.stderr);
report.originalArtifactRestoredAndPasses = true;
writeFileSync(
  "evidence/sites-artifact-gate-tests.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
