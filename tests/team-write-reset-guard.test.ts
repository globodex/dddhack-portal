import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTeamWriteReset } from "../scripts/team-write-reset-guard.mjs";
const token = "eb825a68-849c-44db-9d27-581568de6c3a",
  source = "a".repeat(40),
  worker = "b".repeat(64),
  artifactRoot = "/local/integration";
const fixture = () => ({
  path: "/tmp/ddehack-controls-" + token + ".json",
  token,
  source,
  worker,
  artifactRoot,
  manifest: {
    resetToken: token,
    source,
    worker,
    artifactRoot,
    origin: "http://127.0.0.1:4173",
    disposable: true,
    syntheticOnly: true,
    rootConfirmedReset: true,
  },
});
test("Team write reset accepts only matching explicit local reset evidence", () => {
  assert.doesNotThrow(() => assertTeamWriteReset(fixture()));
  const alternatePort = fixture();
  alternatePort.manifest.origin = "http://127.0.0.1:4176";
  assert.doesNotThrow(() =>
    assertTeamWriteReset({ ...alternatePort, origin: "http://127.0.0.1:4176" }),
  );
  for (const origin of ["https://example.test", "http://localhost:4176", "http://127.0.0.1:4176/path"])
    assert.throws(() => assertTeamWriteReset({ ...fixture(), origin }));
  for (const change of [
    { source: "c".repeat(40) },
    { worker: "d".repeat(64) },
    { artifactRoot: "/other" },
    { origin: "https://example.test" },
    { resetToken: "fb825a68-849c-44db-9d27-581568de6c3a" },
    { disposable: false },
    { syntheticOnly: false },
    { rootConfirmedReset: false },
  ]) {
    const f = fixture();
    f.manifest = { ...f.manifest, ...change };
    assert.throws(() => assertTeamWriteReset(f));
  }
  assert.throws(() =>
    assertTeamWriteReset({ ...fixture(), path: "/tmp/other.json" }),
  );
  assert.throws(() =>
    assertTeamWriteReset({ ...fixture(), token: token.replaceAll("-", "") }),
  );
});
