# Team control continuation

The Team QA runner is portable to this cloud checkout and isolated loopback ports. It requires a fresh UUID reset receipt bound to exact source, compiled Worker, artifact root and origin. Each token is consumed once; failures require a new disposable reset. Unallowlisted writes and external browser requests remain blocked. Keyboard activation joins mouse and emulated touch modes. Startup failures now produce evidence instead of escaping the report.

Source `b95c4fb` passed three serial scoped tests: the reset guard, additive Team fixture/service contracts and a combined HTTP-handler flow using a disposable in-memory SQLite database. The HTTP flow persists ten Team actions and checks state through each actor's dashboard, denied member/locked edits, revoked private idea access after removal, recoverable team deletion, unchanged submission attempts and private no-store responses. Outbound fetch is forbidden by the test. This is positive handler/service coverage, not browser interaction coverage.

TypeScript passed. The unchanged runtime base `8a9daad` built successfully and passed the 185-file artifact review. Its locally compiled Worker hash is `d43976f1cd0105eea93f24fe102afe36b18c810c8410db5fb17252cbb89fccf2`. Test harness changes after the build do not change the product source.

Browser writes are blocked before the first request: system Chromium's SUID sandbox helper is misconfigured, and a sandbox-preserving user-namespace probe reports no usable sandbox. The sandbox was not disabled. Desktop, mobile/tablet touch emulation and keyboard interaction checks remain unexecuted. No screenshots were created. The Team preview was stopped and its disposable database removed.

Exact machine evidence is in `evidence/v7-team/summary.json`, serial output in `evidence/v7-team/targeted-tests.log`, and the blocked browser attempt in `evidence/v7-team-desktop/report.json`. Final integration regression belongs to the integration owner.
