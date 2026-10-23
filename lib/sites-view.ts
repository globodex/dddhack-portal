import { getSitesRuntime, reuseSitesView } from "./sites-runtime";
import { PortalService } from "./service";
import { prepareAdminPresentation } from "./admin-presentation";

// One request, one authorized projection. The Worker guard and page renderer
// share the promise; nothing survives the request or crosses identities.
export function readSitesView(path: string) {
  return reuseSitesView(path, async () => {
    const runtime = getSitesRuntime();
    const view = await new PortalService(
      runtime.db,
      runtime.identity,
      runtime.key,
    ).view(path);
    return prepareAdminPresentation(view, path, {
      search: "",
      page: 0,
      focus: "",
    });
  });
}
