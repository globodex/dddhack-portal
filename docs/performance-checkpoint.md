# Performance checkpoint — 23 October 2026

Measured local baseline is preserved. Following the latest explicit authorization, this worktree applied lossless recompression only to the four measured Delhi PNG assets. No app, schema, service or UI stylesheet changes were made. AI remained inactive and off the submission path. No deployment, production network probe, live stress, backup export or fixture mutation occurred.

## Reproducible evidence

Worktree `/home/param302/Dev/DDEHack-portal/.worktrees/performance-evidence`; branch `feat/performance-evidence`; fork `50c574e`. The served build is identified by hashes below, rather than assuming its source was identical to this fork.

- `performance-visual-baseline.json`: six fresh-context desktop/mobile Home/Profile/Admin captures. All requests, transfer measurements, browser navigation/resource timings, post-snapshot decode probes and controlled-scroll observations are retained. No response body or authentication header was captured.
- `performance-burst-baseline.json`: all 216 measured API reads plus six preflight/warmup reads, with individual elapsed times, status and byte counts. No response bodies were retained.
- `performance-png-feasibility.json`: numeric lossless candidate results, source/candidate hashes and independent decoded-pixel checks. Candidate binaries exist only in `/tmp/ddehack-lossless-feasibility-tc242dix`; those paths are ephemeral and no binaries are committed.

The visual baseline overlapped other read-only browser QA, so its timings are diagnostic observations. Root confirmed all browser QA closed and held builds/tests/browsers before the burst run. Root was told the burst run finished and it was safe to rebuild immediately afterward. No after run exists; root will integrate/build and measure actual browser transfer bytes after this asset-only change.

## Browser requests and images

| Case            | Requests | CDP encoded bytes | Image requests | Image encoded bytes | Portal API calls | API duplicate groups |
| --------------- | -------: | ----------------: | -------------: | ------------------: | ---------------: | -------------------: |
| Home desktop    |       22 |         4,033,292 |              9 |           3,778,929 |                1 |                    0 |
| Home mobile     |       22 |         4,033,286 |              9 |           3,778,924 |                1 |                    0 |
| Profile desktop |       14 |           254,067 |              1 |               2,705 |                1 |                    0 |
| Profile mobile  |       14 |           254,072 |              1 |               2,710 |                1 |                    0 |
| Admin desktop   |       14 |           254,388 |              1 |               2,711 |                1 |                    0 |
| Admin mobile    |       14 |           254,383 |              1 |               2,705 |                1 |                    0 |

All observed requests finished with known byte counts. No browser errors, blocked external requests or blocked mutation methods occurred. Document-image decode probes all resolved; these probes were deliberately taken after the timing snapshot and are **not original decode-cost measurements**.

Both Home cases downloaded the approved fallback (1,690,151 CDP encoded bytes), Delhi fill (1,585,454), Metro (302,867), and text mask (82,335 per request) during initial navigation. The mask appeared twice in each cache-disabled observation. This does not establish duplication in a normal warm-cache production browser. No duplicate API URL group was observed, so there is no measured basis for adding request coalescing from this baseline.

## Bounded local read bursts

Each row has 24 samples; empirical nearest-rank p50/p95 include response body receipt. These are local diagnostic API latency measurements against a tiny synthetic fixture, not hosted capacity, browser rendering latency or backend-only/database timing. All 216 measured reads and six preflight/warmup reads returned HTTP 200; measured error rate was 0/216 (0%).

| Scenario    | Concurrency | p50 ms | p95 ms | Errors / samples |
| ----------- | ----------: | -----: | -----: | ---------------: |
| Home API    |           1 |   6.32 |   8.20 |           0 / 24 |
| Home API    |           4 |  14.36 |  16.78 |           0 / 24 |
| Home API    |           8 |  30.02 |  49.32 |           0 / 24 |
| Profile API |           1 |  11.53 |  12.51 |           0 / 24 |
| Profile API |           4 |  34.83 |  41.34 |           0 / 24 |
| Profile API |           8 |  69.73 |  76.34 |           0 / 24 |
| Admin API   |           1 |  48.55 |  54.72 |           0 / 24 |
| Admin API   |           4 | 174.03 | 223.82 |           0 / 24 |
| Admin API   |           8 | 358.31 | 363.28 |           0 / 24 |

No causal explanation for relative endpoint latency is inferred. Any query or cache optimization needs profiling and semantic checks, particularly current authorization and privacy projections. No model of hosting capacity is provided.

## Lossless verification and authorized application

The source bytes were checked equal to the assets served by the measured compiled preview. Recompressing unchanged PNG scanlines with zlib level 9, merging IDAT chunks and retaining all non-IDAT chunks yielded these `/tmp` candidates:

| Asset                    | Original bytes | Candidate bytes | Potential saving |
| ------------------------ | -------------: | --------------: | ---------------: |
| fallback-approved-v3.png |      1,689,967 |       1,371,819 | 318,148 (18.83%) |
| delhi-fill-overscan.png  |      1,585,270 |       1,544,882 |   40,388 (2.55%) |
| metro-static.png         |        302,684 |         296,153 |    6,531 (2.16%) |
| text-mask-alpha.png      |         82,153 |          66,193 |  15,960 (19.43%) |
| Total                    |      3,660,074 |       3,279,047 |          381,027 |

For every candidate, CRC checks pass, inflated PNG scanlines match, all non-IDAT chunks remain byte-identical, and Pillow independently decodes identical mode/dimensions/pixel bytes. This proves candidate pixel identity under that decoder. After the baseline checkpoint, the user explicitly authorized one bounded asset improvement and root granted exclusive ownership of these four files. The checked-in recompression script was rerun, every original source SHA-256 was checked against the preserved baseline record, and all four candidates were revalidated before any file was replaced. Explicit alpha-channel byte equality was also verified for the two RGBA assets. All applied hashes match the candidate hashes in `performance-png-feasibility.json`.

Only these four public PNGs were replaced: total source size fell from 3,660,074 to 3,279,047 bytes, a verified reduction of **381,027 bytes (10.41%)**. Filenames, dimensions, decoded pixels, alpha and every non-IDAT chunk remain unchanged. There are no visual-composition, geometry, source or CSS changes. The numeric baseline JSON files remain the original before measurements. Root integration/build and actual browser after-byte comparison are pending. No improvement to loading time is claimed; request coalescing, caching, splitting and other changes remain proposals for cloud continuation.

## Exact non-secret toolchain and handoff

Observed versions: Linux x64 kernel `7.0.0-38-generic`, Node `v24.22.0`, Python `3.14.4`, Pillow `12.1.1`, Playwright `1.64.1`, Chromium `156.0.8078.4`. Chromium launched with `headless:true, chromiumSandbox:true`. No sandbox-disabling flag or alternate binary was used.

Approved official package: `/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs`. Browser cache: `/tmp/ddehack-playwright-browsers`. An initial launch without this cache environment failed before any browser/request; that setup-only failure is excluded from the successful baseline.

Commands used from this performance worktree, after root confirmed a fresh disposable synthetic preview on exactly `http://127.0.0.1:4173`:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/ddehack-playwright-browsers node scripts/performance-visual.mjs --preview-ready
node scripts/performance-bursts.mjs --preview-ready --label baseline
python3 -u scripts/performance-png-feasibility.py
```

Browser routes block all other origins and all methods except GET/HEAD. The burst sampler has fixed localhost GET scenarios, no redirects, no retries, ten-second request timeouts and concurrency limited to 1/4/8. It verifies the reserved synthetic identities `fake_alice` and `fake_admin`. It never reveals credits or submits a form.

Both successful runs captured these identical before/after compiled SHA-256 values:

```text
dist/server/index.js
78aff73a7876e0c8b3063042f7a4c1d5a85431ef8a4d53d006cf8878bca40358
dist/server/wrangler.json
49bbd6084f83a674625e0e5d6a5d349100780600fb31cf9a066a34a0ac5eb8f3
dist/client/.vite/manifest.json
46d58a6aebc1cfa73a87860b7cf6e0454d9bea113d2427429f753cef1b3770a0
```

For tomorrow's Codex Cloud engineering, recreate an approved official Playwright/browser environment through its supported setup, preserve Chromium sandboxing, and adapt only the script's filesystem locations to the actual cloud checkout/cache. These host `/tmp` paths and candidates will not reliably persist. Retain the fixed localhost allowlist, disposable fixtures and read-only measurement bounds. Do not run measurements during builds or other QA, and do not call a new run isolated without coordinating that condition. After an agreed optimization, rebuild/reseed the same harness and rerun comparable observations; use `--label after` for bursts and retain the new artifact hashes.

Publishing on Windows is outside these scripts. This evidence is an engineering checkpoint, not publication authorization or a replacement for the root release checks.
