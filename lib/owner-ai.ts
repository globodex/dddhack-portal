import { z } from "zod";
import { one, batch, assertPreviousWrite, type Database } from "./db";
import type { PortalService } from "./service";
import { demand } from "./security";

export const aiModelId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
  .refine(
    (value) => !/^(?:sk-|sess-)/i.test(value),
    "Enter a model ID, never an API key.",
  );
export type ProviderUsage = {
  id: string;
  versionId: string;
  requestedModel: string;
  actualModel: string | null;
  input: number | null;
  output: number | null;
  cached: number | null;
  total: number | null;
};
const count = (value: unknown) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 1_000_000_000
    ? value
    : null;
/** Provider metadata only: never prompt, output, project payload, key or pricing guesses. */
export function providerUsage(
  value: unknown,
  versionId: string,
  requestedModel: string,
): ProviderUsage {
  const response =
    value && typeof value === "object" ? (value as Record<string, any>) : {};
  const u =
    response.usage && typeof response.usage === "object" ? response.usage : {};
  let input = count(u.input_tokens),
    output = count(u.output_tokens),
    cached = count(u.input_tokens_details?.cached_tokens),
    total = count(u.total_tokens);
  if (cached !== null && input !== null && cached > input) cached = null;
  if (
    total !== null &&
    input !== null &&
    output !== null &&
    total !== input + output
  )
    total = null;
  return {
    id:
      typeof response.id === "string" &&
      /^[A-Za-z0-9_-]{1,150}$/.test(response.id)
        ? response.id
        : crypto.randomUUID(),
    versionId,
    requestedModel,
    actualModel: aiModelId.safeParse(response.model).success
      ? response.model
      : null,
    input,
    output,
    cached,
    total,
  };
}
export async function recordProviderUsage(
  db: Database,
  usage: ProviderUsage,
  at: string,
) {
  await batch(db, [
    [
      `INSERT INTO ai_provider_usage(id,version_id,requested_model,actual_model,input_tokens,output_tokens,cached_tokens,total_tokens,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
      usage.id,
      usage.versionId,
      usage.requestedModel,
      usage.actualModel,
      usage.input,
      usage.output,
      usage.cached,
      usage.total,
      at,
    ],
  ]);
}
export async function selectedAIModel(db: Database, fallback?: string) {
  const row = await one<{ model: string; revision: number }>(
    db,
    "SELECT model,revision FROM ai_model_settings WHERE id=1",
  );
  return {
    model:
      row?.model || (aiModelId.safeParse(fallback).success ? fallback! : null),
    source: row ? "owner" : "environment",
    revision: row?.revision || 0,
  };
}
export async function ownerAIView(s: PortalService) {
  await s.staff(true);
  const selected = await selectedAIModel(s.db, s.evaluator.model);
  const sums = selected.model
    ? await one<Record<string, number | null>>(
        s.db,
        `SELECT count(*) responses,
    sum(input_tokens) input_tokens,count(input_tokens) input_known,
    sum(output_tokens) output_tokens,count(output_tokens) output_known,
    sum(cached_tokens) cached_tokens,count(cached_tokens) cached_known,
    sum(total_tokens) total_tokens,count(total_tokens) total_known
    FROM ai_provider_usage WHERE requested_model=?`,
        selected.model,
      )
    : undefined;
  const metric = (name: string) => ({
    tokens: Number(sums?.[name + "_known"] || 0)
      ? Number(sums?.[name + "_tokens"])
      : null,
    knownResponses: Number(sums?.[name + "_known"] || 0),
  });
  return {
    ...selected,
    providerAvailable: s.evaluator.available === true,
    responses: Number(sums?.responses || 0),
    input: metric("input"),
    output: metric("output"),
    cached: metric("cached"),
    total: metric("total"),
    costUSD: null,
    coverage:
      "Recorded portal responses only, after this backend update. Historical calls and missing telemetry are unavailable. Cached tokens are included in input.",
    costReason:
      "Charged cost is unavailable without verified billing data. No pricing or account totals are inferred.",
  };
}
export async function ownerAICommand(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action !== "change-ai-model") return null;
  const actor = await s.staff(true);
  const d = z
    .object({
      model: aiModelId,
      expectedRevision: z.number().int().min(0),
      confirmation: z.literal("CHANGE_AI_MODEL"),
    })
    .strict()
    .parse(input);
  const current = await selectedAIModel(s.db, s.evaluator.model);
  demand(
    current.revision === d.expectedRevision,
    409,
    "AI_MODEL_CHANGED",
    "Refresh the model settings before saving.",
  );
  await s.mutate(
    actor.id,
    action,
    "ai-model",
    [
      current.revision === 0
        ? [
            "INSERT INTO ai_model_settings(id,model,revision,updated_by,updated_at) VALUES(1,?,1,?,?) ON CONFLICT(id) DO NOTHING",
            d.model,
            actor.id,
            s.now(),
          ]
        : [
            "UPDATE ai_model_settings SET model=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=1 AND revision=?",
            d.model,
            actor.id,
            s.now(),
            d.expectedRevision,
          ],
      ...assertPreviousWrite(),
    ],
    { changed: true },
    "Owner selected the model for future evaluations",
  );
  return {
    message:
      "Model saved for future evaluations. API access is not verified by saving.",
    revision: current.revision + 1,
  };
}
