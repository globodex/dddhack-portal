# Submission access and admin Add idea — held backend candidate

Built from exact tested runtime source `49de9dd55dcaaa14b881e30fd0eac39eb4c8a23d` with official `@neon/config-runtime@1.10.2`, Node.js24/Linux ARM64 glibc, empty function environment and zero warnings. Packaging/verification only: publication and owner-operated migration/deployment remain pending.

- ZIP SHA256: `a23ff1aa87e9cd8d9ef13bc2db7eaafec21407932603f0bea52d9188c796136e` (9,042,985 bytes).
- `index.mjs` SHA256: `1a4115a59bd6a69c5af52ddcbf9ecb20c3cf4f67eb2d881a17f56f43c7da811a`.
- 93 files, 21,249,435 uncompressed bytes. Only `index.mjs` changes from prior ZIP `e2fe6ef514c45cd6f52175b25ce10a4f569fbe08bb648181c7059e07cd97200d`; all 92 dependency/native entries remain byte-identical. Prior archive is preserved in Git history and a separate executor copy.
- Fresh independent esbuild output matches the packaged JavaScript exactly; all 99 application inputs match source49de9dd. No frontend, tests, fixtures or environment files are included.
- Append-only migrations **0110_admin_submission_access.sql** and **0111_admin_missing_team_idea.sql** are required before this backend runs. Inspect actual hosted state and apply only a pending suffix; already applied migrations are skipped. Nothing migrates automatically.
- Canonical 17-entry plan: `3c173216603f6a2927903493e29bfbe629dcaddf67cbcd322196f3153f6bffd5`. Historical SQL through0109 and seven CRLF aliases are unchanged.
- Exact extracted deployment directory: `.local\portalapi-a23ff1aa87e9`, containing `index.mjs` and `node_modules` at its root. Do not merge into a previous folder or install Windows dependencies inside it.

[Held Windows rollout](../../docs/SUBMISSION_ACCESS_WINDOWS_ROLLOUT.md), [receipt](receipt.json), [verification evidence](../../evidence/submission-access-package/), [application validation](../../docs/SUBMISSION_ACCESS_LOCAL_REVIEW.md).

The ARM64 addon/libvips ELF headers, hashes and RPATH were inspected. JavaScript routing passed with host-native Sharp substituted in a separate directory and outbound networking blocked. The original archive and extracted ARM64 tree remain unchanged. Native ARM64 execution/system-library availability and live deployment are unverified. Current exact-byte proof does not guarantee future npm resolution or ZIP timestamps will reproduce identical archives.
