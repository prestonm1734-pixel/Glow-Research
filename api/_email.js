// Shared presentation for the transactional emails (wholesale
// acknowledgement, password reset). Files prefixed with _ are not routed by
// Vercel, so this is internal only.
//
// Everything is inline-styled against a light surface. Email clients strip
// <style> blocks and will not load the site's webfonts, and Gmail's dark mode
// inverts backgrounds — a near-black design in the site's own palette comes
// out muddy there, so these lean on the light half of the brand instead.

import { fmtPrice } from '../js/products-data.js';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const COMPANY = 'Glow Research';

// fmtPrice() (js/products-data.js) is where "$65, not $65.00" is decided —
// the same rule the site itself follows, so an order confirmation email
// never states a price differently than the page the shopper just saw.
export const money = n => fmtPrice(Number(n || 0));

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
    <div style="background:#ffffff;padding:${i === 0 ? '40px' : '30px'} 36px;${i > 0 ? 'border-top:1px solid #ebebed;' : ''}">
      ${html}
    </div>`).join('');

  return `
<div style="margin:0;padding:0;background:#f5f5f7;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${preheader}</div>` : ''}
  <div style="max-width:560px;margin:0 auto;padding:44px 20px;font-family:${FONT};">

    <!-- The mark used to be the character itself, Glow&#10022; set in this
         file's own FONT stack. assets/glow-logo.svg's own comment already
         explains why that fails: a glyph is a request to whatever font the
         recipient's client falls back to, and Outlook's rendering engine in
         particular does not carry U+2726 in Segoe UI or Arial, so it
         substitutes something else, a box, a different dingbat, sometimes
         nothing. That is "the logo that isn't even it." A raster image drawn
         once and shipped as pixels renders identically everywhere images
         render at all, which a font glyph can never promise. glow-logo-512.png
         is the same mark already used for Organization structured data and
         social cards, so this is the third place drawing it as pixels rather
         than trusting a glyph, not a one-off fix. alt="" rather than "Glow"
         because the text cell beside it already says the word; a screen
         reader or a blocked-image client would otherwise hear "Glow Glow." -->
    <div style="padding-bottom:30px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;padding-right:6px;line-height:0;">
          <img src="https://glowresearch.shop/assets/glow-logo-512.png" width="22" height="22"
               alt="" style="display:block;border-radius:5px;" />
        </td>
        <td style="vertical-align:middle;font-size:21px;font-weight:700;letter-spacing:-.02em;color:#0a0a0a;">Glow</td>
      </tr></table>
    </div>
    ${bands}

    <div style="padding:26px 4px 0;font-size:12px;line-height:1.65;color:#8e8e93;">
      <strong style="color:#55554f;">${COMPANY}</strong>
      ${footerNote ? `<br><span style="color:#a1a1a6;">${footerNote}</span>` : ''}
    </div>

  </div>
</div>`;
}

export function heading(text) {
  return `<h1 style="margin:0 0 16px;font-size:26px;line-height:1.18;letter-spacing:-.022em;font-weight:600;color:#0a0a0a;">${text}</h1>`;
}

export function paragraph(html, { last = false } = {}) {
  return `<p style="margin:0 0 ${last ? '0' : '20px'};font-size:15px;line-height:1.68;color:#45453f;">${html}</p>`;
}

export function eyebrow(text) {
  return `<div style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:#8e8e93;padding-bottom:12px;">${text}</div>`;
}

export function fine(html) {
  return `<p style="margin:0 0 11px;font-size:13.5px;line-height:1.6;color:#55554f;">${html}</p>`;
}

/* Square and black, same as the primary button on the sign-in page this links
   to. Built as a table rather than a padded inline-block because Outlook
   renders through Word, which drops padding on anchors. */
export function button(href, label) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;">
      <tr><td style="background:#0a0a0a;">
        <a href="${esc(href)}" style="display:inline-block;padding:16px 32px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;">${label}</a>
      </td></tr>
    </table>`;
}
