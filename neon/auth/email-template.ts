export interface SignInEmail {
  url: string;
  expiresMinutes: number;
}

function escapeHTML(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

/** Presentation only. Opening the URL still reaches the browser-bound GET confirmation. */
export function signInEmailContent({ url, expiresMinutes }: SignInEmail) {
  const link = new URL(url);
  if (
    !["https:", "http:"].includes(link.protocol) ||
    link.username ||
    link.password
  )
    throw new Error("INVALID_SIGN_IN_URL");
  const href = escapeHTML(url);
  const expiry = escapeHTML(String(expiresMinutes));
  const subject = "Sign in to DevDay Exchange New Delhi";
  const text = `Confirm your sign-in to DevDay Exchange New Delhi:\n\n${url}\n\nThis link expires in ${expiresMinutes} minutes and works only in the browser where you requested it. If you did not request it, ignore this email.`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f4ee;color:#171b18;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">Your sign-in link expires in ${expiry} minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f6f4ee;">
    <tr><td align="center" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
        <tr><td style="padding:0 0 24px;color:#171b18;font-size:18px;line-height:24px;font-weight:700;letter-spacing:-0.4px;">DevDay Exchange<span style="color:#008a36;">.</span></td></tr>
        <tr><td style="padding:32px;background-color:#ffffff;border:1px solid #e3e5df;border-radius:16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr><td style="padding:0 0 16px;"><h1 style="margin:0;color:#171b18;font-size:30px;line-height:36px;letter-spacing:-1px;font-weight:700;">Sign in</h1></td></tr>
            <tr><td style="padding:0 0 24px;color:#535b55;font-size:16px;line-height:25px;">Continue in the same browser where you requested this link.</td></tr>
            <tr><td style="padding:0 0 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#171b18" style="background-color:#171b18;border-radius:8px;mso-padding-alt:15px 28px;"><a href="${href}" style="display:inline-block;padding:15px 28px;border:1px solid #171b18;border-radius:8px;color:#ffffff;font-size:16px;line-height:20px;font-weight:700;text-decoration:none;text-align:center;">Sign in</a></td></tr></table>
            </td></tr>
            <tr><td style="padding:0 0 28px;color:#657068;font-size:13px;line-height:20px;">Expires in ${expiry} minutes</td></tr>
            <tr><td style="padding:24px 0 10px;border-top:1px solid #e9ebe5;color:#535b55;font-size:13px;line-height:20px;">If the button does not open, copy this link:</td></tr>
            <tr><td style="color:#006a38;font-size:13px;line-height:20px;word-break:break-all;overflow-wrap:anywhere;"><a href="${href}" style="color:#006a38;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${href}</a></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 4px 0;color:#69716b;font-size:12px;line-height:20px;">If you did not request this email, you can ignore it.</td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}
