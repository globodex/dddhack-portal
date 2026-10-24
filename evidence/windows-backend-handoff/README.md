# Local Windows deployment handoff validation

The preparation helper executed successfully using the official PowerShell7.6.8 Linux runtime. Its public release archive digest was verified as `59112e38ad83350e4f6dc0195953c66b5926792f300ca2e7691b8242e7a16e7f`. This is local cross-platform execution, not a claim of native Windows verification.

[Six checks passed](report.json) against the actual reviewed93-entry backend ZIP: normal copy/hash/extraction and required native files; repeated fresh staging; wrong-hash rejection; mocked HTTPS retrieval; unsafe-URL rejection before transport; and unchanged synthetic environment sentinel with zero Neon commands. The download test replaces `Invoke-WebRequest` with a local copy explicitly, so no real artifact-download claim is made. The helper never evaluates `neon.ts` or accesses environment/context files.

Neon CLI8.11.1 was obtained from the public npm distribution in a temporary directory. Only `--version`, `deploy --help` and `functions deploy --help` were executed. [Functions help](neon-functions-deploy-help.txt) verifies the exact manual `--src`, `--no-bundle` and Node24 options; [full-policy help](neon-deploy-help.txt) distinguishes its file-based `--env` option. No login, account inspection, environment pull, config plan/apply, hosted migration or deployment was executed.

The [operator handoff](../../docs/DESIGN_RELEASE_WINDOWS_DEPLOY.md) links the populated-database upgrade prerequisite owned by the release lane. Actual Windows5.1/7 execution, real HTTPS retrieval, hosted target/schema/environment and ARM64 runtime execution remain unverified. Existing application code and real environment files were not changed.

The six checks were repeated after integration against the freshly rebuilt ZIP `bc017c088b6791d091db6571104d84a2dcfb6ca8ea1d7a0f80fa36b38aef7ae3`. The preparation helper pins that exact archive; report.json is the refreshed result.
