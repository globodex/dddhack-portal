import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { readSitesView } from "../lib/sites-view";
import { runWithSitesRequest } from "../lib/sites-runtime";
import { readPortalView } from "../lib/portal-read";
const scope = (db: any, user: string, run: () => Promise<unknown>) =>
  runWithSitesRequest(
    new Request("https://portal.test/dashboard", {
      headers: {
        "oai-authenticated-user-id": "fake_" + user,
        "oai-authenticated-user-email": user + "@portal.test",
      },
    }),
    { DB: db, PORTAL_RUNTIME: "sites", PORTAL_TRUST_SITES_DISPATCH: "true" },
    run,
  );
test("Worker guard and SSR share exactly one authorized request-local projection with no identity reuse", async () => {
  const { db } = await setup();
  try {
    await scope(db, "alice", async () => {
      const guard = readSitesView("/dashboard");
      const page = readSitesView("/dashboard/");
      assert.equal(guard, page);
      const [a, b] = await Promise.all([guard, page]);
      assert.equal(a, b);
      assert.equal((a.me as any).id, "fake_alice");
    });
    await scope(db, "bob", async () => {
      assert.equal(
        ((await readSitesView("/dashboard")).me as any).id,
        "fake_bob",
      );
    });
    await scope(db, "alice", async () => {
      await assert.rejects(readSitesView("/admin/permissions"), {
        code: "OWNER_REQUIRED",
      });
    });
    assert.throws(() => readSitesView("/dashboard"), {
      code: "SITES_DISPATCH_NOT_CONFIGURED",
    });
  } finally {
    db.close();
  }
});
test("private browser reads preserve no-store and credentials, abort stale reads and bound stalled reads", async () => {
  const original = globalThis.fetch;
  try {
    let request: RequestInit | undefined;
    globalThis.fetch = async (_url, init) => {
      request = init;
      return Response.json({ items: [] });
    };
    await readPortalView(
      "/api/portal?view=/dashboard",
      new AbortController().signal,
    );
    assert.equal(request?.cache, "no-store");
    assert.equal(request?.credentials, "same-origin");
    globalThis.fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        const s = init!.signal!;
        const fail = () => reject(new DOMException("Aborted", "AbortError"));
        s.addEventListener("abort", fail, { once: true });
        if (s.aborted) fail();
      });
    await assert.rejects(
      readPortalView("/api/portal", new AbortController().signal, 10),
      /Loading timed out/,
    );
    const stale = new AbortController();
    const pending = readPortalView("/api/portal", stale.signal);
    stale.abort();
    await assert.rejects(pending, { name: "AbortError" });
  } finally {
    globalThis.fetch = original;
  }
});
