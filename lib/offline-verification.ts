import type { Evaluator, Report } from "./evaluation";
import { selectedSubmissionTools } from "./submission-tools";

type WorkflowTool =
  | "Codex"
  | "Parallel Agents"
  | "Parallel worktrees"
  | "ChatGPT Sites"
  | "ChatGPT";
export type OfflineSnapshot = {
  versionId: string;
  commitSha: string;
  complete: boolean;
  files: { path: string; content: string }[];
  // Supplied completed workflow records, never inferred from authors or code style.
  workflow?: { tool: WorkflowTool; artifactPath: string; event: "completed" }[];
};
export type OfflineSnapshotResolver = (
  versionId: string,
) => Promise<OfflineSnapshot | null>;
export const offlineSnapshotLimits = {
  files: 48,
  fileBytes: 65_536,
  totalBytes: 524_288,
  workflows: 24,
} as const;
const encoder = new TextEncoder();
const safePath = (path: unknown): path is string =>
  typeof path === "string" &&
  path.length > 0 &&
  path.length <= 180 &&
  /^[a-zA-Z0-9_./ -]+$/.test(path) &&
  !path.startsWith("/") &&
  !path.split("/").some((part) => !part || part === "." || part === "..") &&
  !/(^|\/)(\.env(?:\..*)?|credentials?|secrets?|id_rsa|id_ed25519)(\/|$)/i.test(
    path,
  );
function usable(
  snapshot: OfflineSnapshot,
  versionId: string,
  commitSha: string,
) {
  if (
    snapshot.versionId !== versionId ||
    snapshot.commitSha.toLowerCase() !== commitSha ||
    !snapshot.complete ||
    !Array.isArray(snapshot.files) ||
    snapshot.files.length > offlineSnapshotLimits.files ||
    (snapshot.workflow?.length || 0) > offlineSnapshotLimits.workflows
  )
    return false;
  let total = 0;
  const paths = new Set<string>();
  for (const file of snapshot.files) {
    if (
      !file ||
      !safePath(file.path) ||
      paths.has(file.path) ||
      typeof file.content !== "string" ||
      file.content.length > offlineSnapshotLimits.fileBytes
    )
      return false;
    paths.add(file.path);
    const size = encoder.encode(file.content).byteLength;
    total += size;
    if (
      size > offlineSnapshotLimits.fileBytes ||
      total > offlineSnapshotLimits.totalBytes
    )
      return false;
  }
  for (const workflow of snapshot.workflow || [])
    if (
      !workflow ||
      workflow.event !== "completed" ||
      !safePath(workflow.artifactPath) ||
      !paths.has(workflow.artifactPath)
    )
      return false;
  return true;
}
const check = (
  id: string,
  status: Report["checks"][number]["status"],
  evidence: string[],
  explanation: string,
) => ({ id, status, evidence, explanation });
const unknown = (id: string) =>
  check(
    id,
    "UNKNOWN",
    [],
    "A complete version-bound committed snapshot with reliable evidence is unavailable. Human review required; no score or penalty is assigned.",
  );

// Caller injects an offline fixture/snapshot reader. No provider, URL fetch,
// credential lookup, repository checkout, score or activation is implemented here.
export function createOfflineVerificationEvaluator(
  resolveSnapshot: OfflineSnapshotResolver,
): Evaluator {
  return {
    async evaluate(versionId, payload) {
      const submitted =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
      const claims = selectedSubmissionTools(
        submitted.ecosystemSelections ?? submitted.tools,
      );
      const report: Report = {
        versionId,
        status: "needs_review",
        model: "offline-snapshot-evidence-only",
        rubricVersion: 1,
        revision: "unverified",
        checks: [
          unknown("snapshot"),
          ...claims.map((claim) => unknown(`ecosystem:${claim}`)),
        ],
        dimensions: null,
        suspectedFalseClaims: [],
      };
      const sha =
        typeof submitted.commitSha === "string"
          ? submitted.commitSha.toLowerCase()
          : "";
      if (!/^[a-f0-9]{40}$/.test(sha)) return report;
      let snapshot: OfflineSnapshot | null;
      try {
        snapshot = await resolveSnapshot(versionId);
      } catch {
        return report;
      }
      try {
        if (!snapshot || !usable(snapshot, versionId, sha)) return report;
      } catch {
        return report;
      }
      report.revision = sha;
      report.checks = [
        check(
          "snapshot",
          "PASS",
          [
            "Complete snapshot matches the immutable submission version and commit.",
          ],
          "Binding and input bounds checked locally. Repository authorship and runtime behavior require human review.",
        ),
      ];
      for (const claim of claims) {
        if (claim === "OpenAI API") {
          const candidates = snapshot.files.filter((file) =>
            /\.(?:[cm]?[jt]sx?|py)$/.test(file.path),
          );
          const match = candidates.find((file) => {
            // Strip comments before looking for a specific SDK receiver/invocation.
            const code = file.content
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .replace(/^\s*(?:\/\/|#).*$/gm, "");
            const jsClient = code.match(
              /\b([a-zA-Z_$][\w$]*)\s*=\s*new\s+OpenAI\s*\(/,
            )?.[1];
            const pyClient = code.match(
              /\b([a-zA-Z_][\w]*)\s*=\s*OpenAI\s*\(/,
            )?.[1];
            const invokes = (client: string | undefined) =>
              !!client &&
              new RegExp(
                `\\b${client.replace(/[$]/g, "\\$")}\\.(?:responses|chat\\.completions|embeddings)\\.create\\s*\\(`,
              ).test(code);
            const js =
              /(?:import\s+(?:OpenAI|\{[^}]*OpenAI[^}]*\})\s+from\s+["']openai["']|require\(["']openai["']\))/.test(
                code,
              ) && invokes(jsClient);
            const py =
              (/from\s+openai\s+import\s+OpenAI/.test(code) &&
                invokes(pyClient)) ||
              (/import\s+openai/.test(code) && invokes("openai"));
            return js || py;
          });
          report.checks.push(
            match
              ? check(
                  `ecosystem:${claim}`,
                  "NEEDS_MANUAL_REVIEW",
                  [`SDK invocation evidence in ${match.path}`],
                  "The committed source matches an OpenAI SDK receiver and invocation pattern. Execution, correctness and attribution are unverified; no API request was made.",
                )
              : unknown(`ecosystem:${claim}`),
          );
        } else {
          const workflow = snapshot.workflow?.find(
            (entry) => entry.tool === claim,
          );
          report.checks.push(
            workflow
              ? check(
                  `ecosystem:${claim}`,
                  "NEEDS_MANUAL_REVIEW",
                  [`Completed workflow record in ${workflow.artifactPath}`],
                  "Explicit supplied workflow evidence is present. Human review must verify authenticity and relevance; code style and contributor counts were not used.",
                )
              : unknown(`ecosystem:${claim}`),
          );
        }
      }
      return report;
    },
  };
}
