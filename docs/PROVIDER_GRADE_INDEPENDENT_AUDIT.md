# Independent provider-grade boundary audit

Final outcome: nine independent cases pass on parent runtime fix `46afa8b52e09c7da56bace5e4e68a8e766abd3d6`. Full typecheck and diff checks pass. Two existing native PostgreSQL cases were explicitly skipped with the native test URL unset. No remaining source defect was found within the tested boundaries.

Baseline source: `cde3ce4e5a69158eaf5a2b0f7ae489800740982c`, including the provider output and persistence bridge. All evaluations use injected mock providers and disposable synthetic SQLite/PGlite databases. No real provider request, credential read, configuration change or hosted database action occurred.

The initial seven-case run passed three cases and failed four, reproducing two issues independently in both database engines:

1. Provider lease recovery leaves the running provider-config evaluation row active because recovery uses a hardcoded offline configuration key. A retry hits the active version/config unique constraint and cannot proceed. The original late result is superseded, but the provider row remains active. The exact synthetic state and retry failure are retained in `provider-recovery-before.json`.
2. An evaluation started before a real owner `freeze-results` command can finalize and persist a numeric grade after the freeze. The frozen snapshot and manual rubric remain unchanged in this reproduction; no public final-score mutation is claimed. The late private grade still changes evaluation/scoring inputs after the frozen boundary.

Before-fix cross-engine output is preserved in `evidence/provider-grade-independent/before-independent-tests.log`. The mapper/binding/uncertainty/zero/attempt-cap/privacy control cases pass. The parent owns narrow runtime fixes; this audit edits only its independent tests and evidence.

Native PostgreSQL multi-connection behavior and a real configured model are not verified here. The local missing-model condition reported by the parent remains a live-evaluation blocker; no actual key or model configuration was read by this audit.

The after-fix test strengthens the exact-SHA check with an internally consistent report for a different revision, so rejection depends on the expected approved revision. It checks missing-model rejection before a job attempt, three-attempt enforcement, a real zero grade, no automatic eligibility/history/manual-review changes, public score privacy before reveal, and an assigned judge's exclusion from private evaluation reports. Manual zero overrides a distinct provider score of ten.

Recovery now frees the actual original provider lease and configuration, permits a second evaluation, and rejects the late first result. Both late provider success and late provider failure after an actual owner freeze return an explicit stopped message and leave the entire job, run, scoring revision, frozen snapshot and manual rubric unchanged. The remaining database `running` rows are deliberately inert after freeze; the parent owns the derived stopped UI state.

Results are retained separately in `after-independent-tests.log`, `native-explicit-skip.log`, and `typecheck.log` under `evidence/provider-grade-independent/`. The original failing output is unchanged. This audit owns only its independent tests/docs/evidence; the runtime fix is parent-owned. ScoringSetup UI and real provider behavior are outside this completed mock-only audit.
