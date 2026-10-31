import { createHash } from "node:crypto";
import type { PostgresConnection, PostgresPool } from "./adapter";
import { applyPortalMigrations, type PortalMigration } from "./migrate";
import {
  historicalLedgerCompatibility,
  type HistoricalEncoding,
} from "./historical-ledger-compatibility";

type LedgerEntry = { name: string; checksum: string };
export type UpgradeBaseline = {
  historical: LedgerEntry[];
  pendingFeatureMigrations: LedgerEntry[];
};
export type UpgradeTarget = {
  host: string;
  port: string;
  database: string;
  role: string;
};
export type UpgradeReceipt = {
  format: "portal-populated-upgrade-v1";
  createdAt: string;
  planDigest: string;
  targetDigest: string;
  ledger: LedgerEntry[];
  pending: string[];
  counts: Record<string, string>;
  historicalEncoding?: HistoricalEncoding;
};

export class UpgradeStopped extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function stop(code: string): never {
  throw new UpgradeStopped(code);
}
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const entries = (plan: readonly PortalMigration[]) =>
  plan.map(({ name, checksum }) => ({ name, checksum }));
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

export function verifyUpgradePlan(
  plan: readonly PortalMigration[],
  baseline: UpgradeBaseline,
) {
  const approved = [
    ...baseline.historical,
    ...baseline.pendingFeatureMigrations,
  ];
  if (
    baseline.historical.length !== 7 ||
    !same(
      baseline.pendingFeatureMigrations.map((entry) => entry.name),
      [
        "0102_credit_stock.sql",
        "0103_project_media_limits.sql",
        "0104_admin_team_corrections.sql",
        "0105_terminal_record_deletion.sql",
        "0106_admin_team_unlock.sql",
        "0107_admin_team_lock.sql",
        "0108_admin_testing_and_team_corrections.sql",
        "0109_owner_ai_model_usage.sql",
        "0110_admin_submission_access.sql",
        "0111_admin_missing_team_idea.sql",
      ],
    ) ||
    !same(entries(plan), approved) ||
    plan.some(
      (migration) =>
        createHash("sha256").update(migration.sql).digest("hex") !==
        migration.checksum,
    )
  )
    stop("UPGRADE_SOURCE_PLAN_MISMATCH");
  return digest(approved);
}

// The private expectations are operator inputs, never printed by this module.
// Reject libpq query parameters that could override a reviewed URL identity.
export function verifyUpgradeTarget(
  connectionString: string | undefined,
  expected: { host?: string; database?: string; role?: string },
): UpgradeTarget {
  if (
    !connectionString ||
    !expected.host ||
    !expected.database ||
    !expected.role
  )
    stop("UPGRADE_TARGET_INPUT_REQUIRED");
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return stop("UPGRADE_DATABASE_URL_INVALID");
  }
  const overrides = [...url.searchParams.keys()].some(
    (key) => !["sslmode", "channel_binding"].includes(key),
  );
  let database: string, role: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    role = decodeURIComponent(url.username);
  } catch {
    return stop("UPGRADE_DATABASE_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hash ||
    overrides ||
    /-pooler\./i.test(url.hostname) ||
    url.hostname !== expected.host ||
    database !== expected.database ||
    role !== expected.role ||
    !database ||
    /[\x00-\x1f\x7f]/.test(`${database}${role}${url.hostname}`)
  )
    stop("UPGRADE_TARGET_MISMATCH");
  return { host: url.hostname, port: url.port || "5432", database, role };
}

async function readState(
  connection: PostgresConnection,
  target: UpgradeTarget,
  plan: readonly PortalMigration[],
  baseline: UpgradeBaseline,
): Promise<
  Pick<UpgradeReceipt, "ledger" | "pending" | "counts"> & {
    historicalEncoding: HistoricalEncoding;
  }
> {
  const identity = (
    await connection.query(
      "SELECT current_database() AS database, current_user AS role",
    )
  ).rows[0];
  if (identity?.database !== target.database || identity?.role !== target.role)
    stop("UPGRADE_CONNECTED_IDENTITY_MISMATCH");
  const exists = await connection.query(
    "SELECT to_regclass('public.portal_schema_migrations') AS ledger",
  );
  if (!exists.rows[0]?.ledger) stop("UPGRADE_HISTORICAL_LEDGER_REQUIRED");
  const ledger = (
    await connection.query(
      "SELECT name,checksum FROM public.portal_schema_migrations ORDER BY name",
    )
  ).rows.map((row) => ({
    name: String(row.name),
    checksum: String(row.checksum),
  }));
  const compatibility = historicalLedgerCompatibility(plan, ledger);
  const recorded = new Map(ledger.map((entry) => [entry.name, entry.checksum]));
  if (!compatibility) stop("UPGRADE_HISTORICAL_LEDGER_MISMATCH");
  const pending = plan
    .filter((entry) => !recorded.has(entry.name))
    .map((entry) => entry.name);
  if (
    pending.some(
      (name) =>
        !baseline.pendingFeatureMigrations.some((entry) => entry.name === name),
    )
  )
    stop("UPGRADE_UNEXPECTED_PENDING_MIGRATION");
  const tables = (
    await connection.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
    )
  ).rows.map((row) => String(row.table_name));
  const counts: Record<string, string> = {};
  for (const table of tables) {
    if (table === "portal_schema_migrations") continue;
    const quoted = `"${table.replaceAll('"', '""')}"`;
    const result = await connection.query(
      `SELECT count(*)::text AS count FROM public.${quoted}`,
    );
    const count = String(result.rows[0]?.count);
    if (!/^\d+$/.test(count)) stop("UPGRADE_COUNT_INVALID");
    counts[table] = count;
  }
  return {
    ledger,
    pending,
    counts,
    historicalEncoding: compatibility.historicalEncoding,
  };
}

export async function inspectPopulatedUpgrade(
  pool: PostgresPool,
  plan: PortalMigration[],
  baseline: UpgradeBaseline,
  target: UpgradeTarget,
  now = new Date(),
): Promise<UpgradeReceipt> {
  const planDigest = verifyUpgradePlan(plan, baseline);
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await connection.query("SET LOCAL statement_timeout = '60s'");
    const state = await readState(connection, target, plan, baseline);
    await connection.query("COMMIT");
    return {
      format: "portal-populated-upgrade-v1",
      createdAt: now.toISOString(),
      planDigest,
      targetDigest: digest(target),
      ...state,
    };
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch {
      /* preserve original */
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function applyPopulatedUpgrade(
  pool: PostgresPool,
  plan: PortalMigration[],
  baseline: UpgradeBaseline,
  target: UpgradeTarget,
  receipt: UpgradeReceipt,
  confirmation: { backupCheckpoint: string; restoreVerified: boolean },
  now = new Date(),
) {
  const planDigest = verifyUpgradePlan(plan, baseline);
  if (
    !confirmation.restoreVerified ||
    !confirmation.backupCheckpoint.trim() ||
    confirmation.backupCheckpoint.length > 500 ||
    /[\x00-\x1f\x7f]/.test(confirmation.backupCheckpoint)
  )
    stop("UPGRADE_VERIFIED_RESTORE_CHECKPOINT_REQUIRED");
  if (!receipt || typeof receipt !== "object")
    stop("UPGRADE_RECEIPT_INVALID_OR_STALE");
  const age = now.getTime() - Date.parse(receipt.createdAt);
  if (
    receipt.format !== "portal-populated-upgrade-v1" ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 24 * 60 * 60 * 1000 ||
    receipt.planDigest !== planDigest ||
    receipt.targetDigest !== digest(target)
  )
    stop("UPGRADE_RECEIPT_INVALID_OR_STALE");
  if (
    !Array.isArray(receipt.ledger) ||
    receipt.ledger.some(
      (entry) =>
        !entry ||
        typeof entry.name !== "string" ||
        typeof entry.checksum !== "string",
    )
  )
    stop("UPGRADE_RECEIPT_INVALID_OR_STALE");
  const compatibility = historicalLedgerCompatibility(plan, receipt.ledger);
  if (
    !compatibility ||
    (receipt.historicalEncoding !== undefined &&
      receipt.historicalEncoding !== compatibility.historicalEncoding)
  )
    stop("UPGRADE_RECEIPT_INVALID_OR_STALE");
  let after: Awaited<ReturnType<typeof readState>> | undefined;
  const applied = await applyPortalMigrations(pool, compatibility.migrations, {
    lockTimeoutMilliseconds: 15000,
    statementTimeoutMilliseconds: 120000,
    async beforeApply(connection) {
      await connection.query("SET LOCAL search_path = public");
      const current = await readState(connection, target, plan, baseline);
      if (
        !same(current, {
          ledger: receipt.ledger,
          pending: receipt.pending,
          counts: receipt.counts,
          historicalEncoding: compatibility.historicalEncoding,
        })
      )
        stop("UPGRADE_DATABASE_CHANGED_SINCE_INSPECTION");
    },
    async afterApply(connection, names) {
      if (!same(names, receipt.pending)) stop("UPGRADE_APPLIED_SET_MISMATCH");
      after = await readState(connection, target, plan, baseline);
      if (
        after.pending.length ||
        Object.entries(receipt.counts).some(
          ([name, count]) => after!.counts[name] !== count,
        )
      )
        stop("UPGRADE_POST_VALIDATION_FAILED");
      // 0102 backfills only new tables. It must not allocate, delete or recycle.
      if (
        names.includes("0102_credit_stock.sql") &&
        (after.counts.credit_category_keys !== receipt.counts.credit_types ||
          after.counts.credit_code_history !==
            receipt.counts.credit_inventory ||
          after.counts.credit_stock_imports !== "0")
      )
        stop("UPGRADE_STOCK_BACKFILL_MISMATCH");
      if (names.includes("0105_terminal_record_deletion.sql")) {
        const mismatch = await connection.query(
          "SELECT count(*)::text AS count FROM (SELECT team_id,MAX(attempt) AS attempts FROM submission_versions GROUP BY team_id) versions FULL JOIN submission_attempt_ledger attempts ON attempts.team_id=versions.team_id WHERE versions.team_id IS NULL OR attempts.team_id IS NULL OR attempts.attempts<>versions.attempts",
        );
        if (
          after.counts.terminal_record_deletions !== "0" ||
          String(mismatch.rows[0]?.count) !== "0"
        )
          stop("UPGRADE_ATTEMPT_BACKFILL_MISMATCH");
      }
    },
  });
  return {
    mode: "populated-upgrade-complete" as const,
    applied,
    planDigest,
    targetDigest: digest(target),
    ownerBackupRestoreAcknowledged: true,
    ...after!,
  };
}
