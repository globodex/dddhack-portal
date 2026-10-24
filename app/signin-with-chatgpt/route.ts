import { redirect } from "next/navigation";
import { chatGPTSignInPath } from "../chatgpt-auth";

// Preserve existing bookmarks while all authentication uses the new origin.
export function GET(request: Request) {
  redirect(
    chatGPTSignInPath(
      new URL(request.url).searchParams.get("return_to") || "/dashboard",
    ),
  );
}
