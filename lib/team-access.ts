import { attendancePredicate, personStatus, teamStatus } from "./portal-status";
import type { PortalService } from "./service";
import { one } from "./db";
import { demand } from "./security";
import { setupReadiness } from "./policy";
export async function teamGoing(s: PortalService, teamId: string) {
  const r = await one<{ total: number; approved: number }>(
    s.db,
    "SELECT count(*) total,COALESCE(sum(r.status='approved'),0) approved FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN registrations r ON r.email=u.email WHERE m.team_id=?",
    teamId,
  );
  return !!r?.total && r.total === r.approved;
}
export async function submissionAccess(s: PortalService, teamId?: string) {
  const settings = await s.settings(true),
    operation = setupReadiness(settings, s.now()).submissions;
  const attendance = teamId
    ? await one<{ n: number }>(
        s.db,
        `SELECT count(*) n FROM memberships m WHERE m.team_id=? AND ${attendancePredicate("m.user_id")}`,
        teamId,
      )
    : undefined;
  const attempts = teamId
    ? await one<{ n: number }>(
        s.db,
        "SELECT count(*) n FROM submission_versions WHERE team_id=?",
        teamId,
      )
    : undefined;
  const checkedInMembers = attendance?.n || 0,
    attemptsUsed = attempts?.n || 0,
    going = teamId ? await teamGoing(s, teamId) : false;
  const actor = s.identity ? await s.actor() : undefined;
  const leader = teamId
    ? await one<{ leader_id: string }>(
        s.db,
        "SELECT leader_id FROM teams WHERE id=?",
        teamId,
      )
    : undefined;
  const personallyCheckedIn = actor
    ? !!(await personStatus(s, actor.id)).checkedIn
    : false;
  const isLeader = !!actor && leader?.leader_id === actor.id;
  const projectRemoved = teamId
    ? !!(await one(
        s.db,
        "SELECT r.target_id FROM record_removals r JOIN projects p ON r.target_id=p.id AND r.kind='project' WHERE p.team_id=? AND r.active=1",
        teamId,
      ))
    : false;
  const canAccess = !!teamId && checkedInMembers > 0 && operation.allowed;
  const canCommit =
    canAccess &&
    isLeader &&
    personallyCheckedIn &&
    attemptsUsed < 3 &&
    !projectRemoved;
  return {
    canAccess,
    canCommit,
    projectRemoved,
    isLeader,
    personallyCheckedIn,
    canRead: !!teamId && checkedInMembers > 0,
    checkedInMembers,
    going,
    attemptsUsed,
    maxAttempts: 3,
    locked: attemptsUsed >= 3,
    progress: attemptsUsed > 0 ? "Submitted" : "Not submitted",
    message: !teamId
      ? "Create or join your team first."
      : !checkedInMembers
        ? "One team member must check in before submissions unlock."
        : !operation.allowed
          ? operation.message
          : !isLeader
            ? "Only the team leader can submit a project."
            : !personallyCheckedIn
              ? "The team leader must personally check in before submitting."
              : attemptsUsed >= 3
                ? "Three submissions committed. This project is now read-only."
                : "Submission is available.",
  };
}
export async function requireSubmissionAccess(
  s: PortalService,
  teamId: string,
  readOnly = false,
) {
  const state = await submissionAccess(s, teamId);

  demand(
    state.checkedInMembers > 0,
    403,
    "TEAM_CHECKIN_REQUIRED",
    "TEAM_CHECKIN_REQUIRED: " + state.message,
  );
  if (readOnly) return state;
  demand(
    !state.projectRemoved,
    409,
    "RECORD_REMOVED",
    "The project was removed by an administrator.",
  );
  demand(state.isLeader, 403, "LEADER_REQUIRED");
  demand(
    state.personallyCheckedIn,
    403,
    "LEADER_CHECKIN_REQUIRED",
    "The submitting leader must personally be checked in.",
  );
  await s.operational("submissions");
  demand(
    state.canAccess,
    409,
    "SUBMISSIONS_CLOSED",
    "SUBMISSIONS_CLOSED: " + state.message,
  );
  return state;
}
export async function assertUnlockedTeam(s: PortalService, teamId: string) {
  demand(
    !(await one(
      s.db,
      "SELECT team_id FROM team_locks WHERE team_id=?",
      teamId,
    )),
    409,
    "TEAM_LOCKED",
    "This team is locked. Membership and team details cannot be changed.",
  );
}
export async function requireGoingForCheckin(s: PortalService, userId: string) {
  const person = await personStatus(s, userId);
  demand(
    person.approval === "approved",
    403,
    "PORTAL_GOING_REQUIRED",
    "PORTAL_GOING_REQUIRED: Only individuals Going on the portal can check in. Luma is registration only.",
  );
}
