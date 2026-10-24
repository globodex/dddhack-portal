import { redirect } from "next/navigation";
import { readBackendSession, type BackendUser } from "../lib/next-backend";

// Compatibility exports: identity now comes only from a backend-verified cookie.
export type ChatGPTUser = BackendUser;
export const getChatGPTUser = readBackendSession;

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  return (
    "/signin?returnTo=" + encodeURIComponent(safeRelativeReturnPath(returnTo))
  );
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  return (
    "/signout-with-chatgpt?return_to=" +
    encodeURIComponent(safeRelativeReturnPath(returnTo))
  );
}

export function safeRelativeReturnPath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (
      url.origin !== "https://app.local" ||
      /^\/(signin|signin-with-chatgpt|signout-with-chatgpt|callback|api\/auth)(\/|$)/.test(
        url.pathname,
      )
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
