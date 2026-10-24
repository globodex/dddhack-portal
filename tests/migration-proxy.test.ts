import { test } from "node:test";
import assert from "node:assert/strict";
import { proxyBackendRequest } from "../lib/next-backend";

const app = "https://synthetic.portal.test";
const backend = "https://synthetic.function.test";
const secret = "synthetic-proxy-secret-32-characters-minimum";
const config = {
  NODE_ENV: "production",
  APP_ORIGIN: app,
  NEON_API_ORIGIN: backend,
  PORTAL_PROXY_SECRET: secret,
  PORTAL_LOCAL_TEST: undefined,
};
async function configured(
  run: () => Promise<void>,
  overrides: Record<string, string | undefined> = {},
) {
  const values = { ...config, ...overrides };
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values))
    value === undefined ? delete process.env[key] : (process.env[key] = value);
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous))
      value === undefined
        ? delete process.env[key]
        : (process.env[key] = value);
  }
}

test("Next proxy forwards only allowlisted client headers and pins backend origin, exact path and query", async (t) => {
  await configured(async () => {
    let calls = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: URL, init: RequestInit) => {
        calls++;
        assert.equal(String(input), backend + "/api/portal?view=%2Fdashboard");
        assert.equal(init.cache, "no-store");
        assert.equal(init.redirect, "manual");
        const headers = new Headers(init.headers);
        assert.equal(headers.get("cookie"), "synthetic_session=fixture-only");
        assert.equal(headers.get("x-portal-proxy-secret"), secret);
        assert.equal(headers.get("x-portal-forwarded-origin"), app);
        for (const name of [
          "oai-authenticated-user-id",
          "oai-authenticated-user-email",
          "x-portal-user-role",
          "x-forwarded-host",
          "x-forwarded-proto",
          "host",
          "authorization",
          "connection",
          "x-attacker",
        ])
          assert.equal(headers.get(name), null, name);
        return Response.json({ safe: true });
      },
    );
    const response = await proxyBackendRequest(
      new Request(app + "/api/portal?view=%2Fdashboard", {
        headers: {
          cookie: "synthetic_session=fixture-only",
          "oai-authenticated-user-id": "fake_owner",
          "oai-authenticated-user-email": "owner@synthetic.invalid",
          "x-portal-user-role": "owner",
          "x-portal-proxy-secret": "forged",
          "x-portal-forwarded-origin": "https://attacker.invalid",
          host: "attacker.invalid",
          authorization: "Bearer synthetic-forged-token",
          connection: "x-attacker",
          "x-attacker": "forged",
          "x-forwarded-host": "attacker.invalid",
          "x-forwarded-proto": "http",
        },
      }),
    );
    assert.equal(calls, 1);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("cache-control") || "",
      /private, no-store/,
    );
    assert.equal(response.headers.get("vary"), "Cookie");
  });
});

test("Next proxy rejects missing/foreign mutation Origin and foreign request hosts before fetch", async (t) => {
  await configured(async () => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return new Response();
    });
    for (const origin of [
      null,
      "https://attacker.invalid",
      app + ".attacker.invalid",
    ]) {
      const response = await proxyBackendRequest(
        new Request(app + "/api/portal", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(origin ? { origin } : {}),
          },
          body: "{}",
        }),
      );
      assert.equal(response.status, 403);
    }
    const foreign = await proxyBackendRequest(
      new Request("https://attacker.invalid/api/portal"),
    );
    assert.equal(foreign.status, 403);
    assert.equal(calls, 0);
  });
});

test("Next proxy preserves independent Set-Cookie values containing Expires commas and removes upstream-only headers", async (t) => {
  await configured(async () => {
    const cookies = [
      "synthetic_session=one; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax",
      "synthetic_csrf=two; Path=/; HttpOnly; Secure; SameSite=Lax",
    ];
    t.mock.method(globalThis, "fetch", async () => {
      const headers = new Headers({
        connection: "x-internal",
        "x-internal": "private",
        "content-length": "999",
        "content-encoding": "gzip",
        "access-control-allow-origin": "*",
        "x-portal-proxy-secret": secret,
        "oai-authenticated-user-id": "fake_owner",
      });
      for (const cookie of cookies) headers.append("Set-Cookie", cookie);
      return new Response("synthetic", { headers });
    });
    const response = await proxyBackendRequest(
      new Request(app + "/api/auth/session"),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(response.headers.getSetCookie(), cookies);
    for (const name of [
      "connection",
      "x-internal",
      "content-length",
      "content-encoding",
      "access-control-allow-origin",
      "x-portal-proxy-secret",
      "oai-authenticated-user-id",
    ])
      assert.equal(response.headers.get(name), null, name);
  });
});

test("Next proxy allows same-app relative redirects and rejects external, scheme-relative and backslash redirects", async (t) => {
  await configured(async () => {
    let location = "/dashboard?synthetic=1#team";
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(null, { status: 302, headers: { location } }),
    );
    for (const value of [
      "/dashboard?synthetic=1#team",
      app + "/dashboard?synthetic=1#team",
    ]) {
      location = value;
      const response = await proxyBackendRequest(
        new Request(app + "/api/auth/callback/google"),
      );
      assert.equal(response.status, 302);
      assert.equal(
        response.headers.get("location"),
        "/dashboard?synthetic=1#team",
      );
    }
    for (const value of [
      "https://attacker.invalid/",
      "//attacker.invalid/",
      "/\\attacker.invalid/",
      "https://synthetic.portal.test@attacker.invalid/",
    ]) {
      location = value;
      const response = await proxyBackendRequest(
        new Request(app + "/api/auth/callback/google"),
      );
      assert.equal(response.status, 502);
      assert.equal(response.headers.get("location"), null);
    }
  });
});

test("Next proxy fails closed for local fixtures in production and unsafe upstream configuration", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response();
  });
  for (const overrides of [
    { PORTAL_LOCAL_TEST: "1" },
    { APP_ORIGIN: app + "/" },
    { APP_ORIGIN: "http://synthetic.portal.test" },
    { NEON_API_ORIGIN: app },
    { NEON_API_ORIGIN: "http://synthetic.function.test" },
    { NEON_API_ORIGIN: "https://127.0.0.1" },
    { PORTAL_PROXY_SECRET: undefined },
    { PORTAL_PROXY_SECRET: "short-synthetic-secret" },
  ])
    await configured(async () => {
      const response = await proxyBackendRequest(
        new Request(app + "/api/portal"),
      );
      assert.equal(response.status, 503);
    }, overrides);
  assert.equal(calls, 0);
});

test("Next proxy streams a valid same-origin body and redacts unexpected upstream exceptions", async (t) => {
  await configured(async () => {
    let shouldFail = false;
    t.mock.method(
      globalThis,
      "fetch",
      async (_input: URL, init: RequestInit) => {
        if (shouldFail) throw new Error("synthetic-private-credential-marker");
        assert.equal(
          await new Response(init.body).text(),
          '{"synthetic":true}',
        );
        assert.equal(init.method, "POST");
        return Response.json({ ok: true });
      },
    );
    const request = () =>
      new Request(app + "/api/portal", {
        method: "POST",
        headers: { origin: app, "content-type": "application/json" },
        body: '{"synthetic":true}',
      });
    assert.equal((await proxyBackendRequest(request())).status, 200);
    shouldFail = true;
    const denied = await proxyBackendRequest(request());
    assert.equal(denied.status, 502);
    assert.ok(
      !(await denied.text()).includes("synthetic-private-credential-marker"),
    );
  });
});
