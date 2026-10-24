# Backend archive packaging audit

24 October 2026. Read-only audit of the integrated `/workspace/dddhack-portal` backend, using its `neon.ts` and `neon/api.ts`. The Git base during the audit was `f8c36d2dad3716483b9d5347c3edeb02dea27914`; integration edits were still in progress. The hashes below identify the exact audited output. No provider project, credentials, deployment, archive upload, production data or live service request was used.

**Result:** the official packager successfully built a complete local ARM64 archive with native `sharp` files and passed its archive limits. JavaScript cold loading and basic routing also passed with a clearly separated host-native substitution. Running the unmodified native archive on the actual Linux ARM64 target remains unverified.

## Tooling and actual build

The root installation contains `@neon/config@1.9.3`. Its `/v1` API validates and resolves configuration but does **not** export `buildFunctionBundle`. `@neon/config-runtime` was absent from the root installation. For this audit only, `@neon/config-runtime@1.10.2` was installed under `/tmp/portal-neon-packaging`, without modifying the project manifest or lockfile. It depends on the matching `@neon/config@1.9.3` and provides `buildFunctionBundle` through `/v1`. The separate runtime package is the documented programmatic build API. [Official runtime reference](https://neon.com/docs/reference/config-runtime#function-bundling)

The audit loaded root `neon.ts` with `loadConfigFromFile`, resolved an offline branch descriptor with `resolveConfig`, and selected `resolved.preview.functions` entry `portalapi`. Resolution confirmed `nodejs24`, the esbuild bundler, and normalized `externalPackages: [{ name: "sharp", includeFiles: true }]`. The actual `buildFunctionBundle` call used an absolute source path and explicitly empty `env: {}`. No API key, project ID, branch ID or provider state is needed for that build-only function. No inspect, plan, apply, deploy or provisioning method was invoked.

The build is local with respect to Neon and application data, but **not air-gapped**: native dependency staging fetches public npm packages. It needs Node.js, npm on PATH, installed project dependencies, writable temporary storage and a writable npm cache. The audit set `npm_config_cache=/tmp/portal-storage-npm-cache` because the environment's default home cache was unavailable. Running a future repeatable project build requires installing the runtime tooling or using a compatible Neon CLI; the currently committed `@neon/config` dependency alone is insufficient for a programmatic archive command.

## Measured archive

| Property               | Audited value | Packager limit |
| ---------------------- | ------------: | -------------: |
| ZIP bytes              |     8,962,124 |     10,485,760 |
| Uncompressed bytes     |    20,937,014 |     67,108,864 |
| Files                  |            93 |          4,096 |
| JavaScript entry bytes |     1,436,137 | Included above |
| Packager warnings      |             0 |              — |

The compressed archive uses approximately 85.5% of the cap, leaving 1,523,636 bytes of compressed headroom. Additional dependencies must be checked against the complete archive again. The package enforced these limits itself, beyond the audit's independent ZIP inventory. Neon also documents these native archive limits. [Native binaries reference](https://raw.githubusercontent.com/neondatabase/agent-skills/main/skills/neon-functions/references/native-binaries.md)

- Archive: `/tmp/portal-neon-packaging/results/portalapi.zip`
- Archive SHA-256: `e6e8ee159ab32618d6fc40a19cc80ffae0d6bca712c46b7ab4b88271e7054c9c`
- `index.mjs` SHA-256: `a8d900cfa1063a8ce8cdc84ced911aab7f7d117ce416126f2b4006e2a9c5effe`
- Local evidence: `summary.json`, `archive-manifest.json`, `metafile.json` and `host-smoke.json` under the same results directory. These temporary audit artifacts were not committed or uploaded. ZIP hashes identify this build rather than promise byte-for-byte reproducibility across future package resolution and ZIP timestamps.

## Native sharp contents and constraints

The runtime stages the installed root `sharp@0.35.5` version into a fresh temporary tree using npm's Linux ARM64 glibc target selectors, with install scripts disabled. It traces and preserves the resulting `node_modules` layout. It does not copy this x86-64 workspace's installed binary. The archive contains:

| Native file                                                             |      Bytes | Independent ELF inspection |
| ----------------------------------------------------------------------- | ---------: | -------------------------- |
| `node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.5.node` |    530,120 | AArch64, machine 183       |
| `node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.7` | 18,324,712 | AArch64, machine 183       |

`readelf` confirmed that the addon expects the packaged `libvips-cpp.so.8.18.7` and has an `$ORIGIN` RPATH that reaches the preserved sibling package directory. The native files also need the target's standard ARM64 glibc/C++ system libraries and loader. Symbol requirements observed in libvips include `GLIBC_2.28` and `GLIBCXX_3.4.22`; this host cannot verify their availability on a deployed Function.

Staged package versions were `sharp 0.35.5`, `@img/sharp-linux-arm64 0.35.5`, `@img/sharp-libvips-linux-arm64 1.3.4`, `@img/colour 1.1.0`, `@emnapi/runtime 1.11.3`, `detect-libc 2.1.2`, and `semver 7.8.5`. The trace omitted incompatible platform builds and the redundant WASM fallback. The packager takes the installed root package version, but fresh staging does not carry the project's transitive overrides or lockfile pins into that temporary install; future native dependency resolution can therefore change beneath the pinned sharp version. `includeFiles: false` would omit required runtime files and must not be used for sharp.

## CommonJS loading, source graph and safe host smoke

The actual SDK-produced `index.mjs` begins with its CommonJS interop banner, which defines `require`, `__filename` and `__dirname` through Node's ESM APIs. `pg@8.23.1` and its required JavaScript dependencies are bundled; `sharp` remains an external import. The default JavaScript pg driver is used. Do not enable `NODE_PG_FORCE_NATIVE`: `pg-native` is not staged or required by this build.

For a host smoke check, the **unchanged JavaScript entry bytes** were copied to a separate temporary directory and resolved sharp from the existing host x86-64 installation. The ARM64 archive and its extracted native tree were preserved unchanged. A child Node.js process received only synthetic frontend/proxy settings; database, S3, SMTP, Google and other credentials were absent. Fetch, TCP connect and TLS connect were explicitly disabled in that process.

Observed behavior: the default export exposed a fetch function; trusted `/api/health` returned 200 with the expected runtime JSON; an untrusted request returned 403; a portal request without backend configuration returned a redacted 503. A separate diagnostic copy with only the banner removed failed cold import with `Dynamic require of "events" is not supported`. This verifies the banner's practical role in the JavaScript graph without implying successful ARM64 native execution.

An independent esbuild metafile used the same entry, format, external declarations, minification, platform and banner settings as the installed official builder. Its 823 input modules include the Neon API, router, auth, PostgreSQL adapter, storage and existing service code. They exclude all `scripts/`, `tests/`, `lib/local-test/`, `neon/local-server`, fixture modules and PGlite. The ZIP inventory contains no environment files, tests, fixture files or local-server entry. Legacy local-test string branches remain in shared service code, gated by runtime settings; no synthetic fixture loader or SQLite adapter is reachable from this function entry.

## Remaining verification

The complete archive is locally built and statically inspected. The unmodified archive still needs a Linux ARM64 Node.js 24 cold-start/native-decode check in a matching controlled runtime. This x86-64 environment has no ARM64 emulator, so no such execution result is claimed. Any approved later deployment also needs real injected backend settings, database migrations, private bucket access, exact frontend proxy/origin configuration, auth provider setup and an authorized synthetic end-to-end upload. None of those live integration checks occurred in this packaging audit.
