# Reviewed backend archive

`portalapi.zip` includes the sign-in email HTML/plain-text template, safe fallback URL, plain-address default display name and existing explicit named-sender support. Backend source: `2cf51d72602447b43d1893cc0b6fb1e6fd207996`; later integrated UI/SEO commits do not change its Neon entry graph. Existing authentication, same-browser token verification, TLS, file/URL restrictions, credentials and production records are preserved. No email was sent.

- Runtime Node.js24, Linux ARM64 glibc.93 files,9,009,666 compressed bytes;21,134,827 uncompressed bytes.
- SHA-256: `db3c06505c15066c1ca918e32c8d77a2a5a86b5d47b080f3ee885ed6498baf85`.
- Independent architecture/path/size checks and isolated host JavaScript smoke passed. The unchanged JavaScript used host x86_64 Sharp only for that smoke; execution of the actual ARM64 binaries is unverified.
- No secrets, fixture databases or test graph were packaged. `receipt.json`, `build-metadata.json` and `../../evidence/neon-host-archive/report.json` record provenance and limits.

The owner must manually redeploy the reviewed backend archive for the email changes to become live. This task did not deploy, migrate, change environment values or alter provider settings. Existing explicit SMTP_FROM remains honored; no sender/credential toggle is required by this release.

Rebuild only with the official locally installed `@neon/config-runtime@1.10.2` build API:

```sh
node scripts/build-neon-archive.mjs /path/to/@neon/config-runtime/dist/v1.js
```

The build helper resolves the local function configuration, supplies an empty environment map and creates the archive. It never invokes plan/apply/deploy. Native dependency staging may download public npm packages. Follow `docs/NEON_HOST_ARCHIVE_VERIFICATION.md` to validate a rebuilt archive before manual publication. ZIP timestamps mean future archive hashes may differ.
