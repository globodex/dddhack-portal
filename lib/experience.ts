import {releasedScoreComponents} from "./released-score-components";
import {projectEvaluationProgress} from "./project-evaluation-progress";
import { feedbackLengthValid } from "./feedback-length";
import { unindexedSubmissions } from "./private-project-index";
import { ownerAIView, ownerAICommand } from "./owner-ai";
import { submissionWindowHasOpened } from "./team-lifecycle";
import { addMissingTeamIdea } from "./admin-team-idea";
import { adminSubmissionAuthority, removeOwnTestProject } from "./admin-submission-testing";
import { adminDemographics, hasDemographics, demographicPredicate, matchingDemographicPeople, matchesAdminParticipant } from "./admin-demographic-filters";
import { publicProjectMembers, adminSubmissionMembers } from "./project-member-profiles";
import { projectMediaPolicy } from "./project-media-policy";
import { adminTeamCandidates, adminTeamCorrection } from "./admin-team-corrections";
import { adminTeamApprovalView, approveTeam } from "./admin-team-approval";
import { adminTeamLock, adminTeamLockView } from "./admin-team-lock";
import { publicTeamMembers } from "./public-team-members";
import { OWNER_EMAIL } from "./identity";
import { adminAccessView, revokeAdminAccess } from "./admin-access";
import { auditReason } from "./security";
import { evaluationAvailability, latestProviderGrade, evaluationActionState } from "./provider-grade";
import { checkInParticipants } from "./participant-checkin";
import { personalCreditRows } from "./credit-stock";
import { resultControls } from "./result-controls";
import { discoverParticipants, type PortalViewOptions } from "./discover-participants";
import { teamFacts, personFacts, selectedRows } from "./directory-facts";
import {
  publicProjectFacts,
  type PublicProjectFact,
} from "./public-project-facts";
import { submissionToolChoices } from "./submission-tools";
import { engagementState, engagementControl } from "./engagement-control";
import { removalCommand, notRemoved } from "./record-removal";
import {
  profileDescriptionChoices,
  profilePhonePattern,
} from "./profile-contract";
import {
  dotColors,
  dotExpressions,
  teamColorKeys,
  legacyTeamPalette,
} from "./avatar-contract";
import { normalizePhone, teamPhone } from "./phone";
import { participantRules } from "./participant-rules";
import {
  repositoryCommand,
  eligibilityReviewer,
  eligibilityWrite,
  commitSha,
} from "./repository-evidence";
import {
  statusCommand,
  teamStatus,
  personStatus,
  attendancePredicate,
} from "./portal-status";
import {
  submissionAccess,
  requireSubmissionAccess,
  assertUnlockedTeam,
} from "./team-access";
import { adminTeamUnlock, teamUnlockBlocker } from "./admin-team-unlock";
import { readAdminStats } from "./admin-stats";
import { readAdminSubmissionAnalytics } from "./admin-submission-analytics";
import { qualificationCommand } from "./engagement-scoring";
import { z } from "zod";
import type { PortalService } from "./service";
import { one, rows, assertPreviousWrite, type SQL } from "./db";
import {
  demand,
  emailSchema,
  githubUrl,
  httpsUrl,
  text,
  sha256,
  PortalError,
} from "./security";
import {
  teamPalettes,
  portalRoles,
  readiness,
  participantStatus,
  unresolvedEventDecisions,
} from "./experience-contract";
import { validateProjectImage } from "./project-media";
import { validatePublishedProjectMedia } from "../neon/storage/reference";
import {
  eventContentCommand,
  publicEventContent,
  managesPrivateVenue,
  publishedPrivateVenue,
  publicContentSchema,
  defaultPublicContent,
} from "./event-content";
import { disabledEvaluator, reportSchema } from "./evaluation";
import { policyControl } from "./policy-controls";
import { publicScores, scoreState, revealCommand } from "./score-release";
import { setupReadiness, policyBlockers } from "./policy";
type Actor = Awaited<ReturnType<PortalService["actor"]>>;
type Team = {
  id: string;
  name: string;
  leader_id: string;
  bio: string;
  avatar?: string;
  palette?: string;
};
type Project = {
  id: string;
  team_id: string;
  slug: string;
  draft: string;
  revision: number;
  published_version_id: string | null;
  updated_at: string;
};
type PublicProjectReference = Pick<
  Project,
  "id" | "team_id" | "slug" | "published_version_id"
>;
type Payload = {
  projectName: string;
  problemSolution: string;
  description: string;
  github: string;
  commitSha?: string;
  demo: string;
  logo: string;
  banner: string;
  tools: string;
  cerebrasIntegration?: "yes" | "no";
  ecosystemSelections?: (typeof submissionToolChoices)[number][];
  contributions: { userId: string; role: string; codex: string }[];
  attestation: boolean;
};
const id = z.string().min(1).max(150),
  why = auditReason(500);
const palette = z.enum(teamColorKeys);
const draftSchema = z
  .object({
    projectName: z.string().max(120).default(""),
    problemSolution: z.string().max(500).default(""),
    description: z.string().max(6000).default(""),
    github: z.string().max(2048).default(""),
    commitSha: z.unknown().optional().transform(() => ""),
    demo: z.string().max(2048).default(""),
    logo: z.string().max(projectMediaPolicy.logo.dataUriMaxChars).default(""),
    banner: z.string().max(projectMediaPolicy.banner.dataUriMaxChars).default(""),
    tools: z.string().max(2000).default(""),
    cerebrasIntegration: z.enum(["yes", "no"]).optional(),
    ecosystemSelections: z
      .array(z.enum(submissionToolChoices))
      .max(6)
      .refine((items) => new Set(items).size === items.length)
      .optional(),
    // Retired participant fields are ignored before request identity/persistence.
    contributions: z.unknown().optional().transform(() => []),
    attestation: z.boolean().default(false),
  })
  .strict();
export class PortalExperience {
  constructor(private s: PortalService) {}
  async team(userId: string) {
    return one<Team>(
      this.s.db,
      `SELECT t.*,'initials' avatar,COALESCE(s.color_key,s.palette) palette FROM memberships m JOIN teams t ON t.id=m.team_id LEFT JOIN team_styles s ON s.team_id=t.id WHERE m.user_id=? AND ${notRemoved("team", "t.id")} AND ${notRemoved("participant", "m.user_id")}`,
      userId,
    );
  }
  async ready(teamId: string) {
    const r = await one<{ total: number; approved: number }>(
      this.s.db,
      "SELECT count(*) total,COALESCE(sum(CASE WHEN r.status='approved' THEN 1 ELSE 0 END),0) approved FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN registrations r ON r.email=u.email WHERE m.team_id=?",
      teamId,
    );
    return readiness(Number(r?.total || 0), Number(r?.approved || 0));
  }
  async profile(actor: Actor) {
    const p = await one<{
      bio: string;
      socials: string;
      gender: string;
      gender_description: string;
      public: number;
      display_name: string | null;
      skills: string | null;
      completed_at: string | null;
      gender_confirmed: number | null;
    }>(
      this.s.db,
      "SELECT p.*,x.display_name,x.skills,x.completed_at,x.gender_confirmed FROM profiles p LEFT JOIN participant_profiles x ON x.user_id=p.user_id WHERE p.user_id=?",
      actor.id,
    );
    const details = await one<{
      phone: string;
      avatar_color: string;
      avatar_expression: string;
      best_description: string;
      organization: string;
      openai_org_id: string;
    }>(this.s.db, "SELECT * FROM profile_details WHERE user_id=?", actor.id);
    const imported = await one<{ payload: string }>(
      this.s.db,
      "SELECT payload FROM roster_prefills WHERE email=?",
      actor.email,
    );
    const prefill =
      imported && !p?.completed_at ? JSON.parse(imported.payload) : {};
    return {
      ...p,
      ...details,
      bio: p?.bio || "",
      gender: p?.gender,
      gender_prefilled: false,
      phone: details?.phone || prefill.phone || "",
      best_description:
        details?.best_description || prefill.bestDescription || "",
      organization: details?.organization || prefill.organization || "",
      openai_org_id: details?.openai_org_id || prefill.openaiOrgId || "",
      socialLinks: prefill.socialLinks || [],
      descriptionChoices: profileDescriptionChoices,
      socials: JSON.parse(p?.socials || "[]"),
      display_name: p?.display_name || prefill.displayName || actor.name,
      skills: p?.skills || "",
      complete:
        !!p?.completed_at &&
        p.gender_confirmed === 1 &&
        !!p.display_name?.trim() &&
        !!p.bio?.trim() &&
        !!details?.phone &&
        !!teamPhone(details.phone).phone &&
        ["man", "woman", "non-binary"].includes(p.gender),
    };
  }
  async completed(actor: Actor) {
    demand(
      (await this.profile(actor)).complete,
      409,
      "PROFILE_COMPLETION_REQUIRED",
    );
  }
  async canReview(actor: Actor, project: Project) {
    const own = await this.team(actor.id);
    if (actor.owner || actor.role === "admin") return "admin";
    const assignment = await one<{ kind: string }>(
      this.s.db,
      "SELECT kind FROM project_assignments WHERE project_id=? AND user_id=?",
      project.id,
      actor.id,
    );
    demand(
      assignment &&
        assignment.kind === actor.role &&
        own?.id !== project.team_id,
      403,
      "PROJECT_ASSIGNMENT_REQUIRED",
    );
    return assignment.kind;
  }
  async project(identifier: string) {
    const p = await one<Project>(
      this.s.db,
      "SELECT * FROM projects WHERE id=? OR slug=?",
      identifier,
      identifier,
    );
    demand(p, 404, "PROJECT_NOT_FOUND");
    return p;
  }
  async version(p: Project) {
    return one<{
      id: string;
      attempt: number;
      payload: string;
      created_at: string;
    }>(
      this.s.db,
      "SELECT * FROM submission_versions WHERE team_id=? ORDER BY attempt DESC LIMIT 1",
      p.team_id,
    );
  }
  async eligibility(p: Project) {
    if (
      await one(
        this.s.db,
        "SELECT target_id FROM record_removals WHERE active=1 AND ((kind='project' AND target_id=?) OR (kind='submission' AND target_id=?))",
        p.id,
        p.published_version_id || "",
      )
    )
      return { status: "removed", versionId: p.published_version_id };
    const v = await this.version(p);
    if (!v) return { status: "not_submitted", versionId: null };
    const e = await one<{ status: string; reason: string }>(
      this.s.db,
      "SELECT status,reason FROM project_eligibility WHERE project_id=? AND version_id=?",
      p.id,
      v.id,
    );
    const legacy = e
      ? undefined
      : await one<{ eligibility: string }>(
          this.s.db,
          "SELECT eligibility FROM reviews WHERE team_id=? AND version_id=?",
          p.team_id,
          v.id,
        );
    return {
      status: e?.status || legacy?.eligibility || "needs_review",
      reason: e?.status === "ineligible" ? e.reason : undefined,
      versionId: v.id,
    };
  }
  async publicProject(
    p: PublicProjectReference,
    disclosure?: Awaited<ReturnType<typeof publicScores>>,
    prefetched?: PublicProjectFact,
    includeBreakdown = false,
  ) {
    const fact =
      prefetched ?? (await publicProjectFacts(this.s.db, [p.id])).get(p.id);
    demand(
      p.published_version_id &&
        fact &&
        fact.id === p.id &&
        fact.team_id === p.team_id &&
        !fact.removed &&
        fact.eligibility === "eligible" &&
        fact.published_version_id === p.published_version_id,
      404,
      "PROJECT_NOT_ELIGIBLE",
    );
    demand(fact.payload, 404, "PROJECT_NOT_PUBLISHED");
    const d = JSON.parse(fact.payload) as Payload;
    // Legacy versions without required media stay private until explicitly reconciled.
    validatePublishedProjectMedia(d.logo || "", "logo", p.team_id);
    validatePublishedProjectMedia(d.banner || "", "banner", p.team_id);
    const publishedScores = disclosure ?? (await publicScores(this.s));
    const revealed = publishedScores.scores.find(
      (e) => e.projectId === p.id && e.versionId === p.published_version_id,
    );
    return {
      id: p.id,
      firstSubmittedAt: fact.firstSubmittedAt ?? undefined,
      slug: p.slug,
      teamName: fact.teamName,
      teamColorKey: fact.teamColorKey,
      projectName: d.projectName,
      problemSolution: d.problemSolution,
      description: d.description,
      github: d.github,
      demo: d.demo,
      logo: `/api/project-image/${p.id}/logo?version=${p.published_version_id}`,
      banner: `/api/project-image/${p.id}/banner?version=${p.published_version_id}`,
      upvotes: fact.upvotes,
      comments: fact.comments,
      ...(revealed
        ? {
            result: {
              score: revealed.score,
              stage: publishedScores.stage,
              ...(includeBreakdown && releasedScoreComponents(revealed.components,revealed.score) ? {components:releasedScoreComponents(revealed.components,revealed.score)} : {}),
              ...(revealed.position ? { position: revealed.position } : {}),
            },
          }
        : {}),
    };
  }
  async participantRows() {
    const items = await rows<{
      id: string | null;
      name: string | null;
      email: string;
      approval: string;
      checked_in: string | null;
      team_id: string | null;
      team_name: string | null;
      team_leader_id: string | null;
      submitted: number;
      avatarColor: string | null;
      avatarExpression: string | null;
      registered: number;
      role: string;
    }>(
      this.s.db,
      "SELECT u.id,COALESCE(x.display_name,u.name) name,r.email,r.status approval,c.created_at checked_in,t.id team_id,t.name team_name,t.leader_id team_leader_id,(SELECT count(*) FROM submission_versions v WHERE v.team_id=t.id) submitted,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression,1 registered,COALESCE(pr.role,u.role,'participant') role FROM registrations r LEFT JOIN users u ON u.email=r.email LEFT JOIN portal_roles pr ON pr.user_id=u.id LEFT JOIN profile_details pd ON pd.user_id=u.id LEFT JOIN participant_profiles x ON x.user_id=u.id LEFT JOIN check_ins c ON c.user_id=u.id LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN teams t ON t.id=m.team_id WHERE NOT EXISTS(SELECT 1 FROM terminal_record_deletions td WHERE td.kind='participant' AND td.target_id=u.id) UNION ALL SELECT u.id,COALESCE(x.display_name,u.name),u.email,'pending',c.created_at,t.id,t.name,t.leader_id,(SELECT count(*) FROM submission_versions v WHERE v.team_id=t.id),pd.avatar_color,pd.avatar_expression,CASE WHEN EXISTS(SELECT 1 FROM luma_roster l WHERE l.email=u.email) THEN 1 ELSE 0 END,COALESCE(pr.role,u.role) FROM users u LEFT JOIN portal_roles pr ON pr.user_id=u.id LEFT JOIN profile_details pd ON pd.user_id=u.id LEFT JOIN participant_profiles x ON x.user_id=u.id LEFT JOIN check_ins c ON c.user_id=u.id LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN teams t ON t.id=m.team_id WHERE NOT EXISTS(SELECT 1 FROM registrations r WHERE r.email=u.email) AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions td WHERE td.kind='participant' AND td.target_id=u.id)",
    );
    const teams = await teamFacts(
        this.s.db,
        items.flatMap((item) => (item.team_id ? [item.team_id] : [])),
        undefined,
        this.s.now(),
      ),
      people = await personFacts(
        this.s.db,
        items.flatMap((item) => (item.id ? [item.id] : [])),
      ),
      absentEmails = new Set(
        (
          await rows<{ email: string }>(
            this.s.db,
            "SELECT email FROM registration_absences",
          )
        ).map((row) => row.email),
      );
    // Include archived teams in the confirmation scope. Leadership can outlive
    // the currently visible membership, so confirming only that card is unsafe.
    const ledTeams = await selectedRows<{ id: string; name: string; leader_id: string }>(
      this.s.db,
      items.flatMap((item) => item.id ? [item.id] : []),
      (marks) => `SELECT id,name,leader_id FROM teams WHERE leader_id IN (${marks}) ORDER BY id`,
    );
    const leadership = new Map<string, typeof ledTeams>();
    for (const team of ledTeams) {
      const owned = leadership.get(team.leader_id) || [];
      owned.push(team);
      leadership.set(team.leader_id, owned);
    }
    return items
      .map((item) => {
        const individual = item.id ? people.get(item.id) : undefined,
          progress = item.team_id ? teams.get(item.team_id) : undefined,
          viewer =
            !item.registered &&
            item.role === "participant" &&
            item.email !== OWNER_EMAIL &&
            !individual?.deactivatedAt;
        const { role: _role, team_leader_id: _leader, ...participant } = item;
        return {
          ...participant,
          registered: !!item.registered,
          canDeleteParticipant: !!item.id && item.role === "participant" && item.email !== OWNER_EMAIL,
          teamLeader: !!item.id && item.team_leader_id === item.id,
          leaderTeamIds: (leadership.get(item.id || "") || []).map((team) => team.id),
          leaderTeamNames: (leadership.get(item.id || "") || []).map((team) => team.name),
          viewer,
          approval: viewer ? null : item.approval,
          deactivated_at: individual?.deactivatedAt,
          teamReadiness: progress?.readiness || readiness(0, 0),
          status: viewer
            ? "Not registered"
            : individual?.status ||
              (item.approval !== "approved"
                ? "Registered"
                : absentEmails.has(item.email)
                  ? "Absent"
                  : "Going"),
          teamStatus: progress?.status,
          teamLocked: progress?.locked || false,
          teamLockedAt: item.team_id ? progress?.lockedAt : null,
          checked_in: individual?.checkedIn
            ? item.checked_in || "Manually checked in"
            : null,
        };
      })
      .sort(
        (a, b) =>
          Number(b.teamLocked && b.status === "Registered") -
            Number(a.teamLocked && a.status === "Registered") ||
          (a.teamLockedAt || "9999").localeCompare(b.teamLockedAt || "9999") ||
          a.email.localeCompare(b.email),
      );
  }

  async workspace(actor: Actor, contacts = true) {
    const profile = await this.profile(actor);
    if (!profile.complete && !actor.owner && actor.role !== "admin")
      return { me: actor, profile, profileIncomplete: true };
    const { phone: _phone, openai_org_id: _orgId, ...workspaceProfile } = profile;
    const team = await this.team(actor.id),
      registration = await one<{ status: string }>(
        this.s.db,
        "SELECT status,luma_confirmed FROM registrations WHERE email=?",
        actor.email,
      );
    const teamProgress = team ? await teamStatus(this.s, team.id) : undefined;
    const individual = await personStatus(this.s, actor.id);
    const ready = team ? await this.ready(team.id) : readiness(0, 0);
    const access = await submissionAccess(this.s, team?.id);
    if (!profile.complete && !access.adminSubmissionTest)
      return { me: actor, profile, profileIncomplete: true };
    const lock = team
      ? await one(
          this.s.db,
          "SELECT locked_at,locked_by FROM team_locks WHERE team_id=?",
          team.id,
        )
      : undefined;
    const attempts = team
      ? await rows(
          this.s.db,
          "SELECT id,attempt,created_at FROM submission_versions WHERE team_id=? ORDER BY attempt DESC",
          team.id,
        )
      : [];
    const members = team
      ? await rows(
          this.s.db,
          "SELECT u.id,COALESCE(x.display_name,u.name) name,CASE WHEN u.id=t.leader_id THEN 'leader' ELSE 'member' END role,COALESCE(r.status,'pending') approval,pd.phone,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression,p.bio,p.socials,p.public,CASE WHEN x.completed_at IS NOT NULL AND x.gender_confirmed=1 AND length(trim(COALESCE(x.display_name,'')))>0 AND length(trim(COALESCE(p.bio,'')))>0 AND p.gender IN ('man','woman','non-binary') THEN 1 ELSE 0 END profileContentComplete FROM memberships m JOIN users u ON u.id=m.user_id JOIN teams t ON t.id=m.team_id LEFT JOIN registrations r ON r.email=u.email LEFT JOIN participant_profiles x ON x.user_id=u.id LEFT JOIN profile_details pd ON pd.user_id=u.id LEFT JOIN profiles p ON p.user_id=u.id WHERE t.id=? AND EXISTS(SELECT 1 FROM memberships viewer WHERE viewer.user_id=? AND viewer.team_id=t.id) AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=u.id AND rr.active=1)",
          team.id,
          actor.id,
        )
      : [];
    const memberStatuses = await personFacts(this.s.db, members.map((member) => String(member.id)));
    const project = team
      ? await one<Project>(
          this.s.db,
          "SELECT * FROM projects WHERE team_id=?",
          team.id,
        )
      : undefined;
    const projectIndexMissing = !project && attempts.length > 0 && access.canRead;
    const feedback =
      project && access.canRead
        ? await rows(
            this.s.db,
            "SELECT h.id,h.body,h.kind,h.created_at,h.version_id,u.name author FROM project_review_history h JOIN users u ON u.id=h.author_id WHERE h.project_id=? ORDER BY h.created_at DESC",
            project.id,
          )
        : [];
    // Feedback has no numeric rating, evaluation report or hidden score fields.
    const privateVenue = await publishedPrivateVenue(this.s, actor, individual);
    const checked = individual.checkedIn;
    const credits =
      checked
        ? await personalCreditRows(this.s, actor)
        : [];
    const projectResult = project
      ? (await publicScores(this.s)).scores.find(
          (r) =>
            r.projectId === project.id &&
            r.versionId === project.published_version_id,
        )
      : undefined;
    const projectEngagement = project ? await one<{upvotes:number;feedbackCount:number}>(this.s.db,"SELECT (SELECT count(*) FROM project_upvotes WHERE project_id=?) upvotes,(SELECT count(*) FROM project_comments WHERE project_id=?) feedbackCount",project.id,project.id) : undefined;
    const projectUpvotes=projectEngagement?.upvotes || 0;
    const operational = setupReadiness(
      await this.s.settings(true),
      this.s.now(),
    );
    const projectEligibility = project
      ? await this.eligibility(project)
      : { status: "not_submitted", versionId: null };
    return {
      me: actor,
      profile: actor.owner || actor.role === "admin" ? profile : workspaceProfile,
      registration: {
        ...registration,
        status: registration?.status || "pending",
      },
      team: team
        ? { ...team, locked: !!lock, lockedAt: lock?.locked_at }
        : undefined,
      projectIndexMissing,
      submissionAccess: {
        ...access,
        intentVersion: 1,
        ...(projectIndexMissing ? {canCommit:false,message:"Committed submissions need project-index reconciliation. Do not resubmit."} : {}),
      },
      projectStats: access.contentHidden ? undefined : { upvotes: projectUpvotes, feedbackCount:projectEngagement?.feedbackCount || 0, result: projectResult },
      evaluationProgress: !access.contentHidden && access.canRead && project?.published_version_id ? await projectEvaluationProgress(this.s.db,project.id,project.published_version_id) : undefined,
      projectPublicPath:
        !access.contentHidden && project && projectEligibility.status === "eligible" && projectEligibility.versionId === project.published_version_id
          ? "/projects/" + encodeURIComponent(project.slug)
          : null,
      submissionProgress: {
        status: access.progress,
        attemptsUsed: access.attemptsUsed,
        maxAttempts: 3,
        locked: access.locked,
      },
      teamReadiness: ready,
      teamStatus: teamProgress?.status,
      teamFacts: teamProgress,
      individualStatus: individual.status,
      idea: team
        ? await one(
            this.s.db,
            "SELECT title,core,description FROM ideas WHERE team_id=?",
            team.id,
          )
        : undefined,
      ideaLocked:
        !!lock || this.s.now() >= (await this.s.settings(true)).policy.ideaLock,
      members: members.map(
        ({ phone, public: visible, socials, bio, profileContentComplete, ...m }) => ({
          ...m,
          status: memberStatuses.get(String(m.id))?.status || "Registered",
          profileComplete: Number(profileContentComplete) === 1 && !!teamPhone(String(phone || "")).phone,
          profileUrl: "/discover/participants#person-" + String(m.id),
          ...(visible
            ? { bio, socials: JSON.parse(String(socials || "[]")) }
            : { socials: [] }),
          ...(contacts ? teamPhone(String(phone || "")) : {}),
        }),
      ),
      attempts: access.contentHidden ? [] : attempts,
      project:
        project && access.canRead
          ? { ...project, draft: JSON.parse(project.draft) }
          : undefined,
      feedback,
      eligibility: access.contentHidden ? { status: "not_submitted", versionId: null } : projectEligibility,
      leaderboardUrl:
        !access.contentHidden && project && projectEligibility.status === "eligible"
          ? "/leaderboard?project=" +
            encodeURIComponent(project.slug) +
            "#entry-" +
            project.slug
          : undefined,
      credits,
      checkedIn: checked,
      status: individual.status,
      actions: await rows(
        this.s.db,
        "SELECT a.*,t.name team_name,COALESCE(NULLIF(pp.display_name,''),u.name) person_name FROM team_actions a JOIN teams t ON t.id=a.team_id JOIN users u ON u.id=a.user_id LEFT JOIN participant_profiles pp ON pp.user_id=u.id WHERE a.user_id=? OR t.leader_id=?",
        actor.id,
        actor.id,
      ),
      ...(privateVenue ? { privateVenue } : {}),
      submissionStatus: operational.submissions,
      eventDraft: !operational.submissions.enabled,
    };
  }
  async view(
    path: string,
    options: PortalViewOptions = {},
  ): Promise<Record<string, unknown> | null> {
    let route = path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    const demographics = adminDemographics(options);
    if (demographics.teamSize) demand(route === "/admin/teams", 422, "TEAM_SIZE_FILTER_ROUTE_REQUIRED");
    if (hasDemographics(demographics)) {
      demand(["/admin", "/admin/participants", "/admin/teams", "/admin/submissions"].includes(route), 422, "ADMIN_FILTER_ROUTE_REQUIRED");
      await this.s.staff();
    }
    const lockPreview = await adminTeamLockView(this.s, route, options);
    if (lockPreview !== null) return lockPreview;
    const approval = await adminTeamApprovalView(this.s, route, options);
    if (approval !== null) return approval;
    const candidates = await adminTeamCandidates(this.s, route, options);
    if (candidates !== null) return candidates;
    if (route === "/discover/teams") route = "/teams";
    if (route === "/discover/participants") {
      const me = await this.s.actor();
      return {
        me,
        discovery: "participants",
        ...(await discoverParticipants(this.s.db, options, me)),
      };
    }
    if (route === "/rules") {
      const { policy } = await this.s.settings(true);
      return {
        me: await this.s.actor(),
        categories: participantRules(
          policy.submissionOpen,
          policy.submissionClose,
        ),
      };
    }
    if (route === "/") {
      const me = this.s.identity ? await this.s.actor() : undefined;
      const privateVenue = options.includePrivateVenue && me
        ? await publishedPrivateVenue(this.s, me)
        : undefined;
      return {
        content: await publicEventContent(this.s),
        submissionClose: (await this.s.settings(true)).policy.submissionClose,
        ...(me ? { me } : {}),
        ...(privateVenue ? { privateVenue } : {}),
      };
    }
    if (
      route === "/projects" ||
      route === "/leaderboard" ||
      route === "/winners" ||
      route.startsWith("/projects/")
    ) {
      let selectedPage = Math.floor(options.page || 0);
      const scores = await publicScores(this.s);
      const showcaseSort=z.enum(["votes","name","score"]).parse(options.projectSort || (scores.stage === "final" ? "score" : "votes"));
      const sortDirection=z.enum(["asc","desc"]).parse(options.sortDirection || "desc");
      if(route === "/projects" && showcaseSort === "score") demand(scores.stage === "final",409,"SCORES_NOT_REVEALED","Score sorting becomes available after the owner reveals scores.");
      const scoreOrderArgs:unknown[]=[];
      const scoreOrder=scores.scores.length ? "CASE "+scores.scores.map(entry=>{scoreOrderArgs.push(entry.projectId,entry.versionId,entry.score);return "WHEN p.id=? AND p.published_version_id=? THEN CAST(? AS DOUBLE PRECISION)"}).join(" ")+" ELSE NULL END" : "NULL";
      const directionSql=sortDirection === "asc" ? "ASC" : "DESC";
      const showcaseOrder=showcaseSort === "name" ? "lower(t.name) "+directionSql : showcaseSort === "score" ? scoreOrder+" "+directionSql+" NULLS LAST" : "(SELECT count(*) FROM project_upvotes u WHERE u.project_id=p.id) "+directionSql;
      const baseOrder="(SELECT count(*) FROM project_upvotes u WHERE u.project_id=p.id) DESC";
      const selectedOrder=route === "/projects" ? showcaseOrder : baseOrder;
      const listRoute = ["/projects", "/leaderboard", "/winners"].includes(
        route,
      );
      let all = listRoute
        ? await rows<PublicProjectReference>(
            this.s.db,
            "SELECT p.id,p.team_id,p.slug,p.published_version_id FROM projects p JOIN submission_versions v ON v.id=p.published_version_id JOIN teams t ON t.id=p.team_id WHERE COALESCE((SELECT e.status FROM project_eligibility e WHERE e.project_id=p.id AND e.version_id=v.id),(SELECT r.eligibility FROM reviews r WHERE r.team_id=p.team_id AND r.version_id=v.id),'needs_review')='eligible' AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND ((rr.kind='project' AND rr.target_id=p.id) OR (rr.kind='submission' AND rr.target_id=v.id))) AND instr(lower(json_extract(v.payload,'$.projectName') || ' ' || t.name || ' ' || COALESCE(json_extract(v.payload,'$.problemSolution'),'')),lower(?))>0 ORDER BY "+selectedOrder+",(SELECT first.created_at FROM submission_versions first WHERE first.team_id=p.team_id ORDER BY first.attempt ASC LIMIT 1) ASC,p.id ASC LIMIT 1000",
            (options.search || "").slice(0, 200),
            ...(route === "/projects" && showcaseSort === "score" ? scoreOrderArgs : []),
          )
        : [await this.project(decodeURIComponent(route.split("/")[2]))];
      const scoreFor = (p: PublicProjectReference) =>
        scores.scores.find(
          (e) => e.projectId === p.id && e.versionId === p.published_version_id,
        );
      // Until the countdown completes, keep the ordinary project list in community
      // order. Sorting/removing the five hidden teams would reveal their identities.
      if (
        route === "/leaderboard" &&
        (scores.stage === "ai" || scores.complete)
      )
        all.sort((a, b) => {
          const x = scoreFor(a),
            y = scoreFor(b);
          if (x && y)
            return scores.complete
              ? x.position! - y.position!
              : y.score - x.score;
          return x ? -1 : y ? 1 : 0;
        });
      if (route === "/winners")
        all = all
          .filter((p) => scoreFor(p)?.position)
          .sort((a, b) => scoreFor(a)!.position! - scoreFor(b)!.position!);
      if (options.focus) {
        const found = all.findIndex((p) => p.slug === options.focus);
        if (found >= 0) selectedPage = Math.floor(found / 24);
      }
      const hasMore = listRoute && all.length > (selectedPage + 1) * 24;
      const me = this.s.identity ? await this.s.actor() : undefined;
      const engagement = await engagementState(this.s);
      if (me && !me.deactivated && (me.owner || me.role === "admin"))
        engagement.feedbackPaused = false;
      const ownTeam = me ? await this.team(me.id) : undefined;
      const ownAttendance = me
        ? (await personStatus(this.s, me.id)).checkedIn
        : false;
      const selected = listRoute
          ? all.slice(selectedPage * 24, (selectedPage + 1) * 24)
          : all,
        awardScores =
          scores.stage === "final"
            ? scores.scores
                .filter(
                  (entry) =>
                    entry.position && (scores.complete || entry.position! <= 5),
                )
                .sort((a, b) => a.position! - b.position!)
            : [],
        references = new Map(all.map((project) => [project.id, project]));
      const missingAwards = awardScores
        .map((entry) => entry.projectId)
        .filter((id) => !references.has(id));
      for (const project of await selectedRows<PublicProjectReference>(
        this.s.db,
        missingAwards,
        (marks) =>
          `SELECT id,team_id,slug,published_version_id FROM projects WHERE id IN (${marks})`,
      ))
        references.set(project.id, project);
      const facts = await publicProjectFacts(
        this.s.db,
        [
          ...selected.map((project) => project.id),
          ...awardScores.map((entry) => entry.projectId),
        ],
        me?.id,
      );
      const items = await Promise.all(
        selected.map(async (p) => ({
          ...(await this.publicProject(p, scores, facts.get(p.id), !listRoute)),
          canComment: !!me?.canEngage && !engagement.feedbackPaused,
          engagementPaused:
            engagement.votingPaused || engagement.feedbackPaused,
          upvoted: !!facts.get(p.id)?.upvoted,
          canUpvote:
            !engagement.votingPaused &&
            !!me?.canEngage &&
            (!!facts.get(p.id)?.upvoted || ownTeam?.id !== p.team_id || ownAttendance),
        })),
      );
      const awards = await Promise.all(
        awardScores.map(async (e) => {
          const p = references.get(e.projectId);
          demand(p, 404, "PROJECT_NOT_FOUND");
          const publicEntry = await this.publicProject(
            p,
            scores,
            facts.get(p.id),
          );
          return {
            projectName: publicEntry.projectName,
            teamName: publicEntry.teamName,
            slug: publicEntry.slug,
            score: e.score,
            position: e.position,
          };
        }),
      );
      return {
        items,
        me,
        hasMore,
        page: selectedPage,
        engagement,
        scoreStage: scores.stage,
        projectSort: route === "/projects" ? showcaseSort : undefined,
        sortDirection: route === "/projects" ? sortDirection : undefined,
        finalCountdownComplete: scores.complete,
        awards,
        ...(scores.criteria && !listRoute ? { scoringInfo: scores.criteria } : {}),
        ...(!listRoute
          ? {
              teamMembers: await publicProjectMembers(this.s.db, all[0].team_id, me),
              comments: await rows(
                this.s.db,
                "SELECT c.id,c.body,c.created_at,COALESCE(x.display_name,u.name) author,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression FROM project_comments c JOIN users u ON u.id=c.author_id LEFT JOIN participant_profiles x ON x.user_id=u.id LEFT JOIN profile_details pd ON pd.user_id=u.id WHERE c.project_id=? ORDER BY c.created_at LIMIT 500",
                all[0].id,
              ),
            }
          : {}),
      };
    }
    if (route === "/project-history") {
      const me = await this.s.actor();
      if (options.focus) await this.s.staff();
      const team = options.focus ? await one<Team>(this.s.db,"SELECT t.* FROM teams t WHERE t.id=? AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=t.id AND r.active=1) AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=t.id)",options.focus) : await this.team(me.id);
      demand(team, 403, "TEAM_REQUIRED");
      const access = await submissionAccess(this.s, team.id);
      demand(!!options.focus || access.canRead, 403, "TEAM_CHECKIN_REQUIRED");
      return {
        me,
        items: (
          await rows<{
            id: string;
            attempt: number;
            payload: string;
            created_at: string;
          }>(
            this.s.db,
            "SELECT id,attempt,payload,created_at FROM submission_versions v WHERE team_id=? AND (?=1 OR EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=v.team_id AND m.user_id=?)) ORDER BY attempt DESC LIMIT 3",
            team.id,
            options.focus ? 1 : 0,
            me.id,
          )
        ).map((v) => ({ ...v, payload: JSON.parse(v.payload) })),
      };
    }
    if (["/profile", "/dashboard/profile"].includes(route)) {
      const me = await this.s.actor();
      return { me, profile: await this.profile(me) };
    }
    if (route === "/teams" || route.startsWith("/teams/")) {
      const me = await this.s.actor();
      const teams = await rows<Team>(
        this.s.db,
        "SELECT t.*,'initials' avatar,COALESCE(s.color_key,s.palette) palette FROM teams t LEFT JOIN team_styles s ON s.team_id=t.id WHERE NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='team' AND rr.target_id=t.id AND rr.active=1) ORDER BY t.name",
      );
      const requestedTeam = route.startsWith("/teams/")
        ? decodeURIComponent(route.split("/")[2])
        : undefined;
      if (requestedTeam)
        demand(
          teams.some((t) => t.id === requestedTeam),
          404,
          "TEAM_NOT_FOUND",
        );
      const selected = teams.filter(
          (t) => !requestedTeam || t.id === requestedTeam,
        ),
        facts = await teamFacts(
          this.s.db,
          selected.map((t) => t.id),
          me.id,
          this.s.now(),
        ),
        members = await publicTeamMembers(this.s.db, selected.map((t) => t.id));
      return {
        me,
        team: await this.team(me.id),
        items: selected.map((t) => {
          const fact = facts.get(t.id)!;
          return {
            id: t.id,
            name: t.name,
            bio: t.bio,
            avatar: t.avatar,
            palette: t.palette,
            locked: fact.locked,
            status: fact.status,
            readiness: fact.readiness,
            requested: fact.requested,
            members: members.get(t.id) || [],
          };
        }),
      };
    }

    if (["/submission", "/dashboard/submission"].includes(route)) {
      const me = await this.s.actor(),
        team = await this.team(me.id);
      const access = await submissionAccess(this.s, team?.id);
      if (!access.contentHidden) {
        demand(team, 403, "TEAM_CHECKIN_REQUIRED", "Create or join your team before submitting.");
        await requireSubmissionAccess(this.s, team.id, true);
      }
      return this.workspace(me, false);
    }
    if (
      [
        "/dashboard",
        "/dashboard/team",
        "/submission",
        "/dashboard/submission",
      ].includes(route)
    )
      return this.workspace(await this.s.actor());
    if (route === "/admin" || route === "/admin/participants") {
      const me = await this.s.actor();
      demand(
        me.owner || ["admin", "volunteer"].includes(me.role),
        403,
        "ADMIN_REQUIRED",
      );
      const matching = demographics.gender || demographics.profession ? await matchingDemographicPeople(this.s.db, { gender: demographics.gender, profession: demographics.profession }) : null;
      return {
        me,
        demographicFilters: demographics,
        items: (await this.participantRows()).filter(
          (item) => (!item.viewer || me.owner || me.role === "admin") && (!matching || (!!item.id && matching.has(item.id))) && matchesAdminParticipant(item, demographics),
        ),
        lookupOnly: me.role === "volunteer",
        ...(me.owner || me.role === "admin" ? { stats: await readAdminStats(this.s, "participants", me) } : {}),
        checkInConfigured: setupReadiness(
          await this.s.settings(true),
          this.s.now(),
        ).checkin.allowed,
        checkInStatus: setupReadiness(await this.s.settings(true), this.s.now())
          .checkin,
      };
    }
    if (["/admin/logs", "/admin/audit"].includes(route)) {
      await this.s.staff(true);
      return {
        me: await this.s.actor(),
        items: await this.s.adminList("audit"),
      };
    }
    if (route === "/admin/teams") {
      const me = await this.s.staff();
      const demographic = demographicPredicate("team", "t.id", demographics, demographics.teamStatus ? submissionWindowHasOpened((await this.s.settings(true)).policy, this.s.now()) : false);
      const all = await rows<Team & { unlock_attempts: number; unlock_frozen: number }>(
        this.s.db,
        "SELECT t.*,'initials' avatar,COALESCE(s.color_key,s.palette) palette,COALESCE(ul.attempts,0) unlock_attempts,CASE WHEN EXISTS(SELECT 1 FROM result_snapshots) THEN 1 ELSE 0 END unlock_frozen FROM teams t LEFT JOIN team_styles s ON s.team_id=t.id LEFT JOIN submission_attempt_ledger ul ON ul.team_id=t.id WHERE " + demographic.sql + " ORDER BY t.name",
        ...demographic.args,
      );
      const ids = all.map((t) => t.id),
        facts = await teamFacts(this.s.db, ids, undefined, this.s.now()),
        ideas = new Map(
          (
            await selectedRows<{
              team_id: string;
              title: string;
              description: string;
            }>(
              this.s.db,
              ids,
              (marks) =>
                `SELECT team_id,title,description FROM ideas WHERE team_id IN (${marks})`,
            )
          ).map(({ team_id, ...idea }) => [team_id, idea]),
        ),
        members = await selectedRows<{
          team_id: string;
          id: string;
          name: string;
          email: string;
          approval: string;
        }>(
          this.s.db,
          ids,
          (marks) =>
            `SELECT m.team_id,u.id,COALESCE(pp.display_name,u.name) name,u.email,COALESCE(r.status,'pending') approval,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN participant_profiles pp ON pp.user_id=u.id LEFT JOIN profile_details pd ON pd.user_id=u.id LEFT JOIN registrations r ON r.email=u.email WHERE m.team_id IN (${marks})`,
        ),
        people = await personFacts(
          this.s.db,
          members.map((member) => member.id),
        ),
        byTeam = new Map<
          string,
          (Omit<(typeof members)[number], "team_id"> & { status: string })[]
        >();
      for (const { team_id, ...member } of members) {
        const group = byTeam.get(team_id) || [];
        group.push({
          ...member,
          status: people.get(member.id)?.status || "Registered",
        });
        byTeam.set(team_id, group);
      }
      const unlockPolicy = (await this.s.settings(true)).policy;
      return {
        me,
        stats: await readAdminStats(this.s, "teams", me),
        demographicFilters: demographics,
        items: all
          .map((t) => {
            const fact = facts.get(t.id)!;
            const { unlock_attempts, unlock_frozen, ...visibleTeam } = t;
            return {
              ...visibleTeam,
              locked: fact.locked,
              lockedAt: fact.lockedAt,
              lockBlockedReason: unlock_frozen ? "Final results are frozen." : Math.max(fact.attemptsUsed, Number(unlock_attempts) || 0) > 0 ? "Committed submissions protect this team's lock state." : "",
              unlockBlockedReason: fact.locked ? teamUnlockBlocker({ frozen: !!unlock_frozen, attempts: Math.max(fact.attemptsUsed, Number(unlock_attempts) || 0), now: this.s.now(), membershipFreeze: unlockPolicy.membershipFreeze, ideaLock: unlockPolicy.ideaLock })?.message || "" : "",
              status: fact.status,
              idea: ideas.get(t.id),
              readiness: fact.readiness,
              members: byTeam.get(t.id) || [],
            };
          })
          .sort((a, b) => {
            const priority = (r: typeof a) =>
              r.status === "Locked"
                ? r.readiness.allApproved
                  ? 1
                  : 0
                : r.status === "Forming"
                  ? 2
                  : r.status === "Not submitted"
                    ? 3
                    : 4;
            return (
              priority(a) - priority(b) ||
              (a.lockedAt || "9999").localeCompare(b.lockedAt || "9999") ||
              a.name.localeCompare(b.name)
            );
          }),
      };
    }
    if (route === "/admin/access") return adminAccessView(this.s);
    if (route === "/admin/settings") {
      const me = await this.s.staff();
      const settings = await this.s.settings(true);
      const canManageVenue = await managesPrivateVenue(this.s, me);
      const content = me.owner
        ? await one(
            this.s.db,
            "SELECT draft,published,revision,updated_at FROM event_content WHERE id=1",
          )
        : undefined;
      const venue = canManageVenue
        ? await one(
            this.s.db,
            "SELECT draft,published,revision,updated_at FROM private_venue WHERE id=1",
          )
        : undefined;
      return {
        me,
        ...(me.owner ? { ownerAI: await ownerAIView(this.s) } : {}),
        engagement: await engagementState(this.s),
        ...(me.owner ? { adminAccess: await adminAccessView(this.s) } : {}),
        creditInstructions: await rows(
          this.s.db,
          "SELECT id,name,instructions FROM credit_types WHERE active=1",
        ),
        policy: settings.policy,
        policyVersion: settings.version,
        readiness: setupReadiness(settings, this.s.now()),
        eventDraft: !settings.active,
        blockers: policyBlockers(settings.policy),
        unresolved: unresolvedEventDecisions,
        content: content || {
          draft: JSON.stringify(defaultPublicContent),
          revision: 0,
        },
        ...(canManageVenue
          ? {
              venue: venue || {
                draft: JSON.stringify({
                  location: "",
                  directions: "",
                  mapUrl: "",
                }),
                revision: 0,
              },
            }
          : {}),
        canManageVenue,
        resultControls: await resultControls(this.s),
        scoreRelease: await scoreState(this.s).then((s) => ({
          stage: s.stage,
          aiRevealed: s.aiRevealed,
          legacyPending: s.legacyPending,
          releaseId: s.active?.id,
          remainingAwards: s.entries
            .filter(
              (e) =>
                e.position &&
                e.position <= 5 &&
                !s.unveiled.some((v) => v.project_id === e.projectId),
            )
            .map((e) => ({ position: e.position, projectId: e.projectId })),
          complete: s.complete,
        })),
        scoringDisclosure: settings.policy.scoringDisclosure,
        resultSnapshots:
          me.owner || me.role === "admin"
            ? (await rows<{ id: string; created_at: string; policy_version: number; payload: string }>(
                this.s.db,
                "SELECT id,created_at,policy_version,payload FROM result_snapshots ORDER BY created_at DESC",
              )).map(({ payload, ...snapshot }) => {
                const entries = JSON.parse(payload) as { eligibility?: string }[];
                return { ...snapshot, entryCount: entries.length, eligibleCount: entries.filter(entry => entry.eligibility === "eligible").length };
              })
            : undefined,
        resultPublication: me.owner
          ? await one(
              this.s.db,
              "SELECT published_at FROM result_publication WHERE id=1",
            )
          : undefined,
        roles: me.owner
          ? await rows(
              this.s.db,
              "SELECT u.id,u.email,u.name,COALESCE(r.role,u.role) role,CASE WHEN v.user_id IS NULL THEN 0 ELSE 1 END venue_manager FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id LEFT JOIN private_venue_managers v ON v.user_id=u.id",
            )
          : undefined,
      };
    }
    if (route === "/admin/submissions" || route === "/review") {
      const me = await this.s.actor();
      demand(
        me.owner || ["admin", "judge", "mentor"].includes(me.role),
        403,
        "REVIEWER_REQUIRED",
      );
      const demographic = demographicPredicate("team", "p.team_id", demographics, demographics.teamStatus ? submissionWindowHasOpened((await this.s.settings(true)).policy, this.s.now()) : false);
      const query =
        "SELECT p.id,p.slug,t.name teamName,json_extract(p.draft,'$.projectName') projectName,CASE WHEN EXISTS(SELECT 1 FROM submission_versions v WHERE v.team_id=p.team_id) THEN 'Submitted' ELSE 'Draft' END status,p.updated_at,rr.updated_at deleted_at FROM projects p JOIN teams t ON t.id=p.team_id LEFT JOIN record_removals rr ON rr.kind='project' AND rr.target_id=p.id AND rr.active=1 ";
      const items = await rows<Record<string, any>>(
        this.s.db,
        me.owner || me.role === "admin"
          ? query + " WHERE " + demographic.sql + " ORDER BY p.updated_at DESC LIMIT 1000"
          : query +
              " JOIN project_assignments a ON a.project_id=p.id WHERE a.user_id=? AND a.kind=? ORDER BY p.updated_at DESC LIMIT 1000",
        ...(me.owner || me.role === "admin" ? demographic.args : [me.id, me.role]),
      );
      const unindexed = me.owner || me.role === "admin" ? await unindexedSubmissions(this.s,demographics,submissionWindowHasOpened((await this.s.settings(true)).policy,this.s.now())) : [];
      const byProject = new Map<string, Record<string, unknown>[]>();
      if (me.owner || me.role === "admin") {
        const versions = await selectedRows<{
          project_id: string;
          id: string;
          attempt: number;
          deleted_at: string | null;
        }>(
          this.s.db,
          items.map((item) => String(item.id)),
          (marks) =>
            `SELECT p.id project_id,v.id,v.attempt,r.updated_at deleted_at FROM projects p JOIN submission_versions v ON v.team_id=p.team_id LEFT JOIN record_removals r ON r.kind='submission' AND r.target_id=v.id AND r.active=1 WHERE p.id IN (${marks}) ORDER BY attempt DESC`,
        );
        for (const { project_id, ...version } of versions) {
          const group = byProject.get(project_id) || [];
          if (group.length < 3) group.push(version);
          byProject.set(project_id, group);
        }
      }
      const adminAnalytics = me.owner || me.role === "admin"
        ? await readAdminSubmissionAnalytics(this.s)
        : undefined;
      const currentScores = new Map(adminAnalytics?.scores.map(score => [score.projectId, score]) || []);
      const frozenScores = new Map(adminAnalytics?.frozenScores.map(score => [score.projectId, score]) || []);
      return {
        me,
        ...(me.owner || me.role === "admin" ? { stats: await readAdminStats(this.s, "submissions", me), demographicFilters: demographics } : {}),
        ...(adminAnalytics ? { submissionAnalytics: adminAnalytics.analytics } : {}),
        unindexedSubmissionCount: unindexed.reduce((n,item)=>n+Number(item.committedVersions || 0),0),
        items: [...items.map((item) => ({
          ...item,
          ...(adminAnalytics ? {
            score: currentScores.get(String(item.id)),
            frozenScore: frozenScores.get(String(item.id)),
          } : {}),
          deleted_at: item.deleted_at ?? undefined,
          versions:
            me.owner || me.role === "admin"
              ? byProject.get(String(item.id)) || []
              : undefined,
        })),...unindexed].sort((a,b)=>String((b as Record<string,unknown>).updated_at || "").localeCompare(String((a as Record<string,unknown>).updated_at || ""))),
      };
    }

    if (/^\/(admin\/submissions|review)\/[^/]+$/.test(route)) {
      const me = await this.s.actor(),
        p = await this.project(route.split("/").at(-1)!);
      const kind = await this.canReview(me, p),
        currentVersion = await this.version(p),
        v = options.focus ? await one<{ id: string; attempt: number; payload: string; created_at: string }>(this.s.db,
          "SELECT id,attempt,payload,created_at FROM submission_versions WHERE id=? AND team_id=?", id.parse(options.focus), p.team_id,
        ) : currentVersion,
        teamIdentity = await one<{
          teamName: string;
          teamPalette: string | null;
        }>(
          this.s.db,
          "SELECT t.name teamName,COALESCE(s.color_key,s.palette) teamPalette FROM teams t LEFT JOIN team_styles s ON s.team_id=t.id WHERE t.id=?",
          p.team_id,
        );
      demand(!options.focus || v, 404, "SUBMISSION_NOT_FOUND");
      const policySettings = await this.s.settings(true);
      const actionState = me.owner || me.role === "admin" ? await evaluationActionState(this.s, p.id, v?.id, p.published_version_id, policySettings.policy.submissionClose) : {};
      return {
        me,
        project: {
          ...p,
          ...teamIdentity,
          draft: JSON.parse(p.draft),
          deleted_at: (
            await one<{ updated_at: string }>(
              this.s.db,
              "SELECT updated_at FROM record_removals WHERE kind='project' AND target_id=? AND active=1",
              p.id,
            )
          )?.updated_at,
        },
        versions:
          me.owner || me.role === "admin"
            ? await rows(
                this.s.db,
                "SELECT v.id,v.attempt,r.updated_at deleted_at FROM submission_versions v LEFT JOIN record_removals r ON r.kind='submission' AND r.target_id=v.id AND r.active=1 WHERE v.team_id=? ORDER BY attempt DESC LIMIT 3",
                p.team_id,
              )
            : undefined,
        version: v ? { ...v, payload: JSON.parse(v.payload) } : undefined,
        currentVersionId: currentVersion?.id || null,
        selectedIsCurrent: !!v && v.id === currentVersion?.id && v.id === p.published_version_id,
        ...(me.owner || me.role === "admin" ? { teamMembers: await adminSubmissionMembers(this.s.db, p.team_id, me) } : {}),
        reviewKind: kind,
        canRestoreEligibility: kind === "judge",
        eligibility: await this.eligibility(p),
        repositoryEvidence:
          kind === "admin" || kind === "judge"
            ? await rows(
                this.s.db,
                "SELECT id,version_id,commit_sha,status,evidence,reason,created_at FROM repository_evidence WHERE project_id=? ORDER BY created_at DESC",
                p.id,
              )
            : undefined,
        rubricReview:
          me.owner || me.role === "admin"
            ? await one(
                this.s.db,
                "SELECT eligibility,astra,codex,diversity,false_claims,evidence FROM reviews WHERE team_id=? AND version_id=?",
                p.team_id,
                v?.id || "",
              )
            : undefined,

        history: await rows(
          this.s.db,
          kind === "mentor"
            ? "SELECT h.id,h.version_id,h.body,h.kind,h.created_at,u.name author FROM project_review_history h JOIN users u ON u.id=h.author_id WHERE h.project_id=? ORDER BY h.created_at DESC"
            : "SELECT h.*,u.name author FROM project_review_history h JOIN users u ON u.id=h.author_id WHERE h.project_id=? ORDER BY h.created_at DESC",
          p.id,
        ),
        runs: !(me.owner || me.role === "admin")
          ? []
          : await rows(
              this.s.db,
              me.owner ? "SELECT id,version_id,config_key,state,error,created_at,updated_at FROM evaluation_runs WHERE project_id=? ORDER BY created_at DESC" : "SELECT id,version_id,state,error,created_at,updated_at FROM evaluation_runs WHERE project_id=? ORDER BY created_at DESC",
              p.id,
            ),
        reviewers:
          me.owner || me.role === "admin"
            ? await rows(
                this.s.db,
                "SELECT u.id,u.name,COALESCE(r.role,u.role) role FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id WHERE COALESCE(r.role,u.role) IN ('judge','mentor')",
              )
            : undefined,
        evaluationConfigured: evaluationAvailability(this.s.evaluator).available,
        evaluationUnavailableReason: evaluationAvailability(this.s.evaluator).reason,
        scoringReady: policyBlockers(policySettings.policy).length === 0,
        evaluation: (me.owner || me.role === "admin") && v ? await latestProviderGrade(this.s.db, p.id, v.id).then(value => {
          if (!value || me.owner) return value;
          const { model: _model, ...report } = value.report;
          return { ...value, report };
        }) : null,
        ...actionState,
      };
    }
    return null;
  }
  async legacyAdminSubmission(actor: Actor, data: unknown) {
    demand(actor.owner || actor.role === "admin", 403, "ADMIN_REQUIRED");
    demand(data && typeof data === "object" && !Array.isArray(data), 422, "INVALID_PROJECT");
    const team = await this.team(actor.id);
    demand(team && team.leader_id === actor.id, 403, "LEADER_REQUIRED");
    const project = await one<Project>(this.s.db, "SELECT * FROM projects WHERE team_id=?", team.id);
    const values = data as Record<string, unknown>;
    // The old flat API must use the same validated project shape and atomic commit.
    const clean = Object.fromEntries(Object.keys(draftSchema.shape)
      .filter(key => key in values).map(key => [key, values[key]]));
    const result = await this.command("submit-project", {
      revision: project?.revision || 0, project: clean, teamId: team.id, actorId: actor.id,
    }, actor, "legacy-submit");
    return { ...result, id: result?.versionId };
  }
  async command(
    action: string,
    data: unknown,
    actor: Actor,
    source?: "legacy-submit",
  ): Promise<Record<string, unknown> | null> {
    if (action === "submit" && (actor.owner || actor.role === "admin"))
      return this.legacyAdminSubmission(actor, data);
    const addedIdea = await addMissingTeamIdea(this.s, action, data);
    if (addedIdea !== null) return addedIdea;
    const aiModel = await ownerAICommand(this.s, action, data);
    if (aiModel !== null) return aiModel;
    const removedTest = await removeOwnTestProject(this.s, action, data);
    if (removedTest !== null) return removedTest;
    const locked = await adminTeamLock(this.s, action, data);
    if (locked !== null) return locked;
    const approval = await approveTeam(this.s, action, data);
    if (approval !== null) return approval;
    const unlocked = await adminTeamUnlock(this.s, action, data);
    if (unlocked !== null) return unlocked;
    const correction = await adminTeamCorrection(this.s, action, data);
    if (correction !== null) return correction;
    if (action === "quick-check-in" || action === "bulk-check-in")
      return checkInParticipants(this.s, actor, action, data);
    if (
      [
        "create-workspace-team",
        "create-team",
        "request-team",
        "respond-team",
        "team-request",
        "team-invite",
        "team-respond",
        "remove-member",
        "remove-workspace-member",
        "leave-workspace-team",
        "team-style",
        "rename-team",
      ].includes(action)
    ) {
      const settings = await this.s.settings(true);
      demand(
        this.s.now() < settings.policy.membershipFreeze,
        409,
        "MEMBERSHIP_FROZEN",
      );
    }
    if (action === "save-workspace-idea" || action === "admin-idea-override") {
      const admin = action === "admin-idea-override";
      const d = z
        .object({
          title: text(120).min(2),
          description: text(500),
          core: z.string().max(500).optional(),
          ...(admin
            ? {
                teamId: id,
                reason: why,
                confirmation: z.literal("OVERRIDE_TEAM_IDEA"),
              }
            : {}),
        })
        .strict()
        .parse(data) as {
        title: string;
        description: string;
        core?: string;
        teamId?: string;
        reason?: string;
        confirmation?: string;
      };
      let team: Team | undefined;
      if (admin) {
        await this.s.staff();
        team = await one<Team>(
          this.s.db,
          "SELECT * FROM teams WHERE id=?",
          d.teamId,
        );
        demand(team, 404, "TEAM_NOT_FOUND");
        await this.s.unfrozen();
      } else {
        await this.completed(actor);
        team = await this.team(actor.id);
        demand(team && team.leader_id === actor.id, 403, "LEADER_REQUIRED");
        await assertUnlockedTeam(this.s, team.id);
        demand(
          this.s.now() < (await this.s.settings(true)).policy.ideaLock,
          409,
          "IDEA_LOCKED",
        );
      }
      const old = await one(
        this.s.db,
        "SELECT * FROM ideas WHERE team_id=?",
        team.id,
      );
      if (admin) demand(old, 404, "IDEA_REQUIRED");
      const hash = await sha256(
          JSON.stringify({ title: d.title, description: d.description }),
        ),
        time = this.s.now(),
        guard = "admin-idea:" + team.id;
      const sql: SQL[] = [
        ...(admin
          ? [["INSERT INTO write_guards VALUES(?,1)", guard] as SQL]
          : []),
        admin ? [
          "UPDATE ideas SET title=?,core=?,description=?,hash=?,updated_at=? WHERE team_id=?",
          d.title,d.description,d.description,hash,time,team.id,
        ] : [
          "INSERT INTO ideas VALUES(?,?,?,?,?,?) ON CONFLICT(team_id) DO UPDATE SET title=excluded.title,core=excluded.core,description=excluded.description,hash=excluded.hash,updated_at=excluded.updated_at",
          team.id,d.title,d.description,d.description,hash,time,
        ],
        [
          "INSERT INTO idea_revisions VALUES(?,?,?,?)",
          crypto.randomUUID(),
          team.id,
          JSON.stringify({
            title: d.title,
            core: d.description,
            description: d.description,
            hash,
            author: actor.id,
            previous: old || null,
            adminOverride: admin,
          }),
          time,
        ],
        ...(admin
          ? [["DELETE FROM write_guards WHERE token=?", guard] as SQL]
          : []),
      ];
      await this.s.mutate(
        actor.id,
        action,
        team.id,
        sql,
        { title: d.title, hash, adminOverride: admin },
        d.reason,
      );
      return {
        message: admin
          ? "Private idea override recorded. Membership and lock are unchanged."
          : "Private idea saved. You may edit it until the team locks.",
      };
    }
    const engagement = await engagementControl(this.s, action, data);
    if (engagement) return engagement;
    const removed = await removalCommand(this.s, action, data);
    if (removed) return removed;
    const repository = await repositoryCommand(this.s, action, data);
    if (repository) return repository;
    const override = await statusCommand(this.s, action, data);
    if (override) return override;
    const qualification = await qualificationCommand(this.s, action, data);
    if (qualification) return qualification;
    const policy = await policyControl(this.s, action, data);
    if (policy) return policy;
    const reveal = await revealCommand(this.s, action, data);
    if (reveal) return reveal;
    const content = await eventContentCommand(this.s, action, data);
    if (content) return content;
    if (action === "lock-team") {
      z.object({ confirmation: z.literal("LOCK_TEAM") })
        .strict()
        .parse(data);
      await this.completed(actor);
      const t = await this.team(actor.id);
      demand(t && t.leader_id === actor.id, 403, "LEADER_REQUIRED");
      if (
        await one(
          this.s.db,
          "SELECT team_id FROM team_locks WHERE team_id=?",
          t.id,
        )
      )
        return { message: "Team is already locked." };
      const idea = await one<{ title: string; core: string }>(
        this.s.db,
        "SELECT title,core FROM ideas WHERE team_id=?",
        t.id,
      );
      demand(
        idea?.title.trim() && idea.core.trim(),
        422,
        "TEAM_IDEA_REQUIRED",
        "Save the completed team idea before locking.",
      );
      const members = await rows<{ user_id: string }>(
        this.s.db,
        "SELECT user_id FROM memberships WHERE team_id=?",
        t.id,
      );
      demand(members.length > 0 && members.length <= 5, 409, "TEAM_SIZE");
      for (const m of members) {
        const profile = await this.profile({ ...actor, id: m.user_id });
        demand(
          profile.complete,
          409,
          "MEMBER_PROFILE_REQUIRED",
          "Every member must complete their profile before the leader locks the team.",
        );
      }
      await this.s.mutate(
        actor.id,
        action,
        t.id,
        [
          [
            "INSERT INTO team_locks VALUES(?,?,?) ON CONFLICT DO NOTHING",
            t.id,
            actor.id,
            this.s.now(),
          ],
        ],
        { locked: true, members: members.length },
      );
      return {
        message:
          "Team locked for admin review. Approval and Going remain separate; Luma updates are manual.",
      };
    }
    if (action === "complete-profile") {
      const d = z
        .object({
          phone: z.string().trim().max(30).optional(),
          bestDescription: z.string().trim().max(200).optional(),
          organization: z.string().trim().max(300).optional(),
          openaiOrgId: z.string().trim().max(200).optional(),
          avatarColor: z
            .enum(
              Object.keys(dotColors) as [
                keyof typeof dotColors,
                ...(keyof typeof dotColors)[],
              ],
            )
            .default("blue"),
          avatarExpression: z
            .enum(
              Object.keys(dotExpressions) as [
                keyof typeof dotExpressions,
                ...(keyof typeof dotExpressions)[],
              ],
            )
            .default("squeezed"),
          displayName: text(100).min(2),
          bio: text(240).refine(
            (v) => !/[\r\n]/.test(v),
            "Use a one-line bio.",
          ),
          skills: z.string().max(500).optional(),
          socialLinks: z
            .array(
              z
                .object({
                  type: z.enum([
                    "X",
                    "LinkedIn",
                    "GitHub",
                    "Instagram",
                    "Website",
                  ]),
                  url: httpsUrl,
                })
                .strict(),
            )
            .max(8)
            .optional(),
          socials: z.string().max(12000).default(""),
          public: z.boolean().default(false),
          gender: z.enum(["woman", "man", "non-binary"]),
          genderDescription: z.string().max(100).default(""),
        })
        .strict()
        .parse(data);
      const currentDetails = await one<{
        phone: string;
        best_description: string;
        organization: string;
        openai_org_id: string;
      }>(this.s.db, "SELECT * FROM profile_details WHERE user_id=?", actor.id);
      const phone = normalizePhone(d.phone ?? currentDetails?.phone ?? "");
      demand(
        profilePhonePattern.test(phone),
        422,
        "PHONE_REQUIRED",
        "Enter your phone number.",
      );
      const description =
        d.bestDescription ?? currentDetails?.best_description ?? "";
      const initialPrefill = await one<{ payload: string }>(
        this.s.db,
        "SELECT rp.payload FROM roster_prefills rp LEFT JOIN participant_profiles pp ON pp.user_id=? WHERE rp.email=? AND pp.completed_at IS NULL",
        actor.id,
        actor.email,
      );
      const importedDescription = initialPrefill
        ? JSON.parse(initialPrefill.payload).bestDescription
        : undefined;
      demand(
        !description ||
          description === currentDetails?.best_description ||
          description === importedDescription ||
          profileDescriptionChoices.includes(description),
        422,
        "PROFILE_DESCRIPTION_INVALID",
        "Choose one of the event's profile categories.",
      );
      const links = (
        d.socialLinks ? d.socialLinks.map((v) => v.url).join("\n") : d.socials
      )
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean);
      demand(links.length <= 8, 422, "TOO_MANY_SOCIALS");
      links.forEach((v) => httpsUrl.parse(v));
      await this.s.mutate(
        actor.id,
        action,
        actor.id,
        [
          [
            "INSERT INTO participant_profiles(user_id,display_name,skills,completed_at,gender_confirmed) VALUES(?,?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,skills=COALESCE(?,participant_profiles.skills),completed_at=excluded.completed_at,gender_confirmed=1",
            actor.id,
            d.displayName,
            d.skills || "",
            this.s.now(),
            d.skills ?? null,
          ],
          [
            "UPDATE profiles SET bio=?,socials=?,gender=?,gender_description=?,public=? WHERE user_id=?",
            d.bio,
            JSON.stringify(links),
            d.gender,
            d.genderDescription,
            d.public ? 1 : 0,
            actor.id,
          ],
          [
            "INSERT INTO profile_details(user_id,phone,best_description,organization,openai_org_id,avatar_color,avatar_expression) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,best_description=excluded.best_description,organization=excluded.organization,openai_org_id=excluded.openai_org_id,avatar_color=excluded.avatar_color,avatar_expression=excluded.avatar_expression",
            actor.id,
            phone,
            description,
            d.organization ?? currentDetails?.organization ?? "",
            d.openaiOrgId ?? currentDetails?.openai_org_id ?? "",
            d.avatarColor,
            d.avatarExpression,
          ],
        ],
        {
          fields: [
            "name",
            "bio",
            "socials",
            "private-sex",
            "phone",
            "organization",
            "openai-org-id",
            "avatar",
          ],
        },
      );
      return { message: "Profile saved. Your workspace is ready." };
    }
    if (action === "create-workspace-team") {
      await this.completed(actor);
      demand(actor.role === "participant", 403, "PARTICIPANT_REQUIRED");
      const d = z
        .object({
          name: text(80),
          bio: z.string().max(1000).default(""),
          avatar: z.literal("initials").default("initials"),
          palette,
        })
        .strict()
        .parse(data);
      demand(!(await this.team(actor.id)), 409, "ALREADY_IN_TEAM");
      const registration = await one<{ status: string }>(
        this.s.db,
        "SELECT status FROM registrations WHERE email=?",
        actor.email,
      );
      demand(
        !registration ||
          !["rejected", "cancelled"].includes(registration.status),
        403,
        "REGISTRATION_REQUIRED",
      );
      const teamId = crypto.randomUUID();
      await this.s.mutate(
        actor.id,
        action,
        teamId,
        [
          [
            "INSERT INTO teams VALUES(?,?,?,?,?)",
            teamId,
            d.name,
            actor.id,
            d.bio,
            this.s.now(),
          ],
          [
            "INSERT INTO memberships VALUES(?,?,?)",
            actor.id,
            teamId,
            this.s.now(),
          ],
          [
            "INSERT INTO team_styles(team_id,avatar,palette,color_key) VALUES(?,?,?,?)",
            teamId,
            "fold",
            legacyTeamPalette(d.palette),
            d.palette,
          ],
        ],
        { name: d.name, avatar: d.avatar, palette: d.palette },
      );
      return {
        message: "Team created. Approval readiness is tracked separately.",
        teamId,
      };
    }
    if (action === "rename-team") {
      const d = z
          .object({ name: text(80).min(2), reason: why })
          .strict()
          .parse(data),
        team = await this.team(actor.id);
      demand(team && team.leader_id === actor.id, 403, "LEADER_REQUIRED");
      await assertUnlockedTeam(this.s, team.id);
      await this.s.unfrozen();
      demand(
        this.s.now() < (await this.s.settings(true)).policy.membershipFreeze,
        409,
        "MEMBERSHIP_FROZEN",
      );
      if (d.name === team.name) return { message: "Team name is unchanged." };
      await this.s.mutate(
        actor.id,
        action,
        team.id,
        [
          [
            "UPDATE teams SET name=? WHERE id=? AND leader_id=? AND name=?",
            d.name,
            team.id,
            actor.id,
            team.name,
          ],
          ...assertPreviousWrite(),
        ],
        { before: team.name, after: d.name },
        d.reason,
      );
      return {
        message:
          "Team renamed. Membership, lock and submission history are unchanged.",
      };
    }
    if (action === "team-style") {
      const d = z
          .object({
            avatar: z.literal("initials").default("initials"),
            palette,
          })
          .strict()
          .parse(data),
        t = await this.team(actor.id);
      demand(t && t.leader_id === actor.id, 403, "LEADER_REQUIRED");
      await assertUnlockedTeam(this.s, t.id);
      await this.s.mutate(
        actor.id,
        action,
        t.id,
        [
          [
            "INSERT INTO team_styles(team_id,avatar,palette,color_key) VALUES(?,?,?,?) ON CONFLICT(team_id) DO UPDATE SET avatar=excluded.avatar,palette=excluded.palette,color_key=excluded.color_key",
            t.id,
            "fold",
            legacyTeamPalette(d.palette),
            d.palette,
          ],
        ],
        d,
      );
      return { message: "Team identity updated for every member." };
    }
    if (action === "remove-workspace-member" || action === "leave-workspace-team") {
      const leaving = action === "leave-workspace-team";
      if (leaving) z.object({ confirmation: z.literal("LEAVE_TEAM") }).strict().parse(data);
      const d = leaving ? { userId: actor.id, reason: "Participant left their team" } : z.object({ userId: id, reason: why }).strict().parse(data),
        t = await this.team(d.userId);
      demand(t, 404, "TEAM_NOT_FOUND");
      demand(
        actor.owner || actor.role === "admin" || t.leader_id === actor.id || (leaving && actor.id === d.userId),
        403,
        "TEAM_MANAGER_REQUIRED",
      );
      await assertUnlockedTeam(this.s, t.id);
      demand(d.userId !== t.leader_id, 409, "TRANSFER_LEADERSHIP_FIRST");
      await this.s.unfrozen();
      const settings = await this.s.settings(true);
      demand(
        !settings.active || this.s.now() < settings.policy.membershipFreeze,
        409,
        "MEMBERSHIP_FROZEN",
      );
      await this.s.mutate(
        actor.id,
        action,
        t.id,
        [
          [
            "DELETE FROM memberships WHERE user_id=? AND team_id=?",
            d.userId,
            t.id,
          ],
          ...(leaving ? assertPreviousWrite() : []),
        ],
        { userId: d.userId },
        d.reason,
      );
      return {
        message:
          leaving ? "You left the team." : "Membership removed. Readiness and private venue access recalculated.",
      };
    }
    if (action === "request-team" || action === "respond-team") {
      await this.completed(actor);
      if (action === "request-team") {
        demand(actor.role === "participant", 403, "PARTICIPANT_REQUIRED");
        const d = z.object({ teamId: id }).strict().parse(data);
        demand(!(await this.team(actor.id)), 409, "ALREADY_IN_TEAM");
        await assertUnlockedTeam(this.s, d.teamId);
        demand(
          await one(this.s.db, "SELECT id FROM teams WHERE id=?", d.teamId),
          404,
          "TEAM_NOT_FOUND",
        );
        const previous = await one<{ id: string; status: string; created_at: string }>(
          this.s.db,
          "SELECT id,status,created_at FROM team_actions WHERE team_id=? AND user_id=? AND kind='request'",
          d.teamId,
          actor.id,
        );
        const response = (requestId: string) => ({
          requestId,
          message: "Request sent to the team leader.",
        });
        if (previous?.status === "pending") return response(previous.id);
        const requestId = crypto.randomUUID();
        try {
          await this.s.mutate(
            actor.id,
            action,
            d.teamId,
            [
              [
                "INSERT INTO team_actions VALUES(?,?,?,'request','pending',?) ON CONFLICT(team_id,user_id,kind) DO UPDATE SET id=excluded.id,status='pending',created_at=excluded.created_at WHERE team_actions.id=? AND team_actions.status=? AND team_actions.status<>'pending'",
                requestId,
                d.teamId,
                actor.id,
                this.s.now(),
                previous?.id || "",
                previous?.status || "",
              ],
              ...assertPreviousWrite(),
            ],
            {
              requestId,
              ...(previous ? { previousRequest: {
                id: previous.id,
                status: previous.status,
                createdAt: previous.created_at,
              } } : {}),
            },
          );
        } catch (error) {
          if (!/CHECK constraint failed: valid=1|write_guards.*check|write_guards_valid_check/i.test(
            error instanceof Error ? error.message : String(error),
          )) throw error;
          const fresh = await this.s.actor();
          demand(!fresh.deactivated, 403, "PARTICIPANT_REMOVED");
          demand(fresh.role === "participant", 403, "PARTICIPANT_REQUIRED");
          demand(fresh.rostered || fresh.owner, 403, "VIEWER_READ_ONLY");
          demand(!(await this.team(actor.id)), 409, "ALREADY_IN_TEAM");
          await assertUnlockedTeam(this.s, d.teamId);
          const pending = await one<{ id: string }>(this.s.db,
            "SELECT id FROM team_actions WHERE team_id=? AND user_id=? AND kind='request' AND status='pending'",
            d.teamId, actor.id);
          if (pending) return response(pending.id);
          throw new PortalError(409, "REQUEST_CHANGED_RELOAD", "This request changed. Refresh and try again.");
        }
        return response(requestId);
      }
      const d = z
          .object({ requestId: id, accept: z.boolean() })
          .strict()
          .parse(data),
        r = await one<{
          id: string;
          team_id: string;
          user_id: string;
          status: string;
          leader_id: string;
        }>(
          this.s.db,
          "SELECT a.*,t.leader_id FROM team_actions a JOIN teams t ON t.id=a.team_id WHERE a.id=? AND a.kind='request'",
          d.requestId,
        );
      demand(r && r.leader_id === actor.id, 403, "LEADER_REQUIRED");
      await assertUnlockedTeam(this.s, r.team_id);
      demand(r.status === "pending", 409, "REQUEST_ALREADY_RESOLVED");
      try {
        await this.s.mutate(
          actor.id,
          action,
          r.team_id,
          [
            ...(d.accept
              ? [
                  [
                    "INSERT INTO memberships(user_id,team_id,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM team_actions WHERE id=? AND status='pending')",
                    r.user_id,
                    r.team_id,
                    this.s.now(),
                    r.id,
                  ] as SQL,
                ]
              : []),
            [
              "UPDATE team_actions SET status=? WHERE id=? AND status='pending'",
              d.accept ? "accepted" : "declined",
              r.id,
            ],
            ...assertPreviousWrite(),
          ],
          { accepted: d.accept },
        );
      } catch (error) {
        if (!/CHECK constraint failed: valid=1|write_guards.*check|write_guards_valid_check/i.test(
          error instanceof Error ? error.message : String(error),
        )) throw error;
        const fresh = await this.s.actor();
        demand(!fresh.deactivated, 403, "PARTICIPANT_REMOVED");
        const latest = await one<{ status: string; leader_id: string }>(this.s.db,
          "SELECT a.status,t.leader_id FROM team_actions a JOIN teams t ON t.id=a.team_id WHERE a.id=? AND a.kind='request'", r.id);
        demand(latest?.leader_id === actor.id, 403, "LEADER_REQUIRED");
        demand(latest.status === "pending", 409, "REQUEST_ALREADY_RESOLVED");
        throw error;
      }
      return {
        message: d.accept
          ? "Member joined. Team readiness recalculated."
          : "Request declined.",
      };
    }
    if (action === "save-project" || action === "submit-project") {
      const t = await this.team(actor.id);
      demand(t && t.leader_id === actor.id, 403, "LEADER_REQUIRED");
      await this.s.unfrozen();
      const access = await requireSubmissionAccess(this.s, t.id);
      if (!access.adminSubmissionTest) await this.completed(actor);
      const d = z
          .object({ revision: z.number().int().min(0), project: draftSchema,teamId:id.optional(),actorId:id.optional() })
          .strict()
          .parse(data),
        p = await one<Project>(
          this.s.db,
          "SELECT * FROM projects WHERE team_id=?",
          t.id,
        );
      demand(!d.teamId || d.teamId === t.id,409,"SUBMISSION_TEAM_CHANGED","Your team changed. Reload before saving or submitting.");
      demand(!d.actorId || d.actorId === actor.id,409,"SUBMISSION_ACCOUNT_CHANGED","Your signed-in account changed. Reload before saving or submitting.");
      const requestKey = await sha256(
        JSON.stringify(source === "legacy-submit" ? {legacy:true,project:d.project} : { revision: d.revision, project: d.project }),
      );
      if (action === "submit-project") {
        const receipt = await one<{ project_id: string; version_id: string; attempt: number }>(
          this.s.db,
          "SELECT r.project_id,r.version_id,v.attempt FROM project_commit_receipts r JOIN submission_versions v ON v.id=r.version_id WHERE r.team_id=? AND r.request_key=?",
          t.id,
          requestKey,
        );
        if (receipt)
          return {
            message: "This submission was already committed.",
            projectId: receipt.project_id,
            versionId: receipt.version_id,
            attemptsUsed: receipt.attempt,
          };
      }
      demand(p || access.attemptsUsed === 0,409,"PROJECT_INDEX_MISSING","Committed submissions exist without a project record. History is preserved; ask the owner to reconcile it before submitting again.");
      demand(
        !access.locked,
        409,
        "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION",
        "Three submissions are committed. No more project edits are allowed.",
      );
      demand((p?.revision || 0) === d.revision, 409, "PROJECT_CHANGED_RELOAD");
      if (d.project.logo) validateProjectImage(d.project.logo, "logo");
      if (d.project.banner) validateProjectImage(d.project.banner, "banner");
      const projectId = p?.id || crypto.randomUUID(),
        updatedAt = this.s.now(),
        slug = p?.slug || "project-" + projectId;
      const sql: SQL[] = p
        ? [
            [
              "UPDATE projects SET draft=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
              JSON.stringify(d.project),
              updatedAt,
              p.id,
              d.revision,
            ],
          ]
        : [
            [
              "INSERT INTO projects(id,team_id,slug,draft,updated_at) VALUES(?,?,?,?,?)",
              projectId,
              t.id,
              slug,
              JSON.stringify(d.project),
              updatedAt,
            ],
          ];
      const draftGuard = "admin-test-project:" + JSON.stringify([t.id, actor.id, projectId, updatedAt]);
      if (access.adminSubmissionTest) sql.unshift(...adminSubmissionAuthority(actor, t.id), ["INSERT INTO write_guards VALUES(?,1)", draftGuard]);
      sql.push(...assertPreviousWrite());
      if (access.adminSubmissionTest) sql.push(["DELETE FROM write_guards WHERE token=?", draftGuard]);
      if (action === "submit-project") {
        if (!access.adminTimeOverride) await this.s.operational("submissions");

        text(120).parse(d.project.projectName);
        text(500).parse(d.project.problemSolution);
        text(6000).parse(d.project.description);
        githubUrl.parse(d.project.github);
        // Repository evidence is collected separately; participants never supply a hash.
        d.project.commitSha = "";
        if (d.project.demo) httpsUrl.parse(d.project.demo);
        validateProjectImage(d.project.logo, "logo");
        validateProjectImage(d.project.banner, "banner");
        demand(d.project.attestation, 422, "ATTESTATION_REQUIRED");
        const versionId = crypto.randomUUID();
        const createdAt = this.s.now();
        const testGuard = "admin-test-submission:" + JSON.stringify([t.id, actor.id, versionId, createdAt]);
        if (access.adminSubmissionTest) sql.push(["INSERT INTO write_guards VALUES(?,1)", testGuard]);
        sql.push([
          "INSERT INTO submission_versions SELECT ?,?,COALESCE(MAX(attempt),0)+1,?,? FROM submission_versions WHERE team_id=?",
          versionId,
          t.id,
          JSON.stringify(d.project),
          createdAt,
          t.id,
        ]);
        if (access.adminSubmissionTest) sql.push(["DELETE FROM write_guards WHERE token=?", testGuard]);
        sql.push([
          "INSERT INTO astra_jobs(id,version_id,updated_at) VALUES(?,?,?)",
          crypto.randomUUID(),
          versionId,
          this.s.now(),
        ]);
        sql.push([
          "UPDATE projects SET published_version_id=? WHERE id=?",
          versionId,
          projectId,
        ]);
        sql.push([
          "INSERT INTO project_commit_receipts VALUES(?,?,?,?,?)",
          t.id,
          requestKey,
          projectId,
          versionId,
          this.s.now(),
        ]);
      }
      try {
        await this.s.mutate(actor.id, action, projectId, sql, {
          fields: ["project", "media"],
          submitted: action === "submit-project",
          ...(access.adminSubmissionTest ? { adminSubmissionTest: true, timeWindowOverridden: access.adminTimeOverride } : {}),
        });
      } catch (error) {
        if (action === "submit-project") {
          const receipt = await one<{ project_id: string; version_id: string; attempt: number }>(
            this.s.db,
            "SELECT r.project_id,r.version_id,v.attempt FROM project_commit_receipts r JOIN submission_versions v ON v.id=r.version_id WHERE r.team_id=? AND r.request_key=?",
            t.id,
            requestKey,
          );
          if (receipt)
            return {
              message: "This submission was already committed.",
              projectId: receipt.project_id,
              versionId: receipt.version_id,
              attemptsUsed: receipt.attempt,
            };
        }
        throw error;
      }
      return {
        message:
          action === "submit-project"
            ? "Project submitted successfully."
            : "Project draft saved.",
        projectId,
        ...(action === "submit-project"
          ? (await one<{ versionId: string; attemptsUsed: number }>(
                  this.s.db,
                  "SELECT r.version_id versionId,v.attempt attemptsUsed FROM project_commit_receipts r JOIN submission_versions v ON v.id=r.version_id WHERE r.team_id=? AND r.request_key=?",
                  t.id,
                  requestKey,
                )) || {}
          : {}),
      };
    }
    if (action === "set-project-eligibility") {
      const d = z
        .object({
          projectId: id,
          versionId: id,
          status: z.enum(["eligible", "ineligible", "needs_review"]),
          reason: why,
          violation: z
            .object({
              rule: z.string().trim().min(5).max(1000),
              evidence: z.string().trim().min(10).max(3000),
            })
            .strict()
            .optional(),
        })
        .strict()
        .parse(data);
      await eligibilityReviewer(this.s, d.projectId, d.status === "eligible");
      await this.s.unfrozen();
      const p = await this.project(d.projectId),
        v = await this.version(p);
      demand(v?.id === d.versionId, 409, "PROJECT_VERSION_CHANGED");
      demand(
        d.status !== "ineligible" || !!d.violation,
        422,
        "ESTABLISHED_VIOLATION_REQUIRED",
        "A proven rule violation and private evidence are required. An API timeout is unverifiable, not a violation.",
      );
      await this.s.mutate(
        actor.id,
        action,
        p.id,
        eligibilityWrite(
          {
            id: p.id,
            versionId: v.id,
            status: d.status,
            reason: d.reason,
            evidence: {
              manual: true,
              violation: d.violation || null,
              commitSha: JSON.parse(v.payload).commitSha || null,
            },
          },
          actor.id,
          this.s.now(),
        ),
        { versionId: v.id, status: d.status },
        d.reason,
      );
      return {
        message:
          "Eligibility recorded for the committed version. Team progress remains Submitted; private evidence stays private.",
      };
    }
    if (action === "upvote-project" || action === "comment-project") {
      const engagement = await engagementState(this.s);
      if (!actor.deactivated && (actor.owner || actor.role === "admin"))
        engagement.feedbackPaused = false;
      if (action === "upvote-project") demand(!engagement.votingPaused, 409, "VOTING_CLOSED", engagement.votingWindow.message);
      const d = z
          .object({
            projectId: id,
            voted: z.boolean().optional(),
            body:
              action === "comment-project"
                ? text(1500).refine(value => feedbackLengthValid(value, 1500), "Enter at least 30 and at most 1,500 characters after trimming spaces.")
                : z.string().optional(),
          })
          .strict()
          .parse(data),
        p = await this.project(d.projectId);
      demand(
        p.published_version_id &&
          (await this.eligibility(p)).status === "eligible",
        404,
        "PROJECT_NOT_ELIGIBLE",
      );
      if (action === "upvote-project") {
        const own = await this.team(actor.id);
        if (d.voted !== false && own?.id === p.team_id)
          demand(
            (await personStatus(this.s, actor.id)).checkedIn,
            403,
            "OWN_PROJECT_CHECKIN_REQUIRED",
          );
      }
      const staffComment = action === "comment-project" && !actor.deactivated && (actor.owner || actor.role === "admin");
      const commentGuard = "staff-comment:" + JSON.stringify([actor.id, p.id, this.s.now()]);
      const voteGuard = "vote-settings:" + crypto.randomUUID();
      await this.s.mutate(
        actor.id,
        action,
        p.id,
        action === "upvote-project"
          ? [
              ["INSERT INTO write_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND active=1 AND version=?) THEN 1 ELSE 0 END)",voteGuard,engagement.settingsVersion],
              ["DELETE FROM write_guards WHERE token=?",voteGuard],
              d.voted === false
                ? ["DELETE FROM project_upvotes WHERE project_id=? AND user_id=?", p.id, actor.id]
                : ["INSERT INTO project_upvotes VALUES(?,?,?) ON CONFLICT DO NOTHING", p.id, actor.id, this.s.now()],
            ]
          : [
              ...(staffComment ? [["INSERT INTO write_guards(token,valid) VALUES(?,1)", commentGuard] as SQL] : []),
              [
                "INSERT INTO project_comments VALUES(?,?,?,?,?)",
                crypto.randomUUID(),
                p.id,
                actor.id,
                d.body!,
                this.s.now(),
              ],
              ...(staffComment ? [["DELETE FROM write_guards WHERE token=?", commentGuard] as SQL] : []),
            ],
        { publicEngagement: true },
      );
      return {
        message:
          action === "upvote-project" ? (d.voted === false ? "Upvote removed." : "Upvote recorded.") : "Comment posted.",
      };
    }
    if (action === "participant-bulk") {
      const d = z
        .object({
          emails: z.array(emailSchema).min(1).max(250),
          status: z
            .enum(["pending", "approved", "rejected", "cancelled"])
            .optional(),
          checkIn: z.boolean().default(false),
          reason: why,
        })
        .strict()
        .parse(data);
      if (d.checkIn)
        demand(
          actor.owner || ["admin", "volunteer"].includes(actor.role),
          403,
          "CHECKIN_OPERATOR_REQUIRED",
        );
      else await this.s.staff();
      demand(!(d.checkIn && d.status), 422, "SEPARATE_STATUS_AND_ATTENDANCE");
      if (d.checkIn)
        return checkInParticipants(this.s, actor, action, {
          emails: d.emails,
          reason: d.reason,
        });
      const emails = [...new Set(d.emails)],
        sql: SQL[] = [];
      {
        demand(d.status, 422, "STATUS_REQUIRED");
        for (const email of emails) {
          sql.push([
            "INSERT INTO registrations(email,status) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET status=excluded.status",
            email,
            d.status,
          ]);
          sql.push([
            "DELETE FROM participant_status_overrides WHERE user_id=(SELECT id FROM users WHERE email=?)",
            email,
          ]);
        }
      }
      await this.s.mutate(
        actor.id,
        action,
        "participants",
        sql,
        { count: emails.length, status: d.status, checkIn: d.checkIn },
        d.reason,
      );
      return {
        message:
          d.status === "approved"
            ? "You’re Going. Individual approvals updated."
            : "Participant status updated.",
      };
    }
    if (action === "revoke-admin") return revokeAdminAccess(this.s, data);
    if (action === "add-admin") {
      await this.s.staff(true);
      const d = z
        .object({ email: emailSchema, confirmation: z.literal("ADD_ADMIN") })
        .strict()
        .parse(data);
      const target = await one<{ id: string; role: string }>(
        this.s.db,
        "SELECT u.id,COALESCE(r.role,u.role) role FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id WHERE u.email=?",
        d.email,
      );
      demand(
        target,
        422,
        "ACCOUNT_MUST_SIGN_IN_FIRST",
        "This person must sign in before being added as an admin.",
      );
      demand(
        target.id !== actor.id && target.role !== "owner",
        422,
        "OWNER_IDENTITY_IS_PLATFORM_MANAGED",
      );
      demand(
        !(await one(
          this.s.db,
          "SELECT target_id FROM record_removals WHERE kind='participant' AND target_id=? AND active=1",
          target.id,
        )),
        409,
        "PARTICIPANT_REMOVED",
      );
      if (target.role === "admin") return { message: "Already an admin." };
      await this.s.mutate(
        actor.id,
        action,
        target.id,
        [
          [
            "INSERT INTO portal_roles SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=? AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=u.id AND rr.active=1)) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,granted_by=excluded.granted_by,updated_at=excluded.updated_at WHERE NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=excluded.user_id AND rr.active=1)",
            target.id,
            "admin",
            actor.id,
            this.s.now(),
            target.id,
          ],
          ...assertPreviousWrite(),
          ["DELETE FROM private_venue_managers WHERE user_id=?", target.id],
          ["DELETE FROM project_assignments WHERE user_id=?", target.id],
        ],
        { role: "admin" },
        "Confirmed portal action",
      );
      return { message: "Admin added." };
    }
    if (action === "portal-role") {
      await this.s.staff(true);
      const d = z
        .object({ userId: id, role: z.enum(portalRoles), reason: why })
        .strict()
        .parse(data);
      demand(d.userId !== actor.id, 422, "OWNER_IDENTITY_IS_PLATFORM_MANAGED");
      demand(
        await one(this.s.db, "SELECT id FROM users WHERE id=?", d.userId),
        404,
        "USER_NOT_FOUND",
      );
      await this.s.mutate(
        actor.id,
        action,
        d.userId,
        [
          [
            "INSERT INTO portal_roles VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,granted_by=excluded.granted_by,updated_at=excluded.updated_at",
            d.userId,
            d.role,
            actor.id,
            this.s.now(),
          ],
          ["DELETE FROM private_venue_managers WHERE user_id=?", d.userId],
          [
            "DELETE FROM project_assignments WHERE user_id=? AND kind<>?",
            d.userId,
            d.role,
          ],
        ],
        { role: d.role },
        d.reason,
      );
      return { message: "Role updated with an audit entry." };
    }
    if (action === "assign-project") {
      await this.s.staff();
      const d = z
          .object({
            projectId: id,
            userId: id,
            kind: z.enum(["judge", "mentor"]),
            reason: why,
          })
          .strict()
          .parse(data),
        p = await this.project(d.projectId);
      const u = await one<{ role: string }>(
        this.s.db,
        "SELECT COALESCE(r.role,u.role) role FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id WHERE u.id=?",
        d.userId,
      );
      demand(u?.role === d.kind, 422, "REVIEWER_ROLE_REQUIRED");
      demand(
        (await this.team(d.userId))?.id !== p.team_id,
        409,
        "REVIEWER_CONFLICT",
      );
      await this.s.mutate(
        actor.id,
        action,
        p.id,
        [
          [
            "INSERT INTO project_assignments VALUES(?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET kind=excluded.kind",
            p.id,
            d.userId,
            d.kind,
          ],
        ],
        { kind: d.kind, userId: d.userId },
        d.reason,
      );
      return { message: "Project assigned." };
    }
    if (action === "review-project") {
      const d = z
          .object({
            projectId: id,
            versionId: id,
            body: z.string().trim().max(4000).default(""),
            rating: z.number().finite().min(0).max(100).optional(),
            ratingScale: z.union([z.literal(10), z.literal(100)]).default(10),
          })
          .strict()
          .parse(data),
        p = await this.project(d.projectId),
        kind = await this.canReview(actor, p),
        v = await this.version(p);
      demand(v?.id === d.versionId, 409, "PROJECT_VERSION_CHANGED");
      demand(d.rating === undefined || d.rating <= d.ratingScale, 422, "INVALID_REVIEW_SCORE", "Score exceeds its declared scale.");
      const normalizedRating = d.rating === undefined ? null : d.rating * 10 / d.ratingScale;
      demand(
        kind === "judge" || kind === "admin" || d.rating === undefined,
        403,
        "ONLY_ASSIGNED_JUDGES_SCORE",
      );
      demand(
        d.rating !== undefined || d.body.length > 0,
        422,
        "REVIEW_CONTENT_REQUIRED",
      );
      if (d.rating !== undefined)
        demand(
          !(await one(
            this.s.db,
            "SELECT user_id FROM memberships WHERE team_id=? AND user_id=?",
            p.team_id,
            actor.id,
          )),
          403,
          "JUDGE_CONFLICT",
        );
      await this.s.unfrozen();
      await this.s.mutate(
        actor.id,
        action,
        p.id,
        [
          [
            "INSERT INTO project_review_history VALUES(?,?,?,?,?,?,?,?)",
            crypto.randomUUID(),
            p.id,
            d.versionId,
            actor.id,
            kind,
            d.body,
            normalizedRating,
            this.s.now(),
          ],
        ],
        { versionId: d.versionId, kind, hasRating: d.rating !== undefined, enteredRating: d.rating ?? null, inputScale: d.ratingScale, canonicalScale: 10 },
      );
      return {
        message:
          "Private review saved. Team feedback contains no numeric score.",
      };
    }
    if (action === "reevaluate-project") {
      const d = z.object({ projectId: id, versionId: id }).strict().parse(data);
      await this.s.staff();
      await this.s.unfrozen();
      const availability = evaluationAvailability(this.s.evaluator);
      demand(availability.available, 503, "EVALUATOR_NOT_CONFIGURED", availability.reason);
      const p = await this.project(d.projectId), v = await this.version(p);
      demand(v?.id === d.versionId && p.published_version_id === v.id, 409, "STALE_SUBMISSION");
      demand(!(await one(this.s.db, "SELECT target_id FROM record_removals WHERE active=1 AND ((kind='project' AND target_id=?) OR (kind='submission' AND target_id=?))", p.id, v.id)), 409, "RECORD_REMOVED");
      const job = await one<{ id: string; state: string; attempts: number }>(this.s.db, "SELECT id,state,attempts FROM astra_jobs WHERE version_id=?", v.id);
      demand(job && job.attempts < 3 && job.state !== "running", 409, "JOB_NOT_RUNNABLE");
      if (job.state === "finalized") {
        await this.s.mutate(actor.id, "request-evaluation", job.id, [
          ["UPDATE astra_jobs SET state='needs_review',updated_at=? WHERE id=? AND state='finalized' AND attempts=? AND attempts<3 AND NOT EXISTS(SELECT 1 FROM result_snapshots)", this.s.now(), job.id, job.attempts],
          ...assertPreviousWrite(),
        ], { versionId: v.id });
      }
      return this.s.command("astra-run", { jobId: job.id });
    }
    return null;
  }
}
