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
  const settings = await s.settings(true);
  const attendance = teamId
    ? await one<{ n: number }>(
        s.db,
        `SELECT count(*) n FROM memberships m WHERE m.team_id=? AND ${attendancePredicate("m.user_id")}`,
        teamId,
      )
    : undefined;
  const attempts = teamId
    ? await one<{ n: number; frozen: number }>(
        s.db,
        "SELECT count(*) n,CASE WHEN EXISTS(SELECT 1 FROM result_snapshots) THEN 1 ELSE 0 END frozen FROM submission_versions WHERE team_id=?",
        teamId,
      )
    : undefined;
  const checkedInMembers = attendance?.n || 0,
    attemptsUsed = attempts?.n || 0,
    going = teamId ? await teamGoing(s, teamId) : false;
  const actor = s.identity ? await s.actor() : undefined;
  const leader = teamId
    ? await one<{
        leader_id: string;
        current_member: number;
        actor_member: number;
      }>(
        s.db,
        `SELECT t.leader_id,
          CASE WHEN EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=t.id AND m.user_id=t.leader_id) THEN 1 ELSE 0 END current_member,
          CASE WHEN EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=t.id AND m.user_id=?) THEN 1 ELSE 0 END actor_member
         FROM teams t WHERE t.id=?
         AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=t.id AND r.active=1)
         AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=t.id)`,
        actor?.id || "",
        teamId,
      )
    : undefined;
  const personallyCheckedIn = actor
    ? !!(await personStatus(s, actor.id)).checkedIn
    : false;
  const currentMember =
    !!actor && !actor.deactivated && leader?.actor_member === 1;
  const isLeader = currentMember && leader?.leader_id === actor?.id;
  const adminSubmissionTest =
    !!actor &&
    !actor.deactivated &&
    isLeader &&
    leader?.current_member === 1 &&
    (actor.owner || actor.role === "admin");
  const projectRemoved = teamId
    ? !!(await one(
        s.db,
        "SELECT r.target_id FROM record_removals r JOIN projects p ON r.target_id=p.id AND r.kind='project' WHERE p.team_id=? AND r.active=1",
        teamId,
      ))
    : false;
  const now = s.now();
  const operation = setupReadiness(settings, now).submissions;
  const adminTimeOverride = adminSubmissionTest && !operation.allowed;
  const contentHidden =
    !adminSubmissionTest &&
    (!operation.configured || !["open", "closed"].includes(operation.state));
  const canAccess =
    !!teamId &&
    currentMember &&
    (adminSubmissionTest || (checkedInMembers > 0 && operation.allowed));
  const canCommit =
    canAccess &&
    !attempts?.frozen &&
    isLeader &&
    (personallyCheckedIn || adminSubmissionTest) &&
    attemptsUsed < 3 &&
    !projectRemoved;
  return {
    contentHidden,
    opensAt: operation.configured
      ? new Date(settings.policy.submissionOpen).toISOString()
      : null,
    closesAt: operation.configured
      ? new Date(settings.policy.submissionClose!).toISOString()
      : null,
    serverNow: now,
    windowHasOpened:
      operation.configured &&
      (operation.state === "open" || operation.state === "closed"),
    canAccess,
    canCommit,
    projectRemoved,
    isLeader,
    personallyCheckedIn,
    adminSubmissionTest,
    adminTimeOverride,
    canRead:
      currentMember &&
      !contentHidden &&
      (checkedInMembers > 0 || adminSubmissionTest),
    checkedInMembers,
    going,
    attemptsUsed,
    maxAttempts: 3,
    locked: attemptsUsed >= 3 || !!attempts?.frozen,
    progress: attemptsUsed > 0 ? "Submitted" : "Not submitted",
    message: !teamId
      ? "Create or join your team first."
      : attempts?.frozen
        ? "Final results are frozen. This project is read-only."
        : !checkedInMembers && !adminSubmissionTest
          ? "One team member must check in before submissions unlock."
          : !operation.allowed && !adminTimeOverride
            ? operation.message
            : !isLeader
              ? "Only the team leader can submit a project."
              : !personallyCheckedIn && !adminSubmissionTest
                ? "The team leader must personally check in before submitting."
                : attemptsUsed >= 3
                  ? "Three submissions committed. This project is now read-only."
                  : adminSubmissionTest
                    ? "Admin testing: timing, check-in and profile prerequisites are waived. Ownership, submission limits and frozen results still apply."
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
    state.checkedInMembers > 0 || state.adminSubmissionTest,
    403,
    "TEAM_CHECKIN_REQUIRED",
    "TEAM_CHECKIN_REQUIRED: " + state.message,
  );
  if (readOnly) {
    demand(
      state.canRead,
      403,
      "SUBMISSION_CONTENT_NOT_OPEN",
      "Project submissions are not available yet.",
    );
    return state;
  }
  demand(
    !state.projectRemoved,
    409,
    "RECORD_REMOVED",
    "The project was removed by an administrator.",
  );
  demand(state.isLeader, 403, "LEADER_REQUIRED");
  demand(
    state.personallyCheckedIn || state.adminSubmissionTest,
    403,
    "LEADER_CHECKIN_REQUIRED",
    "The submitting leader must personally be checked in.",
  );
  if (!state.adminTimeOverride) await s.operational("submissions");
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
