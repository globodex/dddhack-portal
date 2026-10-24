import { portalErrorText } from "./ui-feedback";

export type PortalLoadFailure = { code: string; message: string };
/** Only an authorized projection identifies a Viewer. Failures never infer registration. */
export function portalLoadFailure(status: number, body: { code?: string; message?: string }): PortalLoadFailure {
  const code = body.code || (status === 401 ? "SIGN_IN_REQUIRED" : "LOAD_FAILED");
  const message = portalErrorText({ ...body, code });
  return {
    code,
    message: message === code || /^[A-Z][A-Z0-9_]+$/.test(message)
      ? "This page could not load. Please try again."
      : message,
  };
}
