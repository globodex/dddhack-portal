import { requireChatGPTUser } from "../chatgpt-auth";
import { getSitesRuntime, protectedPath } from "../../lib/sites-runtime";
import { PortalService } from "../../lib/service";
import { demand } from "../../lib/security";
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
    if (/^\/admin(\/|$)/.test(routePath)) {
      await service.staff(
        routePath === "/admin/settings" || routePath === "/admin/permissions",
      );
    } else if (/^\/judge(\/|$)/.test(routePath)) {
      const actor = await service.actor();
      demand(actor.role === "judge", 403, "JUDGE_REQUIRED");
      // The service also checks the particular assignment on individual pages.
      await service.view(routePath);
    } else {
      await service.view(routePath);
    }
  }
  return <Portal path={routePath} localTest={localTest} />;
}
