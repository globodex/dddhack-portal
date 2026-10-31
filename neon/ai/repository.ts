import { one, type Database } from "../../lib/db";
import {
  digest,
  evaluationLimits,
  OpenAIEvaluationError,
  requireEvaluation,
  validateApprovedSnapshot,
} from "./input";

// Authorization belongs to the caller: an operational admin selection or a
// server-owned automatic selection must bind these exact immutable contents.
// A client-supplied approved flag never grants authority.
export function prepareApprovedSnapshot(
  input: unknown,
  binding: { versionId: string; commitSha: string },
) {
  const snapshot = validateApprovedSnapshot(
    input,
    binding.versionId,
    binding.commitSha,
  );
  const snapshotJson = JSON.stringify(snapshot);
  requireEvaluation(
    Buffer.byteLength(snapshotJson) <= evaluationLimits.requestBytes,
    "OPENAI_INPUT_REJECTED",
  );
  return {
    snapshotJson,
    snapshotSha256: digest(snapshotJson),
    commitSha: snapshot.commitSha,
  };
}
export async function readApprovedSnapshot(db: Database, versionId: string) {
  try {
    const row = await one<{
      version_id: string;
      commit_sha: string;
      snapshot_json: string;
      snapshot_sha256: string;
    }>(
      db,
      "SELECT version_id,commit_sha,snapshot_json,snapshot_sha256 FROM approved_evaluation_snapshots WHERE version_id=? AND revoked_at IS NULL",
      versionId,
    );
    if (!row) return null;
    requireEvaluation(
      typeof row.snapshot_json === "string" &&
        Buffer.byteLength(row.snapshot_json) <= evaluationLimits.requestBytes &&
        digest(row.snapshot_json) === row.snapshot_sha256 &&
        row.version_id === versionId,
      "OPENAI_INPUT_REJECTED",
    );
    return validateApprovedSnapshot(
      JSON.parse(row.snapshot_json),
      versionId,
      row.commit_sha,
    );
  } catch {
    throw new OpenAIEvaluationError("OPENAI_SNAPSHOT_UNAVAILABLE");
  }
}
