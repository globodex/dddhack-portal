import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { defaultPublicContent } from "../lib/public-content-defaults";
import {
  defaultPublicContent as serverDefault,
  publicContentSchema,
} from "../lib/event-content-contract";

test("public defaults retain the server contract without pulling server validators into Portal's browser graph", async () => {
  assert.strictEqual(serverDefault, defaultPublicContent);
  assert.deepEqual(
    publicContentSchema.parse(defaultPublicContent),
    defaultPublicContent,
  );

  const root = fileURLToPath(new URL("../", import.meta.url));
  const zodRoot = dirname(
    createRequire(import.meta.url).resolve("zod/package.json"),
  );
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["app/portal.tsx"],
    bundle: true,
    packages: "external",
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  // Inspect the complete transitive graph, including dynamic imports. No
  // generated client code is executed and no compiled output is written.
  const inputs = Object.keys(result.metafile.inputs).map((path) =>
    resolve(root, path),
  );
  assert.ok(inputs.includes(resolve(root, "app/portal.tsx")));
  assert.ok(inputs.includes(resolve(root, "lib/public-content-defaults.ts")));
  assert.ok(
    !inputs.includes(resolve(root, "lib/event-content-contract.ts")),
    "Portal must import fallback data without evaluating the server contract",
  );
  assert.ok(
    !inputs.some((path) => path === zodRoot || path.startsWith(zodRoot + sep)),
    "No resolved Zod files may enter the browser graph",
  );
  const externalImports = Object.values(result.metafile.outputs).flatMap(
    (output) =>
      output.imports
        .filter((entry) => entry.external)
        .map((entry) => entry.path),
  );
  assert.ok(
    !externalImports.some((path) => path === "zod" || path.startsWith("zod/")),
    "Externalized packages must not hide a transitive Zod dependency",
  );
});
