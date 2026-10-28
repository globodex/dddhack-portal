import { selectedAIModel, recordProviderUsage } from "../lib/owner-ai";
import { disabledEvaluator } from "../lib/evaluation";
import { createNeonDatabase, type NeonDatabaseEnvironment } from "./db/index";
import {
  authenticateRequest,
  createAuthHandler,
  type AuthEnv,
} from "./auth/index";
import { createPortalBackend, type BackendEnvironment } from "./router";
import { PortalService } from "../lib/service";
import {
  createDatabaseMediaRepository,
  createMediaDatabase,
  createNeonStorageClient,
  createPortalMediaAuthorizer,
  createProjectMediaStorage,
  createS3ObjectStore,
  createStorageApiHandler,
  type StorageEnvironment,
} from "./storage/index";
import type { Database } from "../lib/db";
import {
  createOpenAIEvaluator,
  readApprovedSnapshot,
  type OpenAIEvaluationEnv,
} from "./ai/index";
import { handleEvaluationSnapshots } from "./ai/http";

const env = process.env as AuthEnv &
  NeonDatabaseEnvironment &
  BackendEnvironment &
  StorageEnvironment &
  OpenAIEvaluationEnv & {
    CREDIT_ENCRYPTION_KEY?: string;
  };

let database: ReturnType<typeof createNeonDatabase> | undefined;
const baseDb = () => (database ??= createNeonDatabase(env));
let storedDatabase: Database | undefined;
let objectStore: ReturnType<typeof createS3ObjectStore> | undefined;
const objects = () =>
  (objectStore ??= createS3ObjectStore(createNeonStorageClient(env)));
const db = () =>
  (storedDatabase ??= createMediaDatabase(baseDb(), {
    objectStore: objects(),
    mediaBucket: env.NEON_MEDIA_BUCKET,
  }));
function requestHandler(tasks: Promise<unknown>[]) {
  return createPortalBackend(env, {
    async runtime(request) {
      const selected = await selectedAIModel(baseDb(), env.OPENAI_MODEL);
      return {
        db: db(),
        identity: await authenticateRequest(request, env, baseDb()),
        key: env.CREDIT_ENCRYPTION_KEY,
        background: (task) => {
          tasks.push(task);
        },
        ...(env.PORTAL_OPENAI_EVALUATION_APPROVED === "true"
          ? {
              evaluator: createOpenAIEvaluator(
                { ...env, OPENAI_MODEL: selected.model || undefined },
                {
                  recordUsage: (usage) =>
                    recordProviderUsage(
                      baseDb(),
                      usage,
                      new Date().toISOString(),
                    ),
                  resolveApprovedSnapshot: (versionId) =>
                    readApprovedSnapshot(baseDb(), versionId),
                },
              ),
            }
          : {
              evaluator: {
                ...disabledEvaluator,
                model: selected.model || undefined,
              },
            }),
      };
    },
    evaluation: handleEvaluationSnapshots,
    auth(request) {
      return createAuthHandler(env, baseDb())(request);
    },
    async storage(request, runtime) {
      const response = await createStorageApiHandler({
        appOrigin: env.APP_ORIGIN!,
        authenticate: async () => runtime.identity,
        storageFor: () =>
          createProjectMediaStorage({
            objectStore: objects(),
            repository: createDatabaseMediaRepository(baseDb()),
            authorize: createPortalMediaAuthorizer(
              new PortalService(runtime.db, runtime.identity, runtime.key),
            ),
            mediaBucket: env.NEON_MEDIA_BUCKET,
          }),
      })(request);
      return response ?? new Response(null, { status: 404 });
    },
  });
}

// Neon Functions accepts a standard fetch handler. No startup migration,
// scheduler, production fixture or credential discovery runs on import.
export default {
  async fetch(request: Request) {
    // Processing starts only from an authenticated explicit request. Await its
    // bounded work within this invocation; leases/results live in Postgres.
    // No process loop, fire-and-forget promise or automatic schedule is used.
    const tasks: Promise<unknown>[] = [];
    const response = await requestHandler(tasks)(request);
    await Promise.allSettled(tasks);
    return response;
  },
};
