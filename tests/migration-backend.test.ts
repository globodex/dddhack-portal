import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPortalBackend,
  trustedProxyRequest,
  backendError,
} from "../neon/router";
import { setup } from "./helpers";
import { fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalError } from "../lib/security";

const app = "https://synthetic.portal.test";
const secret = "synthetic-proxy-secret-32-characters-minimum";
const env = { APP_ORIGIN: app, PORTAL_PROXY_SECRET: secret };
const incoming = (path: string, init: RequestInit = {}) =>
  new Request("https://synthetic.function.test" + path, {
    ...init,
    headers: {
      "x-portal-proxy-secret": secret,
      "x-portal-forwarded-origin": app,
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });

test("public Function rejects untrusted proxy requests before invoking authentication or data dependencies", async () => {
  let calls = 0;
  const handler = createPortalBackend(env, {
    runtime: async () => {
      calls++;
      throw new Error("must not run");
    },
    auth: async () => {
      calls++;
      throw new Error("must not run");
    },
  });
  for (const request of [
    new Request("https://synthetic.function.test/api/portal"),
    incoming("/api/auth/session", {
      headers: { "x-portal-proxy-secret": "wrong" },
    }),
    incoming("/api/health", {
      headers: { "x-portal-forwarded-origin": "https://attacker.invalid" },
    }),
    incoming("/api/health", {
      headers: { "x-portal-forwarded-origin": app + "/" },
    }),
  ]) {
    const response = await handler(request);
    assert.equal(response.status, 403);
    assert.match(
      response.headers.get("cache-control") || "",
      /private, no-store/,
    );
  }
  assert.equal(calls, 0);
  assert.throws(
    () =>
      trustedProxyRequest(incoming("/api/health"), {
        ...env,
        PORTAL_PROXY_SECRET: "short",
      }),
    /UNTRUSTED_PROXY/,
  );
});

test("trusted request uses the browser origin and session cookie while stripping forged identity and forwarding hosts", () => {
  const request = trustedProxyRequest(
    incoming("/api/portal?view=%2Fdashboard", {
      headers: {
        cookie: "synthetic_session=fixture-only",
        "oai-authenticated-user-id": "fake_owner",
        "oai-authenticated-user-email": "owner@synthetic.invalid",
        "x-portal-user-id": "fake_owner",
        "x-portal-user-role": "owner",
        host: "attacker.invalid",
        forwarded: "host=attacker.invalid",
        "x-forwarded-host": "attacker.invalid",
        "x-forwarded-proto": "http",
      },
    }),
    env,
  );
  assert.equal(request.url, app + "/api/portal?view=%2Fdashboard");
  assert.equal(request.headers.get("cookie"), "synthetic_session=fixture-only");
  for (const header of [
    "oai-authenticated-user-id",
    "oai-authenticated-user-email",
    "x-portal-user-id",
    "x-portal-user-role",
    "host",
    "forwarded",
    "x-forwarded-host",
    "x-forwarded-proto",
  ])
    assert.equal(request.headers.get(header), null, header);
});

test("backend path reconstruction cannot switch origins through scheme-relative or non-API paths", () => {
  for (const path of ["//attacker.invalid/api/portal", "/dashboard", "/api"])
    assert.throws(() => trustedProxyRequest(incoming(path), env), /NOT_FOUND/);
  const request = trustedProxyRequest(
    incoming("/api//attacker.invalid/portal?view=%2Fdashboard"),
    env,
  );
  assert.equal(new URL(request.url).origin, app);
  assert.equal(new URL(request.url).pathname, "/api//attacker.invalid/portal");
});

test("backend session resolver owns identity; forged headers cannot read private state or export records", async () => {
  const { db } = await setup();
  try {
    let reads = 0;
    const handler = createPortalBackend(env, {
      runtime: async (request) => {
        reads++;
        assert.equal(request.headers.get("oai-authenticated-user-id"), null);
        return { db, identity: null, key: undefined };
      },
      auth: async () => Response.json({ user: null }),
    });
    for (const path of [
      "/api/portal?view=%2Fdashboard",
      "/api/export?list=participants",
    ]) {
      const response = await handler(
        incoming(path, {
          headers: { "oai-authenticated-user-id": "fake_admin" },
        }),
      );
      assert.equal(response.status, 401);
      assert.ok(!(await response.text()).includes("alice@portal.test"));
    }
    assert.equal(reads, 2);
  } finally {
    db.close();
  }
});

test("backend mutation rechecks exact browser Origin and refuses missing/foreign origins without committing", async () => {
  const { db } = await setup();
  try {
    const handler = createPortalBackend(env, {
      runtime: async () => ({
        db,
        identity: fixtures.alice,
        key: LOCAL_CREDIT_KEY,
      }),
      auth: async () => Response.json({}),
    });
    for (const origin of [
      null,
      "https://attacker.invalid",
      app + ".attacker.invalid",
    ]) {
      const response = await handler(
        incoming("/api/portal", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(origin ? { origin } : {}),
          },
          body: JSON.stringify({
            action: "rename-team",
            data: { name: "Forbidden synthetic rename" },
          }),
        }),
      );
      assert.equal(response.status, 403);
      assert.equal(
        (
          db.raw
            .prepare("SELECT name FROM teams WHERE id='fake_team1'")
            .get() as { name: string }
        ).name,
        "Small Wonder",
      );
    }
  } finally {
    db.close();
  }
});

test("fresh backend actor resolution revokes team privacy and enforces viewer read-only on every request", async () => {
  const { db } = await setup();
  try {
    let actor = fixtures.alice;
    const handler = createPortalBackend(env, {
      runtime: async () => ({ db, identity: actor, key: LOCAL_CREDIT_KEY }),
      auth: async () => Response.json({}),
    });
    const own = await handler(incoming("/api/portal?view=%2Fdashboard"));
    assert.equal(own.status, 200);
    assert.ok((await own.text()).includes("A fake private core idea."));
    actor = fixtures.stranger;
    const revoked = await handler(incoming("/api/portal?view=%2Fdashboard"));
    assert.equal(revoked.status, 403);
    assert.ok(!(await revoked.text()).includes("A fake private core idea."));
    const viewer = await handler(
      incoming("/api/portal?view=%2Fdiscover%2Fparticipants"),
    );
    assert.equal(viewer.status, 200);
    const projection = (await viewer.json()) as Record<string, any>;
    assert.equal(projection.me.mode, "viewer");
    assert.ok(
      !JSON.stringify(projection).includes("A fake private core idea."),
    );
    const denied = await handler(
      incoming("/api/portal", {
        method: "POST",
        headers: { origin: app, "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-workspace-team",
          data: { name: "Forbidden synthetic viewer team" },
        }),
      }),
    );
    assert.equal(denied.status, 403);
    assert.equal(
      ((await denied.json()) as { code: string }).code,
      "VIEWER_READ_ONLY",
    );
  } finally {
    db.close();
  }
});

test("auth routes preserve independent cookie headers and avoid the private runtime resolver", async () => {
  let runtimeCalled = false;
  const handler = createPortalBackend(env, {
    runtime: async () => {
      runtimeCalled = true;
      throw new Error("must not run");
    },
    auth: async (request) => {
      assert.equal(request.url, app + "/api/auth/session");
      const headers = new Headers();
      headers.append(
        "Set-Cookie",
        "synthetic_session=one; Path=/; HttpOnly; Secure; SameSite=Lax",
      );
      headers.append(
        "Set-Cookie",
        "synthetic_csrf=two; Path=/; HttpOnly; Secure; SameSite=Lax",
      );
      return Response.json({ user: null }, { headers });
    },
  });
  const response = await handler(incoming("/api/auth/session"));
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(runtimeCalled, false);
});

test("backend errors return stable codes without exception text, stack or credentials", async () => {
  const marker = "synthetic-private-credential-marker";
  for (const error of [
    new Error(marker),
    new PortalError(403, "FORBIDDEN", marker),
  ]) {
    const response = backendError(error);
    assert.match(
      response.headers.get("cache-control") || "",
      /private, no-store/,
    );
    const text = await response.text();
    assert.ok(!text.includes(marker));
    assert.ok(!text.includes("stack"));
  }
});
