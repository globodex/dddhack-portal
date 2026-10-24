import { z } from "zod";
import type { PortalService } from "./service";
import type { PortalViewOptions } from "./discover-participants";
import { one, rows, type SQL } from "./db";
import { attendancePredicate } from "./portal-status";
import { demand, requireCreditKey, unseal } from "./security";

/** Append inside the caller's existing transaction, after attendance/stock writes.
 * The existing unique constraints and history triggers are the final authority.
 * No read endpoint, timer, poll or extra request performs allocations.
 */
export async function creditAssignmentStatements(
  s: PortalService,
): Promise<SQL[]> {
  let legacy = 0;
  try {
    requireCreditKey(s.creditKey);
    legacy = 1;
  } catch {
    /* Voucher stock is keyless. */
  }
  return [
    [
      `WITH eligible AS (
      SELECT t.id type_id,u.id,lower(u.email) email,row_number() OVER(PARTITION BY t.id ORDER BY u.created_at,u.id) rn
      FROM credit_types t CROSS JOIN users u WHERE t.active=1 AND ${attendancePredicate("u.id")}
      AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.type_id=t.id AND a.user_id=u.id)
    ), stock AS (
      SELECT i.type_id,i.id,row_number() OVER(PARTITION BY i.type_id ORDER BY i.rowid) rn FROM credit_inventory i
      JOIN credit_types t ON t.id=i.type_id AND t.active=1 JOIN credit_code_history h ON h.inventory_id=i.id
      WHERE h.assigned=0 AND (i.voucher_value IS NOT NULL OR ?=1)
      AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.inventory_id=i.id)
    ) INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email)
      SELECT stock.id,stock.type_id,eligible.id,?,eligible.email FROM eligible JOIN stock ON stock.type_id=eligible.type_id AND stock.rn=eligible.rn
      WHERE 1=1 ON CONFLICT DO NOTHING`,
      legacy,
      s.now(),
    ],
  ];
}

export type CreditSummary = {
  id: string;
  name: string;
  instructions: string;
  active: number;
  total: number;
  assigned: number;
  available: number;
  waiting: number;
  inventory: number;
  exhausted: boolean;
};
export async function creditSummaries(
  s: PortalService,
): Promise<CreditSummary[]> {
  const facts = await rows<Omit<CreditSummary, "inventory" | "exhausted">>(
    s.db,
    `SELECT t.id,t.name,t.instructions,t.active,
      (SELECT count(*) FROM credit_inventory i WHERE i.type_id=t.id) total,
      (SELECT count(*) FROM credit_allocations a WHERE a.type_id=t.id) assigned,
      (SELECT count(*) FROM credit_inventory i JOIN credit_code_history h ON h.inventory_id=i.id WHERE i.type_id=t.id AND h.assigned=0 AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.inventory_id=i.id)) available,
      (SELECT count(*) FROM users u WHERE t.active=1 AND ${attendancePredicate("u.id")} AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.type_id=t.id AND a.user_id=u.id)) waiting
      FROM credit_types t ORDER BY t.name,t.id`,
  );
  return facts.map((row) => ({
    ...row,
    inventory: row.total,
    exhausted: row.available === 0,
  }));
}

export async function personalCredits(s: PortalService) {
  const actor = await s.actor();
  demand(
    !actor.deactivated,
    403,
    "PARTICIPANT_REMOVED",
    "Your participant access has been removed. Contact an organizer.",
  );
  demand(
    await one(
      s.db,
      `SELECT id FROM users WHERE id=? AND ${attendancePredicate("users.id")}`,
      actor.id,
    ),
    403,
    "CHECKIN_REQUIRED",
  );
  return {
    me: actor,
    checkedIn: true,
    credits: await personalCreditRows(s, actor),
  };
}

export async function personalCreditRows(
  s: PortalService,
  actor: { id: string; email: string },
) {
  const credits = await rows<Record<string, any>>(
    s.db,
    "SELECT t.id type_id,t.name,t.instructions,CASE WHEN a.inventory_id IS NOT NULL THEN 1 ELSE 0 END allocated,a.assigned_at assignedAt,CASE WHEN EXISTS(SELECT 1 FROM credit_inventory i JOIN credit_code_history h ON h.inventory_id=i.id WHERE i.type_id=t.id AND h.assigned=0 AND NOT EXISTS(SELECT 1 FROM credit_allocations used WHERE used.inventory_id=i.id)) THEN 0 ELSE 1 END exhausted FROM credit_types t LEFT JOIN credit_allocations a ON a.type_id=t.id AND a.user_id=? AND lower(a.recipient_email)=? WHERE t.active=1 ORDER BY t.name,t.id",
    actor.id,
    actor.email.toLowerCase(),
  );
  return credits.map((credit) => ({
    ...credit,
    exhausted: credit.exhausted === 1,
  }));
}

export async function creditStockView(
  s: PortalService,
  route: string,
  options: PortalViewOptions,
) {
  if (route === "/personal/credits") return personalCredits(s);
  const match =
    /^\/admin\/credit-stock\/([^/]+)(?:\/(assigned|available))?$/.exec(route);
  if (!match) return null;
  const me = await s.staff(),
    typeId = decodeURIComponent(match[1]),
    status = match[2] || "all";
  const summary = (await creditSummaries(s)).find((row) => row.id === typeId);
  demand(summary, 404, "CREDIT_COLUMN_NOT_FOUND");
  const page = Math.max(0, Math.min(1000, Math.floor(options.page || 0))),
    pageSize = 25,
    q = (options.search || "").trim().slice(0, 200);
  const predicate =
    "i.type_id=? AND (?='all' OR (?='assigned' AND a.inventory_id IS NOT NULL) OR (?='available' AND a.inventory_id IS NULL AND h.assigned=0)) AND (?='' OR instr(lower(COALESCE(pp.display_name,u.name,'')||' '||COALESCE(a.recipient_email,'')),lower(?))>0)";
  const args = [typeId, status, status, status, q, q];
  const from =
    "FROM credit_inventory i JOIN credit_code_history h ON h.inventory_id=i.id LEFT JOIN credit_allocations a ON a.inventory_id=i.id LEFT JOIN users u ON u.id=a.user_id LEFT JOIN participant_profiles pp ON pp.user_id=u.id";
  const totalRows = (await one<{ n: number }>(
    s.db,
    `SELECT count(*) n ${from} WHERE ${predicate}`,
    ...args,
  ))!.n;
  const items = await rows(
    s.db,
    `SELECT i.id,COALESCE(pp.display_name,u.name) person,a.recipient_email email,a.assigned_at assignedAt,'[masked]' maskedCode,CASE WHEN a.inventory_id IS NOT NULL THEN 'Assigned' ELSE 'Available' END status ${from} WHERE ${predicate} ORDER BY i.rowid LIMIT ? OFFSET ?`,
    ...args,
    pageSize,
    page * pageSize,
  );
  return {
    me,
    items,
    page,
    pageSize,
    totalRows,
    hasMore: totalRows > (page + 1) * pageSize,
    summary,
  };
}

export async function creditStockCommand(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (
    action !== "repair-credit-allocations" &&
    action !== "admin-reveal-credit"
  )
    return null;
  const actor = await s.staff();
  if (action === "repair-credit-allocations") {
    z.object({}).strict().parse(input);
    const statements = await creditAssignmentStatements(s);
    await s.mutate(actor.id, action, "credits", statements, {
      categoryCount: statements.length,
    });
    return {
      message: "Credit assignments repaired.",
      categories: await creditSummaries(s),
    };
  }
  const d = z
    .object({ inventoryId: z.string().min(1).max(200) })
    .strict()
    .parse(input);
  const stock = await one<{
    id: string;
    type_id: string;
    voucher_value: string | null;
    ciphertext: string;
  }>(
    s.db,
    "SELECT id,type_id,voucher_value,ciphertext FROM credit_inventory WHERE id=?",
    d.inventoryId,
  );
  demand(stock, 404, "CREDIT_STOCK_NOT_FOUND");
  const value =
    stock.voucher_value !== null
      ? stock.voucher_value
      : await unseal(stock.ciphertext, s.creditKey);
  const guard = "admin-credit-reveal:" + crypto.randomUUID();
  await s.mutate(
    actor.id,
    action,
    stock.id,
    [
      [
        "INSERT INTO write_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM credit_inventory WHERE id=? AND type_id=?) THEN 1 ELSE 0 END)",
        guard,
        stock.id,
        stock.type_id,
      ],
      ["DELETE FROM write_guards WHERE token=?", guard],
      [
        "UPDATE credit_code_history SET exposed=1 WHERE inventory_id=? AND exposed=0",
        stock.id,
      ],
    ],
    { inventoryId: stock.id, typeId: stock.type_id, value: "[masked]" },
  );
  return { value };
}
