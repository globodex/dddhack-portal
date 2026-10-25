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

const queries = {
  participants: `WITH roster AS (
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
    SELECT id,attended,COALESCE(status_override,CASE WHEN attended=1 THEN 'Checked in'
      WHEN approval='approved' THEN 'Going' ELSE 'Registered' END) status
    FROM participant_states
  )
  SELECT count(*) roster,
    COALESCE(sum(CASE WHEN id IS NOT NULL THEN 1 ELSE 0 END),0) accounts,
    COALESCE(sum(CASE WHEN status='Going' THEN 1 ELSE 0 END),0) going,
    COALESCE(sum(CASE WHEN status='Checked in' AND attended=1 THEN 1 ELSE 0 END),0) checked_in
  FROM effective_states`,
  teams: `WITH active_teams AS (
    SELECT t.id FROM teams t WHERE ${active("team", "t.id")}
  ), member_states AS (
    SELECT m.team_id,count(*) total,
      COALESCE(sum(CASE WHEN r.status='approved' AND ${active("participant", "u.id")}
        AND COALESCE(CASE WHEN COALESCE(a.reconciled_at,ra.reconciled_at) IS NOT NULL
          AND (o.updated_at IS NULL OR o.updated_at<COALESCE(a.reconciled_at,ra.reconciled_at))
          THEN 'Absent' ELSE o.status END,'Going') IN ('Going','Checked in') THEN 1 ELSE 0 END),0) approved
    FROM memberships m JOIN active_teams t ON t.id=m.team_id JOIN users u ON u.id=m.user_id
    LEFT JOIN registrations r ON r.email=u.email
    LEFT JOIN participant_status_overrides o ON o.user_id=u.id
    LEFT JOIN automatic_absences a ON a.user_id=u.id
    LEFT JOIN registration_absences ra ON ra.email=u.email
    GROUP BY m.team_id
  )
  SELECT count(*) formed,
    COALESCE(sum(CASE WHEN EXISTS(SELECT 1 FROM team_locks l WHERE l.team_id=t.id) THEN 1 ELSE 0 END),0) locked,
    COALESCE(sum(CASE WHEN m.total>0 AND m.total=m.approved THEN 1 ELSE 0 END),0) approved,
    COALESCE(sum(CASE WHEN m.total=1 THEN 1 ELSE 0 END),0) size_1,
    COALESCE(sum(CASE WHEN m.total=2 THEN 1 ELSE 0 END),0) size_2,
    COALESCE(sum(CASE WHEN m.total=3 THEN 1 ELSE 0 END),0) size_3,
    COALESCE(sum(CASE WHEN m.total=4 THEN 1 ELSE 0 END),0) size_4,
    COALESCE(sum(CASE WHEN m.total=5 THEN 1 ELSE 0 END),0) size_5
  FROM active_teams t LEFT JOIN member_states m ON m.team_id=t.id`,
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
 * Portal accounts = roster emails with a users record, not an auth/session claim.
 * No historical source split or profile-completeness approximation is inferred.
 * Going follows the effective individual status, including reconciled absence
 * and manual override precedence. Checked-in also requires actual attendance
 * evidence and approved registration; a stale status alone never fabricates it.
 * Removed/terminal people and teams are excluded. Team approval requires every
 * current member to have approved registration and effective Going/Checked in
 * status; empty teams fail. Locks and approvals are independent, overlapping sets.
 * Submission counts exclude removed teams/projects/versions. Visible versions
 * are not consumed attempts; this read never changes durable attempt history.
 * Drafts have neither any committed version (including hidden history) nor a
 * positive durable attempt record. Later edits of submitted projects are not drafts.
 * One aggregate result row/query is fetched after the server staff guard.
 */
export async function readAdminStats(
  s: Pick<PortalService, "staff" | "db">,
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
    queries[collection],
  ))!;
  const card = (key: string, label: string, value = result[key]) => ({
    key,
    label,
    value: count(value),
  });
  if (collection === "participants")
    return {
      collection,
      scope: "Entire collection",
      cards: [
        card("roster", "On roster"),
        card("accounts", "Portal accounts"),
        card(
          "without_account",
          "No portal account",
          count(result.roster) - count(result.accounts),
        ),
        card("going", "Going"),
        card("checked_in", "Checked-in"),
      ],
    };
  if (collection === "teams")
    return {
      collection,
      scope: "Entire collection",
      cards: [
        card("formed", "Teams formed"),
        card("locked", "Locked teams"),
        card("approved", "Approved teams"),
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
