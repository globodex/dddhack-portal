import {
  getSitesRuntime,
  unavailableResponse,
} from "../../../../lib/sites-runtime";
import { profilePhotoResponse } from "../../../../lib/profile-photo";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const runtime = getSitesRuntime();
    return await profilePhotoResponse(runtime.db, id, runtime.identity?.id);
  } catch (e) {
    return unavailableResponse(e);
  }
}
