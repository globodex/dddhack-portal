import { createHash } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { demand, emailSchema } from "../../lib/security";
import { equalSecret } from "./config";

export const GOOGLE_AUTHORIZATION_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 60 * 60_000,
  },
);
export interface GoogleClaims extends JWTPayload {
  email?: string;
  email_verified?: boolean;
  name?: string;
  nonce?: string;
  hd?: string;
  azp?: string;
}
export interface GoogleExchange {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}
export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
export async function exchangeGoogleCode(
  input: GoogleExchange,
): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
  });
  demand(response.ok, 401, "GOOGLE_SIGN_IN_FAILED");
  const body: unknown = await response.json();
  demand(
    body &&
      typeof body === "object" &&
      "id_token" in body &&
      typeof body.id_token === "string" &&
      body.id_token.length < 16_384,
    401,
    "GOOGLE_SIGN_IN_FAILED",
  );
  // Access/refresh tokens are deliberately neither persisted nor returned.
  return body.id_token;
}

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  nonce: string,
  now = Date.now(),
  keys: JWTVerifyGetKey = googleKeys,
): Promise<GoogleClaims> {
  const result = await jwtVerify<GoogleClaims>(token, keys, {
    algorithms: ["RS256"],
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    requiredClaims: [
      "iss",
      "aud",
      "sub",
      "exp",
      "iat",
      "nonce",
      "email",
      "email_verified",
    ],
    currentDate: new Date(now),
    maxTokenAge: "10m",
    clockTolerance: 5,
  }).catch(() => {
    demand(false, 401, "GOOGLE_ID_TOKEN_INVALID");
  });
  const { payload } = result;
  demand(
    typeof payload.nonce === "string" &&
      equalSecret(payload.nonce, nonce) &&
      typeof payload.sub === "string" &&
      payload.sub.length > 0 &&
      payload.sub.length <= 255 &&
      payload.email_verified === true &&
      emailSchema.safeParse(payload.email).success &&
      (!Array.isArray(payload.aud) ||
        payload.aud.length === 1 ||
        payload.azp === clientId) &&
      (payload.azp === undefined || payload.azp === clientId),
    401,
    "GOOGLE_ID_TOKEN_INVALID",
  );
  return payload;
}
export function authoritativeGoogleEmail(claims: GoogleClaims) {
  const email = emailSchema.parse(claims.email);
  // Google's email_verified alone is insufficient for external email accounts.
  // https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
  demand(
    claims.email_verified === true &&
      (email.endsWith("@gmail.com") ||
        (typeof claims.hd === "string" &&
          /^[a-z0-9.-]+$/i.test(claims.hd) &&
          claims.hd.length <= 253)),
    403,
    "GOOGLE_EMAIL_PROOF_REQUIRED",
  );
  return email;
}
