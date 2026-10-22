import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { parse as parseAst } from "acorn";
import { init, parse } from "es-module-lexer";

await init();
const root = process.cwd();
const auditBytes = readFileSync("evidence/sites-dependency-audit.json");
const audit = JSON.parse(auditBytes);
const reviewedAdvisories = new Set([
  "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  "https://github.com/advisories/GHSA-67mh-4wv8-2f99",
]);
for (const finding of Object.values(audit.vulnerabilities)) {
  for (const via of finding.via)
    if (typeof via === "object")
      assert(
        reviewedAdvisories.has(via.url),
        "A new advisory requires a fresh reachability review: " + via.url,
      );
}
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const packages = [
  "braces",
  "micromatch",
  "fast-glob",
  "vite-plugin-commonjs",
  "vite-plugin-dynamic-import",
  "esbuild",
  "drizzle-kit",
  "@esbuild-kit/core-utils",
  "@esbuild-kit/esm-loader",
  "wrangler",
  "@cloudflare/vite-plugin",
];
const graphs = ["rsc", "ssr", "client"].map((name) =>
  JSON.parse(readFileSync(`.sites-runtime/reachability/${name}.json`, "utf8")),
);
for (const graph of graphs) {
  assert.equal(
    graph.lockfileSha256,
    sha256(readFileSync("package-lock.json")),
    "Stale build module graph: lockfile changed",
  );
  assert.equal(
    graph.configSha256,
    sha256(readFileSync("vite.config.ts")),
    "Stale build module graph: Vite configuration changed",
  );
  for (const chunk of graph.chunks) {
    assert(
      existsSync(resolve(graph.outputDirectory, chunk.file)),
      "A recorded artifact chunk is missing",
    );
    for (const module of chunk.modules) {
      if (module.sourceSha256)
        assert.equal(
          sha256(readFileSync(module.id.split("?")[0])),
          module.sourceSha256,
          "Stale bundled source: " + module.id,
        );
    }
  }
}
const modules = [
  ...new Set(
    graphs.flatMap((graph) =>
      graph.chunks.flatMap((chunk) => chunk.modules.map((module) => module.id)),
    ),
  ),
].sort();
const affectedInstallNodes = Object.values(audit.vulnerabilities)
  .filter((finding) => finding.name !== "vinext")
  .flatMap((finding) => finding.nodes);
const affectedModules = modules.filter(
  (id) =>
    packages.some((name) => id.includes("node_modules/" + name + "/")) ||
    affectedInstallNodes.some((node) => id.startsWith(node + "/")),
);
const compilerEntries = modules.filter((id) =>
  /^node_modules\/vinext\/dist\/(index|cli|init|check)\.js(?:\?|$)/.test(id),
);
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    assert(!entry.isSymbolicLink(), "Artifact must not contain symlinks");
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const artifactFiles = walk("dist");
assert(
  !artifactFiles.some((path) =>
    /(?:^|\/)(?:node_modules|\.git|\.env(?:\.|$))/.test(relative(root, path)),
  ),
  "Runtime archive must not contain package installations, Git metadata or environment files",
);
assert(
  !modules.some(
    (id) =>
      id.includes("lib/local-test/") || id.includes("scripts/fixtures.ts"),
  ),
  "Fixture runtime entered production bundle",
);
const recordedChunks = new Set(
  graphs.flatMap((graph) =>
    graph.chunks.map((chunk) => resolve(graph.outputDirectory, chunk.file)),
  ),
);
const generatedMetadata = [];
for (const file of artifactFiles.filter(
  (path) => /\.(?:m?js)$/.test(path) && !recordedChunks.has(path),
)) {
  const name = relative(root, file);
  const code = readFileSync(file, "utf8").trim();
  if (
    /^dist\/server\/(?:ssr\/)?(?:__vinext_action_owner_manifest|__vinext_cacheability_manifest|__vinext_cacheability_request_projection|__vite_rsc_assets_manifest|vinext-client-assets)\.js$/.test(
      name,
    )
  ) {
    assert(
      code.startsWith("export default "),
      "Unexpected generated manifest code: " + name,
    );
    JSON.parse(code.slice("export default ".length).replace(/;$/, ""));
  } else if (name === "dist/server/__vinext_pregenerated_concrete_paths.js") {
    assert.equal(
      code,
      "delete globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS;",
      "Unexpected prerender metadata code",
    );
  } else if (
    /^dist\/client\/_next\/static\/[^/]+\/_ssgManifest\.js$/.test(name)
  ) {
    assert.equal(
      code.replace(/\s+/g, ""),
      "self.__SSG_MANIFEST=newSet;self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()",
      "Unexpected SSG manifest code",
    );
  } else if (
    /^dist\/client\/_next\/static\/[^/]+\/_buildManifest\.js$/.test(name)
  ) {
    const [assignment, callback, extra] = code.split(";");
    assert(assignment.startsWith("self.__BUILD_MANIFEST = "));
    JSON.parse(assignment.slice("self.__BUILD_MANIFEST = ".length));
    assert.equal(
      callback.replace(/\s+/g, ""),
      "self.__BUILD_MANIFEST_CB&&self.__BUILD_MANIFEST_CB()",
    );
    assert.equal(extra, undefined);
  } else assert.fail("Unrecorded JavaScript entered the artifact: " + name);
  generatedMetadata.push(name);
}
const unresolved = [],
  external = new Set(),
  dynamicExpressions = [],
  imports = [],
  retainedDeadDevelopmentImports = [];
function walkAst(node, visit, ancestors = []) {
  if (!node || typeof node !== "object" || typeof node.type !== "string")
    return;
  visit(node, ancestors);
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value))
      for (const child of value)
        walkAst(child, visit, [...ancestors, { node, key }]);
    else if (value && typeof value === "object")
      walkAst(value, visit, [...ancestors, { node, key }]);
  }
}
function deadReactDevelopmentImport(code, offset, from) {
  if (from !== "dist/server/ssr/index.js") return null;
  const ast = parseAst(code, { ecmaVersion: "latest", sourceType: "module" });
  let result;
  walkAst(ast, (node, ancestors) => {
    if (node.type !== "ImportExpression" || node.start !== offset) return;
    const source = node.source;
    if (
      source.type !== "CallExpression" ||
      source.callee.type !== "MemberExpression" ||
      source.callee.property.name !== "join"
    )
      return;
    const suffix = source.arguments.at(-1);
    const suffixValue =
      suffix?.type === "Literal"
        ? suffix.value
        : suffix?.type === "TemplateLiteral" && suffix.expressions.length === 0
          ? suffix.quasis[0].value.cooked
          : null;
    if (suffixValue !== "cjs/react-dom-server.edge.development.js") return;
    for (const frame of ancestors) {
      const guard = frame.node;
      if (
        guard.type !== "IfStatement" ||
        frame.key !== "consequent" ||
        guard.test.type !== "CallExpression" ||
        guard.test.arguments.length !== 0 ||
        guard.test.callee.type !== "Identifier"
      )
        continue;
      const name = guard.test.callee.name;
      const declarations = ast.body.filter(
        (entry) =>
          entry.type === "FunctionDeclaration" && entry.id.name === name,
      );
      if (declarations.length !== 1) continue;
      const fn = declarations[0];
      if (
        fn.params.length ||
        fn.body.body.length !== 1 ||
        fn.body.body[0].type !== "ReturnStatement"
      )
        continue;
      const value = fn.body.body[0].argument;
      const isFalse =
        (value.type === "Literal" && value.value === false) ||
        (value.type === "UnaryExpression" &&
          value.operator === "!" &&
          value.argument.type === "Literal" &&
          value.argument.value === 1);
      let reassigned = false;
      walkAst(ast, (entry) => {
        if (
          entry.type === "AssignmentExpression" &&
          entry.left.type === "Identifier" &&
          entry.left.name === name
        )
          reassigned = true;
        if (
          entry.type === "UpdateExpression" &&
          entry.argument.type === "Identifier" &&
          entry.argument.name === name
        )
          reassigned = true;
      });
      if (isFalse && !reassigned)
        result = {
          from,
          expression: code.slice(node.start, node.end),
          guard: code.slice(fn.start, fn.end),
          reason:
            "Consequent of a zero-argument, unreassigned function that returns literal false in the production artifact",
        };
    }
  });
  return result;
}
const allowedExternal = new Set([
  "cloudflare:workers",
  "node:async_hooks",
  "node:buffer",
  "node:crypto",
  "node:fs",
  "node:module",
  "node:path",
  "node:url",
]);
for (const path of artifactFiles.filter((file) => /\.(?:m?js)$/.test(file))) {
  const code = readFileSync(path, "utf8");
  for (const item of parse(code)[0]) {
    if (item.type === "import-meta") continue;
    const specifier = item.specifier;
    const from = relative(root, path);
    if (!specifier || item.glob) {
      const deadImport = deadReactDevelopmentImport(
        code,
        item.importStart,
        from,
      );
      if (deadImport) retainedDeadDevelopmentImports.push(deadImport);
      else
        dynamicExpressions.push({
          from,
          expression: code.slice(item.importStart, item.importEnd),
          offset: item.importStart,
        });
      continue;
    }
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(path), specifier);
      if (
        !target.startsWith(resolve(root, "dist") + "/") ||
        !existsSync(target)
      )
        unresolved.push({ from, specifier });
    } else {
      external.add(specifier);
      if (!allowedExternal.has(specifier)) unresolved.push({ from, specifier });
    }
    imports.push({ from, type: item.type, specifier });
  }
}
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
assert.equal(config.main, "index.js");
assert.equal(config.assets.directory, "../client");
assert(
  !(config.services ?? []).some((service) => service.binding === "CONNECTORS"),
  "Development connector Worker entered production configuration",
);
const report = {
  schemaVersion: 1,
  lockfileSha256: sha256(readFileSync("package-lock.json")),
  worker: {
    entry: "dist/server/" + config.main,
    noBundle: config.no_bundle,
    assetsDirectory: config.assets.directory,
  },
  auditCounts: audit.metadata.vulnerabilities,
  auditEvidenceSha256: sha256(auditBytes),
  environments: graphs.map((graph) => ({
    name: graph.environment,
    outputDirectory: graph.outputDirectory,
    chunks: graph.chunks.length,
    moduleCount: new Set(
      graph.chunks.flatMap((chunk) => chunk.modules.map((module) => module.id)),
    ).size,
  })),
  reviewedAdvisoryPackages: packages,
  generatedMetadata,
  affectedModules,
  compilerEntries,
  externalModules: [...external].sort(),
  unresolved,
  dynamicExpressions,
  retainedDeadDevelopmentImports,
  artifactFiles: artifactFiles.sort().map((path) => ({
    path: relative(root, path),
    sha256: sha256(readFileSync(path)),
  })),
  moduleGraphs: graphs,
};
writeFileSync(
  "evidence/sites-artifact-reachability.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      environments: report.environments,
      affectedModules,
      compilerEntries,
      externalModules: report.externalModules,
      unresolved,
      dynamicExpressions,
      retainedDeadDevelopmentImports,
      artifactFiles: artifactFiles.length,
    },
    null,
    2,
  ),
);
assert.equal(
  affectedModules.length,
  0,
  "Advisory-affected tooling entered production bundle",
);
assert.equal(
  compilerEntries.length,
  0,
  "Vinext compiler entry entered production bundle",
);
assert.equal(
  unresolved.length,
  0,
  "Production module closure contains unknown external dependencies",
);
assert.equal(
  dynamicExpressions.length,
  0,
  "Nonliteral production imports need explicit reachability review",
);
assert.equal(
  config.no_bundle,
  true,
  "Review assumes the supported prebundled Worker artifact",
);
