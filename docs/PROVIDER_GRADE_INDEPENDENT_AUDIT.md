# Independent provider-grade boundary audit

Baseline source: `cde3ce4e5a69158eaf5a2b0f7ae489800740982c`, including the provider output and persistence bridge. All evaluations use injected mock providers and disposable synthetic SQLite/PGlite databases. No real provider request, credential read, configuration change or hosted database action occurred.

The initial seven-case run passed three cases and failed four, reproducing two issues independently in both database engines:

1. Provider lease recovery leaves the running provider-config evaluation row active because recovery uses a hardcoded offline configuration key. A retry hits the active version/config unique constraint and cannot proceed. The original late result is superseded, but the provider row remains active. The exact synthetic state and retry failure are retained in `provider-recovery-before.json`.
2. An evaluation started before a real owner `freeze-results` command can finalize and persist a numeric grade after the freeze. The frozen snapshot and manual rubric remain unchanged in this reproduction; no public final-score mutation is claimed. The late private grade still changes evaluation/scoring inputs after the frozen boundary.

Before-fix cross-engine output is preserved in `evidence/provider-grade-independent/before-independent-tests.log`. The mapper/binding/uncertainty/zero/attempt-cap/privacy control cases pass. The parent owns narrow runtime fixes; this audit edits only its independent tests and evidence.

Native PostgreSQL multi-connection behavior and a real configured model are not verified here. The local missing-model condition reported by the parent remains a live-evaluation blocker; no actual key or model configuration was read by this audit.
