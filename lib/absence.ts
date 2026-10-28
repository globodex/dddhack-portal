import type { PortalService } from "./service";
import { rows, type SQL, batch } from "./db";
// Sites has no verified durable clock runner. Reconcile lazily on authenticated requests.
export const absenceCutoff = "2026-11-01T18:30:00.000Z";
export async function reconcileAbsences(
  s: PortalService,
  requestActorId: string,
) {
  if (s.now() < absenceCutoff) return;
  const missing = await rows<{ email: string }>(
    s.db,
    "SELECT r.email FROM registrations r WHERE r.status='approved' AND NOT EXISTS(SELECT 1 FROM users u WHERE u.email=r.email) AND NOT EXISTS(SELECT 1 FROM registration_absences a WHERE a.email=r.email)",
  );
  for (const row of missing)
    await batch(s.db, [
      [
        "INSERT INTO registration_absences SELECT r.email,?,? FROM registrations r WHERE r.email=? AND r.status='approved' AND NOT EXISTS(SELECT 1 FROM users u WHERE u.email=r.email) ON CONFLICT DO NOTHING",
        s.now(),
        absenceCutoff,
        row.email,
      ],
      [
        "INSERT INTO audit_logs SELECT ?,?,'automatic-absence',?,?,?,? WHERE EXISTS(SELECT 1 FROM registration_absences WHERE email=? AND cutoff=?) ON CONFLICT(id) DO NOTHING",
        "automatic-absence:registration:" + row.email + ":" + absenceCutoff,
        requestActorId,
        "registration:" + row.email,
        JSON.stringify({
          cutoff: absenceCutoff,
          mechanism: "request-time-reconciliation",
          previous: "Going",
          next: "Absent",
          neverSignedIn: true,
        }),
        "Going registrant never checked in before the event ended.",
        s.now(),
        row.email,
        absenceCutoff,
      ],
    ]);
  const predicate = `r.status='approved' AND COALESCE(o.status,'Going')='Going' AND NOT EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM manual_checkins c WHERE c.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM registration_absences ra WHERE ra.email=u.email) AND NOT EXISTS(SELECT 1 FROM automatic_absences a WHERE a.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=u.id AND rr.active=1)`;
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
        "INSERT INTO audit_logs SELECT ?,?,'automatic-absence',?,?,?,? WHERE EXISTS(SELECT 1 FROM automatic_absences WHERE user_id=? AND cutoff=?) ON CONFLICT(id) DO NOTHING",
        "automatic-absence:participant:" + candidate.id + ":" + absenceCutoff,
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
        candidate.id,
        absenceCutoff,
      ],
    ];
    await batch(s.db, sql);
  }
}
