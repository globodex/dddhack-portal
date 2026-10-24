import { z } from "zod";
import { assertPreviousWrite, one } from "../../lib/db";
import { PortalService } from "../../lib/service";
import { checkMutationRequest, demand, PortalError } from "../../lib/security";
import type { Runtime } from "../../lib/http";
import {
  prepareApprovedSnapshot,
  OpenAIEvaluationError,
  evaluationLimits,
} from "./index";

async function boundedJSON(request: Request) {
  checkMutationRequest(request);
  const reader = request.body?.getReader();
  demand(reader, 422, "EMPTY_BODY");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      demand(
        bytes <= evaluationLimits.requestBytes + 4096,
        413,
        "BODY_TOO_LARGE",
      );
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PortalError(422, "INVALID_JSON");
  }
}

// Store only an explicitly selected, version-bound snapshot after current staff
// authorization. The approval actor and source body never enter ordinary audit.
export async function handleEvaluationSnapshots(
  request: Request,
  runtime: Runtime,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    demand(request.method === "POST", 405, "METHOD_NOT_ALLOWED");
    const service = new PortalService(
      runtime.db,
      runtime.identity,
      runtime.key,
    );
    const actor = await service.staff();
    await service.unfrozen();
    const path = new URL(request.url).pathname;
    const body = await boundedJSON(request);
    if (path === "/api/evaluation/snapshots/revoke") {
      const { versionId } = z
        .object({ versionId: z.string().min(1).max(120) })
        .strict()
        .parse(body);
      const existing = await one<{ revoked_at: string | null }>(
        runtime.db,
        "SELECT revoked_at FROM approved_evaluation_snapshots WHERE version_id=?",
        versionId,
      );
      demand(existing, 404, "SNAPSHOT_NOT_FOUND");
      if (!existing.revoked_at)
        await service.mutate(
          actor.id,
          "revoke-evaluation-snapshot",
          versionId,
          [
            [
              "UPDATE approved_evaluation_snapshots SET revoked_at=? WHERE version_id=? AND revoked_at IS NULL",
              service.now(),
              versionId,
            ],
            ...assertPreviousWrite(),
          ],
          { revoked: true },
        );
      return Response.json({ revoked: true }, { headers });
    }
    demand(path === "/api/evaluation/snapshots", 404, "NOT_FOUND");
    const { versionId, snapshot } = z
      .object({
        versionId: z.string().min(1).max(120),
        snapshot: z.unknown(),
      })
      .strict()
      .parse(body);
    const binding = await one<{ commit_sha: string }>(
      runtime.db,
      "SELECT r.commit_sha FROM repository_evidence r JOIN submission_versions v ON v.id=r.version_id JOIN projects p ON p.id=r.project_id AND p.team_id=v.team_id WHERE r.version_id=? AND p.published_version_id=v.id AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND ((rr.kind='project' AND rr.target_id=p.id) OR (rr.kind='submission' AND rr.target_id=v.id))) ORDER BY r.created_at DESC,r.id DESC LIMIT 1",
      versionId,
    );
    demand(binding, 409, "VERIFIED_REPOSITORY_BINDING_REQUIRED");
    const prepared = prepareApprovedSnapshot(snapshot, {
      versionId,
      commitSha: binding.commit_sha,
    });
    const existing = await one<{
      snapshot_sha256: string;
      revoked_at: string | null;
    }>(
      runtime.db,
      "SELECT snapshot_sha256,revoked_at FROM approved_evaluation_snapshots WHERE version_id=?",
      versionId,
    );
    if (existing) {
      demand(
        !existing.revoked_at &&
          existing.snapshot_sha256 === prepared.snapshotSha256,
        409,
        "SNAPSHOT_IMMUTABLE",
      );
      return Response.json(
        { approved: true, snapshotSha256: existing.snapshot_sha256 },
        { headers },
      );
    }
    await service.mutate(
      actor.id,
      "approve-evaluation-snapshot",
      versionId,
      [
        [
          "INSERT INTO approved_evaluation_snapshots(version_id,commit_sha,snapshot_json,snapshot_sha256,approved_by,approved_at) VALUES(?,?,?,?,?,?)",
          versionId,
          prepared.commitSha,
          prepared.snapshotJson,
          prepared.snapshotSha256,
          actor.id,
          service.now(),
        ],
      ],
      {
        snapshotSha256: prepared.snapshotSha256,
        selectedFiles: JSON.parse(prepared.snapshotJson).files.length,
      },
    );
    return Response.json(
      { approved: true, snapshotSha256: prepared.snapshotSha256 },
      { status: 201, headers },
    );
  } catch (error) {
    if (error instanceof PortalError)
      return Response.json(
        { code: error.code },
        { status: error.status, headers },
      );
    if (error instanceof OpenAIEvaluationError || error instanceof z.ZodError)
      return Response.json(
        { code: "EVALUATION_SNAPSHOT_REJECTED" },
        { status: 422, headers },
      );
    return Response.json(
      { code: "EVALUATION_SNAPSHOT_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
