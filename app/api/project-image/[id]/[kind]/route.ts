import {
  getSitesRuntime,
  unavailableResponse,
} from "../../../../../lib/sites-runtime";
import { publicProjectImage } from "../../../../../lib/public-project-image";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  try {
    const { id, kind } = await params;
    let db;
    if (import.meta.env.DEV && process.env.PORTAL_LOCAL_TEST === "1") {
      const { localRuntime } =
        await import("../../../../../lib/local-test/runtime");
      db = (await localRuntime(request)).db;
    } else db = getSitesRuntime().db;
    return await publicProjectImage(
      db,
      id,
      kind,
      new URL(request.url).searchParams.get("version"),
    );
  } catch (error) {
    return unavailableResponse(error);
  }
}
