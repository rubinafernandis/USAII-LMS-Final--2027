/**
 * Account emails that are not course notifications.
 *
 * Suspension notice: sent to the email address the learner signs in with, the moment an admin suspends
 * the account. It is polite and points to the USAII Terms of Use (TERMS_URL) and to support. The admin's
 * private note is never included.
 */
import type { UserRecord } from '../shared/types';
import { emailEnabled, sendMail } from './mailer';

export const termsUrl = () => (process.env.TERMS_URL || 'https://www.usaii.org/terms-of-use').trim();
const termsEmail = () => (process.env.TERMS_EMAIL || 'termsofuse@usaii.org').trim();
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function sendSuspensionEmail(user: UserRecord): Promise<boolean> {
  if (!emailEnabled()) return false;
  const support = (process.env.SUPPORT_EMAIL ?? '').trim();
  const terms = termsUrl();
  const tEmail = termsEmail();
  const contact = support || tEmail;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const subject = 'Your USAII\u00AE learning account has been suspended';
  const also = support && support.toLowerCase() !== tEmail.toLowerCase() ? ` Questions about the Terms of Use can also be sent to ${tEmail}.` : '';
  const text =
    `Dear ${user.name},\n\n` +
    `We are writing to let you know that your USAII\u00AE AI Micro Credentials learning account (${user.email}) has been suspended as of ${date}.\n\n` +
    `This step was taken in line with the USAII\u00AE Terms of Use, which apply to everyone who uses USAII\u00AE learning services. You can read them at ${terms}\n\n` +
    `While your account is suspended, you will not be able to sign in. Nothing has been deleted: your course progress, submitted work and any certificates you have earned are kept safely.\n\n` +
    `If you believe this is a mistake, or you would like to understand the reason and resolve it, please contact us at ${contact}.${also} Once the matter is resolved, we will restore your access and let you know by email.\n\n` +
    `Thank you for your understanding.\n\nKind regards,\nUSAII\u00AE Learner Support\nUnited States Artificial Intelligence Institute`;
  const p = (h: string) => `<p style="margin:0 0 14px">${h}</p>`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:620px">` +
    p(`Dear ${esc(user.name)},`) +
    p(`We are writing to let you know that your USAII&reg; AI Micro Credentials learning account (<b>${esc(user.email)}</b>) has been suspended as of ${esc(date)}.`) +
    p(`This step was taken in line with the <a href="${esc(terms)}" style="color:#1F6BFF">USAII&reg; Terms of Use</a>, which apply to everyone who uses USAII&reg; learning services.`) +
    p(`While your account is suspended, you will not be able to sign in. Nothing has been deleted: your course progress, submitted work and any certificates you have earned are kept safely.`) +
    p(`If you believe this is a mistake, or you would like to understand the reason and resolve it, please contact us at <a href="mailto:${esc(contact)}" style="color:#1F6BFF">${esc(contact)}</a>.${esc(also)} Once the matter is resolved, we will restore your access and let you know by email.`) +
    p(`Thank you for your understanding.`) +
    p(`Kind regards,<br>USAII&reg; Learner Support<br>United States Artificial Intelligence Institute`) +
    `</div>`;
  return sendMail(user.email, subject, text, html);
}
