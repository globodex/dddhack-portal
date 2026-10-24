// Disposable synthetic UI fixture only. Never imported by the application.
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "./fixtures";
import { PortalService } from "../lib/service";
import { batch } from "../lib/db";

assert.equal(process.env.PORTAL_LOCAL_TEST, "1");
assert.notEqual(process.env.NODE_ENV, "production");
const path = resolve(
  process.env.PORTAL_LOCAL_DB || "/tmp/ddd-credit-ui.sqlite",
);
assert.ok(path.startsWith("/tmp/ddd-credit-") && path.endsWith(".sqlite"));
const prefix = path.slice(0, -7),
  initialCSV = prefix + "-initial.csv",
  restockCSV = prefix + "-restock.csv",
  reportPath = prefix + "-report.json";
for (const file of [path, initialCSV, restockCSV, reportPath])
  assert.ok(!existsSync(file), "NEW_DISPOSABLE_FIXTURE_REQUIRED: " + file);
globalThis.fetch = async () => {
  throw new Error("SYNTHETIC_FIXTURE_EXTERNAL_FETCH_DISABLED");
};
const db = new LocalDatabase(path),
  now = new Date().toISOString();
const legacyWaiting = process.env.CREDIT_UI_LEGACY_WAITING === "1";
const initialStockCount = Number(process.env.CREDIT_UI_INITIAL_STOCK || 50);
assert.ok(
  Number.isInteger(initialStockCount) &&
    initialStockCount >= 1 &&
    initialStockCount <= 1000,
);
try {
  db.migrate();
  await seedLocal(db);
  // Remove the unrelated legacy FAKE pool before any assignment. Its hashes
  // remain retired; this does not reset or recycle an exposed code.
  await batch(db, [
    ["DELETE FROM credit_inventory WHERE type_id='fake_credit'"],
    ["DELETE FROM credit_category_keys WHERE type_id='fake_credit'"],
    ["DELETE FROM credit_types WHERE id='fake_credit'"],
    [
      "INSERT INTO teams VALUES('fake_credit_admin_team','Synthetic Admin Team','fake_admin','Synthetic credit privacy fixture',?)",
      now,
    ],
    [
      "INSERT INTO memberships VALUES('fake_admin','fake_credit_admin_team',?)",
      now,
    ],
    [
      "INSERT INTO memberships VALUES('fake_pending','fake_credit_admin_team',?)",
      now,
    ],
  ]);
  const people = Array.from({ length: 70 }, (_, index) => ({
    id: "fake_credit_ui_" + String(index).padStart(2, "0"),
    name: "Synthetic Credit Builder " + String(index).padStart(2, "0"),
    email: "credit-ui-" + String(index).padStart(2, "0") + "@portal.test",
  }));
  await batch(
    db,
    people.flatMap((person) => [
      [
        "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)",
        person.id,
        person.email,
        person.name,
        now,
      ],
      [
        "INSERT INTO registrations(email,status) VALUES(?,'approved')",
        person.email,
      ],
    ]),
  );
  const admin = new PortalService(
    db,
    fixtures.admin,
    LOCAL_CREDIT_KEY,
    () => now,
  );
  const checkedEmails = [
    fixtures.admin.email,
    ...people.slice(0, 9).map((person) => person.email),
  ];
  await admin.command("bulk-check-in", {
    emails: legacyWaiting ? checkedEmails.slice(1) : checkedEmails,
    confirmation: "CHECK_IN_PARTICIPANTS",
  });
  const values = (count: number, offset: number) =>
    Array.from(
      { length: count },
      (_, index) =>
        "SYNTHETIC-UI-OPENAI-" + String(index + offset).padStart(4, "0"),
    );
  const csv = ["OpenAI credits", ...values(initialStockCount, 1)].join("\n"),
    restock = ["OpenAI credits", ...values(100, initialStockCount + 1)].join(
      "\n",
    );
  const columns = [
    {
      key: "0",
      heading: "OpenAI credits",
      instructions:
        "## Set up your account\nUse your assigned credit with your own account.",
    },
  ];
  const prepared = await admin.command("preview-credit-batch", {
    csv,
    columns,
  });
  const imported = await admin.command("publish-credit-batch", {
    csv,
    columns,
    digest: prepared.digest,
    confirmation: "PUBLISH_CREDIT_BATCH",
  });
  const typeId = (imported.typeIds as string[])[0];
  if (legacyWaiting) {
    // Genuine old quick-check-in state: stock was published first, then the
    // admin checked in without the old endpoint allocating their category.
    // No existing mapping is removed, no code is recycled, and GET stays pure.
    await batch(db, [
      ["INSERT INTO check_ins VALUES('fake_admin','fake_owner',?)", now],
    ]);
  }
  const stock = await admin.view("/admin/credit-stock/" + typeId),
    own = await admin.view("/personal/credits"),
    dashboard = await admin.view("/dashboard");
  const summary = stock.summary as Record<string, any>;
  const assigned = Math.min(initialStockCount, legacyWaiting ? 9 : 10);
  assert.deepEqual(
    [summary.total, summary.assigned, summary.available, summary.waiting],
    [initialStockCount, assigned, initialStockCount - assigned, 10 - assigned],
  );
  assert.equal(
    (own.credits as any[]).find((credit) => credit.type_id === typeId)
      ?.allocated === 1,
    !legacyWaiting,
  );
  assert.equal((dashboard.teamReadiness as any).allApproved, false);
  writeFileSync(initialCSV, csv + "\n");
  writeFileSync(restockCSV, restock + "\n");
  const report = {
    source: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    }).trim(),
    runtimeChanges: execFileSync(
      "git",
      [
        "status",
        "--short",
        "--",
        "lib",
        "neon/db",
        "neon/migrations",
        "db/migrations",
        "scripts/credit-stock-ui-fixture.ts",
      ],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
    ).trim(),
    runtimeFingerprints: Object.fromEntries(
      [
        "lib/credit-stock.ts",
        "lib/credit-stock-import.ts",
        "lib/credit-batches.ts",
        "lib/service.ts",
        "lib/participant-checkin.ts",
        "db/migrations/0024_credit_stock.sql",
        "neon/migrations/0005_credit_stock.sql",
      ].map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(new URL("../" + file, import.meta.url)))
          .digest("hex"),
      ]),
    ),
    syntheticOnly: true,
    database: path,
    initialCSV,
    restockCSV,
    typeId,
    batchId: imported.batchId,
    summary,
    legacyWaiting,
    expectedAfterRepair: {
      total: initialStockCount,
      assigned: Math.min(initialStockCount, 10),
      available: Math.max(0, initialStockCount - 10),
      waiting: Math.max(0, 10 - initialStockCount),
    },
    checkedEmails,
    lateCheckInEmails: people.slice(9, 19).map((person) => person.email),
    adminProof: {
      personallyCheckedIn: true,
      ownsCredit: !legacyWaiting,
      teamId: "fake_credit_admin_team",
      teamAllApproved: false,
    },
    note: "No provider calls or sends. CSV files contain only visibly synthetic test values; no values are printed in logs. Default pool is50/10/40; checking in the next10 gives50/20/30. Legacy-waiting mode leaves the already checked-in admin unallocated until explicit repair. Restock CSV appends100 to the same active category.",
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
} finally {
  db.close();
}
