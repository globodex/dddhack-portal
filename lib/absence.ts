import type { PortalService } from "./service";
import { rows, type SQL, batch } from "./db";
// Sites has no verified durable clock runner. Reconcile lazily on authenticated requests.
export const absenceCutoff = "2026-11-01T18:30:00.000Z";
export async function reconcileAbsences(
  s: PortalService,
  requestActorId: string,
) {
  if (s.now() < absenceCutoff) return;
  const predicate = `r.status='approved' AND COALESCE(o.status,'Going')='Going' AND NOT EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM manual_checkins c WHERE c.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM automatic_absences a WHERE a.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=u.id AND rr.active=1)`;
  const candidates = await rows<{ id: string }>(
    s.db,
    `SELECT u.id FROM users u JOIN registrations r ON r.email=u.email LEFT JOIN participant_status_overrides o ON o.user_id=u.id WHERE ${predicate}`,
  );
  for (const candidate of candidates) {
    const sql: SQL[] = [
      [
        `INSERT INTO automatic_absences SELECT u.id,?,? FROM users u JOIN registrations r ON r.email=u.email LEFT JOIN participant_status_overrides o ON o.user_id=u.id WHERE u.id=? AND ${predicate} ON CONFLICT DO NOTHING`,
        s.now(),
        absenceCutoff,
        candidate.id,
      ],
      [
        "INSERT INTO audit_logs SELECT ?,?,'automatic-absence',?,?,?,? WHERE changes()=1",
        crypto.randomUUID(),
        requestActorId,
        candidate.id,
        JSON.stringify({
          cutoff: absenceCutoff,
          mechanism: "request-time-reconciliation",
          previous: "Going",
          next: "Absent",
        }),
        "Going attendee never checked in before the event ended.",
        s.now(),
      ],
    ];
    await batch(s.db, sql);
  }
}
