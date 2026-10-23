Final local synthetic validation, 23 October 2026.

The compiled workload passed all 1,986 requests: 314 GET and 1,672 POST, including 116 expected rejections and zero unexpected errors. The disposable dataset held 300 participants, 90 teams, 300 memberships, 270 immutable versions, 270 idempotency receipts and 600 unique votes. Maximum team size stayed five and maximum attempts stayed three. Foreign key and duplicate-vote checks passed.

Artifact source: `0a2e3f97b457d4ba8fd1a71333887b50633d84e3`. Worker SHA-256: `b127925d2aaa0eea1f44f6526d4e1437038549e9aa2ca6ac7371a55f092a13c7`. The harness copied an immutable artifact snapshot, used only loopback port 4185 and independent temporary D1 storage, denied Worker outbound requests, and removed temporary storage afterward. Source and snapshot fingerprints stayed unchanged. No outbound requests occurred. All 270 verification jobs stayed pending with zero attempts and no report; no evaluation runs or provider calls occurred.

Normal read p95 was 48.8 ms at concurrency 1, 139.6 ms at 4, 239.7 ms at 8 and 563.7 ms at 16 (75 reads per level). The full serial suite and other browser work ran concurrently. These are local observations, not an exclusive timing comparison or hosted capacity proof.

The final serial suite passed 315/315 with zero skips in 77.6 seconds. It covered integrated application source `153eccd4f6b22c638186cbd5ed7c0dd286846054` in testing merge `c27004340d6c484bcc63d03e967d0935c7d6da77`; later artifact-source changes added preview and delivery evidence only. Typecheck also passed. The suite includes actual local and hosted-stream D1 upgrade parity, configured independent-reviewer minimums, leadership transfer, credits, derived readiness and the combined synthetic journey. No percentage coverage was collected in this run.

`report.json` contains every synthetic HTTP sample, invariant check and workload group. `summary.json` records exact provenance and limitations. `full-serial-tests.log` is the complete test output. Browser interactions and screenshots have separate evidence; this workload adds no screenshots and implies no publication.
