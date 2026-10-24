import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { LocalDatabase } from "../lib/local-test/sqlite";
import {
  applyPortalMigrations,
  loadPortalMigrations,
} from "../neon/db/migrate";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows, type Database, type SQL } from "../lib/db";
import { personStatus } from "../lib/portal-status";
import { handlePortal } from "../lib/http";

const now = "2026-10-22T08:00:00.000Z";
const inviteOnly = { confirmation: "CHECK_IN_PARTICIPANTS" };
async function fixture(engine: "sqlite" | "postgres", size = 0) {
  const pg = engine === "postgres" ? await createPGliteFixture() : null;
  const local = pg ? null : await setup();
  const db = pg?.db || local!.db;
  if (pg) await seedLocal(db);
  const users = Array.from({ length: size }, (_, i) => ({
    id: `independent_${String(i).padStart(2, "0")}`,
    email: `independent${i}@portal.test`,
    name: `Independent synthetic ${i}`,
    source: "local-test" as const,
  }));
  await batch(
    db,
    users.flatMap(
      (user) =>
        [
          [
            "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)",
            user.id,
            user.email,
            user.name,
            now,
          ],
          [
            "INSERT INTO registrations(email,status) VALUES(?,'approved')",
            user.email,
          ],
        ] as SQL[],
    ),
  );
  const service = (name = "admin") =>
    new PortalService(db, fixtures[name], LOCAL_CREDIT_KEY, () => now);
  const personal = (i: number) =>
    new PortalService(db, users[i], LOCAL_CREDIT_KEY, () => now);
  async function rejectAllocation(userId: string) {
    if (pg)
      await pg.engine.exec(
        `CREATE FUNCTION independent_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${userId}' THEN RAISE EXCEPTION 'INDEPENDENT_ALLOCATION_FAIL' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$; CREATE TRIGGER independent_reject BEFORE INSERT ON credit_allocations FOR EACH ROW EXECUTE FUNCTION independent_reject();`,
      );
    else
      local!.db.raw.exec(
        `CREATE TRIGGER independent_reject BEFORE INSERT ON credit_allocations WHEN NEW.user_id='${userId}' BEGIN SELECT RAISE(ABORT,'INDEPENDENT_ALLOCATION_FAIL'); END;`,
      );
  }
  async function allowAllocations() {
    if (pg)
      await pg.engine.exec(
        "DROP TRIGGER independent_reject ON credit_allocations; DROP FUNCTION independent_reject();",
      );
    else local!.db.raw.exec("DROP TRIGGER independent_reject");
  }
  return { db, users, service, personal, rejectAllocation, allowAllocations };
}
const code = (n: number, prefix = "INDEPENDENT-ONLY-") =>
  Array.from({ length: n }, (_, i) => prefix + String(i).padStart(3, "0"));
async function publish(
  service: PortalService,
  header: string,
  values: string[],
  columns?: object[],
) {
  const data = {
    csv: [header, ...values].join("\n"),
    ...(columns ? { columns } : {}),
  };
  const preview = await service.command("preview-credit-batch", data);
  const payload = {
    ...data,
    digest: preview.digest,
    confirmation: "PUBLISH_CREDIT_BATCH",
  };
  const result = await service.command("publish-credit-batch", payload);
  assert.ok(
    Array.isArray(result.typeIds) &&
      result.typeIds.every((id) => typeof id === "string"),
  );
  return {
    preview,
    payload,
    result: result as Record<string, unknown> & { typeIds: string[] },
  };
}
async function summary(service: PortalService, id: string) {
  return ((await service.view("/admin/credits")).items as any[]).find(
    (row) => row.id === id,
  );
}
async function check(service: PortalService, users: { email: string }[]) {
  return service.command("bulk-check-in", {
    emails: users.map((user) => user.email),
    ...inviteOnly,
  });
}
async function snapshot(db: Database) {
  const tables = [
    "credit_types",
    "credit_category_keys",
    "credit_inventory",
    "credit_allocations",
    "credit_code_history",
    "credit_stock_imports",
    "audit_logs",
  ];
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [
        table,
        await rows(db, `SELECT * FROM ${table} ORDER BY 1,2`),
      ]),
    ),
  );
}
function before(
  service: PortalService,
  action: string,
  work: () => Promise<unknown>,
) {
  const mutate = service.mutate.bind(service);
  let once = false;
  service.mutate = async (...args) => {
    if (!once && args[1] === action) {
      once = true;
      await work();
    }
    return mutate(...args);
  };
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: independent stock1 exact50/10, later10 and canonical100 restock preserve assignments/metadata`, async () => {
    const f = await fixture(engine, 22),
      admin = f.service();
    try {
      await check(admin, f.users.slice(0, 10));
      const first = await publish(admin, "Independent stock", code(50), [
        {
          key: "0",
          heading: "Original display",
          instructions: "Original **shared** instructions",
        },
      ]);
      const id = first.result.typeIds[0];
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available, s.waiting])(
          await summary(admin, id),
        ),
        [50, 10, 40, 0],
      );
      const original = await rows(
        f.db,
        "SELECT inventory_id,user_id FROM credit_allocations WHERE type_id=? ORDER BY user_id",
        id,
      );
      await check(admin, f.users.slice(10, 20));
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available, s.waiting])(
          await summary(admin, id),
        ),
        [50, 20, 30, 0],
      );
      const restock = await publish(
        admin,
        "  INDEPENDENT STOCK  ",
        code(100, "INDEPENDENT-RESTOCK-"),
        [
          {
            key: "0",
            heading: "Ignore rename",
            instructions: "Ignore replacement",
          },
        ],
      );
      assert.equal(restock.result.typeIds[0], id);
      const current = await summary(admin, id);
      assert.deepEqual(
        [
          current.total,
          current.assigned,
          current.available,
          current.name,
          current.instructions,
        ],
        [150, 20, 130, "Original display", "Original **shared** instructions"],
      );
      for (const row of original)
        assert.ok(
          (
            await rows<any>(
              f.db,
              "SELECT inventory_id,user_id FROM credit_allocations WHERE type_id=?",
              id,
            )
          ).some(
            (saved) =>
              saved.inventory_id === row.inventory_id &&
              saved.user_id === row.user_id,
          ),
        );
      await Promise.all([
        admin.command("publish-credit-batch", restock.payload),
        admin.command("repair-credit-allocations", {}),
      ]);
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available])(
          await summary(admin, id),
        ),
        [150, 20, 130],
      );
      const durable = JSON.stringify(
        await rows(f.db, "SELECT * FROM credit_stock_imports"),
      );
      for (const value of [
        ...code(50),
        ...code(100, "INDEPENDENT-RESTOCK-"),
        ...f.users.map((user) => user.email),
        ...f.users.map((user) => user.id),
      ])
        assert.ok(!durable.includes(value));
    } finally {
      await f.db.close();
    }
  });

  test(`${engine}: independent stock2 failed assignment rolls entire import/history/receipt back and same prepared retry works`, async () => {
    const f = await fixture(engine, 10),
      admin = f.service();
    try {
      await check(admin, f.users);
      const data = {
        csv: ["Atomic import", ...code(50, "INDEPENDENT-ATOMIC-")].join("\n"),
      };
      const preview = await admin.command("preview-credit-batch", data);
      const payload = {
        ...data,
        digest: preview.digest,
        confirmation: "PUBLISH_CREDIT_BATCH",
      };
      const initial = await snapshot(f.db);
      await f.rejectAllocation(f.users[9].id);
      await assert.rejects(
        admin.command("publish-credit-batch", payload),
        /INDEPENDENT_ALLOCATION_FAIL/,
      );
      assert.deepEqual(await snapshot(f.db), initial);
      assert.ok(
        await one(
          f.db,
          "SELECT digest FROM import_previews WHERE digest=?",
          preview.digest,
        ),
      );
      await f.allowAllocations();
      const result = await admin.command("publish-credit-batch", payload);
      assert.ok(Array.isArray(result.typeIds));
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available])(
          await summary(admin, result.typeIds[0]),
        ),
        [50, 10, 40],
      );
      assert.equal(
        (await rows(f.db, "SELECT * FROM credit_stock_imports")).length,
        1,
      );
    } finally {
      await f.db.close();
    }
  });

  test(`${engine}: independent stock3 allocation failure rolls back bulk attendance and overrides without consuming stock`, async () => {
    const f = await fixture(engine, 2),
      admin = f.service();
    try {
      const published = await publish(
        admin,
        "Attendance atomic",
        code(3, "INDEPENDENT-CHECKIN-"),
      );
      await admin.command("admin-status", {
        kind: "person",
        targetId: f.users[0].id,
        status: "Going",
        confirmation: "CHANGE_STATUS",
      });
      const initial = await snapshot(f.db);
      await f.rejectAllocation(f.users[1].id);
      await assert.rejects(
        check(admin, f.users),
        /INDEPENDENT_ALLOCATION_FAIL/,
      );
      assert.deepEqual(await snapshot(f.db), initial);
      for (const user of f.users) {
        const state = await personStatus(admin, user.id);
        assert.equal(state.status, "Going");
        assert.equal(state.checkedIn, false);
      }
      assert.equal((await rows(f.db, "SELECT * FROM check_ins")).length, 0);
      await f.allowAllocations();
      await check(admin, f.users);
      assert.deepEqual(
        ((s: any) => [s.total, s.assigned, s.available])(
          await summary(admin, published.result.typeIds[0]),
        ),
        [3, 2, 1],
      );
    } finally {
      await f.db.close();
    }
  });

  test(`${engine}: independent stock4 self checked-in admin needs no profile/team/roster and revocation cannot leak a value`, async (t) => {
    const f = await fixture(engine),
      admin = f.service();
    try {
      const identity = {
        id: "independent_admin",
        email: "independent-admin@portal.test",
        name: "Independent admin without roster",
        source: "local-test" as const,
      };
      await batch(f.db, [
        [
          "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'admin',?)",
          identity.id,
          identity.email,
          identity.name,
          now,
        ],
        [
          "INSERT INTO registrations(email,status) VALUES(?,'approved')",
          identity.email,
        ],
      ]);
      const self = new PortalService(
        f.db,
        identity,
        LOCAL_CREDIT_KEY,
        () => now,
      );
      await admin.command("admin-status", {
        kind: "person",
        targetId: identity.id,
        status: "Checked in",
        confirmation: "CHANGE_STATUS",
      });
      assert.equal(
        await one(
          f.db,
          "SELECT email FROM luma_roster WHERE email=?",
          identity.email,
        ),
        undefined,
      );
      assert.equal(
        await one(
          f.db,
          "SELECT user_id FROM participant_profiles WHERE user_id=?",
          identity.id,
        ),
        undefined,
      );
      const { result } = await publish(
        admin,
        "Admin personal",
        code(2, "INDEPENDENT-ADMIN-"),
      );
      const id = result.typeIds[0],
        view = await self.view("/personal/credits");
      assert.equal(view.checkedIn, true);
      assert.equal(
        (view.credits as any[]).find((row) => row.type_id === id).allocated,
        1,
      );
      assert.equal(JSON.stringify(view).includes("voucher_value"), false);
      await assert.rejects(
        self.command("reveal-credit", { typeId: id, userId: "fake_alice" }),
      );
      await assert.rejects(f.service("alice").view("/personal/credits"), {
        code: "CHECKIN_REQUIRED",
      });
      await assert.rejects(
        f
          .service("alice")
          .command("admin-reveal-credit", { inventoryId: "fake_item_0" }),
        { code: "ADMIN_REQUIRED" },
      );
      const recipient = self;
      before(recipient, "reveal-credit", () =>
        batch(f.db, [
          [
            "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) VALUES('participant',?,1,'Synthetic revocation','fake_owner',?,'{}')",
            identity.id,
            now,
          ],
        ]),
      );
      const beforeAudit = (
        await rows(
          f.db,
          "SELECT * FROM audit_logs WHERE action='reveal-credit'",
        )
      ).length;
      await assert.rejects(recipient.command("reveal-credit", { typeId: id }));
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM audit_logs WHERE action='reveal-credit'",
          )
        ).length,
        beforeAudit,
      );
      const item = await one<any>(
        f.db,
        "SELECT h.exposed FROM credit_code_history h JOIN credit_allocations a ON a.inventory_id=h.inventory_id WHERE a.type_id=? AND a.user_id=?",
        id,
        identity.id,
      );
      assert.equal(item.exposed, 0);
      const response = await handlePortal(
        new Request(
          "https://portal.test/api/portal?view=%2Fpersonal%2Fcredits",
        ),
        { db: f.db, identity, key: LOCAL_CREDIT_KEY },
      );
      const denied = (await response.json()) as {
        code: string;
        credits?: unknown;
      };
      assert.equal(response.status, 403);
      assert.equal(denied.code, "PARTICIPANT_REMOVED");
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      assert.equal(denied.credits, undefined);
      assert.equal(
        JSON.stringify(denied).includes("INDEPENDENT-ADMIN-"),
        false,
      );
      t.diagnostic(
        `Removed personal-credit GET: status ${response.status} code ${denied.code}; no credit payload returned`,
      );
    } finally {
      await f.db.close();
    }
  });

  test(`${engine}: independent stock5 global duplicates/retired codes cannot recycle or move an existing allocation owner`, async () => {
    const f = await fixture(engine, 2),
      admin = f.service();
    try {
      await check(admin, f.users);
      const values = code(2, "INDEPENDENT-NO-RECYCLE-");
      const first = await publish(admin, "Original stock", values),
        id = first.result.typeIds[0];
      const other = await publish(admin, "Other stock", [
        values[0],
        "INDEPENDENT-OTHER-ONLY",
      ]);
      assert.deepEqual(other.preview.totals, {
        added: 1,
        duplicates: 1,
        retired: 0,
      });
      await admin.command("delete-credit-column", {
        batchId: first.result.batchId,
        columnId: id,
        confirmation: "DELETE_CREDIT_COLUMN",
      });
      await assert.rejects(
        admin.command("publish-credit-batch", first.payload),
        { code: "CREDIT_BATCH_DELETED" },
      );
      const retry = await publish(admin, "Original stock", [values[0]]);
      assert.deepEqual(retry.preview.totals, {
        added: 0,
        duplicates: 0,
        retired: 1,
      });
      assert.equal(retry.result.added, 0);
      const tombstones = await rows<any>(
        f.db,
        "SELECT * FROM credit_code_history WHERE type_id=?",
        id,
      );
      assert.equal(tombstones.length, 2);
      assert.ok(
        tombstones.every(
          (row) =>
            !Object.keys(row).some((key) =>
              /user|email|assigned_at|voucher_value/.test(key),
            ),
        ),
      );
      const assigned = await one<any>(
        f.db,
        "SELECT * FROM credit_allocations WHERE type_id=? AND user_id=?",
        other.result.typeIds[0],
        f.users[0].id,
      );
      // Probe ownership identity after proving retirement, so a missing guard
      // cannot prevent the independent no-recycle assertions from running.
      await assert.rejects(
        batch(f.db, [
          [
            "UPDATE credit_allocations SET user_id=?,recipient_email=? WHERE inventory_id=?",
            "fake_alice",
            "alice@portal.test",
            assigned.inventory_id,
          ],
        ]),
        /CREDIT_ALLOCATION|IMMUTABLE/,
      );
    } finally {
      await f.db.close();
    }
  });
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: independent stock7 overlapping new imports with different display edits cannot split one canonical header`, async (t) => {
    const f = await fixture(engine, 1),
      admin = f.service();
    try {
      await check(admin, f.users);
      const csv = "Independent overlap\nINDEPENDENT-OVERLAP-A";
      const columns = [
        {
          key: "0",
          heading: "First display",
          instructions: "First instructions",
        },
      ];
      const preview = await admin.command("preview-credit-batch", {
        csv,
        columns,
      });
      before(admin, "publish-credit-batch", () =>
        publish(
          f.service("owner"),
          "  INDEPENDENT OVERLAP  ",
          ["INDEPENDENT-OVERLAP-B"],
          [
            {
              key: "0",
              heading: "Second display",
              instructions: "Second instructions",
            },
          ],
        ),
      );
      let staleError: unknown;
      try {
        await admin.command("publish-credit-batch", {
          csv,
          columns,
          digest: preview.digest,
          confirmation: "PUBLISH_CREDIT_BATCH",
        });
      } catch (error) {
        staleError = error;
      }
      const categories = await rows<{
        id: string;
        name: string;
        source_heading: string;
        assigned: number;
      }>(
        f.db,
        "SELECT t.id,t.name,c.source_heading,(SELECT count(*) FROM credit_allocations a WHERE a.type_id=t.id) assigned FROM credit_batch_columns c JOIN credit_types t ON t.id=c.type_id WHERE lower(trim(c.source_heading))='independent overlap' ORDER BY t.name",
      );
      t.diagnostic(
        "Overlapping canonical-header categories: " +
          JSON.stringify(categories),
      );
      assert.equal(
        categories.length,
        1,
        "One canonical CSV header must remain one category after an intervening import",
      );
      assert.ok(staleError && typeof staleError === "object");
      assert.equal((staleError as { code: string }).code, "PREVIEW_REQUIRED");
      assert.equal(
        (await one(f.db, "SELECT count(*) n FROM credit_stock_imports"))?.n,
        1,
      );
      const winningAllocation = await rows(
        f.db,
        "SELECT inventory_id,user_id,type_id FROM credit_allocations ORDER BY inventory_id",
      );
      const retried = await publish(
        admin,
        "Independent overlap",
        ["INDEPENDENT-OVERLAP-A"],
        columns,
      );
      assert.deepEqual(retried.result.typeIds, [categories[0].id]);
      assert.deepEqual(
        await rows(
          f.db,
          "SELECT inventory_id,user_id,type_id FROM credit_allocations ORDER BY inventory_id",
        ),
        winningAllocation,
      );
      const stock = await summary(admin, categories[0].id);
      assert.deepEqual(
        [stock.total, stock.assigned, stock.available, stock.name],
        [2, 1, 1, "Second display"],
      );
    } finally {
      await f.db.close();
    }
  });
}

async function previous(engine: "sqlite" | "postgres") {
  if (engine === "postgres") {
    const laterMigrations = (await loadPortalMigrations())
      .filter((migration) => migration.name >= "0005_credit_stock.sql")
      .map((migration) => migration.name);
    const f = await createPGliteFixture({
      excludeMigrations: laterMigrations,
    });
    await seedLocal(f.db);
    return {
      db: f.db,
      upgrade: async () =>
        applyPortalMigrations(f.pool, await loadPortalMigrations()),
      journal: () =>
        rows(
          f.db,
          "SELECT name,checksum FROM portal_schema_migrations ORDER BY name",
        ),
    };
  }
  const db = new LocalDatabase(":memory:"),
    directory = new URL("../db/migrations/", import.meta.url);
  db.raw.exec("CREATE TABLE local_schema_migrations(name TEXT PRIMARY KEY)");
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith(".sql") && name < "0024_credit_stock.sql")
    .sort()) {
    db.raw.exec(readFileSync(new URL(name, directory), "utf8"));
    db.raw.prepare("INSERT INTO local_schema_migrations VALUES(?)").run(name);
  }
  await seedLocal(db);
  return {
    db,
    upgrade: async () => db.migrate(),
    journal: () =>
      rows(db, "SELECT name FROM local_schema_migrations ORDER BY name"),
  };
}
for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: independent stock6 real migrator atomically rejects source-header and assigned-fingerprint legacy collisions`, async () => {
    for (const collision of ["header", "fingerprint"]) {
      const f = await previous(engine);
      try {
        await batch(f.db, [
          [
            "INSERT INTO credit_types VALUES('independent_old_a','Different display A','Original A',1)",
          ],
          [
            "INSERT INTO credit_types VALUES('independent_old_b','Different display B','Original B',1)",
          ],
        ]);
        if (collision === "header")
          await batch(f.db, [
            [
              "INSERT INTO credit_batches VALUES('independent_batch','independent-digest','fake_admin',?,NULL)",
              now,
            ],
            [
              "INSERT INTO credit_batch_columns VALUES('independent_batch','independent_old_a','0','Source header')",
            ],
            [
              "INSERT INTO credit_batch_columns VALUES('independent_batch','independent_old_b','1',' SOURCE HEADER ')",
            ],
          ]);
        else
          await batch(f.db, [
            ["INSERT INTO check_ins VALUES('fake_alice','fake_admin',?)", now],
            ["INSERT INTO check_ins VALUES('fake_bob','fake_admin',?)", now],
            [
              "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) SELECT 'independent_collision','independent_old_a',ciphertext,fingerprint,created_at,voucher_value FROM credit_inventory WHERE id='fake_item_0'",
            ],
            [
              "INSERT INTO credit_allocations VALUES('fake_item_0','fake_credit','fake_alice',?,'alice@portal.test')",
              now,
            ],
            [
              "INSERT INTO credit_allocations VALUES('independent_collision','independent_old_a','fake_bob',?,'bob@portal.test')",
              now,
            ],
          ]);
        const tables = [
          "credit_types",
          "credit_inventory",
          "credit_allocations",
          "credit_batches",
          "credit_batch_columns",
        ];
        const snapshot = async () =>
          Object.fromEntries(
            await Promise.all(
              tables.map(async (table) => [
                table,
                await rows(f.db, `SELECT * FROM ${table} ORDER BY 1,2`),
              ]),
            ),
          );
        const initial = await snapshot(),
          journal = await f.journal();
        await assert.rejects(f.upgrade(), (error) =>
          engine === "postgres"
            ? (error as { code?: string }).code === "23505"
            : /UNIQUE constraint/i.test(String(error)),
        );
        assert.deepEqual(await snapshot(), initial);
        assert.deepEqual(await f.journal(), journal);
        await assert.rejects(one(f.db, "SELECT * FROM credit_category_keys"));
        await assert.rejects(one(f.db, "SELECT * FROM credit_code_history"));
      } finally {
        await f.db.close();
      }
    }
  });
}
