import { createHash } from "node:crypto";
import type { PortalMigration } from "./migrate";

export type HistoricalEncoding = "canonical-lf" | "legacy-windows-crlf";
type LedgerEntry = Pick<PortalMigration, "name" | "checksum">;

// Exact historical Windows bytes, proved from the published canonical LF SQL.
// This is not an extensible checksum allowlist or a migration-ledger repair.
const windowsHistorical = [
  [
    "0000_compatibility.sql",
    "22db8c707ddc39ecd16115f8bff30167ff0829a87128302eb9b2334853220932",
  ],
  [
    "0001_portal.sql",
    "c2588cec29a4b754f4b6a63bd0e6b9673e4fc41a3ff3039b590b72c70be40820",
  ],
  [
    "0002_invariants.sql",
    "01806e47a4b58dd37d39f320180259757c976a98b8b26d696252b566d45f4a70",
  ],
  [
    "0003_transaction_safety.sql",
    "7ad7e333e068ef0e1f09bdea1122d5fbcd61c416dd388cfe98d7977fa67f310d",
  ],
  [
    "0004_media_uploads.sql",
    "b4448e94e981049727b64062545f636f6fb5bfa6dcb52fafd01e89a9c55ff365",
  ],
  [
    "0100_auth.sql",
    "3e8a6135c6f634a7722b290961d1a38db27396a70ee92c07bc7f8bd36e47dc47",
  ],
  [
    "0101_approved_evaluation.sql",
    "114234eb2c484a278a110890f1c0eb87336d100774d35ae85585a399023a9e5a",
  ],
] as const;

/** Call after canonical verifyUpgradePlan. Accept one complete historical
 * encoding only, with an ordered canonical feature suffix. The derived CRLF
 * entries describe already-recorded migrations so the strict runner skips them.
 * No historical SQL is re-applied and no recorded checksum is rewritten.
 */
export function historicalLedgerCompatibility(
  plan: readonly PortalMigration[],
  ledger: readonly LedgerEntry[],
): {
  historicalEncoding: HistoricalEncoding;
  migrations: PortalMigration[];
} | null {
  if (
    plan.length !== 15 ||
    ledger.length < 7 ||
    ledger.length > 15 ||
    plan[7]?.name !== "0102_credit_stock.sql" ||
    plan[8]?.name !== "0103_project_media_limits.sql" ||
    plan[9]?.name !== "0104_admin_team_corrections.sql" ||
    plan[10]?.name !== "0105_terminal_record_deletion.sql" ||
    plan[11]?.name !== "0106_admin_team_unlock.sql" ||
    plan[12]?.name !== "0107_admin_team_lock.sql" ||
    plan[13]?.name !== "0108_admin_testing_and_team_corrections.sql" ||
    plan[14]?.name !== "0109_owner_ai_model_usage.sql" ||
    ledger.some((entry, i) => entry.name !== plan[i]?.name)
  )
    return null;
  const legacy = plan.slice();
  for (const [i, [name, checksum]] of windowsHistorical.entries()) {
    const canonical = plan[i];
    if (canonical.name !== name || canonical.sql.includes("\r")) return null;
    const sql = canonical.sql.replaceAll("\n", "\r\n");
    if (createHash("sha256").update(sql).digest("hex") !== checksum)
      return null;
    legacy[i] = { name, sql, checksum };
  }
  // Features never receive aliases, including on a fully-upgraded repeat.
  if (
    ledger.slice(7).some((entry, i) => entry.checksum !== plan[i + 7].checksum)
  )
    return null;
  const historical = ledger.slice(0, 7);
  const canonical = historical.every(
    (entry, i) => entry.checksum === plan[i].checksum,
  );
  const windows = historical.every(
    (entry, i) => entry.checksum === legacy[i].checksum,
  );
  if (!canonical && !windows) return null;
  return {
    historicalEncoding: canonical ? "canonical-lf" : "legacy-windows-crlf",
    migrations: canonical ? plan.slice() : legacy,
  };
}
