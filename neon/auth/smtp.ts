import { demand, emailSchema } from "../../lib/security";
import type { AuthEnv } from "./config";

export interface MagicMessage {
  to: string;
  url: string;
  expiresMinutes: number;
}
export function smtpConfig(env: AuthEnv) {
  const port = Number(env.SMTP_PORT);
  demand(
    env.SMTP_HOST &&
      /^[A-Za-z0-9.-]+$/.test(env.SMTP_HOST) &&
      ((port === 465 && env.SMTP_SECURE === "true") ||
        (port === 587 && env.SMTP_SECURE === "false")) &&
      env.SMTP_USER &&
      env.SMTP_PASSWORD &&
      emailSchema.safeParse(env.SMTP_FROM).success,
    503,
    "SMTP_NOT_CONFIGURED",
  );
  return {
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 8_000,
    logger: false,
    debug: false,
  };
}
export async function sendMagicEmail(env: AuthEnv, message: MagicMessage) {
  const options = smtpConfig(env);
  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport(options);
  try {
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: "Sign in to DevDay Exchange New Delhi",
      text: `Confirm your sign-in to DevDay Exchange New Delhi:\n\n${message.url}\n\nThis link expires in ${message.expiresMinutes} minutes and works only in the browser where you requested it. If you did not request it, ignore this email.`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } finally {
    transport.close();
  }
}
