import assert from "node:assert/strict";
export function assertTeamWriteReset({
  manifest,
  path,
  token,
  source,
  worker,
  artifactRoot,
  origin = "http://127.0.0.1:4173",
}) {
  assert.match(
    token || "",
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    "fresh manifest UUID reset token required",
  );
  assert.equal(
    path,
    "/tmp/ddehack-controls-" + token + ".json",
    "exact coordinator reset receipt path required",
  );
  assert.equal(manifest.resetToken, token, "reset receipt token mismatch");
  for (const key of ["disposable", "syntheticOnly", "rootConfirmedReset"])
    assert.equal(manifest[key], true, "reset receipt must confirm " + key);
  const expectedOrigin = new URL(origin);
  assert.equal(expectedOrigin.protocol, "http:");
  assert.equal(expectedOrigin.hostname, "127.0.0.1");
  assert.equal(expectedOrigin.origin, origin, "bare loopback origin required");
  assert.equal(manifest.origin, origin, "reset receipt origin mismatch");
  assert.equal(manifest.source, source, "stale reset receipt source");
  assert.equal(manifest.worker, worker, "stale reset receipt Worker");
  assert.equal(
    manifest.artifactRoot,
    artifactRoot,
    (origin = "http://127.0.0.1:4173"),
    "reset receipt artifact root mismatch",
  );
}
