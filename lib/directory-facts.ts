import { rows, type Database } from "./db";
import { readiness } from "./experience-contract";
import { attendancePredicate } from "./portal-status";

// A request owns these maps. Never retain them on the service or across requests:
// approvals, attendance, overrides and removals may change before the next read.
const chunks = (ids: string[]) => {
  const unique = [...new Set(ids)];
  return Array.from({ length: Math.ceil(unique.length / 80) }, (_, i) =>
    unique.slice(i * 80, (i + 1) * 80),
  );
};
const marks = (ids: string[]) => ids.map(() => "?").join(",");
export async function teamFacts(db: Database, ids: string[], actorId?: string) {
  const result = new Map<
    string,
    {
      status: string;
      derivedStatus: string;
      manual: boolean;
      locked: boolean;
      checkedInMembers: number;
      attemptsUsed: number;
      ineligible: boolean;
      reason: string | undefined;
      lockedAt: string | undefined;
      readiness: ReturnType<typeof readiness>;
      requested: boolean;
    }
  >();
  for (const part of chunks(ids)) {
    // Aggregate each one-to-many relation separately before joining. Joining
    // members, attempts and pending actions first would multiply every count.
    const facts = await rows<{
      id: string;
      override_status: string | null;
      locked_at: string | null;
      total: number;
      approved: number;
      attended: number;
      attempts: number;
      invalid_reason: string | null;
      requested: number;
    }>(
      db,
      `WITH selected AS (SELECT id FROM teams WHERE id IN (${marks(part)})),
      members AS (SELECT m.team_id,count(*) total,
        COALESCE(sum(CASE WHEN r.status='approved' THEN 1 ELSE 0 END),0) approved,
        COALESCE(sum(CASE WHEN ${attendancePredicate("m.user_id")} THEN 1 ELSE 0 END),0) attended
        FROM memberships m JOIN selected s ON s.id=m.team_id JOIN users u ON u.id=m.user_id
        LEFT JOIN registrations r ON r.email=u.email GROUP BY m.team_id),
      attempts AS (SELECT v.team_id,count(*) n FROM submission_versions v JOIN selected s ON s.id=v.team_id GROUP BY v.team_id)
      SELECT s.id,o.status override_status,l.locked_at,
        COALESCE(m.total,0) total,COALESCE(m.approved,0) approved,
        COALESCE(m.attended,0) attended,COALESCE(v.n,0) attempts,e.reason invalid_reason,
        EXISTS(SELECT 1 FROM team_actions a WHERE a.team_id=s.id AND a.user_id=? AND a.kind='request' AND a.status='pending') requested
      FROM selected s LEFT JOIN members m ON m.team_id=s.id LEFT JOIN attempts v ON v.team_id=s.id
      LEFT JOIN team_locks l ON l.team_id=s.id LEFT JOIN team_status_overrides o ON o.team_id=s.id
      LEFT JOIN projects p ON p.team_id=s.id LEFT JOIN project_eligibility e ON e.project_id=p.id AND e.version_id=p.published_version_id AND e.status='ineligible'`,
      ...part,
      actorId || null,
    );
    for (const fact of facts) {
      const locked = fact.locked_at !== null,
        derived = fact.attempts
          ? "Submitted"
          : fact.attended
            ? "Not submitted"
            : locked
              ? "Locked"
              : "Forming";
      result.set(fact.id, {
        status: fact.override_status || derived,
        derivedStatus: derived,
        manual: fact.override_status !== null,
        locked,
        checkedInMembers: fact.attended,
        attemptsUsed: fact.attempts,
        ineligible: fact.invalid_reason !== null,
        reason: fact.invalid_reason ?? undefined,
        lockedAt: fact.locked_at ?? undefined,
        readiness: readiness(fact.total, fact.approved),
        requested: !!fact.requested,
      });
    }
  }
  return result;
}

export async function personFacts(db: Database, ids: string[]) {
  const result = new Map<
    string,
    {
      status: string;
      checkedIn: boolean;
      approval: string;
      email: string;
      deactivatedAt: string | undefined;
    }
  >();
  for (const part of chunks(ids)) {
    const facts = await rows<{
      id: string;
      approval: string;
      status: string | null;
      email: string;
      checked: number;
      deactivated_at: string | null;
    }>(
      db,
      `SELECT u.id,COALESCE(r.status,'pending') approval,
      CASE WHEN COALESCE(a.reconciled_at,ra.reconciled_at) IS NOT NULL AND
        (o.updated_at IS NULL OR o.updated_at<COALESCE(a.reconciled_at,ra.reconciled_at)) THEN 'Absent' ELSE o.status END status,
      u.email,CASE WHEN ${attendancePredicate("u.id")} THEN 1 ELSE 0 END checked,rr.updated_at deactivated_at
      FROM users u LEFT JOIN registrations r ON r.email=u.email LEFT JOIN participant_status_overrides o ON o.user_id=u.id
      LEFT JOIN automatic_absences a ON a.user_id=u.id LEFT JOIN registration_absences ra ON ra.email=u.email
      LEFT JOIN record_removals rr ON rr.kind='participant' AND rr.target_id=u.id AND rr.active=1
      WHERE u.id IN (${marks(part)})`,
      ...part,
    );
    for (const fact of facts)
      result.set(fact.id, {
        status:
          fact.status ||
          (fact.checked
            ? "Checked in"
            : fact.approval === "approved"
              ? "Going"
              : "Registered"),
        checkedIn: !!fact.checked,
        approval: fact.approval,
        email: fact.email,
        deactivatedAt: fact.deactivated_at ?? undefined,
      });
  }
  return result;
}

export async function selectedRows<T>(
  db: Database,
  ids: string[],
  sql: (marks: string) => string,
) {
  const result: T[] = [];
  for (const part of chunks(ids))
    result.push(...(await rows<T>(db, sql(marks(part)), ...part)));
  return result;
}
