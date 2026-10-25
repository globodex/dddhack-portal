import type { SQL } from "./db";
import type { Identity } from "./identity";

export const SIGN_IN_EVIDENCE_PREFIX = "auth-sign-in:";
export const SIGN_IN_EVIDENCE_ACTION = "auth-sign-in-evidence";
export type SignInEvidenceKind =
  "session-issued" | "authenticated-request" | "retained-session";

// Observation time is deliberately not an inferred first-login timestamp.
// Only server-owned call sites select an evidence kind or a session hash.
function sessionEvidenceStatement(
  observedAt: string,
  evidence: "session-issued" | "retained-session",
  sessionHash?: string,
): SQL {
  return [
    `INSERT INTO audit_logs(id,actor_id,action,entity_id,detail,reason,created_at)
      SELECT DISTINCT ?||p.id,p.id,?,p.id,?,?,? FROM auth_sessions s
      JOIN auth_users a ON a.id=s.auth_user_id JOIN users p ON p.id=a.id
      WHERE a.email_verified_at IS NOT NULL AND a.email_verified_at<>'' AND lower(p.email)=a.email
      ${sessionHash === undefined ? "" : "AND s.token_hash=?"}
      ON CONFLICT(id) DO NOTHING`,
    SIGN_IN_EVIDENCE_PREFIX,
    SIGN_IN_EVIDENCE_ACTION,
    JSON.stringify({ version: 1, evidence }),
    "Authentication evidence observed",
    observedAt,
    ...(sessionHash === undefined ? [] : [sessionHash]),
  ];
}

export function issuedSessionEvidenceStatement(
  observedAt: string,
  sessionHash: string,
): SQL {
  return sessionEvidenceStatement(observedAt, "session-issued", sessionHash);
}

/** Capture retained sessions, including expired ones, before destructive cleanup.
 * A verified auth-user row alone is never sufficient evidence.
 */
export function retainedSessionEvidenceStatement(
  observedAt: string,
  sessionHash?: string,
): SQL {
  return sessionEvidenceStatement(observedAt, "retained-session", sessionHash);
}

export function authenticatedRequestEvidenceStatement(
  identity: Identity,
  observedAt: string,
): SQL | null {
  if (
    identity.emailVerified !== true ||
    (identity.source !== "sites" && identity.source !== "neon")
  )
    return null;
  return [
    `INSERT INTO audit_logs(id,actor_id,action,entity_id,detail,reason,created_at)
      SELECT ?||u.id,u.id,?,u.id,?,?,? FROM users u
      WHERE u.id=? AND lower(u.email)=?
      AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='participant' AND r.target_id=u.id AND r.active=1)
      AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions t WHERE t.kind='participant' AND t.target_id=u.id)
      ON CONFLICT(id) DO NOTHING`,
    SIGN_IN_EVIDENCE_PREFIX,
    SIGN_IN_EVIDENCE_ACTION,
    JSON.stringify({ version: 1, evidence: "authenticated-request" }),
    "Authentication evidence observed",
    observedAt,
    identity.id,
    identity.email.trim().toLowerCase(),
  ];
}
