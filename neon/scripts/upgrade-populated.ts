import { readFile, mkdir, open, realpath } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { Pool } from "pg";
import type { PostgresPool } from "../db/adapter";
import { loadMigrationPlan } from "../migration-plan";
import {
  applyPopulatedUpgrade,
  inspectPopulatedUpgrade,
  verifyUpgradePlan,
  verifyUpgradeTarget,
  UpgradeStopped,
  type UpgradeBaseline,
  type UpgradeReceipt,
} from "../db/populated-upgrade";

// Separate from migrate.ts: synthetic confirmation must NEVER enable this path.
async function main() {
  const args = process.argv.slice(2);
  const mode = args.shift() || "--plan";
  const values = new Map<string, string>();
  let restoreVerified = false;
  while (args.length) {
    const key = args.shift()!;
    if (key === "--confirm-restore-verified" && !restoreVerified) {
      restoreVerified = true;
    } else if (
      ["--receipt", "--backup-checkpoint"].includes(key) &&
      !values.has(key)
    ) {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw new UpgradeStopped("UPGRADE_ARGUMENT_INVALID");
      values.set(key, value);
    } else throw new UpgradeStopped("UPGRADE_ARGUMENT_INVALID");
  }
  if (!["--plan", "--inspect-populated", "--apply-populated"].includes(mode))
    throw new UpgradeStopped("UPGRADE_MODE_REQUIRED");
  const baseline = JSON.parse(
    await readFile(
      new URL(
        "../../evidence/neon-host-archive/historical-ledger-checksums.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as UpgradeBaseline;
  const plan = await loadMigrationPlan();
  const planDigest = verifyUpgradePlan(plan, baseline);
  if (mode === "--plan") {
    if (values.size || restoreVerified)
      throw new UpgradeStopped("UPGRADE_ARGUMENT_INVALID");
    console.log(
      JSON.stringify(
        {
          mode: "source-plan-only",
          planDigest,
          migrations: plan.map(({ name, checksum }) => ({ name, checksum })),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (process.env.PORTAL_SYNTHETIC_DATABASE === "1")
    throw new UpgradeStopped("UPGRADE_SYNTHETIC_FLAG_FORBIDDEN");
  if (
    mode === "--inspect-populated" &&
    (values.has("--backup-checkpoint") || restoreVerified)
  )
    throw new UpgradeStopped("UPGRADE_ARGUMENT_INVALID");
  if (
    mode === "--apply-populated" &&
    (!restoreVerified || !values.get("--backup-checkpoint")?.trim())
  )
    throw new UpgradeStopped("UPGRADE_VERIFIED_RESTORE_CHECKPOINT_REQUIRED");
  const target = verifyUpgradeTarget(process.env.DATABASE_URL_UNPOOLED, {
    host: process.env.MIGRATION_EXPECTED_HOST,
    database: process.env.MIGRATION_EXPECTED_DATABASE,
    role: process.env.MIGRATION_EXPECTED_ROLE,
  });
  const file = values.get("--receipt");
  if (!file || !file.endsWith(".json"))
    throw new UpgradeStopped("UPGRADE_PRIVATE_JSON_RECEIPT_REQUIRED");
  const privateDirectory = resolve(".local");
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  const receiptPath = resolve(file);
  if (
    !receiptPath.startsWith(privateDirectory + sep) ||
    (await realpath(dirname(receiptPath))) !==
      (await realpath(privateDirectory))
  )
    throw new UpgradeStopped("UPGRADE_PRIVATE_JSON_RECEIPT_REQUIRED");
  let receipt: UpgradeReceipt | undefined;
  let output: Awaited<ReturnType<typeof open>> | undefined;
  if (mode === "--inspect-populated") {
    // Reserve exclusively BEFORE connecting. Never overwrite a DB or receipt.
    output = await open(receiptPath, "wx", 0o600);
  } else {
    const body = await readFile(receiptPath, "utf8");
    if (body.length > 128 * 1024)
      throw new UpgradeStopped("UPGRADE_RECEIPT_INVALID_OR_STALE");
    receipt = JSON.parse(body) as UpgradeReceipt;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    if (mode === "--inspect-populated") {
      const inspected = await inspectPopulatedUpgrade(
        pool as unknown as PostgresPool,
        plan,
        baseline,
        target,
      );
      await output!.writeFile(JSON.stringify(inspected, null, 2) + "\n");
      console.log(
        JSON.stringify({
          mode: "populated-inspection-only",
          planDigest,
          targetDigest: inspected.targetDigest,
          ledgerEntries: inspected.ledger.length,
          pending: inspected.pending,
          receiptSaved: true,
        }),
      );
    } else {
      const result = await applyPopulatedUpgrade(
        pool as unknown as PostgresPool,
        plan,
        baseline,
        target,
        receipt!,
        {
          backupCheckpoint: values.get("--backup-checkpoint")!,
          restoreVerified,
        },
      );
      console.log(
        JSON.stringify({
          mode: result.mode,
          planDigest,
          targetDigest: result.targetDigest,
          applied: result.applied,
          pending: result.pending,
          ownerBackupRestoreAcknowledged: true,
          preservedExistingTableCounts: true,
        }),
      );
    }
  } finally {
    await output?.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Never print raw pg errors, SQL DETAIL, a connection URL or checkpoint text.
  const code =
    error instanceof UpgradeStopped ? error.code : "UPGRADE_STOPPED_FOR_REVIEW";
  console.error(
    JSON.stringify({
      code,
      outcome: "not-confirmed; inspect ledger before any retry",
    }),
  );
  process.exitCode = 1;
});
