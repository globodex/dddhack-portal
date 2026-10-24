import { z } from "zod";
import type { PortalService } from "./service";
import type { PortalViewOptions } from "./discover-participants";
import { one, rows, assertPreviousWrite, type SQL } from "./db";
import { auditReason, demand, emailSchema, text } from "./security";
import { registeredEmailPredicate } from "./roster";

const id = z.string().trim().min(1).max(200);
const active = (kind: string, column: string) =>
  `NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='${kind}' AND rr.target_id=${column} AND rr.active=1)`;
const eligible = `${registeredEmailPredicate("u.email")} AND COALESCE(r.status,'pending') NOT IN ('rejected','cancelled') AND ${active("participant", "u.id")}`;
type Team = {
  id: string;
  name: string;
  leader_id: string;
  locked: number;
  members: number;
};
async function targetTeam(s: PortalService, teamId: string) {
  const team = await one<Team>(
    s.db,
    `SELECT t.id,t.name,t.leader_id,CASE WHEN l.team_id IS NULL THEN 0 ELSE 1 END locked,(SELECT count(*) FROM memberships m WHERE m.team_id=t.id) members FROM teams t LEFT JOIN team_locks l ON l.team_id=t.id WHERE t.id=? AND ${active("team", "t.id")}`,
    teamId,
  );
  demand(team, 404, "TEAM_NOT_FOUND");
  return team;
}
async function targetPerson(s: PortalService, email: string) {
  const person = await one<{ id: string; eligible: number; removed: number }>(
    s.db,
    `SELECT u.id,CASE WHEN ${eligible} THEN 1 ELSE 0 END eligible,CASE WHEN ${active("participant", "u.id")} THEN 0 ELSE 1 END removed FROM users u LEFT JOIN registrations r ON r.email=u.email WHERE u.email=?`,
    email,
  );
  demand(
    person,
    422,
    "REGISTERED_ACCOUNT_REQUIRED",
    "Choose a registered participant who has signed in to the portal.",
  );
  demand(
    !person.removed,
    403,
    "PARTICIPANT_REMOVED",
    "This participant was removed. Restore their access before adding them to a team.",
  );
  demand(
    person.eligible,
    422,
    "REGISTERED_ACCOUNT_REQUIRED",
    "Choose an active registered participant. Add participants explicitly before assigning a Viewer.",
  );
  return person;
}
async function membership(s: PortalService, userId: string) {
  return one<{ team_id: string; team_name: string }>(
    s.db,
    "SELECT m.team_id,t.name team_name FROM memberships m JOIN teams t ON t.id=m.team_id WHERE m.user_id=?",
    userId,
  );
}
const otherTeam = (
  current: Awaited<ReturnType<typeof membership>>,
  teamId: string,
) =>
  demand(
    !current || current.team_id === teamId,
    409,
    "ALREADY_IN_TEAM",
    current
      ? `Already belongs to ${current.team_name}. Remove them from that team first.`
      : "This participant already belongs to another team.",
  );
const staffGuard = (
  actor: Awaited<ReturnType<PortalService["actor"]>>,
): SQL[] => {
  const guard = "admin-team-authority:" + crypto.randomUUID();
  return [
    [
      "INSERT INTO write_guards VALUES(?,CASE WHEN ?=1 OR EXISTS(SELECT 1 FROM users u LEFT JOIN portal_roles pr ON pr.user_id=u.id WHERE u.id=? AND COALESCE(pr.role,u.role)='admin') THEN 1 ELSE 0 END)",
      guard,
      actor.owner ? 1 : 0,
      actor.id,
    ],
    ["DELETE FROM write_guards WHERE token=?", guard],
  ];
};
const constraintFailure = (error: unknown) =>
  error instanceof Error &&
  (/constraint|TEAM_FULL|REGISTRATION_REQUIRED|TEAM_LOCKED|RESULTS_FROZEN|RECORD_REMOVED/i.test(
    error.message,
  ) ||
    ["23505", "23514"].includes(String((error as { code?: string }).code)));

/** Lazy admin-only candidate search. Public directories never receive email. */
export async function adminTeamCandidates(
  s: PortalService,
  path: string,
  options: PortalViewOptions,
) {
  const match = /^\/admin\/team-candidates\/([^/]+)$/.exec(path);
  if (!match) return null;
  const me = await s.staff(),
    team = await targetTeam(s, decodeURIComponent(match[1]));
  const frozen = !!(await one(s.db, "SELECT id FROM result_snapshots LIMIT 1"));
  const blockedReason = frozen
    ? "Final results are frozen."
    : team.members >= 5
      ? "This team already has five members."
      : "";
  const q = (options.search || "").trim().slice(0, 200),
    page = Math.max(0, Math.min(1000, Math.floor(options.page || 0))),
    pageSize = 25;
  const from = `FROM users u LEFT JOIN registrations r ON r.email=u.email LEFT JOIN participant_profiles pp ON pp.user_id=u.id LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN teams t ON t.id=m.team_id WHERE ${eligible} AND instr(lower(COALESCE(NULLIF(pp.display_name,''),u.name)||' '||u.email||' '||COALESCE(t.name,'')),lower(?))>0`;
  const totalRows = (await one<{ n: number }>(
    s.db,
    `SELECT count(*) n ${from}`,
    q,
  ))!.n;
  const found = await rows<{
    id: string;
    name: string;
    email: string;
    teamId: string | null;
    teamName: string | null;
  }>(
    s.db,
    `SELECT u.id,COALESCE(NULLIF(pp.display_name,''),u.name) name,u.email,m.team_id teamId,t.name teamName ${from} ORDER BY lower(COALESCE(NULLIF(pp.display_name,''),u.name)),u.id LIMIT ? OFFSET ?`,
    q,
    pageSize,
    page * pageSize,
  );
  return {
    me,
    team: { id: team.id, name: team.name, locked: !!team.locked },
    items: found.map((person) => ({
      ...person,
      selectable: !blockedReason && !person.teamId,
      unavailableReason:
        person.teamId === team.id
          ? "Already a member."
          : person.teamId
            ? `Already belongs to ${person.teamName}. Remove them from that team first.`
            : blockedReason,
    })),
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < totalRows,
    totalRows,
    memberCount: team.members,
    maxMembers: 5,
    canAdd: !blockedReason,
    blockedReason,
  };
}

/** Explicit staff correction only. Locks, leaders, profiles and history stay intact. */
export async function adminTeamCorrection(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (!["admin-add-team-member", "admin-rename-team"].includes(action))
    return null;
  const actor = await s.staff();
  await s.unfrozen();
  if (action === "admin-add-team-member") {
    const d = z
      .object({
        teamId: id,
        email: emailSchema,
        confirmation: z.literal("ADD_TEAM_MEMBER"),
        reason: auditReason(),
      })
      .strict()
      .parse(input);
    const team = await targetTeam(s, d.teamId),
      person = await targetPerson(s, d.email),
      current = await membership(s, person.id);
    otherTeam(current, team.id);
    if (current)
      return {
        teamId: team.id,
        userId: person.id,
        memberCount: team.members,
        changed: false,
        message: "This participant is already a member.",
      };
    demand(
      team.members < 5,
      409,
      "TEAM_FULL",
      "This team already has five members.",
    );
    const guard = "admin-team-add:" + JSON.stringify([team.id, person.id]);
    try {
      await s.mutate(
        actor.id,
        action,
        team.id,
        [
          ...staffGuard(actor),
          ["INSERT INTO write_guards VALUES(?,1)", guard],
          [
            `INSERT INTO memberships(user_id,team_id,joined_at) SELECT u.id,t.id,? FROM users u LEFT JOIN registrations r ON r.email=u.email JOIN teams t ON t.id=? WHERE u.id=? AND ${eligible} AND ${active("team", "t.id")} AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM result_snapshots)`,
            s.now(),
            team.id,
            person.id,
          ],
          ...assertPreviousWrite(),
          ["DELETE FROM write_guards WHERE token=?", guard],
        ],
        {
          userId: person.id,
          membershipAdded: true,
          lockPreserved: true,
          leaderPreserved: true,
        },
        d.reason,
      );
    } catch (error) {
      if (!constraintFailure(error)) throw error;
      await s.staff();
      await s.unfrozen();
      const latest = await targetTeam(s, team.id);
      await targetPerson(s, d.email);
      const member = await membership(s, person.id);
      otherTeam(member, team.id);
      if (member)
        return {
          teamId: team.id,
          userId: person.id,
          memberCount: latest.members,
          changed: false,
          message: "This participant is already a member.",
        };
      demand(
        latest.members < 5,
        409,
        "TEAM_FULL",
        "This team already has five members.",
      );
      throw error;
    }
    return {
      teamId: team.id,
      userId: person.id,
      memberCount: (await targetTeam(s, team.id)).members,
      changed: true,
      message: "Member added. The team leader and lock are unchanged.",
    };
  }
  const d = z
    .object({
      teamId: id,
      name: text(80).min(2),
      expectedName: z.string().min(1).max(80),
      confirmation: z.literal("RENAME_TEAM"),
      reason: auditReason(),
    })
    .strict()
    .parse(input);
  const team = await targetTeam(s, d.teamId);
  demand(
    team.name === d.expectedName,
    409,
    "TEAM_NAME_CHANGED",
    "The team name changed. Refresh the team before renaming it.",
  );
  if (d.name === team.name)
    return {
      teamId: team.id,
      name: team.name,
      changed: false,
      message: "Team name is unchanged.",
    };
  const guard =
    "admin-team-rename:" + JSON.stringify([team.id, team.name, d.name]);
  try {
    await s.mutate(
      actor.id,
      action,
      team.id,
      [
        ...staffGuard(actor),
        ["INSERT INTO write_guards VALUES(?,1)", guard],
        [
          `UPDATE teams SET name=? WHERE id=? AND CAST(name AS TEXT)=? AND ${active("team", "teams.id")} AND NOT EXISTS(SELECT 1 FROM result_snapshots)`,
          d.name,
          team.id,
          d.expectedName,
        ],
        ...assertPreviousWrite(),
        ["DELETE FROM write_guards WHERE token=?", guard],
      ],
      {
        before: team.name,
        after: d.name,
        lockPreserved: true,
        leaderPreserved: true,
      },
      d.reason,
    );
  } catch (error) {
    if (!constraintFailure(error)) throw error;
    await s.staff();
    await s.unfrozen();
    const latest = await targetTeam(s, team.id);
    demand(
      latest.name === d.expectedName,
      409,
      "TEAM_NAME_CHANGED",
      "The team name changed. Refresh the team before renaming it.",
    );
    throw error;
  }
  return {
    teamId: team.id,
    name: d.name,
    changed: true,
    message:
      "Team renamed. Membership, lock and submission history are unchanged.",
  };
}
