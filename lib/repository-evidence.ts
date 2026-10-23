import { z } from "zod";
import type { PortalService } from "./service";
import { one, type SQL } from "./db";
import { demand } from "./security";
import { githubEligibility } from "./evaluation";
export const repositoryStart = "2026-11-01T02:30:00Z";
export const commitSha = z
  .string()
  .regex(/^[a-f0-9]{40}$/i, "Use the full 40-character submitted commit SHA.")
  .transform((v) => v.toLowerCase());
export async function eligibilityReviewer(
  s: PortalService,
  projectId: string,
  restorationOnly = false,
) {
  const actor = await s.actor();
  if (actor.owner || actor.role === "admin") return actor;
  demand(
    actor.role === "judge" &&
      !!(await one(
        s.db,
        "SELECT 1 FROM project_assignments a WHERE a.project_id=? AND a.user_id=? AND a.kind='judge' AND NOT EXISTS(SELECT 1 FROM projects p JOIN memberships m ON m.team_id=p.team_id WHERE p.id=a.project_id AND m.user_id=a.user_id)",
        projectId,
        actor.id,
      )),
    403,
    "ASSIGNED_ELIGIBILITY_REVIEWER_REQUIRED",
  );
  demand(restorationOnly, 403, "ADMIN_ELIGIBILITY_DECISION_REQUIRED");
  return actor;
}
export function eligibilityWrite(
  p: {
    id: string;
    versionId: string;
    status: string;
    reason: string;
    evidence: unknown;
  },
  actorId: string,
  now: string,
): SQL[] {
  return [
    [
      "INSERT INTO project_eligibility VALUES(?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET version_id=excluded.version_id,status=excluded.status,reason=excluded.reason,decided_by=excluded.decided_by,updated_at=excluded.updated_at",
      p.id,
      p.versionId,
      p.status,
      p.reason,
      actorId,
      now,
    ],
    ...(p.status === "eligible"
      ? [
          [
            "DELETE FROM team_status_overrides WHERE team_id=(SELECT team_id FROM projects WHERE id=? AND published_version_id=?)",
            p.id,
            p.versionId,
          ] as SQL,
        ]
      : []),
    [
      "INSERT INTO eligibility_history VALUES(?,?,?,?,?,?,?,?)",
      crypto.randomUUID(),
      p.id,
      p.versionId,
      p.status,
      p.reason,
      JSON.stringify(p.evidence),
      actorId,
      now,
    ],
  ];
}
export async function repositoryCommand(
  s: PortalService,
  action: string,
  data: unknown,
) {
  if (action !== "record-repository-evidence") return null;
  const d = z
    .object({
      projectId: z.string().min(1),
      versionId: z.string().min(1),
      commitSha,
      reason: z.string().trim().min(10).max(1000),
      metadata: z
        .object({
          public: z.boolean(),
          createdAt: z.string().datetime({ offset: true }),
          firstCommit: z.string().datetime({ offset: true }).nullable(),
        })
        .strict()
        .nullable(),
      source: z.string().trim().min(5).max(2000),
      observedAt: z.string().datetime({ offset: true }),
    })
    .strict()
    .parse(data);
  const actor = await eligibilityReviewer(s, d.projectId, true);
  await s.unfrozen();
  const version = await one<{ payload: string }>(
    s.db,
    "SELECT v.payload FROM projects p JOIN submission_versions v ON v.id=p.published_version_id AND v.team_id=p.team_id WHERE p.id=? AND v.id=?",
    d.projectId,
    d.versionId,
  );
  demand(version, 409, "PROJECT_VERSION_CHANGED");
  demand(
    JSON.parse(version.payload).commitSha === d.commitSha,
    409,
    "SUBMITTED_COMMIT_MISMATCH",
  );
  const result = githubEligibility(d.metadata);
  // Assigned judges may restore eligibility; only operational admins can record a negative decision.
  if (result !== "ELIGIBLE") await eligibilityReviewer(s, d.projectId, false);
  const status =
    result === "ELIGIBLE"
      ? "eligible"
      : result === "INELIGIBLE"
        ? "ineligible"
        : "needs_review";
  const evidence = {
    metadata: d.metadata,
    source: d.source,
    observedAt: d.observedAt,
    commitSha: d.commitSha,
    cutoff: repositoryStart,
    comparison: "strictly-after",
    caveat:
      "Repository history dates are operational evidence, not proof of original authorship.",
  };
  const reason =
    status === "ineligible"
      ? "Repository creation and first commit must both be strictly after 1 November 2026, 08:00 IST. " +
        d.reason
      : d.reason;
  await s.mutate(
    actor.id,
    action,
    d.projectId,
    [
      [
        "INSERT INTO repository_evidence VALUES(?,?,?,?,?,?,?,?,?)",
        crypto.randomUUID(),
        d.projectId,
        d.versionId,
        d.commitSha,
        status,
        JSON.stringify(evidence),
        reason,
        actor.id,
        s.now(),
      ],
      ...eligibilityWrite(
        { id: d.projectId, versionId: d.versionId, status, reason, evidence },
        actor.id,
        s.now(),
      ),
    ],
    { versionId: d.versionId, status, commitSha: d.commitSha },
    reason,
  );
  return {
    message:
      status === "needs_review"
        ? "Repository is unverifiable; no violation has been inferred."
        : "Version-specific repository evidence recorded.",
    status,
  };
}
