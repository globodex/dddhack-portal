import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { batch, rows, type Database, type SQL } from "../lib/db";
import { handlePortal } from "../lib/http";
import { PortalService } from "../lib/service";
import { seal, sha256 } from "../lib/security";

// Disposable synthetic data only. PGlite exercises the production PostgreSQL
// adapter/SQL, not native multi-connection concurrency or a hosted database.
const now = "2026-10-22T08:00:00.000Z";
async function fixture(engine: "sqlite" | "postgres") {
  const pg = engine === "postgres" ? await createPGliteFixture() : null;
  const local = pg ? null : await setup();
  const db = pg?.db || local!.db;
  if (pg) await seedLocal(db);
  return {
    db,
    service: (who = "admin", key: string | undefined = LOCAL_CREDIT_KEY) =>
      new PortalService(db, fixtures[who], key, () => now),
    close: async () => {
      if (pg) await pg.pool.end();
      else local!.db.close();
    },
  };
}
async function publish(
  service: PortalService,
  header: string,
  values: string[],
) {
  const csv = [header, ...values].join("\n");
  const preview = await service.command("preview-credit-batch", { csv });
  const result = await service.command("publish-credit-batch", {
    csv,
    digest: preview.digest,
    confirmation: "PUBLISH_CREDIT_BATCH",
  });
  return result.typeIds as string[];
}
function tracked(db: Database) {
  const queries: string[] = [];
  const proxy: Database = {
    prepare(sql) {
      queries.push(sql);
      return db.prepare(sql);
    },
    batch: (statements) => db.batch(statements),
  };
  return { db: proxy, queries };
}
async function get(
  db: Database,
  who: string | null,
  route: string,
  options: Record<string, string> = {},
  key: string | undefined = LOCAL_CREDIT_KEY,
) {
  const params = new URLSearchParams({ view: route, ...options });
  const response = await handlePortal(
    new Request("http://localhost/api/portal?" + params),
    { db, identity: who ? fixtures[who] : null, key, localTest: true },
  );
  assert.equal(
    response.headers.get("Cache-Control"),
    "private, no-store, max-age=0",
  );
  assert.equal(
    response.headers.get("Vary"),
    "Cookie, oai-authenticated-user-id",
  );
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  return { response, body: (await response.json()) as any };
}
async function command(
  db: Database,
  who: string,
  action: string,
  data: unknown,
) {
  const response = await handlePortal(
    new Request("http://localhost/api/portal", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, data }),
    }),
    { db, identity: fixtures[who], key: LOCAL_CREDIT_KEY, localTest: true },
  );
  return { response, body: (await response.json()) as any };
}
async function creditState(db: Database) {
  const result: Record<string, unknown[]> = {};
  for (const [table, order] of [
    ["credit_types", "id"],
    ["credit_inventory", "id"],
    ["credit_allocations", "inventory_id"],
    ["credit_code_history", "fingerprint"],
    ["credit_category_keys", "source_key"],
    ["credit_stock_imports", "digest"],
    ["credit_batches", "id"],
    ["credit_batch_columns", "batch_id,column_key"],
    ["audit_logs", "id"],
  ])
    result[table] = await rows(db, `SELECT * FROM ${table} ORDER BY ${order}`);
  return JSON.parse(JSON.stringify(result));
}
function noCodes(body: unknown, values: string[]) {
  const text = JSON.stringify(body);
  for (const value of values.filter(Boolean))
    assert.ok(!text.includes(value), "unexpected synthetic code in response");
  for (const field of [
    "ciphertext",
    "voucher_value",
    "fingerprint",
    "creditKey",
  ])
    assert.ok(
      !text.includes('"' + field + '"'),
      "storage field exposed: " + field,
    );
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: direct admin values stay private, paged and read-only with assigned/search filters`, async () => {
    const f = await fixture(engine);
    try {
      const codes = Array.from(
        { length: 60 },
        (_, i) => "FAKE-INDEPENDENT-DIRECT-" + String(i).padStart(3, "0"),
      );
      await attend(f.db, "fake_alice", "fake_bob", "fake_admin");
      const [typeId] = await publish(
        f.service(),
        "Independent direct values",
        codes,
      );
      const [retiredType] = await publish(
        f.service(),
        "Independent retired values",
        ["FAKE-INDEPENDENT-RETIRED"],
      );
      const columns = await rows<{ batch_id: string }>(
        f.db,
        "SELECT batch_id FROM credit_batch_columns WHERE type_id=?",
        retiredType,
      );
      await f.service().command("delete-credit-column", {
        batchId: columns[0].batch_id,
        columnId: retiredType,
        confirmation: "DELETE_CREDIT_COLUMN",
      });
      const before = await creditState(f.db);
      const root = `/admin/credit-stock/${typeId}`;
      const all: any[] = [];
      for (const [page, length] of [
        [0, 25],
        [1, 25],
        [2, 10],
      ]) {
        const { response, body } = await get(
          f.db,
          page === 1 ? "owner" : "admin",
          root,
          { page: String(page), presentation: "apv1.untrusted" },
        );
        assert.equal(response.status, 200);
        assert.equal(body.items.length, length);
        assert.equal(body.pageSize, 25);
        assert.equal(body.totalRows, 60);
        assert.equal(body.hasMore, page < 2);
        assert.equal(body.adminPresentation, undefined);
        assert.deepEqual(
          [body.summary.total, body.summary.assigned, body.summary.available],
          [60, 3, 57],
        );
        for (const item of body.items) {
          assert.deepEqual(Object.keys(item).sort(), [
            "assignedAt",
            "codeAvailability",
            "codeError",
            "email",
            "id",
            "person",
            "status",
            "value",
          ]);
          assert.equal(item.codeAvailability, "ready");
          assert.equal(item.codeError, null);
          assert.ok(codes.includes(item.value));
        }
        all.push(...body.items);
      }
      assert.equal(new Set(all.map((row) => row.id)).size, 60);
      assert.deepEqual(all.map((row) => row.value).sort(), [...codes].sort());
      const assigned = (await get(f.db, "admin", root + "/assigned")).body;
      const available = (await get(f.db, "admin", root + "/available")).body;
      assert.equal(assigned.totalRows, 3);
      assert.equal(available.totalRows, 57);
      assert.deepEqual(assigned.items.map((row: any) => row.email).sort(), [
        "admin@portal.test",
        "alice@portal.test",
        "bob@portal.test",
      ]);
      assert.ok(
        assigned.items.every(
          (row: any) => row.status === "Assigned" && row.assignedAt,
        ),
      );
      assert.ok(
        available.items.every(
          (row: any) =>
            row.status === "Available" &&
            row.email === null &&
            row.assignedAt === null,
        ),
      );
      const search = (await get(f.db, "owner", root, { q: "BOB@portal.test" }))
        .body;
      assert.equal(search.items.length, 1);
      assert.equal(search.items[0].email, "bob@portal.test");
      assert.equal(
        (await get(f.db, "admin", root, { q: "' OR 1=1 --" })).body.totalRows,
        0,
      );
      const absent = (await get(f.db, "admin", root, { page: "1000" })).body;
      assert.deepEqual(absent.items, []);
      assert.equal(absent.hasMore, false);
      assert.deepEqual(
        await creditState(f.db),
        before,
        "GET must preserve codes, assignments, retired tombstones and audit history",
      );
      const tombstones = await rows(
        f.db,
        "SELECT * FROM credit_code_history WHERE type_id=?",
        retiredType,
      );
      assert.equal(tombstones.length, 1);
    } finally {
      await f.close();
    }
  });

  test(`${engine}: fresh role checks precede secret reads and personal/public projections stay separate`, async () => {
    const f = await fixture(engine);
    try {
      await attend(f.db, "fake_alice", "fake_bob");
      const codes = [
        "FAKE-INDEPENDENT-ALLOCATION-A",
        "FAKE-INDEPENDENT-ALLOCATION-B",
        "FAKE-INDEPENDENT-AVAILABLE",
      ];
      const [typeId] = await publish(
        f.service(),
        "Independent authorization values",
        codes,
      );
      await batch(f.db, [
        [
          "INSERT INTO portal_roles VALUES('fake_ivy','volunteer','fake_owner',?)",
          now,
        ],
      ]);
      const route = `/admin/credit-stock/${typeId}`;
      const ownerView = await get(f.db, "owner", route);
      const assigned = ownerView.body.items.filter(
        (row: any) => row.status === "Assigned",
      );
      assert.equal(ownerView.response.status, 200);
      assert.equal((await get(f.db, "admin", route)).response.status, 200);
      for (const who of [null, "stranger", "alice", "judge", "ivy"]) {
        const trace = tracked(f.db);
        const { response, body } = await get(trace.db, who, route, {
          presentation: "apv1.untrusted",
        });
        assert.equal(response.status, who ? 403 : 401);
        noCodes(body, codes);
        assert.ok(
          !trace.queries.some((sql) =>
            /\bcredit_(inventory|allocations|code_history)\b/i.test(sql),
          ),
          "unauthorized request touched secret stock tables",
        );
      }
      const adminIdentity = fixtures.admin;
      await f.service("owner").command("revoke-admin", {
        userId: adminIdentity.id,
        confirmation: "REVOKE_ADMIN",
      });
      const before = await creditState(f.db);
      const revokedTrace = tracked(f.db);
      const revoked = await get(revokedTrace.db, "admin", route);
      assert.equal(revoked.response.status, 403);
      assert.equal(revoked.body.code, "ADMIN_REQUIRED");
      assert.equal(
        fixtures.admin,
        adminIdentity,
        "the authenticated identity was not replaced",
      );
      assert.equal(
        (
          await rows<any>(f.db, "SELECT role FROM users WHERE id='fake_admin'")
        )[0].role,
        "admin",
        "explicit revocation must override the legacy role fallback",
      );
      assert.ok(
        !revokedTrace.queries.some((sql) =>
          /\bcredit_(inventory|allocations|code_history)\b/i.test(sql),
        ),
      );
      const personal = await get(f.db, "alice", "/personal/credits");
      assert.equal(personal.response.status, 200);
      noCodes(personal.body, codes);
      assert.ok(!("items" in personal.body));
      const notCheckedIn = await get(f.db, "admin", "/personal/credits");
      assert.equal(notCheckedIn.response.status, 403);
      assert.equal(notCheckedIn.body.code, "CHECKIN_REQUIRED");
      for (const publicRoute of [
        "/",
        "/projects",
        "/leaderboard",
        "/discover/participants",
      ]) {
        const { body } = await get(f.db, "stranger", publicRoute);
        noCodes(body, codes);
      }
      assert.deepEqual(await creditState(f.db), before);
      const own = await command(f.db, "alice", "reveal-credit", { typeId });
      assert.equal(own.response.status, 200);
      assert.equal(
        own.body.value,
        assigned.find((row: any) => row.email === "alice@portal.test").value,
      );
      assert.notEqual(
        own.body.value,
        assigned.find((row: any) => row.email === "bob@portal.test").value,
      );
      const crossUser = await command(f.db, "alice", "reveal-credit", {
        typeId,
        userId: "fake_bob",
      });
      assert.equal(crossUser.response.status, 422);
      noCodes(crossUser.body, codes);
      const noCheckinReveal = await command(f.db, "admin", "reveal-credit", {
        typeId,
      });
      assert.equal(noCheckinReveal.response.status, 403);
      noCodes(noCheckinReveal.body, codes);
    } finally {
      await f.close();
    }
  });

  test(`${engine}: only the selected legacy page decodes, with safe per-row failures and keyless plaintext`, async () => {
    const f = await fixture(engine);
    try {
      const typeId = "independent_legacy_direct";
      const statements: SQL[] = [
        [
          "INSERT INTO credit_types VALUES(?,?,?,1)",
          typeId,
          "Independent legacy direct",
          "Synthetic only",
        ],
      ];
      const ciphertexts: string[] = [];
      const codes = Array.from(
        { length: 27 },
        (_, i) => "FAKE-INDEPENDENT-LEGACY-" + String(i).padStart(2, "0"),
      );
      const legacyRows = [
        ...(await Promise.all(
          codes.map(async (value, i) => ({
            id: "legacy_valid_" + i,
            ciphertext: await seal(value, LOCAL_CREDIT_KEY),
            value: null as string | null,
            fingerprint: await sha256(value),
          })),
        )),
        {
          id: "legacy_broken",
          ciphertext: "SYNTHETIC-BROKEN-CIPHERTEXT",
          value: null,
          fingerprint: await sha256("FAKE-INDEPENDENT-BROKEN"),
        },
        {
          id: "legacy_empty",
          ciphertext: await seal("", LOCAL_CREDIT_KEY),
          value: null,
          fingerprint: await sha256("FAKE-INDEPENDENT-EMPTY"),
        },
        {
          id: "legacy_plain",
          ciphertext: "",
          value: "FAKE-INDEPENDENT-PLAIN-PREFERRED",
          fingerprint: await sha256("FAKE-INDEPENDENT-PLAIN-PREFERRED"),
        },
      ];
      for (const row of legacyRows) {
        ciphertexts.push(row.ciphertext);
        statements.push([
          "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) VALUES(?,?,?,?,?,?)",
          row.id,
          typeId,
          row.ciphertext,
          row.fingerprint,
          now,
          row.value,
        ]);
      }
      await batch(f.db, statements);
      const before = await creditState(f.db);
      const service = f.service();
      let keyReads = 0;
      Object.defineProperty(service, "creditKey", {
        get() {
          keyReads++;
          return LOCAL_CREDIT_KEY;
        },
      });
      const route = `/admin/credit-stock/${typeId}`;
      const first = await service.view(route, { page: 0 });
      assert.equal((first.items as any[]).length, 25);
      assert.equal(
        keyReads,
        25,
        "must not decode records outside the selected page",
      );
      keyReads = 0;
      const last = await service.view(route, { page: 1 });
      assert.equal(
        keyReads,
        4,
        "only the four encrypted rows on this page need the key",
      );
      const items = last.items as any[];
      assert.deepEqual(
        items.filter((row) => row.value !== null).map((row) => row.value),
        [...codes.slice(25), "FAKE-INDEPENDENT-PLAIN-PREFERRED"],
      );
      const broken = items.find((row) => row.id === "legacy_broken");
      assert.equal(broken.value, null);
      assert.equal(broken.codeAvailability, "unavailable");
      assert.equal(
        broken.codeError,
        "Legacy code unavailable. Ask an owner to verify the stored code and credit encryption configuration.",
      );
      const empty = items.find((row) => row.id === "legacy_empty");
      assert.equal(empty.value, null);
      assert.equal(empty.codeAvailability, "unavailable");
      assert.equal(
        empty.codeError,
        "This stock entry has no code. Ask an owner to verify the imported value.",
      );
      // An invalid key and an actually absent key must both fail closed.
      const unavailable = await get(
        f.db,
        "admin",
        route,
        { page: "1" },
        "synthetic-invalid-key",
      );
      assert.equal(unavailable.response.status, 200);
      assert.ok(
        unavailable.body.items
          .filter((row: any) => row.id !== "legacy_plain")
          .every(
            (row: any) =>
              row.value === null && row.codeAvailability === "unavailable",
          ),
      );
      assert.equal(
        unavailable.body.items.find((row: any) => row.id === "legacy_plain")
          .value,
        "FAKE-INDEPENDENT-PLAIN-PREFERRED",
      );
      noCodes([first, last, unavailable.body], ciphertexts);
      assert.ok(
        !JSON.stringify(unavailable.body).includes("synthetic-invalid-key"),
      );
      const missingKeyResponse = await handlePortal(
        new Request(
          "http://localhost/api/portal?" +
            new URLSearchParams({ view: route, page: "1" }),
        ),
        { db: f.db, identity: fixtures.admin, key: undefined, localTest: true },
      );
      assert.equal(missingKeyResponse.status, 200);
      const missingKey = (await missingKeyResponse.json()) as any;
      assert.deepEqual(missingKey.items, unavailable.body.items);
      assert.deepEqual(await creditState(f.db), before);
    } finally {
      await f.close();
    }
  });
}
