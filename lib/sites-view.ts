import { getSitesRuntime, reuseSitesView } from "./sites-runtime";
import { PortalService } from "./service";

// One request, one authorized projection. The Worker guard and page renderer
// share the promise; nothing survives the request or crosses identities.
export function readSitesView(path: string) {
  return reuseSitesView(path, async () => {
    const runtime = getSitesRuntime();
    return new PortalService(runtime.db, runtime.identity, runtime.key).view(
      path,
    );
  });
}
