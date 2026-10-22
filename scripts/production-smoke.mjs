import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unstable_dev, getPlatformProxy } from "wrangler";
import { seedLocal, LOCAL_CREDIT_KEY } from "./fixtures.ts";
process.env.PORTAL_LOCAL_TEST = "1"; // Cannot reactivate code removed by the production build.
process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
process.env.WRANGLER_SEND_METRICS = "false";
const persistTo = mkdtempSync(join(tmpdir(), "portal-worker-smoke-"));
const options = {
  config: "dist/server/wrangler.json",
  envFiles: [],
  local: true,
  ip: "127.0.0.1",
  port: 0,
  inspectorPort: 0,
  logLevel: "error",
  persist: true,
  persistTo,
  experimental: {
    disableExperimentalWarning: true,
    disableDevRegistry: true,
    testMode: true,
    watch: false,
  },
};
let worker;
const report = {};
const spoof = {
  "oai-authenticated-user-id": "attacker",
  "oai-authenticated-user-email": "connectwithparam.30@gmail.com",
  cookie: "portal_local_fixture=owner; __sites_local_auth=1",
};
try {
  worker = await unstable_dev("dist/server/index.js", options);
  const landing = await worker.fetch("/");
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /Build what/);
  for (const path of [
    "/dashboard/credits",
    "/admin/permissions",
    "/judge",
    "/api/portal?view=/admin/permissions",
    "/api/export?list=credits",
  ]) {
    const response = await worker.fetch(path, {
      headers: spoof,
      redirect: "manual",
    });
    assert.equal(response.status, 503, path);
    assert.equal((await response.json()).code, "SITES_DISPATCH_NOT_CONFIGURED");
  }
  assert.equal((await worker.fetch("/local-test")).status, 404);
  report.standalone = {
    landing: 200,
    forgedOwnerHeadersAccepted: false,
    localAdapterEnabledByEnvironmentOrCookie: false,
    privatePagesAndAPIs: 503,
    localTestRoute: 404,
  };
  await worker.stop();
  worker = undefined;

  // An isolated synthetic Dispatch harness. Its identity headers are test input,
  // not proof of real ChatGPT sign-in, and these vars never enter hosted config.
  const platform = await getPlatformProxy({
    configPath: "dist/server/wrangler.json",
    envFiles: [],
    remoteBindings: false,
    persist: { path: join(persistTo, "v3") },
  });
  try {
    for (const file of readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      for (const sql of readFileSync("drizzle/" + file, "utf8")
        .split("--> statement-breakpoint")
        .filter((s) => s.trim()))
        await platform.env.DB.prepare(sql).all();
    }
    await seedLocal(platform.env.DB);
  } finally {
    await platform.dispose();
  }
  worker = await unstable_dev("dist/server/index.js", {
    ...options,
    vars: {
      PORTAL_RUNTIME: "sites",
      PORTAL_TRUST_SITES_DISPATCH: "true",
      CREDIT_ENCRYPTION_KEY: LOCAL_CREDIT_KEY,
    },
  });
  const anon = await worker.fetch("/dashboard", { redirect: "manual" });
  assert.equal(anon.status, 302);
  assert.match(
    anon.headers.get("location"),
    /\/signin-with-chatgpt\?return_to=%2Fdashboard$/,
  );
  assert.match(anon.headers.get("cache-control"), /no-store/);
  const alice = {
    "oai-authenticated-user-id": "fake_alice",
    "oai-authenticated-user-email": "alice@portal.test",
  };
  const adminDenied = await worker.fetch("/admin/permissions", {
    headers: alice,
  });
  assert.equal(adminDenied.status, 403, await adminDenied.text());
  const dashboard = await worker.fetch("/dashboard/profile", {
    headers: alice,
  });
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.headers.get("cache-control"), /no-store/);
  const profile = await worker.fetch("/api/portal?view=/dashboard/profile", {
    headers: alice,
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).me.id, "fake_alice");
  assert.equal(
    (await worker.fetch("/api/portal?view=/dashboard/profile")).status,
    401,
  );
  assert.equal(
    (await worker.fetch("/api/export?list=credits", { headers: alice })).status,
    403,
  );
  const judge = {
    "oai-authenticated-user-id": "fake_judge",
    "oai-authenticated-user-email": "judge@portal.test",
  };
  assert.equal(
    (await worker.fetch("/dashboard/credits", { headers: judge })).status,
    403,
  );
  const owner = {
    "oai-authenticated-user-id": "synthetic-owner",
    "oai-authenticated-user-email": "connectwithparam.30@gmail.com",
  };
  assert.equal(
    (await worker.fetch("/admin/permissions", { headers: owner })).status,
    200,
  );
  const mutation = await worker.fetch(
    `http://${worker.address}:${worker.port}/api/portal`,
    {
      method: "POST",
      headers: {
        ...owner,
        "content-type": "application/json",
        origin: `http://${worker.address}:${worker.port}`,
      },
      body: JSON.stringify({
        action: "local-signin",
        data: { fixture: "owner" },
      }),
    },
  );
  assert.equal(mutation.status, 404);
  assert.equal(mutation.headers.get("set-cookie"), null);
  assert.equal((await worker.fetch("/api/portal?view=/rules")).status, 200);
  report.syntheticDispatch = {
    realChatGPTSignInVerified: false,
    anonymousPrivatePage: 302,
    participantProfilePage: 200,
    participantPrivateAPI: 200,
    anonymousPrivateAPI: 401,
    participantAdminPage: 403,
    participantExport: 403,
    judgeCreditsPage: 403,
    verifiedHarnessOwnerAdminPage: 200,
    localSignInCommand: 404,
    publicRulesAPI: 200,
  };
  writeFileSync(
    "evidence/sites-production-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (worker) await worker.stop();
  rmSync(persistTo, { recursive: true, force: true });
}
