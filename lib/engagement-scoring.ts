import { feedbackLength } from "./feedback-length";
import { auditReason } from "./security";
import { z } from "zod";
import type { PortalService } from "./service";
import { one, rows, type Database } from "./db";
import { demand, sha256 } from "./security";
import { qualificationBlockers, type Policy } from "./policy";
type Audience = NonNullable<Policy["engagementQualification"]>["voters"];
function audienceSQL(mode: Audience, alias: string) {
  const outside = `NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=${alias}.user_id AND m.team_id=p.team_id)`;
  if (mode === "all-signed-in") return "1=1";
  if (mode === "other-team") return outside;
  return `${outside} AND EXISTS(SELECT 1 FROM users u JOIN registrations r ON r.email=u.email JOIN check_ins ci ON ci.user_id=u.id WHERE u.id=${alias}.user_id AND r.status='approved')`;
}
export async function qualifiedEngagement(
  db: Database,
  policy: Policy,
  projectId: string,
  versionId: string,
) {
  demand(
    qualificationBlockers(policy).length === 0,
    409,
    "ENGAGEMENT_SCORING_NOT_CONFIGURED",
    "Scored engagement qualification is not confirmed. Public upvotes and comments remain separate.",
  );
  const rules = policy.engagementQualification!;
  const votes = await one<{ n: number }>(
    db,
    `SELECT count(*) n FROM project_upvotes v JOIN projects p ON p.id=v.project_id WHERE v.project_id=? AND v.created_at>=? AND v.created_at<? AND ${audienceSQL(rules.voters, "v")}`,
    projectId,
    policy.engagementOpen,
    policy.engagementClose,
  );
  const validAuthors = new Set<string>(),
    pendingAuthors = new Set<string>(),
    countedBodies = new Set<string>();
  let cursor = "",
    cursorTime = "";
  for (;;) {
    const comments = await rows<{
      id: string;
      created_at: string;
      user_id: string;
      body: string;
      qualified: number | null;
      body_hash: string | null;
    }>(
      db,
      `SELECT c.id,c.created_at,c.author_id user_id,c.body,q.qualified,q.body_hash FROM project_comments c JOIN projects p ON p.id=c.project_id LEFT JOIN project_feedback_reviews q ON q.rowid=(SELECT max(last.rowid) FROM project_feedback_reviews last WHERE last.comment_id=c.id AND last.version_id=? AND last.rule_version=?) WHERE c.project_id=? AND (c.created_at>? OR (c.created_at=? AND c.id>?)) AND c.created_at>=? AND c.created_at<? AND ${audienceSQL(rules.feedbackAuthors, "c").replaceAll("c.user_id", "c.author_id")} ORDER BY c.created_at,c.id LIMIT 200`,
      versionId,
      rules.version,
      projectId,
      cursorTime,
      cursorTime,
      cursor,
      policy.engagementOpen,
      policy.engagementClose,
    );
    for (const c of comments) {
      const hash = await sha256(c.body);
      if (c.qualified === 0 && c.body_hash === hash) continue;
      if (c.qualified !== 1 || c.body_hash !== hash) {
        pendingAuthors.add(c.user_id);
        continue;
      }
      // Qualification always requires the declared bounds; semantic judgement is a
      // recorded staff decision, never a count of every public comment.
      if (
        feedbackLength(c.body) < 30 ||
        c.body.trim().length > policy.feedbackMax
      ) {
        pendingAuthors.add(c.user_id);
        continue;
      }
      const fingerprint = await sha256(
        c.body.trim().toLowerCase().replace(/\s+/g, " "),
      );
      if (
        rules.feedbackDuplicates === "exclude-exact-normalized-copies" &&
        countedBodies.has(fingerprint)
      )
        continue;
      validAuthors.add(c.user_id);
      countedBodies.add(fingerprint);
    }
    if (comments.length < 200) break;
    cursor = comments.at(-1)!.id;
    cursorTime = comments.at(-1)!.created_at;
  }
  return {
    votes: Number(votes?.n || 0),
    feedback: validAuthors.size,
    pendingFeedback: [...pendingAuthors].filter((id) => !validAuthors.has(id))
      .length,
  };
}
export async function qualificationCommand(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action !== "qualify-project-feedback") return null;
  const actor = await s.staff();
  await s.unfrozen();
  const d = z
    .object({
      commentId: z.string().min(1).max(150),
      versionId: z.string().min(1).max(150),
      qualified: z.boolean(),
      reason: auditReason(),
    })
    .strict()
    .parse(input);
  const settings = await s.settings(true);
  demand(
    qualificationBlockers(settings.policy).length === 0,
    409,
    "ENGAGEMENT_SCORING_NOT_CONFIGURED",
  );
  const comment = await one<{
    body: string;
    project_id: string;
    published_version_id: string;
  }>(
    s.db,
    "SELECT c.body,c.project_id,p.published_version_id FROM project_comments c JOIN projects p ON p.id=c.project_id WHERE c.id=?",
    d.commentId,
  );
  demand(comment, 404, "COMMENT_NOT_FOUND");
  demand(
    comment.published_version_id === d.versionId,
    409,
    "PROJECT_VERSION_CHANGED",
  );
  if (d.qualified)
    demand(
      comment.body.trim().length >= settings.policy.feedbackMin &&
        comment.body.trim().length <= settings.policy.feedbackMax,
      422,
      "FEEDBACK_QUALITY_REQUIRED",
      "This comment does not meet the declared feedback length bounds. It remains a public comment without scoring credit.",
    );
  const ruleVersion = settings.policy.engagementQualification!.version,
    hash = await sha256(comment.body);
  await s.mutate(
    actor.id,
    action,
    d.commentId,
    [
      [
        "INSERT INTO project_feedback_reviews VALUES(?,?,?,?,?,?,?,?,?)",
        crypto.randomUUID(),
        d.commentId,
        d.versionId,
        ruleVersion,
        d.qualified ? 1 : 0,
        hash,
        actor.id,
        d.reason,
        s.now(),
      ],
    ],
    {
      projectId: comment.project_id,
      versionId: d.versionId,
      ruleVersion,
      qualified: d.qualified,
    },
    d.reason,
  );
  return {
    message: "Scoring qualification recorded. The public comment is unchanged.",
  };
}
