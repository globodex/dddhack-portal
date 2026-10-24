import { createNeonDatabase } from "./db/index";
import { authenticateRequest, createAuthHandler } from "./auth/index";
import { createPortalBackend } from "./router";

let database: ReturnType<typeof createNeonDatabase> | undefined;
const db = () => (database ??= createNeonDatabase(process.env));
const handler = createPortalBackend(process.env, {
  async runtime(request) {
    return {
      db: db(),
      identity: await authenticateRequest(request, process.env, db()),
      key: process.env.CREDIT_ENCRYPTION_KEY,
    };
  },
  auth(request) {
    return createAuthHandler(process.env, db())(request);
  },
});

// Neon Functions accepts a standard fetch handler. No startup migration,
// scheduler, production fixture or credential discovery runs on import.
export default { fetch: handler };
