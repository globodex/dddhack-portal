import { auditReason } from "./security";
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
  requireGoingForCheckin,
} from "./team-access";
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
import {
  eventContentCommand,
  publicEventContent,
  managesPrivateVenue,
  publicContentSchema,
  privateVenueSchema,
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
    commitSha: z.unknown().transform(() => ""),
    demo: z.string().max(2048).default(""),
    logo: z.string().max(180000).default(""),
    banner: z.string().max(180000).default(""),
    tools: z.string().max(2000).default(""),
    cerebrasIntegration: z.enum(["yes", "no"]).optional(),
    ecosystemSelections: z
      .array(z.enum(submissionToolChoices))
      .max(6)
      .refine((items) => new Set(items).size === items.length)
      .optional(),
    // Retired participant fields are ignored before request identity/persistence.
    contributions: z.unknown().transform(() => []),
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
      bio: p?.bio || prefill.bio || "",
      gender: p?.gender_confirmed ? p.gender : prefill.gender || p?.gender,
      gender_prefilled: !!prefill.gender,
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
    validateProjectImage(d.logo || "", "logo");
    validateProjectImage(d.banner || "", "banner");
    const publishedScores = disclosure ?? (await publicScores(this.s));
    const revealed = publishedScores.scores.find(
      (e) => e.projectId === p.id && e.versionId === p.published_version_id,
    );
    return {
      id: p.id,
      firstSubmittedAt: fact.firstSubmittedAt ?? undefined,
      slug: p.slug,
      teamName: fact.teamName,
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
      submitted: number;
      avatarColor: string | null;
      avatarExpression: string | null;
    }>(
      this.s.db,
      "SELECT u.id,COALESCE(x.display_name,u.name) name,r.email,r.status approval,c.created_at checked_in,t.id team_id,t.name team_name,(SELECT count(*) FROM submission_versions v WHERE v.team_id=t.id) submitted,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression FROM registrations r LEFT JOIN users u ON u.email=r.email LEFT JOIN profile_details pd ON pd.user_id=u.id LEFT JOIN participant_profiles x ON x.user_id=u.id LEFT JOIN check_ins c ON c.user_id=u.id LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN teams t ON t.id=m.team_id UNION ALL SELECT u.id,COALESCE(x.display_name,u.name),u.email,'pending',c.created_at,t.id,t.name,(SELECT count(*) FROM submission_versions v WHERE v.team_id=t.id),pd.avatar_color,pd.avatar_expression FROM users u LEFT JOIN profile_details pd ON pd.user_id=u.id LEFT JOIN participant_profiles x ON x.user_id=u.id LEFT JOIN check_ins c ON c.user_id=u.id LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN teams t ON t.id=m.team_id WHERE NOT EXISTS(SELECT 1 FROM registrations r WHERE r.email=u.email)",
    );
    const teams = await teamFacts(
        this.s.db,
        items.flatMap((item) => (item.team_id ? [item.team_id] : [])),
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
    return items
      .map((item) => {
        const individual = item.id ? people.get(item.id) : undefined,
          progress = item.team_id ? teams.get(item.team_id) : undefined;
        return {
          ...item,
          deactivated_at: individual?.deactivatedAt,
          teamReadiness: progress?.readiness || readiness(0, 0),
          status:
            individual?.status ||
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
    if (!profile.complete)
      return { me: actor, profile, profileIncomplete: true };
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
          "SELECT u.id,COALESCE(x.display_name,u.name) name,CASE WHEN u.id=t.leader_id THEN 'leader' ELSE 'member' END role,COALESCE(r.status,'pending') approval,pd.phone,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression,p.bio,p.socials,p.public FROM memberships m JOIN users u ON u.id=m.user_id JOIN teams t ON t.id=m.team_id LEFT JOIN registrations r ON r.email=u.email LEFT JOIN participant_profiles x ON x.user_id=u.id LEFT JOIN profile_details pd ON pd.user_id=u.id LEFT JOIN profiles p ON p.user_id=u.id WHERE t.id=? AND EXISTS(SELECT 1 FROM memberships viewer WHERE viewer.user_id=? AND viewer.team_id=t.id) AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=u.id AND rr.active=1)",
          team.id,
          actor.id,
        )
      : [];
    const project = team
      ? await one<Project>(
          this.s.db,
          "SELECT * FROM projects WHERE team_id=?",
          team.id,
        )
      : undefined;
    const feedback =
      project && access.canRead
        ? await rows(
            this.s.db,
            "SELECT h.id,h.body,h.kind,h.created_at,h.version_id,u.name author FROM project_review_history h JOIN users u ON u.id=h.author_id WHERE h.project_id=? ORDER BY h.created_at DESC",
            project.id,
          )
        : [];
    // Feedback has no numeric rating, evaluation report or hidden score fields.
    const venue =
      (registration?.status === "approved" &&
        ["Going", "Checked in"].includes(individual.status)) ||
      (await managesPrivateVenue(this.s, actor))
        ? await one<{ published: string | null }>(
            this.s.db,
            "SELECT published FROM private_venue WHERE id=1",
          )
        : undefined;
    const checked = individual.checkedIn;
    const credits =
      checked && actor.role !== "judge" && registration?.status === "approved"
        ? await rows(
            this.s.db,
            "SELECT t.id type_id,t.name,t.instructions,CASE WHEN a.inventory_id IS NOT NULL THEN 1 ELSE 0 END allocated FROM credit_types t LEFT JOIN credit_allocations a ON a.type_id=t.id AND a.user_id=? AND lower(a.recipient_email)=? WHERE t.active=1",
            actor.id,
            actor.email.toLowerCase(),
          )
        : [];
    const projectResult = project
      ? (await publicScores(this.s)).scores.find(
          (r) =>
            r.projectId === project.id &&
            r.versionId === project.published_version_id,
        )
      : undefined;
    const projectUpvotes = project
      ? (
          await one<{ n: number }>(
            this.s.db,
            "SELECT count(*) n FROM project_upvotes WHERE project_id=?",
            project.id,
          )
        )?.n || 0
      : 0;
    const operational = setupReadiness(
      await this.s.settings(true),
      this.s.now(),
    );
    return {
      me: actor,
      profile,
      registration: {
        ...registration,
        status: registration?.status || "pending",
      },
      team: team
        ? { ...team, locked: !!lock, lockedAt: lock?.locked_at }
        : undefined,
      submissionAccess: access,
      projectStats: { upvotes: projectUpvotes, result: projectResult },
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
        ({ phone, public: visible, socials, bio, ...m }) => ({
          ...m,
          profileUrl: "/discover/participants#person-" + String(m.id),
          ...(visible
            ? { bio, socials: JSON.parse(String(socials || "[]")) }
            : { socials: [] }),
          ...(contacts ? teamPhone(String(phone || "")) : {}),
        }),
      ),
      attempts,
      project:
        project && access.canRead
          ? { ...project, draft: JSON.parse(project.draft) }
          : undefined,
      feedback,
      eligibility: project
        ? await this.eligibility(project)
        : { status: "not_submitted" },
      leaderboardUrl:
        project && (await this.eligibility(project)).status === "eligible"
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
        "SELECT a.*,t.name team_name,u.name person_name FROM team_actions a JOIN teams t ON t.id=a.team_id JOIN users u ON u.id=a.user_id WHERE a.user_id=? OR t.leader_id=?",
        actor.id,
        actor.id,
      ),
      ...(venue?.published
        ? {
            privateVenue: privateVenueSchema.parse(JSON.parse(venue.published)),
          }
        : {}),
      submissionStatus: operational.submissions,
      eventDraft: !operational.submissions.enabled,
    };
  }
  async view(
    path: string,
    options: { search?: string; page?: number; focus?: string } = {},
  ): Promise<Record<string, unknown> | null> {
    let route = path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    if (route === "/discover/teams") route = "/teams";
    if (route === "/discover/participants") {
      const me = await this.s.actor();
      return {
        me,
        discovery: "participants",
        items: (
          await rows<Record<string, any>>(
            this.s.db,
            "SELECT u.id,COALESCE(pp.display_name,u.name) name,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression,t.name teamName,COALESCE(ts.color_key,ts.palette) teamPalette,CASE WHEN m.team_id IS NULL THEN 'Not in a team' ELSE 'In a team' END teamStatus,CASE WHEN p.public=1 THEN p.bio ELSE '' END bio,CASE WHEN p.public=1 THEN p.socials ELSE '[]' END socials FROM users u JOIN luma_roster l ON l.email=u.email JOIN participant_profiles pp ON pp.user_id=u.id LEFT JOIN portal_roles r ON r.user_id=u.id JOIN profiles p ON p.user_id=u.id JOIN profile_details pd ON pd.user_id=u.id LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN teams t ON t.id=m.team_id LEFT JOIN team_styles ts ON ts.team_id=t.id WHERE COALESCE(r.role,u.role)='participant' AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=u.id AND rr.active=1) AND pp.completed_at IS NOT NULL AND pd.phone<>'' ORDER BY name LIMIT 1000",
          )
        ).map((r) => ({ ...r, socials: JSON.parse(r.socials) })),
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
    if (route === "/")
      return {
        content: await publicEventContent(this.s),
        submissionClose: (await this.s.settings(true)).policy.submissionClose,
        ...(this.s.identity ? { me: await this.s.actor() } : {}),
      };
    if (
      route === "/projects" ||
      route === "/leaderboard" ||
      route === "/winners" ||
      route.startsWith("/projects/")
    ) {
      let selectedPage = Math.floor(options.page || 0);
      const scores = await publicScores(this.s);
      const listRoute = ["/projects", "/leaderboard", "/winners"].includes(
        route,
      );
      let all = listRoute
        ? await rows<PublicProjectReference>(
            this.s.db,
            "SELECT p.id,p.team_id,p.slug,p.published_version_id FROM projects p JOIN submission_versions v ON v.id=p.published_version_id JOIN teams t ON t.id=p.team_id WHERE COALESCE((SELECT e.status FROM project_eligibility e WHERE e.project_id=p.id AND e.version_id=v.id),(SELECT r.eligibility FROM reviews r WHERE r.team_id=p.team_id AND r.version_id=v.id),'needs_review')='eligible' AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND ((rr.kind='project' AND rr.target_id=p.id) OR (rr.kind='submission' AND rr.target_id=v.id))) AND instr(lower(json_extract(v.payload,'$.projectName') || ' ' || t.name),lower(?))>0 ORDER BY (SELECT count(*) FROM project_upvotes u WHERE u.project_id=p.id) DESC,(SELECT first.created_at FROM submission_versions first WHERE first.team_id=p.team_id ORDER BY first.attempt ASC LIMIT 1) ASC,p.id ASC LIMIT 1000",
            (options.search || "").slice(0, 200),
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
          ...(await this.publicProject(p, scores, facts.get(p.id))),
          canComment: !!me?.canEngage && !engagement.feedbackPaused,
          engagementPaused:
            engagement.votingPaused || engagement.feedbackPaused,
          upvoted: !!facts.get(p.id)?.upvoted,
          canUpvote:
            !engagement.votingPaused &&
            !!me?.canEngage &&
            (ownTeam?.id !== p.team_id || ownAttendance),
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
        finalCountdownComplete: scores.complete,
        awards,
        ...(scores.criteria ? { scoringInfo: scores.criteria } : {}),
        ...(!listRoute
          ? {
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
      const me = await this.s.actor(),
        team = await this.team(me.id);
      demand(team, 403, "TEAM_REQUIRED");
      const access = await submissionAccess(this.s, team.id);
      demand(access.canRead, 403, "TEAM_CHECKIN_REQUIRED");
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
            "SELECT id,attempt,payload,created_at FROM submission_versions v WHERE team_id=? AND EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=v.team_id AND m.user_id=?) ORDER BY attempt DESC LIMIT 3",
            team.id,
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
        );
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
          };
        }),
      };
    }

    if (["/submission", "/dashboard/submission"].includes(route)) {
      const me = await this.s.actor(),
        team = await this.team(me.id);
      demand(
        team,
        403,
        "TEAM_CHECKIN_REQUIRED",
        "At least one team member must check in before submission unlocks.",
      );
      await requireSubmissionAccess(this.s, team.id, true);
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
      return {
        me,
        items: await this.participantRows(),
        lookupOnly: me.role === "volunteer",
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
      const all = await rows<Team>(
        this.s.db,
        "SELECT t.*,'initials' avatar,COALESCE(s.color_key,s.palette) palette FROM teams t LEFT JOIN team_styles s ON s.team_id=t.id ORDER BY t.name",
      );
      const ids = all.map((t) => t.id),
        facts = await teamFacts(this.s.db, ids),
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
      return {
        me,
        items: all
          .map((t) => {
            const fact = facts.get(t.id)!;
            return {
              ...t,
              locked: fact.locked,
              lockedAt: fact.lockedAt,
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
        engagement: await engagementState(this.s),
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
        scoreRelease: await scoreState(this.s).then((s) => ({
          stage: s.stage,
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
            ? await rows(
                this.s.db,
                "SELECT id,created_at FROM result_snapshots ORDER BY created_at DESC",
              )
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
      const query =
        "SELECT p.id,p.slug,t.name teamName,json_extract(p.draft,'$.projectName') projectName,CASE WHEN EXISTS(SELECT 1 FROM submission_versions v WHERE v.team_id=p.team_id) THEN 'Submitted' ELSE 'Draft' END status,p.updated_at,rr.updated_at deleted_at FROM projects p JOIN teams t ON t.id=p.team_id LEFT JOIN record_removals rr ON rr.kind='project' AND rr.target_id=p.id AND rr.active=1 ";
      const items = await rows<Record<string, any>>(
        this.s.db,
        me.owner || me.role === "admin"
          ? query + " ORDER BY p.updated_at DESC LIMIT 1000"
          : query +
              " JOIN project_assignments a ON a.project_id=p.id WHERE a.user_id=? AND a.kind=? ORDER BY p.updated_at DESC LIMIT 1000",
        ...(me.owner || me.role === "admin" ? [] : [me.id, me.role]),
      );
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
      return {
        me,
        items: items.map((item) => ({
          ...item,
          deleted_at: item.deleted_at ?? undefined,
          versions:
            me.owner || me.role === "admin"
              ? byProject.get(String(item.id)) || []
              : undefined,
        })),
      };
    }

    if (/^\/(admin\/submissions|review)\/[^/]+$/.test(route)) {
      const me = await this.s.actor(),
        p = await this.project(route.split("/").at(-1)!);
      const kind = await this.canReview(me, p),
        v = await this.version(p),
        teamIdentity = await one<{
          teamName: string;
          teamPalette: string | null;
        }>(
          this.s.db,
          "SELECT t.name teamName,COALESCE(s.color_key,s.palette) teamPalette FROM teams t LEFT JOIN team_styles s ON s.team_id=t.id WHERE t.id=?",
          p.team_id,
        );
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
              "SELECT id,version_id,config_key,state,error,created_at,updated_at FROM evaluation_runs WHERE project_id=? ORDER BY created_at DESC",
              p.id,
            ),
        reviewers:
          me.owner || me.role === "admin"
            ? await rows(
                this.s.db,
                "SELECT u.id,u.name,COALESCE(r.role,u.role) role FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id WHERE COALESCE(r.role,u.role) IN ('judge','mentor')",
              )
            : undefined,
        evaluationConfigured: false,
      };
    }
    return null;
  }
  async command(
    action: string,
    data: unknown,
    actor: Actor,
  ): Promise<Record<string, unknown> | null> {
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
        [
          "INSERT INTO ideas VALUES(?,?,?,?,?,?) ON CONFLICT(team_id) DO UPDATE SET title=excluded.title,core=excluded.core,description=excluded.description,hash=excluded.hash,updated_at=excluded.updated_at",
          team.id,
          d.title,
          d.description,
          d.description,
          hash,
          time,
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
    if (action === "remove-workspace-member") {
      const d = z.object({ userId: id, reason: why }).strict().parse(data),
        t = await this.team(d.userId);
      demand(t, 404, "TEAM_NOT_FOUND");
      demand(
        actor.owner || actor.role === "admin" || t.leader_id === actor.id,
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
        ],
        { userId: d.userId },
        d.reason,
      );
      return {
        message:
          "Membership removed. Readiness and private venue access recalculated.",
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
        await this.s.mutate(
          actor.id,
          action,
          d.teamId,
          [
            [
              "INSERT INTO team_actions VALUES(?,?,?,'request','pending',?) ON CONFLICT(team_id,user_id,kind) DO UPDATE SET status='pending',created_at=excluded.created_at WHERE team_actions.status<>'accepted'",
              crypto.randomUUID(),
              d.teamId,
              actor.id,
              this.s.now(),
            ],
          ],
          {},
        );
        return { message: "Request sent to the team leader." };
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
        ],
        { accepted: d.accept },
      );
      return {
        message: d.accept
          ? "Member joined. Team readiness recalculated."
          : "Request declined.",
      };
    }
    if (action === "save-project" || action === "submit-project") {
      await this.completed(actor);
      const t = await this.team(actor.id);
      demand(t && t.leader_id === actor.id, 403, "LEADER_REQUIRED");
      await this.s.unfrozen();
      const access = await requireSubmissionAccess(this.s, t.id);
      const d = z
          .object({ revision: z.number().int().min(0), project: draftSchema })
          .strict()
          .parse(data),
        p = await one<Project>(
          this.s.db,
          "SELECT * FROM projects WHERE team_id=?",
          t.id,
        );
      const requestKey = await sha256(
        JSON.stringify({ revision: d.revision, project: d.project }),
      );
      if (action === "submit-project") {
        const receipt = await one<{ project_id: string; version_id: string }>(
          this.s.db,
          "SELECT project_id,version_id FROM project_commit_receipts WHERE team_id=? AND request_key=?",
          t.id,
          requestKey,
        );
        if (receipt)
          return {
            message: "This submission was already committed.",
            projectId: receipt.project_id,
            versionId: receipt.version_id,
          };
      }
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
        slug = p?.slug || "project-" + projectId;
      const sql: SQL[] = p
        ? [
            [
              "UPDATE projects SET draft=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
              JSON.stringify(d.project),
              this.s.now(),
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
              this.s.now(),
            ],
          ];
      sql.push(...assertPreviousWrite());
      if (action === "submit-project") {
        await this.s.operational("submissions");

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
        sql.push([
          "INSERT INTO submission_versions SELECT ?,?,COALESCE(MAX(attempt),0)+1,?,? FROM submission_versions WHERE team_id=?",
          versionId,
          t.id,
          JSON.stringify(d.project),
          this.s.now(),
          t.id,
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
        });
      } catch (error) {
        if (action === "submit-project") {
          const receipt = await one<{ project_id: string; version_id: string }>(
            this.s.db,
            "SELECT project_id,version_id FROM project_commit_receipts WHERE team_id=? AND request_key=?",
            t.id,
            requestKey,
          );
          if (receipt)
            return {
              message: "This submission was already committed.",
              projectId: receipt.project_id,
              versionId: receipt.version_id,
            };
        }
        throw error;
      }
      return {
        message:
          action === "submit-project"
            ? "Project version committed. Eligible entries appear automatically; eligibility verification remains separate."
            : "Project draft saved.",
        projectId,
        ...(action === "submit-project"
          ? {
              versionId: (
                await one<{ version_id: string }>(
                  this.s.db,
                  "SELECT version_id FROM project_commit_receipts WHERE team_id=? AND request_key=?",
                  t.id,
                  requestKey,
                )
              )?.version_id,
            }
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
      demand(
        !(action === "upvote-project"
          ? engagement.votingPaused
          : engagement.feedbackPaused),
        409,
        "ENGAGEMENT_PAUSED",
      );
      const d = z
          .object({
            projectId: id,
            body:
              action === "comment-project"
                ? text(1500).min(30)
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
        if (own?.id === p.team_id)
          demand(
            (await personStatus(this.s, actor.id)).checkedIn,
            403,
            "OWN_PROJECT_CHECKIN_REQUIRED",
          );
      }
      await this.s.mutate(
        actor.id,
        action,
        p.id,
        action === "upvote-project"
          ? [
              [
                "INSERT INTO project_upvotes VALUES(?,?,?) ON CONFLICT DO NOTHING",
                p.id,
                actor.id,
                this.s.now(),
              ],
            ]
          : [
              [
                "INSERT INTO project_comments VALUES(?,?,?,?,?)",
                crypto.randomUUID(),
                p.id,
                actor.id,
                d.body!,
                this.s.now(),
              ],
            ],
        { publicEngagement: true },
      );
      return {
        message:
          action === "upvote-project" ? "Upvote recorded." : "Comment posted.",
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
      const emails = [...new Set(d.emails)],
        sql: SQL[] = [];
      if (d.checkIn) {
        await this.s.operational("checkin");
        for (const email of emails) {
          const u = await one<{ id: string }>(
            this.s.db,
            "SELECT id FROM users WHERE email=?",
            email,
          );
          demand(u, 422, "PARTICIPANT_NOT_SIGNED_IN");
          await requireGoingForCheckin(this.s, u.id);
          sql.push(
            [
              "INSERT INTO check_ins VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING",
              u.id,
              actor.id,
              this.s.now(),
            ],
            ["DELETE FROM participant_status_overrides WHERE user_id=?", u.id],
          );
        }
      } else {
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
            rating: z.number().min(1).max(10).optional(),
          })
          .strict()
          .parse(data),
        p = await this.project(d.projectId),
        kind = await this.canReview(actor, p),
        v = await this.version(p);
      demand(v?.id === d.versionId, 409, "PROJECT_VERSION_CHANGED");
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
            d.rating ?? null,
            this.s.now(),
          ],
        ],
        { versionId: d.versionId, kind, hasRating: d.rating !== undefined },
      );
      return {
        message:
          "Private review saved. Team feedback contains no numeric score.",
      };
    }
    if (action === "reevaluate-project") {
      const d = z.object({ projectId: id, versionId: id }).strict().parse(data);
      const p = await this.project(d.projectId),
        kind = await this.canReview(actor, p);
      demand(kind !== "mentor", 403, "SCORING_REVIEWER_REQUIRED");
      // Separate secure API setup is pending. No runner, credential or network
      // invocation is enabled by this revision, even with an injected evaluator.
      throw new PortalError(503, "EVALUATOR_NOT_CONFIGURED");
    }
    return null;
  }
}
