import assert from "node:assert/strict";
import { test } from "node:test";
import { smtpConfig, smtpFrom } from "../neon/auth/smtp";

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
