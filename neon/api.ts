import { createNeonDatabase, type NeonDatabaseEnvironment } from "./db/index";
import { authenticateRequest, createAuthHandler, type AuthEnv } from "./auth/index";
import { createPortalBackend, type BackendEnvironment } from "./router";

const env = process.env as AuthEnv & NeonDatabaseEnvironment & BackendEnvironment & {
  CREDIT_ENCRYPTION_KEY?: string;
};

let database: ReturnType<typeof createNeonDatabase> | undefined;
const db = () => (database ??= createNeonDatabase(env));
const handler = createPortalBackend(env, {
  async runtime(request) {
    return {
      db: db(),
      identity: await authenticateRequest(request, env, db()),
      key: env.CREDIT_ENCRYPTION_KEY,
    };
  },
  auth(request) {
    return createAuthHandler(env, db())(request);
  },
});

// Neon Functions accepts a standard fetch handler. No startup migration,
// scheduler, production fixture or credential discovery runs on import.
export default { fetch: handler };
