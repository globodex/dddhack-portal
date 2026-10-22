import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
process.env.NODE_ENV = "production";
process.env.PORTAL_LOCAL_TEST = "1"; // Must not reactivate the compiled-out local adapter.
const { startProdServer } = await import("vinext/server/prod-server");
const { server } = await startProdServer({
  host: "127.0.0.1",
  port: 0,
  silent: true,
});
const url = `http://127.0.0.1:${server.address().port}`;
try {
  const landing = await fetch(url);
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /Build what/);
  const headers = {
    "oai-authenticated-user-id": "attacker",
    "oai-authenticated-user-email": "connectwithparam.30@gmail.com",
  };
  const api = await fetch(url + "/api/portal?view=/admin/permissions", {
    headers,
  });
  assert.equal(api.status, 503);
  assert.equal((await api.json()).code, "HOSTED_ADAPTER_UNAVAILABLE");
  const mutation = await fetch(url + "/api/portal", {
    method: "POST",
    headers: { ...headers, origin: url, "content-type": "application/json" },
    body: JSON.stringify({
      action: "local-signin",
      data: { fixture: "owner" },
    }),
  });
  assert.equal(mutation.status, 503);
  assert.equal(mutation.headers.get("set-cookie"), null);
  const exp = await fetch(url + "/api/export?list=credits", { headers });
  assert.equal(exp.status, 503);
  const report = {
    landing: 200,
    unwiredRead: 503,
    unwiredMutation: 503,
    unwiredExport: 503,
    localAdapterEnabledByEnvironment: false,
    forgedOwnerHeadersAccepted: false,
  };
  writeFileSync(
    "evidence/production-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
