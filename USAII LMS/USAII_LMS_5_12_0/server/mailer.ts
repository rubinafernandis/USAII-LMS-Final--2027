/**
 * Outgoing email: password-reset codes and links, payment receipts, decisions on work, certificates.
 * The sender is set ONLY with these server settings (environment variables), for any SMTP mailbox,
 * for example a Hostinger or Google Workspace address:
 *   SMTP_HOST=smtp.hostinger.com  SMTP_PORT=465  SMTP_USER=no-reply@yourdomain.com  SMTP_PASS=...
 *   MAIL_FROM="USAII <no-reply@yourdomain.com>"
 * Port 465 uses SSL; 587 uses STARTTLS. Admins can check the settings with "Send test email" in
 * Payments & Email. Without SMTP settings no email is sent (password reset tells people to try later).
 */
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { DATA_DIR } from './db';

/** MAIL_OUTBOX=1 (local testing): emails are written to data/outbox.jsonl instead of being sent. */
const outbox = () => process.env.MAIL_OUTBOX === '1';
export const emailEnabled = () => outbox() || !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: nodemailer.Transporter | null = null;
function mailer() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 15_000,
    });
  }
  return transport;
}

/** What admins see about the email settings (never the password). */
export function mailStatus() {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || '';
  return {
    enabled: emailEnabled(),
    outbox: outbox(),
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    from,
    missing: outbox() ? [] : ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k]),
  };
}

/** Send one email and report the real error (for the admins' "Send test email" button). */
export async function sendTestMail(to: string): Promise<void> {
  if (!emailEnabled()) throw new Error('Email is not set up. Add SMTP_HOST, SMTP_USER and SMTP_PASS on the server, then restart it.');
  const subject = 'USAII LMS test email';
  const text = 'This is a test from the USAII LMS. Password reset codes, receipts and other messages will be sent from this address.';
  if (outbox()) {
    fs.appendFileSync(path.join(DATA_DIR, 'outbox.jsonl'), JSON.stringify({ to, subject, text, at: new Date().toISOString() }) + '\n');
    return;
  }
  await mailer().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html: `<p>${text}</p>` });
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!emailEnabled()) return false;
  if (outbox()) {
    fs.appendFileSync(path.join(DATA_DIR, 'outbox.jsonl'), JSON.stringify({ to, subject, text, at: new Date().toISOString() }) + '\n');
    return true;
  }
  try {
    await mailer().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    return true;
  } catch (e) {
    console.warn('[mail] could not send:', (e as Error).message);
    return false;
  }
}
