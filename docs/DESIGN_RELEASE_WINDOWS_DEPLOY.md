# Windows backend archive handoff

Use the [complete analytics/member-information Windows rollout](ANALYTICS_MEMBER_INFO_WINDOWS_ROLLOUT.md).
It contains the exact existing repository location, all software/checks, one fully
initialized PowerShell block, read-only schema inspection and conditional prior0106
recovery, direct Node checksum verification, Explorer extraction, literal deploy
path and authenticated post-deployment checks. It does not require a checksum
cmdlet or the legacy preparation helper.

The reviewed archive source is `72ec164d3056469c239a011984e83ff88f2aacaf`; ZIP SHA256 is `cef0cb28499525c48fbf4825d4a50c988b19337c5b0ff240ed3d0c5719bac6cb`.
This batch adds no SQL migration. The existing12-entry plan digest remains
`73c64b0acbe9df80f9ca6627c0a1d4a3485c83214a6923918c530c1ab2b5d160`: if inspection already shows12 and pending[], apply nothing.
If only prior0106 is pending on an11-entry ledger, establish and independently
verify a real restore checkpoint before using the existing guarded apply workflow.
Do not fabricate a backup identifier or confirmation. Other states stop for the
[existing populated-upgrade guide](NEON_POPULATED_UPGRADE_PLAN.md).

Keep the existing linked `.neon` context, `.env.backend.local`, `neon.windows.ts`,
APP_ORIGIN, NEON_API_ORIGIN and proxy secrets intact. The working public origin is
`https://dddhack-portal.vercel.app`; this handoff does not change it or any default.
The owner-run command remains a separate manual step from the same linked root:

```powershell
neon functions deploy portalapi --src .\.local\portalapi-cef0cb284995 --no-bundle --runtime nodejs24
```

The complete guide verifies the ZIP with Node crypto, creates that exact fresh
folder through Explorer and verifies root index.mjs/node_modules before this command.
It supplies no `--env`: existing deployed Function variables carry over. It performs
no full-policy config reconciliation or env-file pull. The extracted tree already
contains Linux ARM64 dependencies; do not run npm install there.

[Archive verification](FINAL_NEON_API_ARCHIVE_VERIFICATION.md) records local evidence.
Legacy helper digest pins are maintained for compatibility, and six checks ran under
PowerShell7.6.8 on Linux. This does not establish native Windows acceptance. Native
ARM64 execution and hosted deployment were not performed by the packaging lane.
