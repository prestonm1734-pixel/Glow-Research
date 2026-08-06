// Shared presentation for the transactional emails (wholesale
// acknowledgement, password reset). Files prefixed with _ are not routed by
// Vercel, so this is internal only.
//
// Everything is inline-styled against a light surface. Email clients strip
// <style> blocks and will not load the site's webfonts, and Gmail's dark mode
// inverts backgrounds — a near-black design in the site's own palette comes
// out muddy there, so these lean on the light half of the brand instead.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const COMPANY = 'Glow Research';
export const ADDRESS = '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States';

export const money = n => '$' + Number(n || 0).toFixed(2);

/* Single send path for every transactional email. Never throws and never
   reports upward: each caller runs after the thing the email is *about* has
   already happened (order created, password changed), so a mail failure must
   not turn a completed action into a reported one. Returns whether it went. */
export async function sendEmail({ to, replyTo, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(`sendEmail: RESEND_API_KEY is not set — "${subject}" not sent.`);
    return false;
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Glow Research <onboarding@resend.dev>',
        to,
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject, text, html,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => null);
      console.error(`sendEmail: Resend rejected "${subject}".`, resp.status, errBody);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`sendEmail: "${subject}" failed.`, e);
    return false;
  }
}

export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* The wrapper every email shares: wordmark, one or more white cards, and the
   legal footer. `sections` are raw HTML strings — each becomes its own card
   band, divided by a hairline. `preheader` is the grey line inboxes show next
   to the subject; without one they scrape the first visible text, which is
   rarely the sentence you would have chosen. `footerNote` says why this
   person is receiving it. */
export function emailShell({ preheader = '', sections = [], footerNote = '' }) {
  const bands = sections.map((html, i) => `
    <div style="background:#ffffff;padding:${i === 0 ? '34px' : '24px'} 32px;${i > 0 ? 'border-top:1px solid #e4e4e7;' : ''}">
      ${html}
    </div>`).join('');

  return `
<div style="margin:0;padding:0;background:#f5f5f7;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${preheader}</div>` : ''}
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;font-family:${FONT};">

    <div style="font-size:21px;font-weight:700;letter-spacing:-.02em;color:#0a0a0a;padding-bottom:26px;">Glow&#10022;</div>
    ${bands}

    <div style="padding:22px 4px 0;font-size:12px;line-height:1.6;color:#86868b;">
      <strong style="color:#55554f;">${COMPANY}</strong><br>
      ${ADDRESS}
      ${footerNote ? `<br><span style="color:#a1a1a6;">${footerNote}</span>` : ''}
    </div>

  </div>
</div>`;
}

export function heading(text) {
  return `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.15;letter-spacing:-.03em;font-weight:600;color:#0a0a0a;">${text}</h1>`;
}

export function paragraph(html, { last = false } = {}) {
  return `<p style="margin:0 0 ${last ? '0' : '18px'};font-size:15px;line-height:1.62;color:#45453f;">${html}</p>`;
}

export function eyebrow(text) {
  return `<div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#86868b;padding-bottom:10px;">${text}</div>`;
}

export function fine(html) {
  return `<p style="margin:0 0 9px;font-size:13px;line-height:1.55;color:#55554f;">${html}</p>`;
}

/* Square and black, same as the primary button on the sign-in page this links
   to. Built as a table rather than a padded inline-block because Outlook
   renders through Word, which drops padding on anchors. */
export function button(href, label) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;">
      <tr><td style="background:#0a0a0a;">
        <a href="${esc(href)}" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;">${label}</a>
      </td></tr>
    </table>`;
}
