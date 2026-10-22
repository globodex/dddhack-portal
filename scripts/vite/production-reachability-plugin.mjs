import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";

// Records the actual bundled module graph without modifying the emitted code.
// Kept outside dist so neither source paths nor the review report are public assets.
export function productionReachability() {
  let root;
  return {
    name: "portal-production-reachability",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle(options, bundle) {
      const environment = this.environment?.name ?? "default";
      const local = (id) =>
        id.startsWith(root + "/") ? relative(root, id) : id;
      const sha256 = (data) => createHash("sha256").update(data).digest("hex");
      const chunks = Object.values(bundle)
        .filter((item) => item.type === "chunk")
        .map((chunk) => ({
          file: chunk.fileName,
          facade: chunk.facadeModuleId ? local(chunk.facadeModuleId) : null,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          modules: Object.entries(chunk.modules)
            .map(([id, info]) => ({
              id: local(id),
              renderedLength: info.renderedLength ?? null,
              sourceSha256: existsSync(id.split("?")[0])
                ? sha256(readFileSync(id.split("?")[0]))
                : null,
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        }));
      const directory = resolve(root, ".sites-runtime", "reachability");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        resolve(directory, environment + ".json"),
        JSON.stringify(
          {
            environment,
            lockfileSha256: sha256(
              readFileSync(resolve(root, "package-lock.json")),
            ),
            configSha256: sha256(readFileSync(resolve(root, "vite.config.ts"))),
            outputDirectory: local(resolve(root, options.dir ?? ".")),
            chunks,
          },
          null,
          2,
        ) + "\n",
      );
    },
  };
}
