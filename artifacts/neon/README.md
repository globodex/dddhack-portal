# Admin profile email backend package

Built from exact committed runtime source `6cb9b2862fb992135491fcadca5795b63a9ed3f9` using official `@neon/config-runtime@1.10.2`, Node.js24/Linux ARM64 glibc, `env: {}`, zero warnings. No credentials, SQL, fixtures, tests or screenshots are packaged.

- ZIP SHA256: `6c94e2ccd8ad3baeccc326c7e87c49e0b0900657012becad36b97505f89d0542` (9,039,162 bytes).
- JavaScript SHA256: `8649033ec0f2959c0075bf0ead08b150b44d3b82cb453d111f64157bd11c0b89`.
- 93 entries; only `index.mjs` changed versus the prior 0c3e35 archive; all 92 native/dependency entries unchanged.
- Independent fresh esbuild matches the archive JavaScript; 96 application input hashes match the exact Git source.
- No new migration. The existing 13-entry plan through0107 is unchanged.
- Backend deployment is required to supply the admin-only selected-profile email field. The agent has not deployed it or changed hosted data/settings.

[Windows deployment steps](../../docs/ADMIN_PROFILE_EMAIL_WINDOWS_ROLLOUT.md), [receipt](receipt.json), [build metadata](build-metadata.json), [package evidence](../../evidence/admin-profile-email-api-release/). Host smoke verifies JavaScript routing in a separate copy with host Sharp substituted; native ARM64 execution and hosted rollout remain unverified.
