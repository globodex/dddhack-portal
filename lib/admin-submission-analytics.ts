import { one, rows, type Database } from "./db";
import { score, reportSchema } from "./evaluation";
import { validatedProviderGrade } from "./provider-grade";
import { OWNER_EMAIL } from "./identity";
import { policyBlockers, qualificationBlockers, type Policy } from "./policy";
import { demand, sha256 } from "./security";
import type { PortalService } from "./service";

type Count = { key: string; label: string; value: number };
export type AdminProjectScoreDTO = {
  projectId: string;
  teamId: string;
  versionId: string | null;
  attempt: number | null;
  total: number | null;
  components: {
    key: string;
    label: string;
    value: number | null;
    max: number | null;
    status: string;
  }[];
  basis: "current" | "frozen";
  pending: string[];
  eligibility: string;
  policyVersion: number;
  snapshotId: string | null;
  sourceRevision: number | null;
  createdAt: string | null;
};
export type AdminSubmissionAnalyticsDTO = {
  scope: "Current committed submissions";
  cohortTotal: number;
  selectionMissing: number;
  cerebras: Count[];
  eligibility: Count[];
  evaluation: Count[];
  scores: {
    complete: number;
    awaiting: number;
    eligibleComparable: number;
    average: number | null;
    minimum: number | null;
    maximum: number | null;
  };
  policy: {
    version: number;
    blockers: string[];
    maxTotal: number | null;
    baseMaximum: number | null;
    feedbackMaximum: number | null;
  };
  frozen: {
    snapshotId: string;
    policyVersion: number;
    sourceRevision: number;
    createdAt: string;
    entryCount: number;
    eligibleCount: number;
    invalidEntries: number;
  } | null;
};
export type AdminSubmissionAnalyticsResult = {
  analytics: AdminSubmissionAnalyticsDTO;
  scores: AdminProjectScoreDTO[];
  frozenScores: AdminProjectScoreDTO[];
};

const active = (kind: string, column: string) =>
  `NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='${kind}' AND rr.target_id=${column} AND rr.active=1)` +
  (kind === "team"
    ? ` AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions td WHERE td.kind='team' AND td.target_id=${column})`
    : "");

// A selected version is not silently replaced with MAX(attempt), an older visible
// version, or a draft. Latest is retained separately for the canonical score gate.
const cohort = `WITH active_projects AS (
  SELECT p.id,p.team_id,p.published_version_id FROM projects p JOIN teams t ON t.id=p.team_id
  WHERE ${active("team", "t.id")} AND ${active("project", "p.id")}
), latest AS (
  SELECT p.id project_id,v.id version_id FROM active_projects p JOIN submission_versions v ON v.team_id=p.team_id
  WHERE v.attempt=(SELECT max(last.attempt) FROM submission_versions last WHERE last.team_id=p.team_id)
), selected AS (
  SELECT p.id project_id,p.team_id,v.id version_id,v.attempt,l.version_id latest_version_id,
    json_extract(v.payload,'$.cerebrasIntegration') cerebras
  FROM active_projects p JOIN submission_versions v ON v.id=p.published_version_id AND v.team_id=p.team_id
  JOIN latest l ON l.project_id=p.id WHERE ${active("submission", "v.id")}
)`;

type Fact = {
  project_id: string;
  team_id: string;
  version_id: string;
  attempt: number;
  latest_version_id: string;
  cerebras: unknown;
  review_version_id: string | null;
  review_eligibility: string | null;
  eligibility: string;
  astra: number | null;
  codex: number | null;
  diversity: number | null;
  false_claims: number | null;
  run_id: string | null;
  run_report: string | null;
  run_score: number | null;
  run_provenance: "provider" | null;
  run_state: string | null;
  job_state: string | null;
};
const componentNames = [
  ["human", "Human"],
  ["astra", "AI"],
  ["voting", "Votes"],
  ["diversity", "Collaboration"],
  ["codex", "Codex"],
  ["bonus", "Feedback bonus"],
  ["penalties", "Penalties"],
] as const;

function audienceSQL(mode: string, alias: string) {
  const outside = `NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=${alias}.user_id AND m.team_id=s.team_id)`;
  if (mode === "all-signed-in") return "1=1";
  if (mode === "other-team") return outside;
  return `${outside} AND EXISTS(SELECT 1 FROM users u JOIN registrations r ON r.email=u.email JOIN check_ins ci ON ci.user_id=u.id WHERE u.id=${alias}.user_id AND r.status='approved')`;
}

type Engagement = { votes: number; feedback: number; pendingFeedback: number };
/** Bulk equivalent of qualifiedEngagement: same windows, audience, exact-version
 * latest staff/body-hash decisions, author/copy rules and 200-row cursor bound. */
async function engagement(db: Database, policy: Policy) {
  const result = new Map<string, Engagement>();
  const rules = policy.engagementQualification!;
  const voteRows = await rows<{ project_id: string; n: number }>(
    db,
    `${cohort} SELECT s.project_id,count(*) n FROM selected s JOIN project_upvotes v ON v.project_id=s.project_id
      WHERE v.created_at>=? AND v.created_at<? AND ${audienceSQL(rules.voters, "v")} GROUP BY s.project_id`,
    policy.engagementOpen,
    policy.engagementClose,
  );
  for (const vote of voteRows)
    result.set(vote.project_id, {
      votes: Number(vote.n),
      feedback: 0,
      pendingFeedback: 0,
    });
  const authors = new Map<
    string,
    { valid: Set<string>; pending: Set<string>; bodies: Set<string> }
  >();
  let projectCursor = "",
    timeCursor = "",
    idCursor = "";
  for (;;) {
    const comments = await rows<{
      project_id: string;
      id: string;
      created_at: string;
      user_id: string;
      body: string;
      qualified: number | null;
      body_hash: string | null;
    }>(
      db,
      `${cohort} SELECT s.project_id,c.id,c.created_at,c.author_id user_id,c.body,q.qualified,q.body_hash
      FROM selected s JOIN project_comments c ON c.project_id=s.project_id
      LEFT JOIN project_feedback_reviews q ON q.rowid=(SELECT max(last.rowid) FROM project_feedback_reviews last
        WHERE last.comment_id=c.id AND last.version_id=s.version_id AND last.rule_version=?)
      WHERE (s.project_id>? OR (s.project_id=? AND (c.created_at>? OR (c.created_at=? AND c.id>?))))
        AND c.created_at>=? AND c.created_at<? AND ${audienceSQL(rules.feedbackAuthors, "c").replaceAll("c.user_id", "c.author_id")}
      ORDER BY s.project_id,c.created_at,c.id LIMIT 200`,
      rules.version,
      projectCursor,
      projectCursor,
      timeCursor,
      timeCursor,
      idCursor,
      policy.engagementOpen,
      policy.engagementClose,
    );
    for (const comment of comments) {
      let group = authors.get(comment.project_id);
      if (!group)
        authors.set(
          comment.project_id,
          (group = { valid: new Set(), pending: new Set(), bodies: new Set() }),
        );
      const hash = await sha256(comment.body);
      if (comment.qualified === 0 && comment.body_hash === hash) continue;
      if (
        comment.qualified !== 1 ||
        comment.body_hash !== hash ||
        comment.body.trim().length < policy.feedbackMin ||
        comment.body.trim().length > policy.feedbackMax
      ) {
        group.pending.add(comment.user_id);
        continue;
      }
      const fingerprint = await sha256(
        comment.body.trim().toLowerCase().replace(/\s+/g, " "),
      );
      if (
        rules.feedbackDuplicates === "exclude-exact-normalized-copies" &&
        group.bodies.has(fingerprint)
      )
        continue;
      group.valid.add(comment.user_id);
      group.bodies.add(fingerprint);
    }
    if (comments.length < 200) break;
    const last = comments.at(-1)!;
    projectCursor = last.project_id;
    timeCursor = last.created_at;
    idCursor = last.id;
  }
  for (const [id, group] of authors) {
    const counts = result.get(id) || {
      votes: 0,
      feedback: 0,
      pendingFeedback: 0,
    };
    counts.feedback = group.valid.size;
    counts.pendingFeedback = [...group.pending].filter(
      (id) => !group.valid.has(id),
    ).length;
    result.set(id, counts);
  }
  return result;
}

function providerGrade(fact: Fact) {
  if (!fact.run_report) return null;
  try {
    const report = reportSchema.parse(JSON.parse(fact.run_report));
    const grade = validatedProviderGrade(
      report,
      fact.run_provenance || undefined,
    );
    return grade !== null &&
      report.versionId === fact.version_id &&
      grade === fact.run_score
      ? grade
      : null;
  } catch {
    return null;
  }
}
const numeric = (value: unknown, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= max;

/** Server-only, request-scoped admin facts. This does not evaluate, rank, mutate,
 * publish or call providers. No private profile payloads are fetched or returned. */
export async function readAdminSubmissionAnalytics(
  service: Pick<PortalService, "db" | "staff" | "settings">,
): Promise<AdminSubmissionAnalyticsResult> {
  // Do not accept client roles or reuse a stale list actor; staff resolves current
  // permission/removal state before any private collection read.
  await service.staff();
  const settings = await service.settings(true),
    policy = settings.policy;
  const revisionSQL =
    "SELECT sr.version revision,COALESCE(es.version,0) policy_version FROM scoring_revision sr LEFT JOIN event_settings es ON es.id=1 WHERE sr.id=1";
  const started = await one<{ revision: number; policy_version: number }>(
    service.db,
    revisionSQL,
  );
  demand(
    started && started.policy_version === settings.version,
    409,
    "ANALYTICS_CHANGED_REFRESH",
    "Scoring facts changed. Refresh to load a consistent summary.",
  );
  const blockers = policyBlockers(policy);
  const facts = await rows<Fact>(
    service.db,
    `${cohort}
    SELECT s.*,r.version_id review_version_id,r.eligibility review_eligibility,
      COALESCE(e.status,CASE WHEN r.version_id=s.version_id THEN r.eligibility END,'needs_review') eligibility,
      CASE WHEN r.version_id=s.version_id THEN r.astra END astra,
      CASE WHEN r.version_id=s.version_id THEN r.codex END codex,
      CASE WHEN r.version_id=s.version_id THEN r.diversity END diversity,
      CASE WHEN r.version_id=s.version_id THEN r.false_claims END false_claims,
      er.id run_id,er.report run_report,er.score run_score,er.provenance run_provenance,
      lr.state run_state,j.state job_state
    FROM selected s LEFT JOIN reviews r ON r.team_id=s.team_id
    LEFT JOIN project_eligibility e ON e.project_id=s.project_id AND e.version_id=s.version_id
    LEFT JOIN astra_jobs j ON j.version_id=s.version_id
    LEFT JOIN evaluation_runs er ON er.id=(SELECT last.id FROM evaluation_runs last
      WHERE last.project_id=s.project_id AND last.version_id=s.version_id AND last.state='completed'
        AND last.provenance='provider' AND last.score IS NOT NULL ORDER BY last.updated_at DESC,last.id LIMIT 1)
    LEFT JOIN evaluation_runs lr ON lr.id=(SELECT last.id FROM evaluation_runs last
      WHERE last.project_id=s.project_id AND last.version_id=s.version_id ORDER BY last.updated_at DESC,last.id LIMIT 1)
    ORDER BY s.project_id`,
  );
  const selection = await one<{ missing: number; mismatch: number }>(
    service.db,
    `${cohort}
    SELECT sum(CASE WHEN NOT EXISTS(SELECT 1 FROM selected s WHERE s.project_id=l.project_id) THEN 1 ELSE 0 END) missing,
      sum(CASE WHEN NOT EXISTS(SELECT 1 FROM selected s WHERE s.project_id=l.project_id AND s.version_id=l.version_id) THEN 1 ELSE 0 END) mismatch
    FROM latest l WHERE ${active("submission", "l.version_id")}`,
  );
  const humanRows = await rows<{ project_id: string; rating: number }>(
    service.db,
    `${cohort}
    SELECT s.project_id,h.rating FROM selected s JOIN project_review_history h ON h.project_id=s.project_id AND h.version_id=s.version_id
    JOIN users u ON u.id=h.author_id LEFT JOIN portal_roles r ON r.user_id=u.id
    WHERE h.kind IN ('judge','admin') AND h.rating IS NOT NULL
      AND (COALESCE(r.role,u.role)='admin' OR lower(u.email)=? OR
        (COALESCE(r.role,u.role)='judge' AND EXISTS(SELECT 1 FROM project_assignments a WHERE a.project_id=h.project_id AND a.user_id=h.author_id AND a.kind='judge')))
      AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=h.author_id AND m.team_id=s.team_id)
      AND h.rowid=(SELECT max(last.rowid) FROM project_review_history last WHERE last.project_id=h.project_id
        AND last.version_id=h.version_id AND last.author_id=h.author_id AND last.kind IN ('judge','admin') AND last.rating IS NOT NULL)`,
    OWNER_EMAIL,
  );
  const humans = new Map<string, number[]>();
  for (const row of humanRows) {
    const group = humans.get(row.project_id) || [];
    group.push(row.rating);
    humans.set(row.project_id, group);
  }
  const engagementScored =
    policy.projectEngagementRule === "score-with-approved-normalization";
  const engagementReady =
    engagementScored && qualificationBlockers(policy).length === 0;
  const counts = engagementReady
    ? await engagement(service.db, policy)
    : new Map<string, Engagement>();
  const maxVotes = Math.max(
    0,
    ...facts
      .filter((f) => f.eligibility === "eligible")
      .map((f) => counts.get(f.project_id)?.votes || 0),
  );
  const normalizationUnknown =
    engagementScored &&
    policy.voteFormula === "sqrt-relative" &&
    policy.weights.votes > 0 &&
    (Number(selection?.mismatch || 0) > 0 ||
      facts.some(
        (f) =>
          f.version_id !== f.latest_version_id ||
          (f.eligibility !== "eligible" && f.eligibility !== "ineligible"),
      ));
  const scores: AdminProjectScoreDTO[] = [];
  const cerebras = { yes: 0, no: 0, unanswered: 0 };
  const eligibility = { eligible: 0, ineligible: 0, needs_review: 0 };
  const evaluation = {
    validated: 0,
    running: 0,
    queued: 0,
    needs_review: 0,
    failed: 0,
    not_evaluated: 0,
  };
  const maximums = {
    human: policy.weights.human,
    astra: policy.weights.ai,
    voting: policy.weights.votes,
    diversity: policy.weights.diversity,
    codex: policy.weights.codex,
    bonus: policy.weights.feedback,
    penalties: 10,
  };
  for (const fact of facts) {
    cerebras[
      fact.cerebras === "yes"
        ? "yes"
        : fact.cerebras === "no"
          ? "no"
          : "unanswered"
    ]++;
    eligibility[
      fact.eligibility === "eligible"
        ? "eligible"
        : fact.eligibility === "ineligible"
          ? "ineligible"
          : "needs_review"
    ]++;
    const provider = providerGrade(fact);
    const state = fact.run_state || fact.job_state;
    const evaluationKey =
      provider !== null
        ? "validated"
        : state === "running"
          ? "running"
          : state === "queued" || state === "pending"
            ? "queued"
            : state === "failed" ||
                state === "failed_retryable" ||
                state === "stale"
              ? "failed"
              : state
                ? "needs_review"
                : "not_evaluated";
    evaluation[evaluationKey]++;
    const human = humans.get(fact.project_id) || [];
    const humanReady =
      human.length >= policy.minJudges && human.every((v) => numeric(v, 10));
    const ai = fact.astra !== null ? fact.astra : provider;
    const aiReady = policy.weights.ai === 0 || numeric(ai, 30);
    const codexReady = numeric(fact.codex, 5),
      diversityReady = numeric(fact.diversity, 10);
    const penaltyReady = numeric(fact.false_claims, 2);
    const qualified = counts.get(fact.project_id) || {
      votes: 0,
      feedback: 0,
      pendingFeedback: 0,
    };
    const engagementKnown = !engagementScored
      ? policy.projectEngagementRule === "display-only"
      : engagementReady;
    const pending: string[] = [];
    if (fact.version_id !== fact.latest_version_id)
      pending.push("Selected submission is not the latest committed version.");
    if (
      fact.review_version_id !== fact.version_id ||
      !fact.review_eligibility ||
      fact.review_eligibility === "needs_review"
    )
      pending.push("Current submission review is incomplete.");
    if (fact.eligibility === "needs_review")
      pending.push("Eligibility review is incomplete.");
    if (fact.eligibility === "eligible") {
      if (!humanReady) pending.push("Human score coverage is incomplete.");
      if (!aiReady)
        pending.push(
          "AI score is awaiting validated evaluation or a manual review.",
        );
      if (!codexReady) pending.push("Codex score is awaiting review.");
      if (!diversityReady)
        pending.push("Collaboration score is awaiting review.");
      if (!penaltyReady) pending.push("Penalty review is incomplete.");
      if (!engagementKnown)
        pending.push("Engagement scoring policy is incomplete.");
      if (qualified.pendingFeedback)
        pending.push("Scoring feedback is awaiting staff qualification.");
      if (normalizationUnknown)
        pending.push(
          "Relative vote normalization awaits a consistent current submission selection.",
        );
    }
    pending.push(...blockers.map((b) => `Scoring policy: ${b}.`));
    // The one canonical calculator supplies weighted parts. Placeholder inputs
    // below are never exposed for missing facts: those components remain null,
    // and no total is released until every canonical prerequisite is complete.
    let calculated: ReturnType<typeof score> = null;
    if (fact.eligibility === "eligible")
      calculated = score({
        weights: policy.weights,
        human: humanReady ? human : [0],
        astra: numeric(ai, 30) ? ai : 0,
        codex: codexReady ? fact.codex! : 0,
        diversity: diversityReady ? fact.diversity! : 0,
        votes: qualified.votes,
        maxVotes,
        voteFormula:
          policy.voteFormula === "fixed-target"
            ? "fixed-target"
            : "sqrt-relative",
        voteTarget: policy.voteTarget,
        feedback: qualified.feedback,
        feedbackTarget: policy.feedbackTarget,
        falseClaims: penaltyReady ? fact.false_claims! : 0,
        eligible: true,
      });
    const available = {
      human: humanReady,
      astra: aiReady,
      codex: codexReady,
      diversity: diversityReady,
      voting: engagementKnown && !normalizationUnknown,
      bonus: engagementKnown && !qualified.pendingFeedback,
      penalties: penaltyReady,
    };
    scores.push({
      projectId: fact.project_id,
      teamId: fact.team_id,
      versionId: fact.version_id,
      attempt: fact.attempt,
      total: pending.length === 0 && calculated ? calculated.total : null,
      components: componentNames.map(([key, label]) => ({
        key,
        label,
        value:
          calculated && available[key] && blockers.length === 0
            ? calculated[key]
            : null,
        max: maximums[key],
        status:
          fact.eligibility === "ineligible"
            ? "not_eligible"
            : fact.eligibility !== "eligible" ||
                !available[key] ||
                blockers.length
              ? "awaiting"
              : (key === "voting" || key === "bonus") && !engagementScored
                ? "display_only"
                : key === "astra"
                  ? policy.weights.ai === 0
                    ? "not_weighted"
                    : fact.astra !== null
                      ? "manual"
                      : "provider"
                  : "available",
      })),
      basis: "current",
      pending,
      eligibility: fact.eligibility,
      policyVersion: settings.version,
      snapshotId: null,
      sourceRevision: null,
      createdAt: null,
    });
  }
  const snapshot = await one<{
    id: string;
    policy_version: number;
    source_revision: number;
    created_at: string;
    payload: string;
  }>(
    service.db,
    "SELECT id,policy_version,source_revision,created_at,payload FROM result_snapshots ORDER BY created_at DESC,id LIMIT 1",
  );
  const frozenScores: AdminProjectScoreDTO[] = [];
  let frozen: AdminSubmissionAnalyticsDTO["frozen"] = null;
  if (snapshot) {
    let entries: unknown[] = [];
    let invalidEntries = 0;
    try {
      const value: unknown = JSON.parse(snapshot.payload);
      if (Array.isArray(value)) entries = value;
      else invalidEntries++;
    } catch {
      invalidEntries++;
    }
    const projectsByTeam = new Map(facts.map((f) => [f.team_id, f.project_id]));
    const seenTeams = new Set<string>();
    for (const value of entries) {
      if (!value || typeof value !== "object") {
        invalidEntries++;
        continue;
      }
      const entry = value as Record<string, unknown>,
        part = entry.components as Record<string, unknown> | null;
      if (
        typeof entry.teamId !== "string" ||
        seenTeams.has(entry.teamId) ||
        !["eligible", "ineligible"].includes(String(entry.eligibility)) ||
        (entry.policyVersion !== undefined &&
          entry.policyVersion !== snapshot.policy_version) ||
        (part !== null &&
          (!part ||
            !componentNames.every(([key]) =>
              numeric(part[key], Number.MAX_VALUE),
            ) ||
            !numeric(part.total, Number.MAX_VALUE)))
      ) {
        invalidEntries++;
        continue;
      }
      if (
        (part === null && entry.eligibility === "eligible") ||
        (part &&
          (Number(part.penalties) > 10 ||
            entry.eligibility !== "eligible" ||
            Math.abs(
              Number(part.total) -
                Math.max(
                  0,
                  Number(part.human) +
                    Number(part.astra) +
                    Number(part.voting) +
                    Number(part.diversity) +
                    Number(part.codex) +
                    Number(part.bonus) -
                    Number(part.penalties),
                ),
            ) > 1e-9))
      ) {
        invalidEntries++;
        continue;
      }
      frozenScores.push({
        projectId: projectsByTeam.get(entry.teamId) || "",
        teamId: entry.teamId,
        versionId: null,
        attempt: null,
        total: part ? Number(part.total) : null,
        components: componentNames.map(([key, label]) => ({
          key,
          label,
          value: part ? Number(part[key]) : null,
          max: null,
          status: part ? "available" : "not_eligible",
        })),
        basis: "frozen",
        pending: part ? [] : ["No eligible score in this frozen snapshot."],
        eligibility: String(entry.eligibility),
        policyVersion: snapshot.policy_version,
        snapshotId: snapshot.id,
        sourceRevision: snapshot.source_revision,
        createdAt: snapshot.created_at,
      });
      seenTeams.add(entry.teamId);
    }
    frozen = {
      snapshotId: snapshot.id,
      policyVersion: snapshot.policy_version,
      sourceRevision: snapshot.source_revision,
      createdAt: snapshot.created_at,
      entryCount: entries.length,
      eligibleCount: frozenScores.filter((s) => s.eligibility === "eligible")
        .length,
      invalidEntries,
    };
  }
  const ended = await one<{ revision: number; policy_version: number }>(
    service.db,
    revisionSQL,
  );
  demand(
    ended &&
      ended.revision === started.revision &&
      ended.policy_version === started.policy_version,
    409,
    "ANALYTICS_CHANGED_REFRESH",
    "Scoring facts changed. Refresh to load a consistent summary.",
  );
  const comparable = scores
    .filter((s) => s.eligibility === "eligible" && s.total !== null)
    .map((s) => s.total!);
  const baseMaximum =
    policy.weights.human +
    policy.weights.ai +
    policy.weights.votes +
    policy.weights.diversity +
    policy.weights.codex;
  return {
    analytics: {
      scope: "Current committed submissions",
      cohortTotal: facts.length,
      selectionMissing: Number(selection?.missing || 0),
      cerebras: Object.entries(cerebras).map(([key, value]) => ({
        key,
        label: key === "yes" ? "Yes" : key === "no" ? "No" : "Unanswered",
        value,
      })),
      eligibility: Object.entries(eligibility).map(([key, value]) => ({
        key,
        label:
          key === "needs_review"
            ? "Awaiting review"
            : key === "eligible"
              ? "Eligible"
              : "Ineligible",
        value,
      })),
      evaluation: Object.entries(evaluation).map(([key, value]) => ({
        key,
        label: {
          validated: "Validated AI evaluation",
          running: "Running",
          queued: "Queued",
          needs_review: "Needs review",
          failed: "Failed or stale",
          not_evaluated: "Not evaluated",
        }[key]!,
        value,
      })),
      scores: {
        complete: comparable.length,
        awaiting: scores.filter(
          (s) => s.eligibility !== "ineligible" && s.total === null,
        ).length,
        eligibleComparable: comparable.length,
        average: comparable.length
          ? comparable.reduce((a, b) => a + b, 0) / comparable.length
          : null,
        minimum: comparable.length ? Math.min(...comparable) : null,
        maximum: comparable.length ? Math.max(...comparable) : null,
      },
      policy: {
        version: settings.version,
        blockers,
        baseMaximum,
        feedbackMaximum: policy.weights.feedback,
        maxTotal: baseMaximum + policy.weights.feedback,
      },
      frozen,
    },
    scores,
    frozenScores,
  };
}
