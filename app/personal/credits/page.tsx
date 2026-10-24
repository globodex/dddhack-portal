import { redirect } from "next/navigation";
import Portal from "../../[[...path]]/portal-client";
import {
  BackendError,
  localDevelopmentRender,
  readBackendView,
} from "../../../lib/next-backend";
import { pageMetadata } from "../../../lib/seo";
import { chatGPTSignInPath } from "../../chatgpt-auth";
import { PersonalCreditsAccess } from "../../personal-credits";

export const dynamic = "force-dynamic";
export function generateMetadata() {
  return pageMetadata("/personal/credits");
}

export default async function PersonalCreditsPage() {
  const localTest = await localDevelopmentRender();
  try {
    const initialView = await readBackendView("/personal/credits");
    return (
      <Portal
        path="/personal/credits"
        localTest={localTest}
        initialView={initialView}
      />
    );
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    if (error.status === 401 && !localTest)
      redirect(chatGPTSignInPath("/personal/credits"));
    return (
      <PersonalCreditsAccess
        checkInRequired={
          error.status === 403 && /CHECK.?IN|CHECKED_IN/.test(error.code)
        }
        title={
          error.code === "PARTICIPANT_REMOVED"
            ? "Your participation was removed. Contact an organizer."
            : error.status === 403
              ? "Your credits are not available."
              : undefined
        }
      />
    );
  }
}
