import { publicSitemap } from "../../lib/sitemap";
import { readAnonymousBackendView } from "../../lib/next-backend";
export const dynamic = "force-dynamic";
export function GET() {
  return publicSitemap(page => readAnonymousBackendView("/projects", page));
}
