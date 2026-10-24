import { createNeonDatabase, type NeonDatabaseEnvironment } from "./db/index";
import { authenticateRequest, createAuthHandler, type AuthEnv } from "./auth/index";
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

const env = process.env as AuthEnv & NeonDatabaseEnvironment & BackendEnvironment & StorageEnvironment & {
  CREDIT_ENCRYPTION_KEY?: string;
};

let database: ReturnType<typeof createNeonDatabase> | undefined;
const baseDb = () => (database ??= createNeonDatabase(env));
let storedDatabase: Database | undefined;
let objectStore: ReturnType<typeof createS3ObjectStore> | undefined;
const objects = () => (objectStore ??= createS3ObjectStore(createNeonStorageClient(env)));
const db = () => (storedDatabase ??= createMediaDatabase(baseDb(), {
  objectStore: objects(), mediaBucket: env.NEON_MEDIA_BUCKET,
}));
const handler = createPortalBackend(env, {
  async runtime(request) {
    return {
      db: db(),
      identity: await authenticateRequest(request, env, baseDb()),
      key: env.CREDIT_ENCRYPTION_KEY,
    };
  },
  auth(request) {
    return createAuthHandler(env, baseDb())(request);
  },
  async storage(request, runtime) {
    const response = await createStorageApiHandler({
      appOrigin: env.APP_ORIGIN!,
      authenticate: async () => runtime.identity,
      storageFor: () => createProjectMediaStorage({
        objectStore: objects(),
        repository: createDatabaseMediaRepository(baseDb()),
        authorize: createPortalMediaAuthorizer(new PortalService(runtime.db, runtime.identity, runtime.key)),
        mediaBucket: env.NEON_MEDIA_BUCKET,
      }),
    })(request);
    return response ?? new Response(null, { status: 404 });
  },
});

// Neon Functions accepts a standard fetch handler. No startup migration,
// scheduler, production fixture or credential discovery runs on import.
export default { fetch: handler };
