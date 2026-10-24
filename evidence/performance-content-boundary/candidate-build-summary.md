# Content-boundary production build

Candidate `d24b47f01c40abe247944a2e81e414a7a31ac06d` passed `next build --webpack`, including TypeScript. It used Node 24.19.0/Next 16.4.3, the same installed dependencies and PATH/LANG/TZ/telemetry-only environment as the control. No env files were copied. The build lane changed no application code, tests, configuration, packages or control artifacts. The separate Home dynamic-import experiment remains isolated.

The candidate build ID is `XehgeJXDCi4ZqY376uUy7`; control remains `QdP_-Y3mVZskIG5jIP-YD`, compiled from `2657` with app code equivalent to checkpoint e135. [Build graph](candidate-build-graph.json) and its [reproducer](candidate-build-graph.mjs) establish:

- Private catch-all initial JavaScript estimate: 812,007→727,008 raw bytes, a reduction of 84,999 bytes. Estimated gzip decreases 24,801 bytes. These are static build estimates, not measured transfer or latency.
- The control's registered Zod factory 6361 occupies 84,117 raw bytes. The candidate initial graph has no Zod factory, and all emitted candidate client chunks have zero paired `ZodError`/`ZodType` markers. Registered module factories were inspected without executing them.
- Initial CSS and font asset paths and byte hashes match exactly. Home retains its synchronous import, with no asynchronous Home entry.
- Extracted default-data literal bytes are identical (SHA256 `4b74f8b4422157358dec6eff35e5534700ec9f7ee3f9ec109a7621e7513e143c`). Server-schema prefix bytes are identical (SHA256 `6a6298d6408f43d8bd14267bc50352f984053b89d58b16d784ecfaa276cfbed5`). The server compatibility re-export remains present.

Profile separately verified actual Home and Dashboard rendering without JavaScript, four pixel-identical control/candidate screenshot pairs, and the native 390px touch-menu→Home flow. Both native HTTPS apps were then stopped and restarted symmetrically, with zero trace lines and no route warmup by this lane. Profile completed the fixed 70-sample measurement run; it reports consistent payload reduction and mixed timing results. Its separate report owns actual transfer counts, cold/cache-on medians and p95. This evidence does not establish a general speed improvement.

Both apps are stopped. PIDs 159430/159426 exited 0 after SIGTERM, both PIDs are absent, and ports 3443/3444/3310/3311 were verified closed. [Lifecycle evidence](candidate-build-lifecycle.json) records source/build IDs, gate/reset/stop details and final trace hashes. All artifacts remain local and unpushed. No hosted migration, deployment, provider setting or production-data operation occurred.
