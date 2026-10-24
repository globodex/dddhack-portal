import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { createPGliteFixture } from "./neon-db-fixture";
import {
  applyPortalMigrations,
  loadPortalMigrations,
} from "../neon/db/migrate";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, rows, one } from "../lib/db";

async function previous(engine: "sqlite" | "postgres") {
  if (engine === "sqlite") {
    const db = new LocalDatabase(":memory:"),
      directory = new URL("../db/migrations/", import.meta.url);
    for (const name of readdirSync(directory)
      .filter(
        (name) => name.endsWith(".sql") && name !== "0024_credit_stock.sql",
      )
      .sort())
      db.raw.exec(readFileSync(new URL(name, directory), "utf8"));
    await seedLocal(db);
    return {
      db,
      upgrade: async () => {
        db.raw.exec("BEGIN IMMEDIATE");
        try {
          db.raw.exec(
            readFileSync(new URL("0024_credit_stock.sql", directory), "utf8"),
          );
          db.raw.exec("COMMIT");
        } catch (error) {
          db.raw.exec("ROLLBACK");
          throw error;
        }
      },
    };
  }
  const context = await createPGliteFixture({
    excludeMigrations: ["0005_credit_stock.sql"],
  });
  await seedLocal(context.db);
  return {
    db: context.db,
    upgrade: async () =>
      applyPortalMigrations(
        context.pool,
        (await loadPortalMigrations()).filter(
          (migration) => migration.name === "0005_credit_stock.sql",
        ),
      ),
  };
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: stock upgrade preserves every existing code and mapping, backfills minimal non-personal tombstones`, async () => {
    const { db, upgrade } = await previous(engine);
    try {
      await batch(db, [
        [
          "INSERT INTO check_ins VALUES('fake_alice','fake_admin','2026-10-22T08:00:00.000Z')",
        ],
        [
          "INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email) VALUES('fake_item_0','fake_credit','fake_alice','2026-10-22T08:00:00.000Z','alice@portal.test')",
        ],
        [
          "INSERT INTO check_ins VALUES('fake_admin','fake_owner','2026-10-22T08:00:00.000Z')",
        ],
        [
          "INSERT INTO check_ins VALUES('fake_owner','fake_admin','2026-10-22T08:00:00.000Z')",
        ],
      ]);
      const stock = await rows(
          db,
          "SELECT * FROM credit_inventory ORDER BY id",
        ),
        allocations = await rows(
          db,
          "SELECT * FROM credit_allocations ORDER BY inventory_id",
        );
      await upgrade();
      assert.deepEqual(
        await rows(db, "SELECT * FROM credit_inventory ORDER BY id"),
        stock,
      );
      assert.deepEqual(
        await rows(
          db,
          "SELECT * FROM credit_allocations ORDER BY inventory_id",
        ),
        allocations,
      );
      const history = await rows<any>(
        db,
        "SELECT * FROM credit_code_history ORDER BY inventory_id",
      );
      assert.equal(history.length, 20);
      assert.equal(history.filter((row) => row.assigned === 1).length, 1);
      assert.ok(
        history.every(
          (row) =>
            !Object.keys(row).some((key) =>
              /user|email|name|assigned_at/.test(key),
            ),
        ),
      );
      assert.equal(
        (await rows(db, "SELECT * FROM credit_category_keys")).length,
        1,
      );
      await assert.rejects(
        batch(db, [
          [
            "UPDATE credit_allocations SET user_id='fake_bob' WHERE inventory_id='fake_item_0'",
          ],
        ]),
        /CREDIT_ASSIGNMENT_IMMUTABLE/,
      );
      await assert.rejects(
        batch(db, [
          [
            "UPDATE credit_code_history SET assigned=0 WHERE inventory_id='fake_item_0'",
          ],
        ]),
        /CREDIT_HISTORY_IMMUTABLE/,
      );
      await assert.rejects(
        batch(db, [["DELETE FROM credit_code_history"]]),
        /CREDIT_HISTORY_IMMUTABLE/,
      );
      const admin = new PortalService(
        db,
        fixtures.admin,
        LOCAL_CREDIT_KEY,
        () => "2026-10-22T08:00:00.000Z",
      );
      const owner = new PortalService(
        db,
        fixtures.owner,
        LOCAL_CREDIT_KEY,
        () => "2026-10-22T08:00:00.000Z",
      );
      assert.equal(
        ((await admin.view("/personal/credits")).credits as any[])[0].allocated,
        0,
        "migration itself never allocates production stock",
      );
      assert.equal(
        ((await owner.view("/personal/credits")).credits as any[])[0].allocated,
        0,
      );
      const repair = await admin.command("repair-credit-allocations", {});
      assert.deepEqual(
        (repair.categories as any[]).map((row) => [
          row.total,
          row.assigned,
          row.available,
          row.waiting,
        ])[0],
        [20, 3, 17, 0],
      );
      const repaired = await rows(
        db,
        "SELECT * FROM credit_allocations ORDER BY inventory_id",
      );
      assert.equal(repaired.length, 3);
      assert.deepEqual(
        repaired.find((row) => row.user_id === "fake_alice"),
        allocations[0],
      );
      assert.equal(
        ((await admin.view("/personal/credits")).credits as any[])[0].allocated,
        1,
      );
      assert.equal(
        ((await owner.view("/personal/credits")).credits as any[])[0].allocated,
        1,
      );
      await owner.command("repair-credit-allocations", {});
      assert.deepEqual(
        await rows(
          db,
          "SELECT * FROM credit_allocations ORDER BY inventory_id",
        ),
        repaired,
      );
      assert.deepEqual(
        await rows(db, "SELECT * FROM credit_inventory ORDER BY id"),
        stock,
      );
    } finally {
      await db.close();
    }
  });
  for (const collision of ["header", "fingerprint"] as const) {
    test(`${engine}: existing ${collision} collision aborts additive migration without merging or deleting data`, async () => {
      const { db, upgrade } = await previous(engine);
      try {
        await batch(db, [
          [
            "INSERT INTO credit_types VALUES('fake_collision',?,'Synthetic collision',1)",
            collision === "header"
              ? "builder boost (fake)"
              : "Different category",
          ],
        ]);
        if (collision === "fingerprint")
          await batch(db, [
            [
              "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) SELECT 'fake_collision_item','fake_collision',ciphertext,fingerprint,created_at,voucher_value FROM credit_inventory WHERE id='fake_item_0'",
            ],
          ]);
        const stock = await rows(
            db,
            "SELECT * FROM credit_inventory ORDER BY id",
          ),
          categories = await rows(db, "SELECT * FROM credit_types ORDER BY id");
        await assert.rejects(upgrade());
        assert.deepEqual(
          await rows(db, "SELECT * FROM credit_inventory ORDER BY id"),
          stock,
        );
        assert.deepEqual(
          await rows(db, "SELECT * FROM credit_types ORDER BY id"),
          categories,
        );
        await assert.rejects(
          one(db, "SELECT count(*) n FROM credit_category_keys"),
        );
        await assert.rejects(
          one(db, "SELECT count(*) n FROM credit_code_history"),
        );
      } finally {
        await db.close();
      }
    });
  }
}
