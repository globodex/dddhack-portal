import type { PortalService } from "./service";
import { one } from "./db";
import { demand } from "./security";
import { attendancePredicate } from "./portal-status";

export type AdminStatsCollection = "participants" | "teams" | "submissions";
export type AdminStatsDTO = {
  collection: AdminStatsCollection;
  scope: "Entire collection";
  cards: {
    key: string;
    label: string;
    value: number | null;
    caption?: string;
    lowerBound?: boolean;
  }[];
  teamSizes?: { label: string; value: number }[];
  note?: string;
};

const active = (
  kind: "participant" | "team" | "project" | "submission",
  column: string,
) =>
  `NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='${kind}' AND rr.target_id=${column} AND rr.active=1)` +
  (["participant", "team"].includes(kind)
    ? ` AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions td WHERE td.kind='${kind}' AND td.target_id=${column})`
    : "");

const teamCtes = `active_teams AS (
  SELECT t.id FROM teams t WHERE ${active("team", "t.id")}
), member_states AS (
  SELECT m.team_id,count(*) total,
    COALESCE(sum(CASE WHEN r.status='approved' THEN 1 ELSE 0 END),0) approved
  FROM memberships m JOIN active_teams t ON t.id=m.team_id JOIN users u ON u.id=m.user_id
  LEFT JOIN registrations r ON r.email=u.email GROUP BY m.team_id
), team_states AS (
  SELECT t.id,COALESCE(m.total,0) total,
    CASE WHEN m.total>0 AND m.total=m.approved THEN 1 ELSE 0 END approved
  FROM active_teams t LEFT JOIN member_states m ON m.team_id=t.id
)`;
const retainedSessions = ` UNION SELECT se.auth_user_id user_id
  FROM auth_sessions se JOIN auth_users au ON au.id=se.auth_user_id
  JOIN users su ON su.id=au.id
  WHERE au.email_verified_at IS NOT NULL AND length(trim(au.email_verified_at))>0 AND lower(su.email)=au.email`;
const participantQuery = (
  includeSessions: boolean,
) => `WITH ${teamCtes}, roster AS (
    SELECT lower(trim(email)) email FROM registrations
    UNION SELECT lower(trim(email)) email FROM luma_roster
  ), participant_states AS (
    SELECT roster.email,u.id,COALESCE(r.status,'pending') approval,
      CASE WHEN COALESCE(a.reconciled_at,ra.reconciled_at) IS NOT NULL
        AND (o.updated_at IS NULL OR o.updated_at<COALESCE(a.reconciled_at,ra.reconciled_at))
        THEN 'Absent' ELSE o.status END status_override,
      CASE WHEN ${attendancePredicate("u.id")} THEN 1 ELSE 0 END attended
    FROM roster LEFT JOIN users u ON u.email=roster.email
    LEFT JOIN registrations r ON r.email=roster.email
    LEFT JOIN participant_status_overrides o ON o.user_id=u.id
    LEFT JOIN automatic_absences a ON a.user_id=u.id
    LEFT JOIN registration_absences ra ON ra.email=roster.email
    WHERE u.id IS NULL OR (${active("participant", "u.id")})
  ), effective_states AS (
    SELECT id,approval,attended,COALESCE(status_override,CASE WHEN attended=1 THEN 'Checked in'
      WHEN approval='approved' THEN 'Going' ELSE 'Registered' END) status
    FROM participant_states
  ), active_accounts AS (
    SELECT u.id FROM users u WHERE ${active("participant", "u.id")}
  ), sign_in_evidence AS (
    SELECT aa.id user_id FROM active_accounts aa JOIN audit_logs a ON a.id='auth-sign-in:'||aa.id
    WHERE a.actor_id=aa.id AND a.entity_id=aa.id
      AND a.action='auth-sign-in-evidence' AND CAST(json_extract(a.detail,'$.version') AS TEXT)='1'
      AND json_extract(a.detail,'$.evidence') IN ('session-issued','authenticated-request','retained-session')
    ${includeSessions ? retainedSessions : ""}
  )
  SELECT count(*) roster,
    (SELECT count(*) FROM active_accounts) accounts,
    (SELECT count(*) FROM active_accounts aa WHERE EXISTS(SELECT 1 FROM sign_in_evidence si WHERE si.user_id=aa.id)) signed_in,
    COALESCE(sum(CASE WHEN e.status='Going' THEN 1 ELSE 0 END),0) going,
    COALESCE(sum(CASE WHEN e.status='Checked in' AND e.attended=1 THEN 1 ELSE 0 END),0) checked_in,
    COALESCE(sum(CASE WHEN e.approval<>'approved' AND EXISTS(
      SELECT 1 FROM memberships m JOIN team_states ts ON ts.id=m.team_id
      WHERE m.user_id=e.id AND ts.approved=0) THEN 1 ELSE 0 END),0) pending
  FROM effective_states e`;
const queries = {
  participants: participantQuery(false),
  teams: `WITH ${teamCtes}
  SELECT count(*) formed,
    COALESCE(sum(CASE WHEN EXISTS(SELECT 1 FROM team_locks l WHERE l.team_id=t.id) THEN 1 ELSE 0 END),0) locked,
    COALESCE(sum(t.approved),0) approved,
    COALESCE(sum(CASE WHEN t.total=1 THEN 1 ELSE 0 END),0) size_1,
    COALESCE(sum(CASE WHEN t.total=2 THEN 1 ELSE 0 END),0) size_2,
    COALESCE(sum(CASE WHEN t.total=3 THEN 1 ELSE 0 END),0) size_3,
    COALESCE(sum(CASE WHEN t.total=4 THEN 1 ELSE 0 END),0) size_4,
    COALESCE(sum(CASE WHEN t.total=5 THEN 1 ELSE 0 END),0) size_5
  FROM team_states t`,
  submissions: `WITH active_projects AS (
    SELECT p.id,p.team_id FROM projects p JOIN teams t ON t.id=p.team_id
    WHERE ${active("team", "t.id")} AND ${active("project", "p.id")}
  ), visible_versions AS (
    SELECT v.id,v.team_id FROM submission_versions v JOIN active_projects p ON p.team_id=v.team_id
    WHERE ${active("submission", "v.id")}
  )
  SELECT (SELECT count(*) FROM active_projects) projects,
    (SELECT count(*) FROM visible_versions) versions,
    (SELECT count(*) FROM active_projects p WHERE NOT EXISTS(
      SELECT 1 FROM submission_versions v WHERE v.team_id=p.team_id
    ) AND NOT EXISTS(SELECT 1 FROM submission_attempt_ledger l WHERE l.team_id=p.team_id AND l.attempts>0)) drafts`,
} as const;

function count(value: unknown) {
  const n = Number(value);
  demand(Number.isSafeInteger(n) && n >= 0, 500, "INVALID_ADMIN_STATS");
  return n;
}

/**
 * Fresh owner/admin-only aggregate facts, independent of filters and pages.
 * Roster = the existing registrations/Luma union, including pending approvals.
 * Signed-in = active portal people (including Viewers) with an immutable successful sign-in marker or retained
 * verified session evidence. Unknown historical user rows never become fake zeroes.
 * No historical source split or profile-completeness approximation is inferred.
 * Going follows the effective individual status, including reconciled absence
 * and manual override precedence. Checked-in also requires actual attendance
 * evidence and approved registration; a stale status alone never fabricates it.
 * Removed/terminal people and teams are excluded. Team approval requires every
 * current member to have approved registration, matching existing readiness.
 * Approval and attendance are distinct: approved Absent members stay approved.
 * Empty teams fail; Pending teams is the exact complement. Pending participants
 * are only unapproved active roster members of pending teams, never teamless people.
 * Submission counts exclude removed teams/projects/versions. Visible versions
 * are not consumed attempts; this read never changes durable attempt history.
 * Drafts have neither any committed version (including hidden history) nor a
 * positive durable attempt record. Later edits of submitted projects are not drafts.
 * One aggregate result row/query is fetched after the server staff guard.
 */
export async function readAdminStats(
  s: Pick<PortalService, "staff" | "db"> &
    Partial<Pick<PortalService, "identity">>,
  collection: AdminStatsCollection,
  authorizedActor?: Awaited<ReturnType<PortalService["actor"]>>,
): Promise<AdminStatsDTO> {
  if (authorizedActor) {
    // Only the route's already verified actor is passed here, never request
    // input. Recheck current authority without repeating profile/bootstrap reads.
    demand(
      !authorizedActor.deactivated &&
        (authorizedActor.owner || authorizedActor.role === "admin"),
      403,
      "ADMIN_REQUIRED",
    );
    demand(
      await one(
        s.db,
        `SELECT u.id FROM users u LEFT JOIN portal_roles p ON p.user_id=u.id
       WHERE u.id=? AND (?=1 OR COALESCE(p.role,u.role)='admin') AND ${active("participant", "u.id")}`,
        authorizedActor.id,
        authorizedActor.owner ? 1 : 0,
      ),
      403,
      "ADMIN_REQUIRED",
    );
  } else await s.staff();
  demand(Object.hasOwn(queries, collection), 422, "INVALID_STATS_COLLECTION");
  const result = (await one<Record<string, number>>(
    s.db,
    collection === "participants"
      ? participantQuery(s.identity?.source === "neon")
      : queries[collection],
  ))!;
  const card = (key: string, label: string, value = result[key]) => ({
    key,
    label,
    value: count(value),
  });
  if (collection === "participants") {
    const confirmed = count(result.signed_in),
      unknown = count(result.accounts) - confirmed;
    demand(unknown >= 0, 500, "INVALID_ADMIN_STATS");
    return {
      collection,
      scope: "Entire collection",
      cards: [
        card("roster", "Added manually"),
        {
          key: "signed_in",
          label: "Signed-in",
          value: unknown > 0 && confirmed === 0 ? null : confirmed,
          ...(unknown > 0
            ? {
                lowerBound: confirmed > 0,
                caption: "Older sign-in evidence is incomplete",
              }
            : {}),
        },
        card("going", "Going"),
        card("checked_in", "Checked-in"),
        card("pending", "Pending"),
      ],
      ...(unknown > 0
        ? {
            note: "Signed-in counts only proven sign-ins; older account rows alone are not proof.",
          }
        : {}),
    };
  }
  if (collection === "teams")
    return {
      collection,
      scope: "Entire collection",
      cards: [
        card("formed", "Teams formed"),
        card("locked", "Locked teams"),
        card("approved", "Approved teams"),
        card(
          "pending",
          "Pending teams",
          count(result.formed) - count(result.approved),
        ),
      ],
      teamSizes: Array.from({ length: 5 }, (_, index) => ({
        label: index === 0 ? "Solo" : `${index + 1} people`,
        value: count(result[`size_${index + 1}`]),
      })),
      note: "Locked and approved counts can overlap.",
    };
  return {
    collection,
    scope: "Entire collection",
    cards: [
      card("projects", "Projects"),
      { ...card("versions", "Submissions"), caption: "Committed versions" },
      { ...card("drafts", "Drafts"), caption: "Never submitted" },
    ],
  };
}
