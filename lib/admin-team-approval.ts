import { z } from "zod";
import type { PortalService } from "./service";
import type { PortalViewOptions } from "./discover-participants";
import { one, rows, batch, assertPreviousWrite, type SQL } from "./db";
import { attendancePredicate } from "./portal-status";
import { registeredEmailPredicate } from "./roster";
import { demand, PortalError, sha256 } from "./security";

type Member = {
  id: string;
  name: string;
  email: string;
  githubUrl: string | null;
  linkedinUrl: string | null;
  profession: string | null;
  gender: string | null;
  genderLabel: string | null;
  role: "leader" | "member";
  portalRole: string;
  status: string;
  approval: string;
  checkedIn: boolean;
  attendanceRecorded: boolean;
  willBecomeGoing: boolean;
  approvalIssue: string | null;
  removed: boolean;
};
type Team = {
  id: string;
  name: string;
  leaderId: string;
  locked: boolean;
  lockedAt: string | null;
};
type Idea = {
  title: string;
  description: string;
  hash: string;
  revisionId: string | null;
  updatedAt: string;
};
export type AdminTeamApprovalDTO = {
  team: Team;
  idea: Idea | null;
  members: Member[];
  snapshotDigest: string;
  canApprove: boolean;
  blockedReason: string | null;
};
type Raw = Record<string, string | null>;
const active = (kind: "participant" | "team", column: string) =>
  `NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='${kind}' AND rr.target_id=${column} AND rr.active=1)
   AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions td WHERE td.kind='${kind}' AND td.target_id=${column})`;
const teamColumns =
  "t.id,t.name,t.leader_id,t.bio,t.created_at,l.locked_by,l.locked_at";
const teamFrom = `FROM teams t LEFT JOIN team_locks l ON l.team_id=t.id WHERE t.id=? AND ${active("team", "t.id")}`;
const memberColumns = `m.user_id,m.team_id,m.joined_at,u.name,u.email,u.role,pr.role,pp.display_name,
 p.socials,p.gender,pd.best_description,r.status,ps.status,ps.updated_at,a.reconciled_at,ra.reconciled_at,
 c.actor_id,c.created_at,mc.actor_id,mc.created_at,
 CASE WHEN ${registeredEmailPredicate("u.email")} THEN '1' ELSE '0' END,
 CASE WHEN ${active("participant", "u.id")} THEN '0' ELSE '1' END`;
const memberFrom = `FROM memberships m JOIN users u ON u.id=m.user_id
 LEFT JOIN portal_roles pr ON pr.user_id=u.id LEFT JOIN participant_profiles pp ON pp.user_id=u.id
 LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN profile_details pd ON pd.user_id=u.id
 LEFT JOIN registrations r ON r.email=u.email LEFT JOIN participant_status_overrides ps ON ps.user_id=u.id
 LEFT JOIN automatic_absences a ON a.user_id=u.id LEFT JOIN registration_absences ra ON ra.email=u.email
 LEFT JOIN check_ins c ON c.user_id=u.id
 LEFT JOIN manual_checkins mc ON mc.user_id=u.id AND mc.verified_email=lower(u.email)
 WHERE m.team_id=?`;
const revision =
  "(SELECT ir.id FROM idea_revisions ir WHERE ir.team_id=i.team_id ORDER BY ir.created_at DESC,ir.id DESC LIMIT 1)";
const ideaColumns = `i.title,i.description,i.hash,i.updated_at,${revision}`;
const ideaFrom = "FROM ideas i WHERE i.team_id=?";
const optional = (value: string | null | undefined) => value?.trim() || null;
const genderLabels: Record<string, string> = {
  man: "Male",
  woman: "Female",
  "non-binary": "Non-binary",
  "self-described": "Self-described",
  "prefer-not-to-say": "Prefer not to say",
};
function socialLinks(saved: string | null) {
  const result: { githubUrl: string | null; linkedinUrl: string | null } = {
    githubUrl: null,
    linkedinUrl: null,
  };
  let values: unknown;
  try {
    values = JSON.parse(saved || "[]");
  } catch {
    return result;
  }
  if (!Array.isArray(values)) return result;
  for (const value of values) {
    if (typeof value !== "string" || value.length > 2048) continue;
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash
      )
        continue;
      if (
        (url.hostname === "github.com" || url.hostname === "www.github.com") &&
        /^\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/?$/.test(url.pathname)
      )
        result.githubUrl ||= url.href;
      if (
        (url.hostname === "linkedin.com" ||
          url.hostname === "www.linkedin.com") &&
        /^\/in\/[A-Za-z0-9_%.-]+\/?$/.test(url.pathname)
      )
        result.linkedinUrl ||= url.href;
    } catch {
      /* An invalid saved URL never becomes an actionable link. */
    }
  }
  return result;
}
const digest = (
  snapshot: Pick<AdminTeamApprovalDTO, "team" | "idea" | "members">,
) => sha256(JSON.stringify(snapshot));

async function snapshot(s: PortalService, teamId: string) {
  const teamRow = await one<Raw>(
    s.db,
    `SELECT t.id,t.name,t.leader_id,l.locked_at,json_array(${teamColumns}) snapshot ${teamFrom}`,
    teamId,
  );
  demand(teamRow, 404, "TEAM_NOT_FOUND");
  const memberRows = await rows<Raw>(
    s.db,
    `SELECT u.id,COALESCE(NULLIF(pp.display_name,''),u.name) name,u.email,
    COALESCE(pr.role,u.role) portal_role,p.socials,p.gender,pd.best_description profession,COALESCE(r.status,'pending') approval,
    CASE WHEN COALESCE(a.reconciled_at,ra.reconciled_at) IS NOT NULL
      AND (ps.updated_at IS NULL OR ps.updated_at<COALESCE(a.reconciled_at,ra.reconciled_at)) THEN 'Absent' ELSE ps.status END status_override,
    CASE WHEN ${attendancePredicate("u.id")} THEN '1' ELSE '0' END checked,
    CASE WHEN c.user_id IS NOT NULL OR mc.user_id IS NOT NULL THEN '1' ELSE '0' END recorded,
    CASE WHEN ${registeredEmailPredicate("u.email")} THEN '1' ELSE '0' END registered,
    CASE WHEN ${active("participant", "u.id")} THEN '0' ELSE '1' END removed,
    json_array(${memberColumns}) snapshot ${memberFrom} ORDER BY u.id LIMIT 6`,
    teamId,
  );
  const ideaRow = await one<Raw>(
    s.db,
    `SELECT i.title,i.description,i.hash,i.updated_at,${revision} revision_id,json_array(${ideaColumns}) snapshot ${ideaFrom}`,
    teamId,
  );
  const frozen = !!(await one(s.db, "SELECT id FROM result_snapshots LIMIT 1"));
  const team: Team = {
    id: teamRow.id!,
    name: teamRow.name!,
    leaderId: teamRow.leader_id!,
    locked: !!teamRow.locked_at,
    lockedAt: teamRow.locked_at,
  };
  const idea: Idea | null = ideaRow
    ? {
        title: ideaRow.title!,
        description: ideaRow.description!,
        hash: ideaRow.hash!,
        revisionId: ideaRow.revision_id,
        updatedAt: ideaRow.updated_at!,
      }
    : null;
  const members: Member[] = memberRows.map((row) => {
    const status =
      row.status_override ||
      (row.checked === "1"
        ? "Checked in"
        : row.approval === "approved"
          ? "Going"
          : "Registered");
    const gender =
      row.gender && Object.hasOwn(genderLabels, row.gender) ? row.gender : null;
    return {
      id: row.id!,
      name: row.name!,
      email: row.email!,
      ...socialLinks(row.socials),
      profession: optional(row.profession),
      gender,
      genderLabel: gender ? genderLabels[gender] : null,
      role: row.id === team.leaderId ? "leader" : "member",
      portalRole: row.portal_role!,
      status,
      approval: row.approval!,
      checkedIn: status === "Checked in" && row.checked === "1",
      attendanceRecorded: row.recorded === "1",
      willBecomeGoing: status === "Registered",
      approvalIssue:
        status !== "Registered" && row.approval !== "approved"
          ? "This existing status has unresolved registration approval. Correct the individual participant first."
          : status === "Checked in" && row.recorded !== "1"
            ? "This checked-in status has no attendance record. Correct the individual participant first."
            : null,
      removed: row.removed === "1",
    };
  });
  const blocker = frozen
    ? { code: "RESULTS_FROZEN", message: "Final results are frozen." }
    : !team.locked
      ? {
          code: "TEAM_LOCK_REQUIRED",
          message: "Lock this team before approving it.",
        }
      : !members.length || members.length > 5
        ? {
            code: "TEAM_MEMBERS_INVALID",
            message: "A team must have between one and five current members.",
          }
        : !members.some((member) => member.id === team.leaderId)
          ? {
              code: "TEAM_LEADER_CHANGED",
              message: "The team leader must be a current member.",
            }
          : members.some((member) => member.removed)
            ? {
                code: "PARTICIPANT_REMOVED",
                message:
                  "Restore removed participants before approving this team.",
              }
            : memberRows.some((member) => member.registered !== "1")
              ? {
                  code: "REGISTERED_ACCOUNT_REQUIRED",
                  message:
                    "Every member must be on the registration roster before team approval.",
                }
              : members.some(
                    (member) =>
                      member.status !== "Registered" &&
                      member.approval !== "approved",
                  )
                ? {
                    code: "TEAM_APPROVAL_INCONSISTENT",
                    message:
                      "A non-Registered member has unresolved approval. Correct that participant before approving this team.",
                  }
                : members.some(
                      (member) =>
                        member.status === "Checked in" &&
                        !member.attendanceRecorded,
                    )
                  ? {
                      code: "TEAM_CHECKIN_INCONSISTENT",
                      message:
                        "A checked-in status has no attendance record. Correct that participant before approving this team.",
                    }
                  : null;
  return {
    teamRow,
    memberRows,
    ideaRow,
    blocker,
    dto: {
      team,
      idea,
      members,
      snapshotDigest: await digest({ team, idea, members }),
      canApprove: !blocker,
      blockedReason: blocker?.message || null,
    } satisfies AdminTeamApprovalDTO,
  };
}

export async function adminTeamApprovalView(
  s: PortalService,
  path: string,
  options: PortalViewOptions,
) {
  if (path !== "/admin/team-approval") return null;
  const me = await s.staff();
  const teamId = z.string().trim().min(1).max(200).parse(options.focus);
  return { me, ...(await snapshot(s, teamId)).dto };
}

function guard(condition: string, args: unknown[]): SQL[] {
  const token = "team-approval-snapshot:" + crypto.randomUUID();
  return [
    [
      `INSERT INTO write_guards VALUES(?,CASE WHEN ${condition} THEN 1 ELSE 0 END)`,
      token,
      ...args,
    ],
    ["DELETE FROM write_guards WHERE token=?", token],
  ];
}
function guards(
  state: Awaited<ReturnType<typeof snapshot>>,
  actor: Awaited<ReturnType<PortalService["staff"]>>,
  lockMembers: boolean,
): SQL[] {
  const teamId = state.dto.team.id;
  return [
    ...guard(
      `EXISTS(SELECT 1 FROM users u LEFT JOIN portal_roles pr ON pr.user_id=u.id WHERE u.id=? AND (?=1 OR COALESCE(pr.role,u.role)='admin') AND ${active("participant", "u.id")}) AND NOT EXISTS(SELECT 1 FROM result_snapshots)`,
      [actor.id, actor.owner ? 1 : 0],
    ),
    ...guard(`EXISTS(SELECT 1 ${teamFrom} AND json_array(${teamColumns})=?)`, [
      teamId,
      state.teamRow.snapshot,
    ]),
    ...guard("(SELECT count(*) FROM memberships WHERE team_id=?)=?", [
      teamId,
      state.dto.members.length,
    ]),
    ...(state.ideaRow
      ? guard(`EXISTS(SELECT 1 ${ideaFrom} AND json_array(${ideaColumns})=?)`, [
          teamId,
          state.ideaRow.snapshot,
        ])
      : guard("NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=?)", [teamId])),
    ...state.memberRows.flatMap((member) =>
      lockMembers
        ? [
            [
              `UPDATE users SET id=id WHERE id=? AND EXISTS(SELECT 1 ${memberFrom} AND u.id=? AND json_array(${memberColumns})=?)`,
              member.id,
              teamId,
              member.id,
              member.snapshot,
            ] as SQL,
            ...assertPreviousWrite(),
          ]
        : guard(
            `EXISTS(SELECT 1 ${memberFrom} AND u.id=? AND json_array(${memberColumns})=?)`,
            [teamId, member.id, member.snapshot],
          ),
    ),
  ];
}

/** Only Registered members become Going. Later attendance states and history stay intact. */
export async function approveTeam(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action !== "approve-team") return null;
  const actor = await s.staff();
  const d = z
    .object({
      teamId: z.string().trim().min(1).max(200),
      snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("APPROVE_TEAM"),
    })
    .strict()
    .parse(input);
  const state = await snapshot(s, d.teamId);
  demand(
    !state.blocker,
    409,
    state.blocker?.code || "TEAM_APPROVAL_BLOCKED",
    state.blocker?.message,
  );
  const afterMembers = state.dto.members.map((member) => ({
    ...member,
    approval: member.willBecomeGoing ? "approved" : member.approval,
    status: member.willBecomeGoing ? "Going" : member.status,
    checkedIn: member.checkedIn,
    willBecomeGoing: false,
  }));
  const approvedDigest = await digest({
    team: state.dto.team,
    idea: state.dto.idea,
    members: afterMembers,
  });
  const updated = state.dto.members.filter((member) => member.willBecomeGoing);
  let repeated = false;
  if (d.snapshotDigest !== state.dto.snapshotDigest) {
    repeated =
      !updated.length &&
      !!(await one(
        s.db,
        "SELECT id FROM audit_logs WHERE actor_id=? AND action='approve-team' AND entity_id=? AND json_extract(detail,'$.snapshotDigest')=? AND json_extract(detail,'$.approvedDigest')=? LIMIT 1",
        actor.id,
        d.teamId,
        d.snapshotDigest,
        state.dto.snapshotDigest,
      ));
    demand(
      repeated,
      409,
      "TEAM_APPROVAL_CHANGED",
      "This team changed. Reload its approval details and review again.",
    );
  }
  const sql = guards(state, actor, true);
  for (const member of updated) {
    sql.push([
      "INSERT INTO registrations(email,status) VALUES(?,'approved') ON CONFLICT(email) DO UPDATE SET status='approved' WHERE registrations.status<>'approved'",
      member.email,
    ]);
    sql.push([
      "INSERT INTO participant_status_overrides(user_id,status,reason,actor_id,updated_at) VALUES(?,'Going','Team approval',?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at",
      member.id,
      actor.id,
      s.now(),
    ]);
  }
  try {
    if (!updated.length || repeated)
      await batch(s.db, guards(state, actor, false));
    else
      await s.mutate(actor.id, action, d.teamId, sql, {
        snapshotDigest: d.snapshotDigest,
        approvedDigest,
        memberIds: state.dto.members.map((member) => member.id),
        updatedMembers: updated.length,
        attendancePreserved: true,
      });
  } catch (error) {
    if (
      /constraint|write_guards|23514/i.test(
        error instanceof Error ? error.message : String(error),
      )
    ) {
      // A concurrent duplicate may have committed exactly this reviewed change.
      // Accept only its own safe receipt and the exact unchanged after-snapshot.
      const fresh = await snapshot(s, d.teamId);
      const receipt =
        !fresh.blocker &&
        fresh.dto.snapshotDigest === approvedDigest &&
        (await one(
          s.db,
          "SELECT id FROM audit_logs WHERE actor_id=? AND action='approve-team' AND entity_id=? AND json_extract(detail,'$.snapshotDigest')=? AND json_extract(detail,'$.approvedDigest')=? LIMIT 1",
          actor.id,
          d.teamId,
          d.snapshotDigest,
          approvedDigest,
        ));
      if (receipt) {
        await batch(s.db, guards(fresh, await s.staff(), false));
        repeated = true;
      } else
        throw new PortalError(
          409,
          "TEAM_APPROVAL_CHANGED",
          "This team changed. Reload its approval details and review again.",
        );
    } else throw error;
  }
  return {
    teamId: d.teamId,
    changed: updated.length > 0 && !repeated,
    updatedMembers: repeated ? 0 : updated.length,
    message:
      updated.length && !repeated ? "Team approved." : "Team already approved.",
  };
}
