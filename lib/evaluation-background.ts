import { z } from "zod";
import { rows } from "./db";
import { demand, PortalError } from "./security";
import type { PortalService } from "./service";

export type BackgroundDispatch = (task: Promise<unknown>) => void;

// Explicit staff request only. No schedule, provider, credential lookup or activation.
export async function queueEvaluations(
  service: PortalService,
  data: unknown,
  dispatch: BackgroundDispatch,
) {
  const { limit } = z
    .object({ limit: z.number().int().min(1).max(5).default(1) })
    .strict()
    .parse(data);
  await service.staff();
  // Provider requests stay within the frontend proxy's bounded request budget.
  // Larger offline fixture batches retain the existing limit of five.
  demand(service.evaluator.provenance !== "provider" || limit === 1, 422, "PROVIDER_BATCH_LIMIT_ONE");
  await service.unfrozen();
  const close = (await service.settings()).policy.submissionClose;
  demand(close && service.now() >= close, 409, "SUBMISSION_WINDOW_OPEN");
  const jobs = await rows<{ id: string }>(
    service.db,
    "SELECT id FROM astra_jobs WHERE state IN ('pending','failed_retryable') AND attempts<3 ORDER BY updated_at,id LIMIT ?",
    limit,
  );
  dispatch(
    (async () => {
      for (const job of jobs) {
        try {
          await service.command("astra-run", { jobId: job.id });
        } catch (error) {
          // Another worker may win the claim or operations may be frozen meanwhile.
          // Provider failures are sanitized and persisted by astra-run itself.
          if (!(error instanceof PortalError)) throw error;
        }
      }
    })(),
  );
  return {
    accepted: jobs.length,
    jobIds: jobs.map((j) => j.id),
    message: "Verification queued for human review.",
  };
}
