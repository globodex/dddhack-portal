import { redirect } from "next/navigation";
import {
  pageMetadata,
  publicPath,
  eventStructuredData,
  safeJSONLD,
} from "../../lib/seo";
import {
  BackendError,
  localDevelopmentRender,
  protectedPath,
  readBackendView,
} from "../../lib/next-backend";
import { chatGPTSignInPath } from "../chatgpt-auth";
import Portal from "../portal";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ path?: string[] }> };

export default async function Page({ params }: PageProps) {
  const { path = [] } = await params;
  const routePath = "/" + path.join("/");
  const localTest = await localDevelopmentRender();
  let initialView: Record<string, any> | undefined;
  let initialPublic: Record<string, any> | undefined;
  if (protectedPath(routePath)) {
    try {
      // One authorized projection feeds the entire protected document.
      initialView = await readBackendView(routePath);
    } catch (error) {
      if (error instanceof BackendError && error.status === 401 && !localTest)
        redirect(chatGPTSignInPath(routePath));
      // Preserve the route-specific retry and account mismatch UI. The backend
      // continues to enforce all roles, assignments and ownership gates.
      if (!(error instanceof BackendError)) throw error;
    }
  } else if (publicPath(routePath)) {
    try {
      initialPublic = await readBackendView(routePath);
    } catch (error) {
      if (!(error instanceof BackendError)) throw error;
      // Static art still renders during downtime, with no invented records,
      // session, deadline or successful mutation fixture.
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

export async function generateMetadata({ params }: PageProps) {
  const { path = [] } = await params;
  const route = "/" + path.join("/");
  if (/^\/projects\/[^/]+$/.test(route)) {
    try {
      const view = await readBackendView(route);
      return pageMetadata(route, view.project || view.items?.[0]);
    } catch {
      const { openGraph, twitter, ...metadata } = pageMetadata(route);
      return { ...metadata, robots: { index: false, follow: false } };
    }
  }
  return pageMetadata(route);
}
