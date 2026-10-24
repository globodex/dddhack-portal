import { createHash } from "node:crypto";
import { z } from "zod";

export const evaluationLimits = {
  files: 24,
  fileBytes: 32_768,
  totalFileBytes: 131_072,
  descriptionBytes: 16_384,
  requestBytes: 196_608,
  responseBytes: 131_072,
  outputTokens: 3_000,
  attemptMs: 5_000,
  attempts: 2,
  retryDelayMs: 200,
} as const;
export type EvaluationErrorCode =
  | "OPENAI_NOT_CONFIGURED"
  | "OPENAI_INPUT_REJECTED"
  | "OPENAI_SNAPSHOT_UNAVAILABLE"
  | "OPENAI_UNAVAILABLE"
  | "OPENAI_OUTPUT_INVALID"
  | "OPENAI_REFUSED";
export class OpenAIEvaluationError extends Error {
  constructor(public readonly code: EvaluationErrorCode) {
    super(code);
    this.name = "OpenAIEvaluationError";
  }
}
export function requireEvaluation(
  value: unknown,
  code: EvaluationErrorCode,
): asserts value {
  if (!value) throw new OpenAIEvaluationError(code);
}
export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const descriptionSchema = z
  .object({
    projectName: z.string().trim().min(1).max(120).optional(),
    problemSolution: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().min(1).max(6000),
    features: z.string().trim().min(1).max(4000).optional(),
    gtm: z.string().trim().min(1).max(3000).optional(),
  })
  .strict();
const snapshotSchema = z
  .object({
    versionId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
    commitSha: sha,
    approved: z.literal(true),
    approvedPaths: z.array(z.string()).max(evaluationLimits.files),
    descriptions: descriptionSchema,
    files: z
      .array(
        z
          .object({
            path: z.string(),
            content: z.string().max(evaluationLimits.fileBytes),
            commitSha: sha,
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(evaluationLimits.files),
    commit: z
      .object({
        sha,
        committedAt: z.string().datetime({ offset: true }).optional(),
      })
      .strict(),
  })
  .strict();
export type ApprovedEvaluationSnapshot = z.infer<typeof snapshotSchema>;
export type ApprovedSnapshotResolver = (
  versionId: string,
) => Promise<ApprovedEvaluationSnapshot | null>;

export function safeSourcePath(path: string) {
  if (path.length < 1 || path.length > 180 || !/^[A-Za-z0-9_./-]+$/.test(path))
    return false;
  const parts = path.split("/");
  if (parts.some((part) => !part || part.startsWith("."))) return false;
  if (
    parts.some((part) =>
      /^(?:credentials?|secrets?|tokens?|passwords?|private[-_]?keys?|node_modules|vendor|logs?|backups?|profiles?|participants?|vouchers?|credits?)(?:[._-]|$)/i.test(
        part,
      ),
    )
  )
    return false;
  if (
    /(?:^|\/)(?:id_rsa|id_ed25519|auth\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)(?:$|\.)/i.test(
      path,
    )
  )
    return false;
  return /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|html|css|scss|md|json|ya?ml|toml|txt|sql|sh)$/i.test(
    path,
  );
}

// Conservative rejection is intentional. Selection by an authorized reviewer is
// still required; pattern scanning cannot certify arbitrary text is non-sensitive.
export function assertSafeEvaluationText(value: string) {
  requireEvaluation(
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/.test(
      value,
    ),
    "OPENAI_INPUT_REJECTED",
  );
  let decoded = value.normalize("NFKC");
  for (let depth = 0; depth < 3; depth++) {
    decoded = decoded
      .replace(/\\u([a-f0-9]{4})/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/\\x([a-f0-9]{2})/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/%([a-f0-9]{2})/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  }
  const secretPatterns = [
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{12,})/,
    /\bAIza[A-Za-z0-9_-]{30,}/,
    /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{12,}/,
    /-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY|PGP PRIVATE KEY)/,
    /(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|smtp):\/\/[^\s/]*:[^\s/]+@/i,
    /\bBearer\s+[A-Za-z0-9_.~+/-]{16,}/i,
    /\b(?:voucher|redemption|credit)[_-]?(?:code|token)?\s*[:=]\s*["'`][^"'`\r\n]{4,}["'`]/i,
    /\b[A-Za-z0-9_-]{0,64}(?:api[_-]?key|secret|password|passwd|token|credential|authorization)[A-Za-z0-9_-]{0,64}\b\s*["']?\s*[:=]\s*["'`][^"'`\r\n]+["'`]/i,
  ];
  requireEvaluation(
    !secretPatterns.some((pattern) => pattern.test(decoded)),
    "OPENAI_INPUT_REJECTED",
  );
  // Mail/contact records and long phone-shaped numbers are outside approval.
  requireEvaluation(
    !/\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9-]{1,63}(?:\.[A-Z0-9-]{1,63})+/i.test(
      decoded,
    ),
    "OPENAI_INPUT_REJECTED",
  );
  const numbers = decoded.match(/(?:\+?\d[\d ().-]{7,}\d)/g) || [];
  requireEvaluation(
    !numbers.some((number) => {
      const length = number.replace(/\D/g, "").length;
      return length >= 10 && length <= 15;
    }),
    "OPENAI_INPUT_REJECTED",
  );
}

export function validateApprovedSnapshot(
  input: unknown,
  versionId: string,
  expectedSha: string,
): ApprovedEvaluationSnapshot {
  const parsed = snapshotSchema.safeParse(input);
  requireEvaluation(parsed.success, "OPENAI_INPUT_REJECTED");
  const snapshot = parsed.data;
  requireEvaluation(
    snapshot.versionId === versionId &&
      snapshot.commitSha === expectedSha &&
      snapshot.commit.sha === expectedSha,
    "OPENAI_INPUT_REJECTED",
  );
  const selected = new Set(
    snapshot.approvedPaths.map((path) => path.toLowerCase()),
  );
  requireEvaluation(
    selected.size === snapshot.approvedPaths.length &&
      snapshot.approvedPaths.every(safeSourcePath) &&
      snapshot.files.length === selected.size,
    "OPENAI_INPUT_REJECTED",
  );
  requireEvaluation(
    Buffer.byteLength(JSON.stringify(snapshot.descriptions)) <=
      evaluationLimits.descriptionBytes,
    "OPENAI_INPUT_REJECTED",
  );
  for (const text of Object.values(snapshot.descriptions))
    assertSafeEvaluationText(text);
  const seen = new Set<string>();
  let total = 0;
  for (const file of snapshot.files) {
    requireEvaluation(
      safeSourcePath(file.path) &&
        snapshot.approvedPaths.includes(file.path) &&
        !seen.has(file.path.toLowerCase()) &&
        file.commitSha === expectedSha &&
        digest(file.content) === file.sha256,
      "OPENAI_INPUT_REJECTED",
    );
    seen.add(file.path.toLowerCase());
    total += Buffer.byteLength(file.content);
    requireEvaluation(
      Buffer.byteLength(file.content) <= evaluationLimits.fileBytes &&
        total <= evaluationLimits.totalFileBytes,
      "OPENAI_INPUT_REJECTED",
    );
    assertSafeEvaluationText(file.content);
    assertSafeEvaluationText(file.path);
  }
  return snapshot;
}
