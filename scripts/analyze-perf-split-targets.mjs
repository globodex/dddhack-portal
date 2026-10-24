// Offline source and existing-artifact analysis. No Next build/server/browser.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { parse } from "acorn";
import { transform as cssTransform } from "lightningcss";
import * as esbuild from "esbuild";
import ts from "typescript";

const output = resolve("evidence/perf-target-audit");
mkdirSync(output, { recursive: true });
const source = "e135e3ec7b787f7e6167c29f4e46bc76a9fbfcec";
const finalBuild = "/workspace/ddd-perf-prod-final/.next";
const baselineBuild = "/workspace/ddd-perf-prod-baseline/.next";
const sourcePaths = [
  "app",
  "lib",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "postcss.config.mjs",
];
execFileSync("git", [
  "diff",
  "--exit-code",
  "2657f26",
  source,
  "--",
  ...sourcePaths,
]);
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const size = (buffer) => ({
  rawBytes: buffer.length,
  gzip9Bytes: gzipSync(buffer, { level: 9 }).length,
  sha256: hash(buffer),
});

function staticFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...staticFiles(path));
    else if (/\.(js|css)$/.test(entry.name))
      result.push({ path, ...size(readFileSync(path)) });
  }
  return result;
}
function webpackModules(directory) {
  const result = [];
  for (const file of readdirSync(directory).filter((name) =>
    name.endsWith(".js"),
  )) {
    const text = readFileSync(join(directory, file), "utf8");
    for (const statement of parse(text, { ecmaVersion: "latest" }).body) {
      const expression = statement.expression;
      if (
        expression?.type !== "CallExpression" ||
        expression.callee?.property?.name !== "push"
      )
        continue;
      for (const property of expression.arguments?.[0]?.elements?.[1]
        ?.properties || []) {
        const body = Buffer.from(
          text.slice(property.value.start, property.value.end),
        );
        result.push({
          chunk: file,
          moduleId: String(property.key.value ?? property.key.name),
          ...size(body),
        });
      }
    }
  }
  return result;
}

// Respect the existing import() stock-table boundary. Only sum the entry and
// transitively static chunks; never count async output as initial code.
const config = {
  entryPoints: ["app/portal.tsx"],
  bundle: true,
  write: false,
  outdir: "/tmp/ddd-perf-estimate-not-written",
  platform: "browser",
  format: "esm",
  packages: "external",
  splitting: true,
  minify: true,
  metafile: true,
  jsx: "automatic",
};
function initialGraph(result) {
  const outputs = result.metafile.outputs;
  const contents = new Map(
    result.outputFiles.map((file) => [file.path, file.contents]),
  );
  const entry = Object.keys(outputs).find(
    (path) => outputs[path].entryPoint === "app/portal.tsx",
  );
  const included = new Set();
  const visit = (path) => {
    if (included.has(path)) return;
    included.add(path);
    for (const dependency of outputs[path].imports)
      if (!dependency.external && dependency.kind === "import-statement")
        visit(dependency.path);
  };
  visit(entry);
  const chunks = [...included].map((path) => ({
    path,
    ...size(contents.get(resolve(path))),
  }));
  const inputs = {};
  for (const path of included)
    for (const [name, value] of Object.entries(outputs[path].inputs))
      inputs[name] = (inputs[name] || 0) + value.bytesInOutput;
  return {
    rawBytes: chunks.reduce((sum, chunk) => sum + chunk.rawBytes, 0),
    gzip9Bytes: chunks.reduce((sum, chunk) => sum + chunk.gzip9Bytes, 0),
    chunks,
    inputs,
  };
}
const full = initialGraph(await esbuild.build(config));
const targets = [
  "app/home.tsx",
  "app/admin-credit-batches.tsx",
  "app/add-admins.tsx",
  "app/owner-submission-window.tsx",
  "app/admin-import-dialog.tsx",
  "app/admin-leader-transfer.tsx",
  "app/admin-project-actions.tsx",
  "app/profile-flow.tsx",
];
const candidates = [];
for (const path of targets) {
  const without = initialGraph(
    await esbuild.build({ ...config, external: [resolve(path)] }),
  );
  candidates.push({
    path,
    sourceBytes: readFileSync(path).length,
    removedRawEstimate: full.rawBytes - without.rawBytes,
    removedGzip9Estimate: full.gzip9Bytes - without.gzip9Bytes,
    uniqueInitialInputs: Object.entries(full.inputs)
      .filter(([name]) => !(name in without.inputs))
      .map(([path, bytesInOutput]) => ({ path, bytesInOutput })),
  });
}
const adminTargets = targets.filter((path) =>
  /admin-|add-admins|owner-/.test(path),
);
const adminWithout = initialGraph(
  await esbuild.build({
    ...config,
    external: adminTargets.map((path) => resolve(path)),
  }),
);

const cssPaths = [
  ...readFileSync("app/layout.tsx", "utf8").matchAll(
    /import "\.\/(.*?\.css)";/g,
  ),
].map((match) => "app/" + match[1]);
const cssSourceEstimates = cssPaths.map((path) => {
  const source = readFileSync(path);
  const { code } = cssTransform({ filename: path, code: source, minify: true });
  return {
    path,
    sourceBytes: source.length,
    standaloneMinifiedEstimate: size(code),
    importsNotInlined: source.toString().includes("@import"),
  };
});

const portal = readFileSync("app/portal.tsx", "utf8");
const ast = ts.createSourceFile(
  "app/portal.tsx",
  portal,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const inlineNames = new Set([
  "AdminParticipants",
  "Review",
  "AdminTeamIdea",
  "AdminList",
  "ContentEditor",
  "OwnerPolicyControls",
  "AdminEngagementControls",
  "AdminCreditInstructions",
  "Settings",
]);
const inlineAdminFunctions = ast.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) && inlineNames.has(node.name?.text),
  )
  .map((node) => {
    const text = node.getText(ast);
    const transformed = esbuild.transformSync(text, {
      loader: "tsx",
      format: "esm",
      jsx: "automatic",
      minify: true,
    });
    return {
      name: node.name.text,
      sourceBytes: Buffer.byteLength(text),
      standaloneTransformedEstimate: size(Buffer.from(transformed.code)),
    };
  });
const attribution = JSON.parse(
  readFileSync("evidence/performance-production/attribution.json", "utf8"),
);
const measured = JSON.parse(
  readFileSync("evidence/performance-production/report.json", "utf8"),
);
const coldDashboardRequests = ["baseline", "final"].map((variant) => {
  const sample = measured.samples.find(
    (sample) =>
      sample.variant === variant &&
      sample.label === "dashboard" &&
      sample.phase === "cold",
  );
  return {
    variant,
    sampleId: sample.id,
    scripts: sample.requests
      .filter((request) => request.type === "Script")
      .map(({ url, encodedDataLength }) => ({
        path: new URL(url).pathname,
        encodedDataLength,
      })),
  };
});
const docs = [
  "node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md",
  "node_modules/next/dist/docs/01-app/01-getting-started/11-css.md",
  "node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cssChunking.md",
];
const report = {
  source,
  sourceEqualsExisting265FrontendGraph: true,
  equivalentPaths: sourcePaths,
  nextVersion: JSON.parse(
    readFileSync("node_modules/next/package.json", "utf8"),
  ).version,
  installedDocsRead: docs.map((path) => ({
    path,
    sha256: hash(readFileSync(path)),
  })),
  existingArtifacts: {
    baseline: staticFiles(join(baselineBuild, "static")),
    final: staticFiles(join(finalBuild, "static")),
    baselineWebpackFactories: [
      ...webpackModules(join(baselineBuild, "static/chunks")),
      ...webpackModules(join(baselineBuild, "static/chunks/app/[[...path]]")),
    ],
    finalWebpackFactories: webpackModules(join(finalBuild, "static/chunks")),
  },
  coldDashboardRequests,
  measuredDashboardColdResources: attribution.routes.dashboard.cold,
  lightweightGraph: {
    method:
      "esbuild ESM minify, packages external, existing async stock table excluded from initial graph; no Next build or application change",
    full,
    candidates,
    combinedAdminEstimate: {
      paths: adminTargets,
      removedRawEstimate: full.rawBytes - adminWithout.rawBytes,
      removedGzip9Estimate: full.gzip9Bytes - adminWithout.gzip9Bytes,
    },
    inlineAdminFunctions,
  },
  cssSourceEstimates,
  limits: [
    "Esbuild/standalone gzip estimates are not Next chunk or network savings. Async wrapper, dependency partition, compression and preload behavior require a controlled Next build.",
    "Standalone CSS minification estimates do not inline imports and cannot be summed as precise compiled chunk savings.",
    "No browser, Next build/server, production source changes, database, provider, push, merge or deploy.",
  ],
};
writeFileSync(
  join(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      source,
      candidates,
      combinedAdminEstimate: report.lightweightGraph.combinedAdminEstimate,
      inlineAdminFunctions,
    },
    null,
    2,
  ),
);
