import { demand, emailSchema } from "../../lib/security";
import type { AuthEnv } from "./config";
import { signInEmailContent } from "./email-template";

export const DEFAULT_SMTP_NAME = "DevDay Exchange · Parampreet Singh";

export interface MagicMessage {
  to: string;
  url: string;
  expiresMinutes: number;
}
export function smtpFrom(env: AuthEnv) {
  const configured = env.SMTP_FROM || "";
  demand(!/[\x00-\x1f\x7f]/.test(configured), 503, "SMTP_NOT_CONFIGURED");
  const value = configured.trim();
  demand(value.length <= 360, 503, "SMTP_NOT_CONFIGURED");
  const named = /^([^<>]{1,100})\s*<([^<>]+)>$/.exec(value);
  const address = emailSchema.safeParse(named ? named[2] : value);
  demand(address.success, 503, "SMTP_NOT_CONFIGURED");
  return {
    name: named ? named[1].trim() : DEFAULT_SMTP_NAME,
    address: address.data,
  };
}
export function smtpConfig(env: AuthEnv) {
  const port = Number(env.SMTP_PORT);
  const password = env.SMTP_PASS || env.SMTP_PASSWORD;
  smtpFrom(env);
  demand(
    env.SMTP_HOST &&
      /^[A-Za-z0-9.-]+$/.test(env.SMTP_HOST) &&
      ((port === 465 && env.SMTP_SECURE === "true") ||
        (port === 587 && env.SMTP_SECURE === "false")) &&
      env.SMTP_USER &&
      password,
    503,
    "SMTP_NOT_CONFIGURED",
  );
  return {
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    auth: { user: env.SMTP_USER, pass: password },
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 8_000,
    logger: false,
    debug: false,
  };
}
export function magicMailOptions(env: AuthEnv, message: MagicMessage) {
  return {
    from: smtpFrom(env),
    to: message.to,
    ...signInEmailContent(message),
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
export async function sendMagicEmail(env: AuthEnv, message: MagicMessage) {
  const options = smtpConfig(env);
  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport(options);
  try {
    await transport.sendMail(magicMailOptions(env, message));
  } finally {
    transport.close();
  }
}
