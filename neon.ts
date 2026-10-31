import { defineConfig } from "@neon/config/v1";

const backendNames = [
  "APP_ORIGIN", "AUTH_BASE_URL", "BETTER_AUTH_SECRET", "AUTH_SECRET", "PORTAL_PROXY_SECRET",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SMTP_HOST", "SMTP_PORT",
  "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_PASSWORD", "SMTP_FROM",
  "CREDIT_ENCRYPTION_KEY", "NEON_MEDIA_BUCKET", "JOB_RUNNER_SECRET",
  "OPENAI_API_KEY", "OPENAI_MODEL", "PORTAL_OPENAI_EVALUATION_APPROVED",
  "PORTAL_EVALUATION_TRIGGER_ID", "PORTAL_GITHUB_PUBLIC_READ_TOKEN",
] as const;
const configured = Object.fromEntries(backendNames.flatMap(name =>
  process.env[name] ? [[name, process.env[name]!]] : []));

// Declarative only: this file does not create or deploy any service itself.
// Neon injects DATABASE_URL / DATABASE_URL_UNPOOLED and enabled AWS_* storage
// credentials at runtime. Never redeclare or copy them from the Sites runtime.
export default defineConfig({
  buckets: { "project-media": { access: "private" } },
  functions: {
    portalapi: {
      name: "DDD Hack portal API",
      source: "./neon/api.ts",
      externalPackages: ["sharp"],
      env: configured,
    },
  },
});
