import assert from "node:assert/strict";
import { test } from "node:test";
import { smtpConfig, smtpFrom } from "../neon/auth/smtp";
import { authConfig } from "../neon/auth/config";

test("SMTP_PASS and a bounded named From address match the configured Gmail contract without sending mail", () => {
  const env = {
    SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_SECURE: "true",
    SMTP_USER: "synthetic@portal.test", SMTP_PASS: "synthetic-app-password",
    SMTP_FROM: "DevDay Exchange <synthetic@portal.test>",
  };
  const config = smtpConfig(env);
  assert.deepEqual(config.auth, { user: "synthetic@portal.test", pass: "synthetic-app-password" });
  assert.equal(config.secure, true);
  assert.equal(config.tls.rejectUnauthorized, true);
  assert.deepEqual(smtpFrom(env), { name: "DevDay Exchange", address: "synthetic@portal.test" });
  assert.throws(() => smtpConfig({ ...env, SMTP_PASS: "" }), /SMTP_NOT_CONFIGURED/);
  assert.throws(() => smtpFrom({ ...env, SMTP_FROM: "Synthetic <synthetic@portal.test>\r\nBcc: other@portal.test" }), /SMTP_NOT_CONFIGURED/);
  assert.throws(() => smtpFrom({ ...env, SMTP_FROM: "first@portal.test,second@portal.test" }), /SMTP_NOT_CONFIGURED/);
});

test("the configured BETTER_AUTH_SECRET alias and implicit same-origin auth base avoid duplicate setup secrets", () => {
  const config = authConfig({
    APP_ORIGIN: "https://portal.example.test",
    BETTER_AUTH_SECRET: "synthetic-auth-secret-with-at-least-32-chars",
    PORTAL_PROXY_SECRET: "synthetic-proxy-secret-with-at-least-32-chars",
  });
  assert.equal(config.origin, "https://portal.example.test");
  assert.ok(config.secret.length >= 32);
  assert.throws(() => authConfig({
    APP_ORIGIN: "https://portal.example.test", AUTH_BASE_URL: "https://untrusted.example.test",
    BETTER_AUTH_SECRET: config.secret, PORTAL_PROXY_SECRET: "synthetic-proxy-secret-with-at-least-32-chars",
  }), /AUTH_NOT_CONFIGURED/);
});
