import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { setup, activate, attend } from "./helpers";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { one, rows } from "../lib/db";
import { handlePortal, handleExport } from "../lib/http";
import { csvCell } from "../lib/security";

type Fixture = Awaited<ReturnType<typeof setup>>;
function withoutKey(f: Fixture, who = "admin") {
  return new PortalService(f.db, fixtures[who], undefined, () =>
    f.service().now(),
  );
}
async function importVouchers(f: Fixture, values: string[]) {
  const admin = withoutKey(f);
  const type = await admin.command("credit-type", {
    name: "Synthetic voucher pool",
    instructions: "Redeem your own synthetic voucher.",
  });
  const typeId = String(type.id),
    csv = ["value", ...values.map(csvCell)].join("\n"),
    data = { kind: "credits", typeId, csv };
  const preview = await admin.command("preview-import", data);
  await admin.command("commit-import", { ...data, digest: preview.digest });
  return { typeId, preview, data };
}
function post(f: Fixture, who: string | null, action: string, data: unknown) {
  return handlePortal(
    new Request("https://portal.test/api/portal", {
      method: "POST",
      headers: {
        origin: "https://portal.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, data }),
    }),
    { db: f.db, identity: who ? fixtures[who] : null, key: undefined },
  );
}

test("voucher-only import, real check-in allocation and authorized reveal work keylessly with idempotent allocation", async () => {
  const f = await setup();
  try {
    await activate(f.db);
    f.clock("2026-11-01T04:00:00.000Z");
    const vouchers = [
      "SYNTHETIC-VOUCHER-ALPHA",
      "https://voucher.invalid/redeem?code=SYNTHETIC-BETA",
    ];
    const { typeId, preview, data } = await importVouchers(f, vouchers);
    for (const value of vouchers)
      assert.equal(JSON.stringify(preview).includes(value), false);
    const inventory = await rows<{ ciphertext: string; voucher_value: string }>(
      f.db,
      "SELECT ciphertext,voucher_value FROM credit_inventory WHERE type_id=?",
      typeId,
    );
    assert.equal(inventory.length, 2);
    assert.ok(
      inventory.every(
        (row) => row.ciphertext === "" && vouchers.includes(row.voucher_value),
      ),
    );
    await assert.rejects(
      withoutKey(f).command("commit-import", {
        ...data,
        digest: preview.digest,
      }),
      { code: "PREVIEW_REQUIRED" },
    );
    const checkin = await post(f, "admin", "check-in", {
      userId: "fake_alice",
    });
    assert.equal(checkin.status, 200);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        withoutKey(f).command("allocate", { userId: "fake_alice" }),
      ),
    );
    const allocated = await rows(
      f.db,
      "SELECT * FROM credit_allocations WHERE user_id='fake_alice' AND type_id=?",
      typeId,
    );
    assert.equal(allocated.length, 1);
    assert.equal(
      (
        await rows(
          f.db,
          "SELECT * FROM credit_allocations WHERE type_id='fake_credit'",
        )
      ).length,
      0,
    );
    const reveal = await post(f, "alice", "reveal-credit", { typeId });
    assert.equal(reveal.status, 200);
    assert.match(reveal.headers.get("cache-control") || "", /no-store/);
    const revealed = (await reveal.json()) as { value: string };
    assert.deepEqual(Object.keys(revealed), ["value"]);
    assert.ok(vouchers.includes(revealed.value));
    const duplicate = await withoutKey(f).command("preview-import", data);
    await assert.rejects(
      withoutKey(f).command("commit-import", {
        ...data,
        digest: duplicate.digest,
      }),
      /UNIQUE/,
    );
    assert.equal(
      (
        await rows(
          f.db,
          "SELECT * FROM credit_inventory WHERE type_id=?",
          typeId,
        )
      ).length,
      2,
    );
  } finally {
    f.db.close();
  }
});

test("keyless vouchers retain admin import RBAC, individual attendance, recipient identity and cross-team denial", async () => {
  const f = await setup();
  try {
    const { typeId, data } = await importVouchers(f, [
      "SYNTHETIC-RECIPIENT-ONLY",
    ]);
    for (const who of ["alice", "stranger", "judge"])
      await assert.rejects(withoutKey(f, who).command("preview-import", data));
    await assert.rejects(
      withoutKey(f).command("allocate", { userId: "fake_alice" }),
      { code: "CHECKIN_REQUIRED" },
    );
    await attend(f.db, "fake_alice", "fake_bob", "fake_judge");
    await withoutKey(f).command("allocate", { userId: "fake_alice" });
    assert.equal(
      (await post(f, null, "reveal-credit", { typeId })).status,
      401,
    );
    await assert.rejects(
      withoutKey(f, "stranger").command("reveal-credit", { typeId }),
      { code: "VIEWER_READ_ONLY" },
    );
    await assert.rejects(
      withoutKey(f, "carol").command("reveal-credit", { typeId }),
      { code: "CHECKIN_REQUIRED" },
    );
    await assert.rejects(
      withoutKey(f, "judge").command("reveal-credit", { typeId }),
      { code: "JUDGES_CANNOT_ACCESS_CREDITS" },
    );
    await assert.rejects(
      withoutKey(f, "bob").command("reveal-credit", { typeId }),
      { code: "ALLOCATION_PENDING" },
    );
    await assert.rejects(
      withoutKey(f, "bob").command("reveal-credit", {
        typeId,
        userId: "fake_alice",
      }),
    );
    await withoutKey(f).command("participant-bulk", {
      emails: ["alice@portal.test"],
      status: "pending",
    });
    await assert.rejects(
      withoutKey(f, "alice").command("reveal-credit", { typeId }),
      { code: "APPROVAL_REQUIRED" },
    );
  } finally {
    f.db.close();
  }
});

test("voucher allocation email remains bound to current verified email and removal revokes an existing recipient", async () => {
  const f = await setup();
  try {
    const { typeId } = await importVouchers(f, [
      "SYNTHETIC-EMAIL-BOUND",
      "SYNTHETIC-REMOVED-RECIPIENT",
    ]);
    await activate(f.db);
    f.clock("2026-11-01T04:00:00.000Z");
    for (const userId of ["fake_alice", "fake_carol"])
      await withoutKey(f).command("check-in", { userId });
    await withoutKey(f).command("participant-deactivate", {
      userId: "fake_carol",
      confirmation: "REMOVE_PARTICIPANT",
    });
    await assert.rejects(
      withoutKey(f, "carol").command("reveal-credit", { typeId }),
      { code: "VIEWER_READ_ONLY" },
    );
    const csv = "email\nchanged@portal.test",
      admin = withoutKey(f);
    const preview = await admin.command("preview-import", {
      kind: "roster",
      csv,
    });
    await admin.command("commit-import", {
      kind: "roster",
      csv,
      digest: preview.digest,
    });
    await admin.command("registration", {
      email: "changed@portal.test",
      status: "approved",
    });
    const changed = new PortalService(
      f.db,
      { ...fixtures.alice, email: "changed@portal.test" },
      undefined,
      () => f.service().now(),
    );
    await assert.rejects(changed.command("reveal-credit", { typeId }), {
      code: "ALLOCATION_PENDING",
    });
    assert.equal(
      (
        await one<{ recipient_email: string }>(
          f.db,
          "SELECT recipient_email FROM credit_allocations WHERE user_id='fake_alice' AND type_id=?",
          typeId,
        )
      )?.recipient_email,
      "alice@portal.test",
    );
  } finally {
    f.db.close();
  }
});

test("voucher bytes stay out of metadata, public views, ordinary exports, audit records and errors", async () => {
  const f = await setup();
  try {
    const markers = [
      '=HYPERLINK("https://voucher.invalid","SYNTHETIC-FORMULA")',
      "<script>SYNTHETIC-MARKUP</script>",
    ];
    const { typeId, preview } = await importVouchers(f, markers);
    await attend(f.db, "fake_alice");
    await withoutKey(f).command("allocate", { userId: "fake_alice" });
    const metadata: unknown[] = [
      preview,
      await withoutKey(f, "alice").view("/dashboard"),
      await withoutKey(f).view("/admin/credits"),
      await withoutKey(f).view("/admin/participants"),
    ];
    for (const path of [
      "/",
      "/projects",
      "/leaderboard",
      "/discover/teams",
      "/discover/participants",
    ])
      metadata.push(await withoutKey(f, "stranger").view(path));
    for (const list of [
      "credits",
      "participants",
      "teams",
      "submissions",
      "settings",
      "logs",
    ]) {
      const exported = await handleExport(
        new Request("https://portal.test/api/export?list=" + list),
        { db: f.db, identity: fixtures.owner, key: undefined },
      );
      assert.equal(exported.status, 200);
      metadata.push(await exported.text());
    }
    const error = await post(f, "bob", "reveal-credit", { typeId });
    assert.equal(error.status, 403);
    metadata.push(await error.text());
    metadata.push(await rows(f.db, "SELECT * FROM audit_logs"));
    const projected = JSON.stringify(metadata);
    for (const marker of markers)
      assert.equal(projected.includes(marker), false);
    assert.equal(projected.includes("voucher_value"), false);
    assert.equal(projected.includes("ciphertext"), false);
    assert.equal(
      (await post(f, "alice", "reveal-credit", { typeId })).status,
      200,
    );
    const logs = JSON.stringify(await rows(f.db, "SELECT * FROM audit_logs"));
    for (const marker of markers) assert.equal(logs.includes(marker), false);
  } finally {
    f.db.close();
  }
});

test("recipient revocation during reveal rolls back the success audit and returns no voucher", async () => {
  const f = await setup();
  try {
    const { typeId } = await importVouchers(f, ["SYNTHETIC-REVOKED-IN-FLIGHT"]);
    await attend(f.db, "fake_alice");
    await withoutKey(f).command("allocate", { userId: "fake_alice" });
    const alice = withoutKey(f, "alice"),
      original = alice.mutate.bind(alice);
    alice.mutate = async (...args) => {
      if (args[1] === "reveal-credit")
        await withoutKey(f).command("admin-status", {
          kind: "person",
          targetId: "fake_alice",
          status: "Going",
          confirmation: "CHANGE_STATUS",
        });
      return original(...args);
    };
    await assert.rejects(alice.command("reveal-credit", { typeId }), /CHECK/);
    assert.equal(
      (
        await rows(
          f.db,
          "SELECT * FROM audit_logs WHERE action='reveal-credit'",
        )
      ).length,
      0,
    );
    assert.equal((await rows(f.db, "SELECT * FROM write_guards")).length, 0);
  } finally {
    f.db.close();
  }
});

test("legacy ciphertext and allocations remain untouched; legacy reveal alone needs its existing valid key", async () => {
  const f = await setup();
  try {
    await attend(f.db, "fake_alice");
    await f.service("admin").command("allocate", { userId: "fake_alice" });
    const before = await rows(
      f.db,
      "SELECT * FROM credit_inventory WHERE type_id='fake_credit'",
    );
    const allocations = await rows(f.db, "SELECT * FROM credit_allocations");
    await assert.rejects(
      withoutKey(f, "alice").command("reveal-credit", {
        typeId: "fake_credit",
      }),
      { code: "CREDIT_KEY_UNAVAILABLE" },
    );
    const invalid = new PortalService(f.db, fixtures.alice, "bad", () =>
      f.service().now(),
    );
    await assert.rejects(
      invalid.command("reveal-credit", { typeId: "fake_credit" }),
      { code: "CREDIT_KEY_UNAVAILABLE" },
    );
    const value = await f
      .service()
      .command("reveal-credit", { typeId: "fake_credit" });
    assert.match(String(value.value), /^FAKE-NOT-REDEEMABLE-/);
    await importVouchers(f, ["SYNTHETIC-NEW-ALONGSIDE-LEGACY"]);
    assert.deepEqual(
      await rows(
        f.db,
        "SELECT * FROM credit_inventory WHERE type_id='fake_credit'",
      ),
      before,
    );
    assert.deepEqual(
      await rows(f.db, "SELECT * FROM credit_allocations"),
      allocations,
    );
  } finally {
    f.db.close();
  }
});

test("voucher migration is additive and repeat-safe for preexisting ciphertext and allocations", async () => {
  const db = new LocalDatabase(":memory:");
  try {
    const directory = new URL("../db/migrations/", import.meta.url);
    const prior = readdirSync(directory)
      .filter((name) => name.endsWith(".sql") && name < "0020_")
      .sort();
    db.raw.exec("CREATE TABLE local_schema_migrations(name TEXT PRIMARY KEY)");
    for (const name of prior) {
      db.raw.exec(readFileSync(new URL(name, directory), "utf8"));
      db.raw.prepare("INSERT INTO local_schema_migrations VALUES(?)").run(name);
    }
    await seedLocal(db);
    await attend(db, "fake_alice");
    const admin = new PortalService(
      db,
      fixtures.admin,
      LOCAL_CREDIT_KEY,
      () => "2026-11-01T04:00:00.000Z",
    );
    // The old five-column schema has no voucher-aware allocation query yet.
    await db
      .prepare(
        "INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email) VALUES('fake_item_0','fake_credit','fake_alice','2026-11-01T04:00:00.000Z','alice@portal.test')",
      )
      .all();
    const old = await rows(
      db,
      "SELECT id,type_id,ciphertext,fingerprint,created_at FROM credit_inventory",
    );
    const oldAllocations = await rows(db, "SELECT * FROM credit_allocations");
    db.migrate();
    db.migrate();
    assert.deepEqual(
      await rows(
        db,
        "SELECT id,type_id,ciphertext,fingerprint,created_at FROM credit_inventory",
      ),
      old,
    );
    assert.deepEqual(
      await rows(db, "SELECT * FROM credit_allocations"),
      oldAllocations,
    );
    assert.ok(
      (
        await rows<{ voucher_value: null }>(
          db,
          "SELECT voucher_value FROM credit_inventory",
        )
      ).every((row) => row.voucher_value === null),
    );
    await assert.rejects(
      db
        .prepare(
          "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) VALUES('bad','fake_credit','not-empty','new','2026-11-01','SYNTHETIC')",
        )
        .all(),
      /INVALID_VOUCHER_STORAGE/,
    );
    assert.equal((await admin.adminList("credits")).length, 1);
  } finally {
    db.close();
  }
});
