# Admin lock, compact filters and inline-member backend candidate

Local review candidate. **Not pushed, deployed or applied to a hosted database.**

Built from runtime source `882bc7c311a4a52f6b7da971f56f6e8cfe09af42` using the official
`@neon/config-runtime@1.10.2` packager with function `env: {}` and no warnings.
No real credentials, fixture database, screenshots, SQL files or tests are packaged.

| Check | Result |
| --- | --- |
| Runtime | Node.js24, Linux ARM64 glibc |
| ZIP | 93 files; 9,039,133 compressed bytes; 21,234,424 raw bytes |
| ZIP SHA256 | `0c3e35e8894fe48b40dfb58b848f1b131a917aca691357fb09a77a461d0864e2` |
| JavaScript SHA256 | `0bf9225529da30ffbd5226fb6022b3509063feb53399a3e08dee03a550849d10` |
| Source graph | 880 inputs; 96 application inputs; all application hashes match the committed runtime source |
| Native dependencies | 92 unchanged archive entries versus the published cef0 archive, including both ARM64 ELF files |
| Host smoke | Health200, untrusted403, unconfigured503; zero outbound attempts |

Only `index.mjs` changed versus the published archive. The fresh official build and
an independent fresh esbuild result have identical JavaScript bytes. Native ARM64
execution is unverified; host smoke explicitly substitutes the existing x86_64 Sharp
dependency in a separate copy without modifying the original package.

This batch needs the exact thirteen-entry source plan through
`0107_admin_team_lock.sql`. A target already through0106 applies only0107 using the
fresh guarded inspection/verified-recovery procedure. Earlier roster0107 was an
unimplemented proposal and is excluded. The migration alone locks/approves no team.

Safest order after approval: publish the review branch, perform the owner-run
schema/backend rollout, then publish the frontend to main. Preserve existing
origins, linked target and deployed environment variables. The Windows guide uses
Node checksum verification and Explorer extraction, without `Get-FileHash`.

[Current Windows steps](../../docs/ADMIN_TEAM_LOCK_WINDOWS_ROLLOUT.md),
[pending-only migration details](../../docs/NEON_POPULATED_UPGRADE_PLAN.md),
[receipt](receipt.json), [build metadata](build-metadata.json),
[source graph](../../evidence/admin-team-lock-api-release/graph.json),
[runtime hashes](../../evidence/admin-team-lock-api-release/runtime-input-hashes.json),
[archive inventory](../../evidence/admin-team-lock-api-release/inventory.json), and
[host smoke](../../evidence/admin-team-lock-api-release/host-smoke.json).
