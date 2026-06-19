import { Resend } from "resend";
import crypto from "crypto";

export const resend = new Resend(process.env.RESEND_API_KEY!);

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://orthren.com";
function getSecret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s) throw new Error("UNSUBSCRIBE_SECRET env var is not set");
  return s;
}

export function createUnsubscribeToken(email: string): string {
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(email);
  const sig = hmac.digest("hex");
  return Buffer.from(JSON.stringify({ email, sig })).toString("base64url");
}

export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const { email, sig } = JSON.parse(Buffer.from(token, "base64url").toString("utf-8")) as {
      email: string;
      sig: string;
    };
    const hmac = crypto.createHmac("sha256", getSecret());
    hmac.update(email);
    const expected = hmac.digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
    return email;
  } catch {
    return null;
  }
}

function unsubscribeUrl(email: string): string {
  return `${appUrl}/api/unsubscribe?token=${createUnsubscribeToken(email)}`;
}

const baseHtml = (body: string, email: string) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:'DM Sans',ui-sans-serif,system-ui,Arial,sans-serif;background:#F8F9FB;margin:0;padding:0;color:#172033}
  .wrap{max-width:560px;margin:40px auto;background:#ffffff;border:1px solid #d7dee8;border-radius:8px;padding:36px 40px}
  h1{font-size:18px;font-weight:700;color:#1E3A5F;margin:0 0 16px}
  p{font-size:15px;line-height:1.65;margin:0 0 14px;color:#374151}
  ul{padding-left:20px;margin:0 0 14px}
  li{font-size:15px;line-height:1.65;color:#374151;margin-bottom:6px}
  .badge{display:inline-block;background:#1E3A5F;color:#fff;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:20px;padding:3px 10px;margin-bottom:20px}
  .divider{border:none;border-top:1px solid #d7dee8;margin:24px 0}
  .footer{font-size:12px;color:#94a3b8;margin-top:24px}
  a{color:#1d4f7a}
  img{max-width:100%;border-radius:6px;margin:16px 0}
</style>
</head>
<body>
<div class="wrap">
  <div class="badge">Orthren</div>
  ${body}
  <hr class="divider">
  <p class="footer">You received this because you joined the Orthren waitlist.<br>
  <a href="${unsubscribeUrl(email)}">Unsubscribe</a></p>
</div>
</body></html>`;

export async function sendConfirmationEmail(email: string, position: number) {
  const html = baseHtml(`
    <h1>You're on the Orthren waitlist.</h1>
    <p>Thanks for signing up. You're <strong>#${position}</strong> on the list.</p>
    <p>Orthren reads a patient chart and generates a complete prior authorization packet — letter of medical necessity, PA score, and submission checklist — in under 60 seconds. No templates. No copy-paste.</p>
    <p>We'll let you know the moment we launch. In the meantime, <a href="https://orthren.com">see how it works →</a></p>
    <p style="color:#94a3b8;font-size:13px">— The Orthren Team</p>
  `, email);

  return resend.emails.send({
    // TODO: update sending domain to hello@orthren.com once DNS/Resend domain verification is complete
    from: "Kamari at Orthren <hello@orthren.com>",
    to: email,
    subject: `You're #${position} on the Orthren waitlist`,
    html
  });
}

export async function sendUpdateEmail(
  email: string,
  opts: { subject: string; headline: string; bullets: string[]; screenshot_url?: string }
) {
  const bulletItems = opts.bullets.map((b) => `<li>${b}</li>`).join("");
  const screenshotBlock = opts.screenshot_url
    ? `<img src="${opts.screenshot_url}" alt="Product screenshot">`
    : "";

  const html = baseHtml(`
    <h1>${opts.headline}</h1>
    <ul>${bulletItems}</ul>
    ${screenshotBlock}
    <p>Know someone at an orthopedic practice? <a href="https://orthren.com/waitlist">Send them this link</a> to join the waitlist.</p>
  `, email);

  return resend.emails.send({
    // TODO: update sending domain to hello@orthren.com once DNS/Resend domain verification is complete
    from: "Kamari at Orthren <hello@orthren.com>",
    to: email,
    subject: opts.subject,
    html
  });
}

export async function sendLaunchEmail(email: string, launchUrl: string) {
  const html = baseHtml(`
    <h1>Orthren is live.</h1>
    <p>Your early access is ready. Click below to get started — no setup required.</p>
    <p><a href="${launchUrl}" style="display:inline-block;background:#1E3A5F;color:#fff;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;text-decoration:none">Open Orthren →</a></p>
    <p style="color:#94a3b8;font-size:13px">Upload a chart, enter the CPT code and payer name, and your PA packet is ready in about 30 seconds.</p>
  `, email);

  return resend.emails.send({
    // TODO: update sending domain to hello@orthren.com once DNS/Resend domain verification is complete
    from: "Kamari at Orthren <hello@orthren.com>",
    to: email,
    subject: "Your early access to Orthren is ready",
    html
  });
}