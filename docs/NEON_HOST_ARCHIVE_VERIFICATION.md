# Rebuilt backend archive: independent host verification

Verified runtime source `2cf51d72602447b43d1893cc0b6fb1e6fd207996`. No rebuild, deployment, mail send or application/runtime file change was performed by this verification lane.

| Check                                                       | Observed result                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| ZIP SHA-256                                                 | `db3c06505c15066c1ca918e32c8d77a2a5a86b5d47b080f3ee885ed6498baf85`      |
| Archive size                                                | 9,009,666 bytes compressed; 21,134,827 bytes uncompressed               |
| Files                                                       | 93                                                                      |
| Native files                                                | Two Linux ARM64 ELF files, both machine 183                             |
| Forbidden archive paths                                     | None found                                                              |
| Original and host-copy JavaScript SHA-256                   | Both `4bf01421341eb73d7e6d61a246024f66645d6e0d0763144e74243df53b08c08d` |
| Trusted in-process GET `/api/health`                        | 200, expected runtime JSON, private/no-store                            |
| Untrusted in-process GET `/api/health`                      | 403, `UNTRUSTED_PROXY`, code-only body                                  |
| Unconfigured in-process GET `/api/portal?view=%2Fdashboard` | 503, `BACKEND_UNAVAILABLE`, code-only redacted body                     |
| Outbound API attempts during smoke                          | Zero                                                                    |

The child Node.js 24 process starts with only six whitelisted synthetic/system environment keys. No database, SMTP, Google, storage or other real credential is supplied. Node fetch, TCP socket connect, TLS and HTTP(S) request APIs are replaced with throwing guards before the archive JavaScript is imported. The module loads without startup migrations, fixture loading, network calls or background processing. Sharp adds its non-secret `VIPSHOME` native-library path during import; the report distinguishes initial and post-import environment key names without recording environment values.

The unchanged JavaScript entry was loaded from `/tmp/ddd-neon-host-smoke/index.mjs`, whose `node_modules` resolves to the executor's installed host dependencies. Sharp 0.35.5/libvips 8.18.7 loaded an **x86_64 ELF machine 62** addon. This substitution is deliberate and external to the ZIP. The original archive and extracted ARM64 tree were unchanged, with ZIP, entry and both ARM native-file hashes checked before and after the smoke.

**This does not execute the unmodified ARM64 archive.** Actual ARM64 cold start, image decoding, hosted storage, SMTP delivery and full login remain unverified. The dependency graph's 854 inputs and empty forbidden-input list are retained from the existing build receipt, not recomputed by this script. File inventory, archive/index hashes and native ELF headers were independently revalidated.

Reproduce using the existing extracted archive and separate host-copy directory:

```sh
node scripts/verify-neon-host-archive.mjs \
  --archive /workspace/dddhack-portal/artifacts/neon/portalapi.zip \
  --receipt /workspace/dddhack-portal/artifacts/neon/receipt.json \
  --extracted /tmp/ddd-neon-verified \
  --host /tmp/ddd-neon-host-smoke \
  --report evidence/neon-host-archive/report.json
```

The command reads the archive and writes only its selected report. It does not create a package or call a provider. [Machine-readable evidence](../evidence/neon-host-archive/report.json) contains the exact response checks, host substitution and limitations. The user must manually redeploy the reviewed backend archive for the email changes to take effect.
