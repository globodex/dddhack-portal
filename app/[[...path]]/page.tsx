import {
  pageMetadata,
  publicPath,
  eventStructuredData,
  safeJSONLD,
} from "../../lib/seo";
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
  if (!localTest && publicPath(routePath)) {
    try {
      const runtime = getSitesRuntime();
      initialPublic = await new PortalService(runtime.db, null, undefined).view(
        routePath,
      );
    } catch {
      if (routePath === "/") initialPublic = { submissionClose: null };
    }
  }
  return (
    <>
      {routePath === "/" && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJSONLD(eventStructuredData) }}
        />
      )}
      <Portal
        path={routePath}
        localTest={localTest}
        initialPublic={initialPublic}
      />
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  const route = "/" + path.join("/");
  if (/^\/projects\/[^/]+$/.test(route))
    try {
      const runtime = getSitesRuntime();
      const view = (await new PortalService(runtime.db, null, undefined).view(
        route,
      )) as Record<string, any>;
      return pageMetadata(route, view.project || view.items?.[0]);
    } catch {
      return {
        ...pageMetadata(route),
        robots: { index: false, follow: false },
      };
    }
  return pageMetadata(route);
}
