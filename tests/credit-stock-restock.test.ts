import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, rows, one } from "../lib/db";
import { sha256 } from "../lib/security";

const now = "2026-10-22T08:00:00.000Z";
async function fixture(engine: "sqlite" | "postgres", cohort = 0) {
  const context =
    engine === "sqlite"
      ? await setup()
      : await (async () => {
          const { db } = await createPGliteFixture();
          await seedLocal(db);
          return {
            db,
            service: (who = "alice") =>
              new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => now),
          };
        })();
  const identities = Array.from({ length: cohort }, (_, index) => ({
    id: "stock_user_" + String(index).padStart(2, "0"),
    email: `stock${index}@portal.test`,
    name: "Synthetic Builder " + index,
    source: "local-test" as const,
  }));
  await batch(
    context.db,
    identities.flatMap((identity) => [
      [
        "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)",
        identity.id,
        identity.email,
        identity.name,
        now,
      ],
      [
        "INSERT INTO registrations(email,status) VALUES(?,'approved')",
        identity.email,
      ],
    ]),
  );
  return {
    ...context,
    identities,
    personal: (index: number) =>
      new PortalService(
        context.db,
        identities[index],
        LOCAL_CREDIT_KEY,
        () => now,
      ),
  };
}
function csv(header: string, values: string[]) {
  return [header, ...values].join("\n");
}
function codes(count: number, offset = 1, prefix = "FAKE-STOCK-") {
  return Array.from(
    { length: count },
    (_, index) => prefix + String(index + offset).padStart(3, "0"),
  );
}
async function publish(admin: PortalService, text: string, columns?: object[]) {
  const prepared = await admin.command("preview-credit-batch", {
    csv: text,
    ...(columns ? { columns } : {}),
  });
  const input = {
    csv: text,
    ...(columns ? { columns } : {}),
    digest: prepared.digest,
    confirmation: "PUBLISH_CREDIT_BATCH",
  };
  return {
    prepared: prepared as any,
    input,
    result: (await admin.command("publish-credit-batch", input)) as any,
  };
}
async function summary(admin: PortalService, id: string) {
  return ((await admin.view("/admin/credits")).items as any[]).find(
    (row) => row.id === id,
  );
}
async function check(admin: PortalService, identities: { email: string }[]) {
  await admin.command("bulk-check-in", {
    emails: identities.map((identity) => identity.email),
    confirmation: "CHECK_IN_PARTICIPANTS",
  });
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: raced new canonical header with different display headings cannot create two categories`, async () => {
    const f = await fixture(engine),
      admin = f.service("admin"),
      owner = f.service("owner");
    try {
      await admin.command("quick-check-in", { emails: ["alice@portal.test"] });
      const firstCSV = csv("Independent overlap", ["FAKE-CATEGORY-RACE-FIRST"]);
      const secondCSV = csv(" INDEPENDENT OVERLAP ", [
        "FAKE-CATEGORY-RACE-SECOND",
      ]);
      const firstColumns = [
        {
          key: "0",
          heading: "First display",
          instructions: "First instructions",
        },
      ];
      const secondColumns = [
        {
          key: "0",
          heading: "Second display",
          instructions: "Second instructions",
        },
      ];
      const prepared = await admin.command("preview-credit-batch", {
        csv: firstCSV,
        columns: firstColumns,
      });
      const mutate = admin.mutate.bind(admin);
      let inserted = false;
      admin.mutate = async (...args) => {
        if (args[1] === "publish-credit-batch" && !inserted) {
          inserted = true;
          await publish(owner, secondCSV, secondColumns);
        }
        return mutate(...args);
      };
      await assert.rejects(
        admin.command("publish-credit-batch", {
          csv: firstCSV,
          columns: firstColumns,
          digest: prepared.digest,
          confirmation: "PUBLISH_CREDIT_BATCH",
        }),
        { code: "PREVIEW_REQUIRED" },
      );
      const mappings = await rows<{ type_id: string }>(
        f.db,
        "SELECT type_id FROM credit_category_keys WHERE source_key='independent overlap'",
      );
      assert.equal(mappings.length, 1);
      const typeId = mappings[0].type_id;
      assert.equal((await summary(admin, typeId)).name, "Second display");
      assert.equal(
        (await summary(admin, typeId)).instructions,
        "Second instructions",
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_types WHERE name='First display'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_inventory WHERE voucher_value='FAKE-CATEGORY-RACE-FIRST'",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_allocations WHERE type_id=? AND user_id='fake_alice'",
            typeId,
          )
        ).length,
        1,
      );
      const retried = await publish(admin, firstCSV, firstColumns);
      assert.equal(retried.result.typeIds[0], typeId);
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available])(
          await summary(admin, typeId),
        ),
        [2, 1, 1],
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_types WHERE name IN ('First display','Second display')",
          )
        ).length,
        1,
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: overlapping restock race rolls back all new rows and asks for current counts`, async () => {
    const f = await fixture(engine),
      admin = f.service("admin");
    try {
      const original = await publish(
        admin,
        csv("Overlapping stock", ["FAKE-OVERLAP-BASE"]),
      );
      const typeId = original.result.typeIds[0],
        incoming = csv("Overlapping stock", [
          "FAKE-OVERLAP-SHARED",
          "FAKE-OVERLAP-OUTER",
        ]);
      const prepared = await admin.command("preview-credit-batch", {
        csv: incoming,
      });
      const mutate = admin.mutate.bind(admin);
      let injected = false;
      admin.mutate = async (...args) => {
        if (args[1] === "publish-credit-batch" && !injected) {
          injected = true;
          await publish(
            f.service("owner"),
            csv("Overlapping stock", [
              "FAKE-OVERLAP-SHARED",
              "FAKE-OVERLAP-INNER",
            ]),
          );
        }
        return mutate(...args);
      };
      await assert.rejects(
        admin.command("publish-credit-batch", {
          csv: incoming,
          digest: prepared.digest,
          confirmation: "PUBLISH_CREDIT_BATCH",
        }),
        { code: "PREVIEW_REQUIRED" },
      );
      assert.equal((await summary(admin, typeId)).total, 3);
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_inventory WHERE voucher_value='FAKE-OVERLAP-OUTER'",
          )
        ).length,
        0,
      );
      const retried = await publish(admin, incoming);
      assert.deepEqual(retried.prepared.totals, {
        added: 1,
        duplicates: 1,
        retired: 0,
      });
      assert.equal((await summary(admin, typeId)).total, 4);
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}:50/10 then late10 gives20/30; exhaustion and100 restock fill waiting without republishing`, async () => {
    const f = await fixture(engine, 65);
    const admin = f.service("admin");
    try {
      await check(admin, f.identities.slice(0, 10));
      const first = await publish(admin, csv("OpenAI stock", codes(50)), [
        {
          key: "0",
          heading: "Builder credits",
          instructions: "## Setup\nUse your own account.",
        },
      ]);
      const typeId = first.result.typeIds[0];
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available, s.waiting])(
          await summary(admin, typeId),
        ),
        [50, 10, 40, 0],
      );
      await check(admin, f.identities.slice(10, 20));
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available, s.waiting])(
          await summary(admin, typeId),
        ),
        [50, 20, 30, 0],
      );
      const before = await f.personal(0).command("reveal-credit", { typeId });
      await admin.command("admin-status", {
        kind: "person",
        targetId: f.identities[0].id,
        status: "Going",
        confirmation: "CHANGE_STATUS",
      });
      await assert.rejects(f.personal(0).command("reveal-credit", { typeId }), {
        code: "CHECKIN_REQUIRED",
      });
      await admin.command("quick-check-in", {
        emails: [f.identities[0].email],
      });
      assert.equal(
        (await f.personal(0).command("reveal-credit", { typeId })).value,
        before.value,
      );
      await check(admin, f.identities.slice(20));
      let stock = await summary(admin, typeId);
      assert.deepEqual(
        [stock.assigned, stock.available, stock.waiting, stock.exhausted],
        [50, 0, 15, true],
      );
      const restock = await publish(
        admin,
        csv("  OPENAI STOCK  ", codes(100, 51)),
        [
          {
            key: "0",
            heading: "Do not rename",
            instructions: "Do not overwrite",
          },
        ],
      );
      assert.equal(restock.prepared.columns[0].mode, "restock");
      assert.equal(restock.prepared.columns[0].heading, "Builder credits");
      assert.equal(
        restock.prepared.columns[0].instructions,
        "## Setup\nUse your own account.",
      );
      assert.equal(restock.result.typeIds[0], typeId);
      stock = await summary(admin, typeId);
      assert.deepEqual(
        [
          stock.total,
          stock.assigned,
          stock.available,
          stock.waiting,
          stock.active,
        ],
        [150, 65, 85, 0, 1],
      );
      await admin.command("repair-credit-allocations", {});
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available, s.waiting])(
          await summary(admin, typeId),
        ),
        [150, 65, 85, 0],
      );
      const retry = await admin.command("publish-credit-batch", restock.input);
      assert.equal(retry.alreadyImported, true);
      assert.equal(retry.added, 0);
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_allocations WHERE type_id=?",
            typeId,
          )
        ).length,
        65,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_batches WHERE deleted_at IS NULL",
          )
        ).length,
        1,
      );
    } finally {
      await f.db.close();
    }
  });

  test(`${engine}: dedup within/later/across categories, masked paging, authorized explicit reveal, delete and no recycle`, async () => {
    const f = await fixture(engine, 2),
      admin = f.service("admin");
    try {
      await check(admin, f.identities);
      const values = codes(30),
        first = await publish(admin, csv("Cloud stock", values));
      await assert.rejects(
        admin.command("preview-credit-batch", {
          csv: "Cloud stock,CLOUD STOCK\nFAKE-HEADER-ONE,FAKE-HEADER-TWO",
          columns: [
            { key: "0", heading: "Different A", instructions: "" },
            { key: "1", heading: "Different B", instructions: "" },
          ],
        }),
        { code: "CREDIT_HEADER_DUPLICATE" },
      );
      const typeId = first.result.typeIds[0];
      const duplicate = await publish(
        admin,
        csv("Cloud stock", [values[0], "FAKE-NEW-CODE", "FAKE-NEW-CODE"]),
      );
      assert.deepEqual(duplicate.prepared.totals, {
        added: 1,
        duplicates: 2,
        retired: 0,
      });
      assert.equal((await summary(admin, typeId)).total, 31);
      const second = await publish(
        admin,
        csv("Second category", [values[0], "FAKE-SECOND-CODE"]),
      );
      assert.deepEqual(second.prepared.totals, {
        added: 1,
        duplicates: 1,
        retired: 0,
      });
      const other = second.result.typeIds[0];
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available, s.waiting])(
          await summary(admin, other),
        ),
        [1, 1, 0, 1],
      );
      const waiting = (
        (await f.personal(1).view("/personal/credits")).credits as any[]
      ).find((row) => row.type_id === other);
      assert.equal(waiting.allocated, 0);
      assert.equal(waiting.exhausted, true);
      assert.ok(!("value" in waiting) && !("maskedCode" in waiting));
      const page = await admin.view("/admin/credit-stock/" + typeId);
      assert.equal((page.items as any[]).length, 25);
      assert.equal(page.hasMore, true);
      const next = await admin.view("/admin/credit-stock/" + typeId, {
        page: 1,
      });
      assert.equal((next.items as any[]).length, 6);
      assert.ok(
        !(page.items as any[]).some((a) =>
          (next.items as any[]).some((b) => a.id === b.id),
        ),
      );
      const assigned = await admin.view(
        "/admin/credit-stock/" + typeId + "/assigned",
      );
      assert.equal(assigned.totalRows, 2);
      assert.ok(
        (assigned.items as any[]).every(
          (row) =>
            row.maskedCode === "[masked]" &&
            row.person &&
            row.email &&
            row.assignedAt &&
            row.status === "Assigned",
        ),
      );
      const encoded = JSON.stringify([
        page,
        next,
        assigned,
        await admin.view("/admin/credits"),
      ]);
      for (const value of values) assert.ok(!encoded.includes(value));
      const inventoryId = (assigned.items as any[])[0].id;
      for (const who of ["alice", "judge", "pending", "stranger"])
        await assert.rejects(
          f.service(who).command("admin-reveal-credit", { inventoryId }),
        );
      const revealed = await admin.command("admin-reveal-credit", {
        inventoryId,
      });
      assert.ok(values.includes(String(revealed.value)));
      await assert.rejects(
        f.personal(0).view("/admin/credit-stock/" + typeId),
        { code: "ADMIN_REQUIRED" },
      );
      await assert.rejects(
        admin.command("delete-credit-column", {
          batchId: first.result.batchId,
          columnId: typeId,
          confirmation: "DELETE_CREDIT_BATCH",
        }),
        { code: "CREDIT_DELETE_CONFIRMATION_REQUIRED" },
      );
      await admin.command("delete-credit-column", {
        batchId: first.result.batchId,
        columnId: typeId,
        confirmation: "DELETE_CREDIT_COLUMN",
      });
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_allocations WHERE type_id=?",
            typeId,
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_inventory WHERE type_id=?",
            typeId,
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM credit_category_keys WHERE type_id=?",
            typeId,
          )
        ).length,
        0,
      );
      const reused = await publish(admin, csv("Cloud stock", [values[0]]));
      assert.deepEqual(reused.prepared.totals, {
        added: 0,
        duplicates: 0,
        retired: 1,
      });
      assert.equal(reused.result.added, 0);
      assert.equal(
        await one(f.db, "SELECT id FROM credit_types WHERE name='Cloud stock'"),
        undefined,
      );
      const history = await rows<any>(
        f.db,
        "SELECT * FROM credit_code_history WHERE type_id=?",
        typeId,
      );
      assert.equal(history.length, 31);
      assert.ok(
        history.every(
          (row) =>
            !("assigned_user_id" in row) &&
            !("assigned_at" in row) &&
            !("voucher_value" in row),
        ),
      );
      const audit = JSON.stringify(
        await rows(
          f.db,
          "SELECT detail FROM audit_logs WHERE action IN ('publish-credit-batch','admin-reveal-credit','delete-credit-column')",
        ),
      );
      for (const value of [...values, "FAKE-NEW-CODE", "FAKE-SECOND-CODE"])
        assert.ok(!audit.includes(value));
    } finally {
      await f.db.close();
    }
  });

  test(`${engine}: checked-in admin and judge get own credits without team/profile gate; no cross-user or nonchecked access`, async () => {
    const f = await fixture(engine),
      admin = f.service("admin");
    try {
      await assert.rejects(admin.view("/personal/credits"), {
        code: "CHECKIN_REQUIRED",
      });
      await admin.command("bulk-check-in", {
        emails: ["admin@portal.test", "judge@portal.test"],
        confirmation: "CHECK_IN_PARTICIPANTS",
      });
      await batch(f.db, [
        ["DELETE FROM participant_profiles WHERE user_id='fake_admin'"],
      ]);
      const p = await publish(
          admin,
          csv("Staff stock", codes(3, 1, "FAKE-STAFF-")),
        ),
        typeId = p.result.typeIds[0];
      const personal = await admin.view("/personal/credits");
      assert.equal(personal.checkedIn, true);
      assert.ok(
        (personal.credits as any[]).some(
          (row) => row.type_id === typeId && row.allocated === 1,
        ),
      );
      await assert.rejects(admin.view("/personal/credits/fake_judge"), {
        code: "PAGE_NOT_FOUND",
      });
      await batch(f.db, [
        [
          "INSERT INTO credit_types VALUES('fake_waiting','Waiting stock','Synthetic waiting fixture',1)",
        ],
        [
          "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) VALUES('fake_waiting_code','fake_waiting','',?,?,?)",
          await sha256("FAKE-WAITING-ONLY"),
          now,
          "FAKE-WAITING-ONLY",
        ],
      ]);
      const waiting = (
        (await admin.view("/personal/credits")).credits as any[]
      ).find((row) => row.type_id === "fake_waiting");
      assert.equal(waiting.allocated, 0);
      assert.equal(waiting.exhausted, false);
      await admin.command("repair-credit-allocations", {});
      assert.equal(
        ((await admin.view("/personal/credits")).credits as any[]).find(
          (row) => row.type_id === "fake_waiting",
        ).allocated,
        1,
      );
      assert.ok(
        String(
          (await admin.command("reveal-credit", { typeId })).value,
        ).startsWith("FAKE-STAFF-"),
      );
      assert.ok(
        String(
          (await f.service("judge").command("reveal-credit", { typeId })).value,
        ).startsWith("FAKE-STAFF-"),
      );
      await assert.rejects(
        f.service("bob").command("reveal-credit", { typeId }),
        { code: "CHECKIN_REQUIRED" },
      );
      await assert.rejects(
        admin.command("reveal-credit", { typeId, userId: "fake_judge" }),
      );
      await assert.rejects(f.service("stranger").command("save-project", {}), {
        code: "VIEWER_READ_ONLY",
      });
      await admin.command("admin-status", {
        kind: "person",
        targetId: "fake_admin",
        status: "Going",
        confirmation: "CHANGE_STATUS",
      });
      await assert.rejects(admin.view("/personal/credits"), {
        code: "CHECKIN_REQUIRED",
      });
    } finally {
      await f.db.close();
    }
  });

  test(`${engine}: concurrent check-ins and repeated publish assign each physical code/person/category once`, async () => {
    const f = await fixture(engine, 4),
      admin = f.service("admin");
    try {
      const text = csv("Concurrent stock", codes(10)),
        prepared = await admin.command("preview-credit-batch", { csv: text });
      const payload = {
        csv: text,
        digest: prepared.digest,
        confirmation: "PUBLISH_CREDIT_BATCH",
      };
      await f.service("owner").command("preview-credit-batch", { csv: text });
      const results = await Promise.all([
        admin.command("publish-credit-batch", payload),
        f.service("owner").command("publish-credit-batch", payload),
      ]);
      assert.equal(
        results.filter((result) => result.alreadyImported === true).length,
        1,
      );
      const typeId = (results[0].typeIds as string[])[0];
      await Promise.all(
        f.identities.map((identity) =>
          f
            .service("admin")
            .command("quick-check-in", { emails: [identity.email] }),
        ),
      );
      const assigned = await rows<any>(
        f.db,
        "SELECT * FROM credit_allocations WHERE type_id=?",
        typeId,
      );
      assert.equal(assigned.length, 4);
      assert.equal(new Set(assigned.map((row) => row.inventory_id)).size, 4);
      assert.equal(new Set(assigned.map((row) => row.user_id)).size, 4);
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available, s.waiting])(
          await summary(admin, typeId),
        ),
        [10, 4, 6, 0],
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM audit_logs WHERE action='publish-credit-batch'",
          )
        ).length,
        1,
      );
    } finally {
      await f.db.close();
    }
  });
}
