import { attendancePredicate } from "./portal-status";

/** Exact override/absence precedence used by personFacts; aliases are internal. */
export function attendanceOverrideSQL(
  override: string,
  automatic: string,
  roster: string,
) {
  return `CASE WHEN COALESCE(${automatic}.reconciled_at,${roster}.reconciled_at) IS NOT NULL AND
    (${override}.updated_at IS NULL OR ${override}.updated_at<COALESCE(${automatic}.reconciled_at,${roster}.reconciled_at))
    THEN 'Absent' ELSE ${override}.status END`;
}
export function memberStatusSQL(id: string) {
  return `(SELECT COALESCE(${attendanceOverrideSQL("ps_o", "ps_a", "ps_ra")},
    CASE WHEN ${attendancePredicate("ps_u.id")} THEN 'Checked in' WHEN ps_r.status='approved' THEN 'Going' ELSE 'Registered' END)
    FROM users ps_u LEFT JOIN registrations ps_r ON ps_r.email=ps_u.email
    LEFT JOIN participant_status_overrides ps_o ON ps_o.user_id=ps_u.id
    LEFT JOIN automatic_absences ps_a ON ps_a.user_id=ps_u.id
    LEFT JOIN registration_absences ps_ra ON ps_ra.email=ps_u.email WHERE ps_u.id=${id})`;
}
/** SQL equivalent of teamFacts/teamLifecycle, including existing display overrides. */
export function teamStatusSQL(id: string, windowOpened: boolean) {
  return `CASE WHEN EXISTS(SELECT 1 FROM submission_versions ts_v WHERE ts_v.team_id=${id}) THEN 'Submitted'
    WHEN NOT EXISTS(SELECT 1 FROM team_locks ts_l WHERE ts_l.team_id=${id}) THEN 'Forming'
    WHEN EXISTS(SELECT 1 FROM memberships ts_m WHERE ts_m.team_id=${id})
      AND NOT EXISTS(SELECT 1 FROM memberships ts_m JOIN users ts_u ON ts_u.id=ts_m.user_id
        LEFT JOIN registrations ts_r ON ts_r.email=ts_u.email WHERE ts_m.team_id=${id} AND COALESCE(ts_r.status,'pending')<>'approved')
      THEN '${windowOpened ? "Yet to submit" : "Approved"}'
    ELSE COALESCE((SELECT ts_o.status FROM team_status_overrides ts_o WHERE ts_o.team_id=${id} AND ts_o.status NOT IN ('Approved','Yet to submit')),'Locked') END`;
}
