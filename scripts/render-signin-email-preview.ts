import { mkdirSync, writeFileSync } from "node:fs";
import { signInEmailContent } from "../neon/auth/email-template";

// A nonfunctional synthetic token only. This script never creates an SMTP transport.
const preview = signInEmailContent({
  url: "https://dddhack-portal.itsparam.in/api/auth/magic/verify?token=SYNTHETIC_PREVIEW_ONLY",
  expiresMinutes: 15,
});
mkdirSync("previews/signin-email", { recursive: true });
writeFileSync("previews/signin-email/signin.html", preview.html);
writeFileSync("previews/signin-email/signin.txt", preview.text);
