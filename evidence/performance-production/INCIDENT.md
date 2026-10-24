# Local synthetic fixture output-path mistake

At2026-10-24 approximately15:28 UTC, this lane executed:

```
python evidence/final-performance-current/fixture-integrity.py /tmp/ddd-redesign-rich.sqlite > evidence/performance-production/fixture-before.json
```

The helper's source is hardcoded and its positional argument is the **output manifest**. The operator incorrectly treated that argument as the input database. It successfully read all64 original synthetic tables using SQLite read-only/query-only mode, closed the connection, then wrote its JSON manifest over the same synthetic database path. The output file was15,859-byte JSON. This is a confirmed local synthetic fixture mutation. No production database/provider was accessed or changed, and no production app source/guard was modified.

The subsequent production baseline preflight received500 REQUEST_FAILED from both the TLS bridge and direct local backend projections, while the synthetic session endpoint still returned200. It correctly failed its heading assertion; no production timing sample is accepted. Root detected the JSON replacement and is coordinating preservation/recovery without blind deletion, migration or reseeding. All8789/database access by this lane stopped immediately after confirmation. The corrupted JSON and any existing WAL are under root's recovery ownership.

The completed28 development samples, actual screenshots, before/after64-table manifests and commit8de749e were produced before this later command. Their recorded unchanged hash is `bf01ef3f41c8ffced1c2d7d9109a3c4f43de014427c8da40d672e946cbd06d45`. The accidental command read the same hash before overwriting; its stdout summary is retained in the production fixture-before.json, which is **not a valid full manifest**.

The owned fingerprint helper now checks source/output collision, requires a .json output, refuses an existing output, and creates the new manifest exclusively. Checks occur before opening SQLite. No further fingerprint operation or recovery has been attempted by this lane pending root direction.

`harness-proxy-attempt` preserves an earlier transport-only ERR_PROXY_CONNECTION_FAILED before any SSR call; adding an explicit resolver exclusion for the local proxy corrected that harness issue. `harness-backend-attempt` preserves the failed500 projection trace and missing-heading failure. These are failed preflight evidence, not accepted benchmark data.
