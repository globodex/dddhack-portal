import assert from "node:assert/strict";
import { test } from "node:test";
import { signInEmailContent } from "../neon/auth/email-template";
import {
  DEFAULT_SMTP_NAME,
  magicMailOptions,
  smtpConfig,
  smtpFrom,
} from "../neon/auth/smtp";

const env = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "synthetic@portal.test",
  SMTP_PASS: "synthetic-not-a-real-password",
  SMTP_FROM: "synthetic@portal.test",
};
const message = {
  to: "builder@portal.test",
  url: "https://portal.example.test/api/auth/magic/verify?token=SYNTHETIC_PREVIEW_ONLY&returnTo=%2Fdashboard",
  expiresMinutes: 15,
};

test("a plain SMTP sender gets the requested display name without changing its address or login", () => {
  assert.deepEqual(smtpFrom(env), {
    name: "DevDay Exchange · Parampreet Singh",
    address: "synthetic@portal.test",
  });
  assert.equal(DEFAULT_SMTP_NAME, "DevDay Exchange · Parampreet Singh");
  assert.deepEqual(smtpConfig(env).auth, {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  });
  assert.deepEqual(
    smtpFrom({ ...env, SMTP_FROM: "  synthetic@portal.test  " }),
    smtpFrom(env),
  );
});

test("explicit SMTP display names remain intact, including a middle dot", () => {
  assert.deepEqual(
    smtpFrom({
      ...env,
      SMTP_FROM: "DevDay Exchange · Parampreet Singh <synthetic@portal.test>",
    }),
    smtpFrom(env),
  );
  assert.deepEqual(
    smtpFrom({ ...env, SMTP_FROM: "Existing Sender <synthetic@portal.test>" }),
    {
      name: "Existing Sender",
      address: "synthetic@portal.test",
    },
  );
});

test("SMTP controls are rejected even when trimming could hide them", () => {
  for (const value of [
    "\r\nsynthetic@portal.test",
    "synthetic@portal.test\n",
    "\tsynthetic@portal.test",
    "Name\x00 <synthetic@portal.test>",
    "Name\x7f <synthetic@portal.test>",
    "Name <synthetic@portal.test>\r\nBcc: other@portal.test",
  ])
    assert.throws(
      () => smtpFrom({ ...env, SMTP_FROM: value }),
      /SMTP_NOT_CONFIGURED/,
    );
});

test("HTML and plain text keep the exact confirmation URL, expiry and browser requirement", () => {
  const content = signInEmailContent(message);
  const escaped = message.url.replaceAll("&", "&amp;");
  assert.equal(content.subject, "Sign in to DevDay Exchange New Delhi");
  assert.equal(
    content.text,
    `Confirm your sign-in to DevDay Exchange New Delhi:\n\n${message.url}\n\nThis link expires in 15 minutes and works only in the browser where you requested it. If you did not request it, ignore this email.`,
  );
  assert.equal(
    (
      content.html.match(
        new RegExp(
          `href="${escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
          "g",
        ),
      ) || []
    ).length,
    2,
  );
  assert.ok(
    content.html.includes(`>${escaped}</a>`),
    "visible fallback and button have the same URL",
  );
  assert.match(content.html, />Sign in<\/a>/);
  assert.match(content.html, /Expires in 15 minutes/);
  assert.match(content.html, /same browser where you requested this link/);
  assert.match(
    signInEmailContent({ ...message, expiresMinutes: 7 }).html,
    /Expires in 7 minutes/,
  );
  assert.doesNotMatch(
    content.html,
    /<(?:script|iframe|img|video|form)\b|\son[a-z]+\s*=|@import|url\(/i,
  );
  assert.doesNotMatch(content.html, /<link\b|src\s*=/i);
});

test("the URL is escaped in both link attributes and fallback text", () => {
  const url = `https://portal.example.test/api/auth/magic/verify?token=SYNTHETIC_ONLY&value="<tag>'`;
  const { html, text } = signInEmailContent({ ...message, url });
  const escaped =
    "https://portal.example.test/api/auth/magic/verify?token=SYNTHETIC_ONLY&amp;value=&quot;&lt;tag&gt;&#39;";
  assert.equal(html.split(`href="${escaped}"`).length - 1, 2);
  assert.ok(html.includes(`>${escaped}</a>`));
  assert.doesNotMatch(html, /<tag>|value="<tag>/);
  assert.ok(text.includes(url));
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "https://user:password@portal.example.test/",
  ])
    assert.throws(
      () => signInEmailContent({ ...message, url: bad }),
      /INVALID_SIGN_IN_URL/,
    );
});

test("mail construction retains transport safeguards without creating a transport or sending", () => {
  const mail = magicMailOptions(env, message);
  assert.deepEqual(mail.from, smtpFrom(env));
  assert.equal(mail.to, message.to);
  assert.equal(mail.disableFileAccess, true);
  assert.equal(mail.disableUrlAccess, true);
  const options = smtpConfig(env);
  assert.equal(options.requireTLS, true);
  assert.deepEqual(options.tls, {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  });
  assert.equal(options.logger, false);
  assert.equal(options.debug, false);
  assert.ok(mail.html && mail.text);
});
