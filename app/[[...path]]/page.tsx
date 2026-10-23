import { requireChatGPTUser } from "../chatgpt-auth";
import { getSitesRuntime, protectedPath } from "../../lib/sites-runtime";
import { PortalService } from "../../lib/service";
import Portal from "../portal";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  const routePath = "/" + path.join("/");
  const localTest =
    import.meta.env.DEV && process.env.PORTAL_LOCAL_TEST === "1";
  if (!localTest && protectedPath(routePath)) {
    const runtime = getSitesRuntime();
    await requireChatGPTUser(routePath);
    const service = new PortalService(
      runtime.db,
      runtime.identity,
      runtime.key,
    );
    // The service owns per-route roles, assignments, profile gating and projections.
    await service.view(routePath);
  }
  let initialPublic: Record<string, any> | undefined;
  if (!localTest && routePath === "/") {
    try {
      const runtime = getSitesRuntime();
      initialPublic = await new PortalService(runtime.db, null, undefined).view(
        "/",
      );
    } catch {
      initialPublic = { submissionClose: null };
    }
  }
  return (
    <Portal
      path={routePath}
      localTest={localTest}
      initialPublic={initialPublic}
    />
  );
}
