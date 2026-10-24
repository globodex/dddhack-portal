# Matched production build preparation

This evidence covers successful production builds and process readiness only. It does not establish FCP/LCP, hosted speed, or a before/after performance result. The parent owns the matched TLS fixture and alternating cold/repeat browser measurement, with medians/p95 kept separate.

| Case     | Source                                                                                                                                          | Production build ID     | Local Next port |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------- |
| Baseline | `c353a173a85580ebb4eed47fff0a23a0830b81a6`, original `696b125f9711a4fd6e02c3ece3adadb18b83cba7` plus only main-only Vercel Git config `e386cc7` | `FxM2l4SoSH0RiG3L9SgqW` | 3310            |
| Final    | `2657f26254ed323ca84a167a2f220f05f4ec7cbf`                                                                                                      | `QdP_-Y3mVZskIG5jIP-YD` | 3311            |

Both isolated worktrees used Node 24.19.0, Next 16.4.3, identical `next.config.ts`, identical package.json/lockfile, the same installed dependency tree, and `node node_modules/next/dist/bin/next build --webpack`. Both completed TypeScript/page data/optimization with exit 0. No app source, CSS, production guard or package configuration was patched. No env file was copied; the builds received only PATH/LANG/TZ and telemetry suppression. The main-only Vercel config commit changes no UI/runtime behavior.

The process environment for coordinated start explicitly sets production mode and the supplied synthetic HTTPS app/backend origins, proxy marker, verified local CA and exact-DNS fixture module. `PORTAL_LOCAL_TEST` is absent, TLS verification remains enabled, and real provider credentials are absent. The build lane started no servers until Profile's TLS-harness GO, then reported listening/ready only. It sent zero HTTP route/SSR warmup requests before the parent's first server-cold samples.

Build durations in the JSON logs are diagnostic local compilation durations under parallel load. Static .next inventories count all emitted files, not route transfer costs. They must not be substituted for measured page performance. Original .next production artifacts remain in `/workspace/ddd-perf-prod-baseline` and `/workspace/ddd-perf-prod-final`; they are ignored build output, not committed binaries. Raw build logs and source/config/dependency hashes are preserved here.
