import { PortalError } from "../../lib/security";
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
import { readSitesView } from "../../lib/sites-view";
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
  let initialView: Record<string, any> | undefined;
  if (!localTest && protectedPath(routePath)) {
    await requireChatGPTUser(routePath);
    // The service owns per-route roles, assignments, profile gating and projections.
    try {
      initialView = await readSitesView(routePath);
    } catch (error) {
      if (!(
        error instanceof PortalError && error.code === "LUMA_EMAIL_MISMATCH"
      ))
        throw error;
    }
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
        initialView={initialView}
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
      const { openGraph, twitter, ...metadata } = pageMetadata(route);
      return { ...metadata, robots: { index: false, follow: false } };
    }
  return pageMetadata(route);
}
