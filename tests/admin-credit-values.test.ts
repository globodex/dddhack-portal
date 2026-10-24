import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { PortalService } from "../lib/service";
import { handlePortal } from "../lib/http";
import { fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { batch, rows, type Database } from "../lib/db";
import { sha256 } from "../lib/security";

const sentinel = "SYNTHETIC_PROVIDER_ENV_NOT_A_VOUCHER";
async function fixture() {
  const f = await setup();
  await batch(f.db, [
    [
      "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at) VALUES('fake_bad_legacy','fake_credit','INVALID-SYNTHETIC-CIPHERTEXT',?,'2026-10-22T08:00:00Z')",
      await sha256("FAKE-BAD-LEGACY"),
    ],
  ]);
  for (let n = 0; n < 15; n++) {
    const value = `FAKE-DIRECT-ADMIN-${String(n).padStart(3, "0")}`;
    await batch(f.db, [
      [
        "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) VALUES(?,'fake_credit','',?,'2026-10-22T08:00:00Z',?)",
        `fake_plain_${n}`,
        await sha256(value),
        value,
      ],
    ]);
  }
  for (const email of ["alice@portal.test", "bob@portal.test"])
    await f.service("admin").command("quick-check-in", { emails: [email] });
  return f;
}
async function state(db: Database) {
  return Promise.all(
    [
      "credit_inventory",
      "credit_allocations",
      "credit_code_history",
      "audit_logs",
    ].map((table) => rows(db, `SELECT * FROM ${table}`)),
  );
}

test("admin current-page values are bounded, decode legacy stock, and preserve allocations/exposure/audit", async () => {
  const f = await fixture();
  try {
    const selections: { sql: string; paging: unknown[] }[] = [];
    const db: Database = {
      batch: (statements) => f.db.batch(statements),
      prepare(sql) {
        const statement = f.db.prepare(sql);
        if (!sql.includes("i.voucher_value,i.ciphertext")) return statement;
        return {
          bind(...args) {
            selections.push({ sql, paging: args.slice(-2) });
            statement.bind(...args);
            return this;
          },
          all: () => statement.all(),
        };
      },
    };
    const before = await state(f.db);
    const admin = new PortalService(
      db,
      fixtures.admin,
      LOCAL_CREDIT_KEY,
      () => "2026-10-22T08:00:00Z",
    );
    const view = await admin.view("/admin/credit-stock/fake_credit");
    const items = view.items as any[];
    assert.equal(items.length, 25);
    assert.equal(view.hasMore, true);
    assert.equal(view.totalRows, 36);
    assert.deepEqual(
      selections.map((query) => query.paging),
      [[25, 0]],
    );
    assert.match(selections[0].sql, /LIMIT \? OFFSET \?/);
    assert.equal(items[0].value, "FAKE-NOT-REDEEMABLE-000");
    assert.equal(items[21].value, "FAKE-DIRECT-ADMIN-000");
    assert.equal(items[20].value, null);
    assert.equal(items[20].codeAvailability, "unavailable");
    assert.match(items[20].codeError, /Ask an owner/);
    const encoded = JSON.stringify(view);
    for (const hidden of [
      "ciphertext",
      "voucher_value",
      "maskedCode",
      "INVALID-SYNTHETIC-CIPHERTEXT",
      LOCAL_CREDIT_KEY,
      sentinel,
      "FAKE-DIRECT-ADMIN-014",
    ])
      assert.ok(!encoded.includes(hidden));
    const next = await admin.view("/admin/credit-stock/fake_credit", {
      page: 1,
    });
    assert.equal((next.items as any[]).length, 11);
    assert.deepEqual(
      selections.map((query) => query.paging),
      [
        [25, 0],
        [25, 25],
      ],
    );
    const assigned = await admin.view(
      "/admin/credit-stock/fake_credit/assigned",
      { search: "alice@portal.test" },
    );
    assert.equal((assigned.items as any[]).length, 1);
    assert.equal((assigned.items as any[])[0].email, "alice@portal.test");
    assert.equal((assigned.items as any[])[0].value, "FAKE-NOT-REDEEMABLE-000");
    assert.deepEqual(
      await state(f.db),
      before,
      "GET must not allocate, expose, alter inventory, or audit code visibility",
    );
    const noKey = await new PortalService(
      f.db,
      fixtures.admin,
      undefined,
      () => "2026-10-22T08:00:00Z",
    ).view("/admin/credit-stock/fake_credit");
    assert.equal((noKey.items as any[])[0].value, null);
    assert.equal((noKey.items as any[])[21].value, "FAKE-DIRECT-ADMIN-000");
    assert.ok(!JSON.stringify(noKey).includes(sentinel));
    assert.deepEqual(await state(f.db), before);
  } finally {
    f.db.close();
  }
});

test("directly viewed but never-exposed available stock remains permanently retired after deletion", async () => {
  const f = await fixture();
  try {
    const admin = f.service("admin"),
      values = [1, 2, 3].map((n) => `FAKE-UNEXPOSED-RETIRE-${n}`);
    const csv = ["Unexposed retirement", ...values].join("\n");
    const preview = await admin.command("preview-credit-batch", { csv });
    const imported = await admin.command("publish-credit-batch", {
      csv,
      digest: preview.digest,
      confirmation: "PUBLISH_CREDIT_BATCH",
    });
    const typeId = (imported.typeIds as string[])[0];
    const available = await admin.view(
      `/admin/credit-stock/${typeId}/available`,
    );
    assert.equal((available.items as any[])[0].value, values[2]);
    const historyBefore = (
      await rows<any>(
        f.db,
        "SELECT exposed FROM credit_code_history WHERE fingerprint=?",
        await sha256(values[2]),
      )
    )[0];
    assert.equal(historyBefore.exposed, 0, "Direct GET must not mark exposed");
    await admin.command("delete-credit-column", {
      batchId: imported.batchId,
      columnId: typeId,
      confirmation: "DELETE_CREDIT_COLUMN",
    });
    const retryCSV = "Unexposed retirement\n" + values[2];
    const retry = await admin.command("preview-credit-batch", {
      csv: retryCSV,
    });
    assert.deepEqual(retry.totals, { added: 0, duplicates: 0, retired: 1 });
    const result = await admin.command("publish-credit-batch", {
      csv: retryCSV,
      digest: retry.digest,
      confirmation: "PUBLISH_CREDIT_BATCH",
    });
    assert.equal(result.added, 0);
    const historyAfter = (
      await rows<any>(
        f.db,
        "SELECT exposed FROM credit_code_history WHERE fingerprint=?",
        await sha256(values[2]),
      )
    )[0];
    assert.equal(historyAfter.exposed, 0);
    const audit = JSON.stringify(
      await rows(f.db, "SELECT detail FROM audit_logs"),
    );
    for (const value of values) assert.ok(!audit.includes(value));
  } finally {
    f.db.close();
  }
});

test("stock HTTP authorizes each user freshly, stays private/no-store, and never expands personal summaries", async () => {
  const f = await fixture();
  const read = (
    identity: typeof fixtures.admin | null,
    key: string | undefined = LOCAL_CREDIT_KEY,
  ) =>
    handlePortal(
      new Request(
        "http://localhost/api/portal?view=%2Fadmin%2Fcredit-stock%2Ffake_credit",
      ),
      { db: f.db, identity, key, localTest: true },
    );
  try {
    const response = await read(fixtures.admin);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("cache-control") || "",
      /private, no-store/,
    );
    assert.match(response.headers.get("vary") || "", /Cookie/);
    assert.equal(
      ((await response.json()) as any).items[0].value,
      "FAKE-NOT-REDEEMABLE-000",
    );
    assert.equal((await read(fixtures.owner)).status, 200);
    await batch(f.db, [
      [
        "INSERT INTO portal_roles VALUES('fake_carol','volunteer','fake_owner','2026-10-22T08:00:00Z')",
      ],
    ]);
    for (const actor of [
      null,
      fixtures.alice,
      fixtures.bob,
      fixtures.carol,
      fixtures.judge,
      fixtures.stranger,
    ]) {
      const denied = await read(actor);
      assert.ok([401, 403].includes(denied.status));
      const body = JSON.stringify(await denied.json());
      assert.doesNotMatch(
        body,
        /FAKE-NOT-REDEEMABLE|FAKE-DIRECT-ADMIN|INVALID-SYNTHETIC|alice@portal.test|bob@portal.test/,
      );
    }
    const cachedIdentityService = f.service("admin");
    await cachedIdentityService.view("/admin/credit-stock/fake_credit");
    await batch(f.db, [
      ["UPDATE users SET role='participant' WHERE id='fake_admin'"],
    ]);
    await assert.rejects(
      cachedIdentityService.view("/admin/credit-stock/fake_credit"),
      { code: "ADMIN_REQUIRED" },
    );
    const personal = await f.service("alice").view("/personal/credits");
    assert.equal(personal.checkedIn, true);
    assert.doesNotMatch(
      JSON.stringify(personal),
      /FAKE-NOT-REDEEMABLE|FAKE-DIRECT-ADMIN|bob@portal.test|voucher_value|ciphertext|codeAvailability|codeError/,
    );
    const own = await f
      .service("alice")
      .command("reveal-credit", { typeId: "fake_credit" });
    assert.equal(own.value, "FAKE-NOT-REDEEMABLE-000");
    await assert.rejects(
      f.service("alice").command("reveal-credit", {
        typeId: "fake_credit",
        userId: "fake_bob",
      }),
    );
  } finally {
    f.db.close();
  }
});
