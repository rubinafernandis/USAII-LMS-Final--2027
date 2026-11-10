import { Router } from 'express';
import crypto from 'node:crypto';
import { emailEnabled, sendMail } from '../mailer';
import { nowIso, uid } from '../db';
import {
  clearFailures,
  clearResetRequest,
  hashPassword,
  setPassword,
  verifyUnknownUser,
  initials,
  issueToken,
  loginLocked,
  recordFailure,
  requireAuth,
  toPublic,
  validatePassword,
  verifyPassword,
} from '../auth';
import { db, save } from '../db';
import { paymentPublicConfig } from '../payments';
import { audit, fail, getActiveEnrollment, recordEvent } from '../services';
import { clearMediaCookie, PASSWORD_RULE, setMediaCookie, supportLine, userForToken } from '../auth';
import { me, wrap } from './util';
import { isCountryCode, normalizePhone } from '../../shared/countries';
import type { Course, LearnMode, PublicUser, UserRecord } from '../../shared/types';

export const authRouter = Router();

const normEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const signupAllowed = () => (process.env.ALLOW_SIGNUP ?? 'true').toLowerCase() !== 'false';

/** "Forgot password": the emailed code and link work for 24 hours, once. Five wrong codes end the request. */
const RESET_HOURS = 24;
const RESET_MAX_TRIES = 5;
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const sameHash = (stored: string | undefined, hash: string) => !!stored && stored.length === hash.length && crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(hash));
const codeHash = (u: UserRecord, code: string) => sha256(`${u.id}:${code}`);
const escHtml = (v: string) => v.replace(/[<>&"]/g, '');

/** Small per-key windows for sign-up and reset requests (spam and email-bombing protection). */
const windows = new Map<string, number[]>();
function allow(key: string, max: number, ms: number): boolean {
  const now = Date.now();
  const list = (windows.get(key) ?? []).filter((t) => now - t < ms);
  if (list.length >= max) {
    windows.set(key, list);
    return false;
  }
  list.push(now);
  windows.set(key, list);
  if (windows.size > 20_000) windows.clear();
  return true;
}

/**
 * The signed-in person as the app sees them. pendingCourseId (the paid course chosen at sign up) is
 * kept only while that course is still unpaid, so the app can take them back to finish paying.
 */
function sessionUser(u: UserRecord): PublicUser {
  const pub = toPublic(u);
  const id = u.pendingCourseId;
  if (id) {
    const c = db().courses.find((x) => x.id === id);
    if (!c || c.status !== 'published' || c.access !== 'open' || getActiveEnrollment(u.id, id)) delete pub.pendingCourseId;
  }
  return pub;
}

/** What the sign-in and sign-up pages can offer on this server (no secrets). */
authRouter.get('/options', (_req, res) => {
  // siteUrl: the public AI Micro Credentials website, linked from the sign-in page.
  // payments: whether paid courses can be bought, the currency and the ways to pay.
  res.json({ signup: signupAllowed(), emailReset: emailEnabled(), siteUrl: (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '') || null, payments: paymentPublicConfig() });
});

/** The course chosen on the sign-up form: published, open to everyone, and payable when it has a price. */
function signupCourse(raw: unknown): Course {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id) fail(400, 'Choose the course you want to enroll in.');
  const c = db().courses.find((x) => x.id === id);
  if (!c || c.status !== 'published') fail(400, 'That course is not available. Choose another course.');
  if (c!.access !== 'open') fail(400, 'That course is by invitation only. Choose another course.');
  if (c!.price > 0 && !paymentPublicConfig().ready) fail(409, 'Online payment is not available right now, so new enrollments are paused. Please try again later.');
  return c!;
}

/**
 * Sign up: a learner creates an account for the course they chose, with their contact details.
 * The account is signed in at once. A paid course then goes to the payment gateway and opens only
 * after the gateway confirms the payment (server/payments.ts). A free course opens straight away.
 */
authRouter.post(
  '/register',
  wrap((req, res) => {
    if (!signupAllowed()) fail(403, 'New accounts cannot be created on this site right now.');
    const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
    const email = normEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const phone = normalizePhone(req.body?.phone);
    const country = typeof req.body?.country === 'string' ? req.body.country.trim().toUpperCase() : '';
    if (name.length < 2 || name.length > 80) fail(400, 'Enter your full name.');
    if (!EMAIL_RE.test(email) || email.length > 200) fail(400, 'Enter a valid email address.');
    if (!phone) fail(400, 'Enter a valid mobile number with its country code, for example +1 555 123 4567.');
    if (!isCountryCode(country)) fail(400, 'Choose your country.');
    const pwErr = validatePassword(password);
    if (pwErr) fail(400, pwErr);
    const course = signupCourse(req.body?.courseId);
    const d = db();
    if (d.users.some((u) => u.email.toLowerCase() === email)) fail(409, 'An account with this email already exists. Sign in to continue, or use "Forgot password?".');
    if (!allow(`signup:${req.ip ?? ''}`, 5, 3_600_000)) fail(429, 'Too many new accounts from this connection. Please try again later.');
    const user: UserRecord = {
      id: uid('u'),
      name,
      email,
      role: 'learner',
      initials: initials(name),
      active: true,
      createdAt: nowIso(),
      // People who sign up for a course go straight to it after paying (no welcome questions first).
      onboarded: true,
      mustChangePassword: false,
      phone,
      country,
      ...hashPassword(password),
    };
    if (course.price > 0) user.pendingCourseId = course.id;
    d.users.push(user);
    if (!(course.price > 0)) d.enrollments.push({ id: uid('enr'), userId: user.id, courseId: course.id, enrolledAt: nowIso(), access: 'free', lessons: {} });
    audit(user, 'SIGNUP', `${name} created a learner account for ${course.title}${course.price > 0 ? ' (payment next)' : ' (free)'}.`);
    recordEvent(user.id, 'login');
    save();
    const token = issueToken(user.id);
    setMediaCookie(req, res, token, userForToken(token).exp);
    return { token, user: sessionUser(user), course: { id: course.id, title: course.title, price: course.price } };
  }),
);

/**
 * "Forgot password?": emails a 6-digit code AND a link. Either one lets the person choose a new
 * password, within 24 hours, once. Asking again replaces the earlier code and link. The answer is
 * the same whether or not the email has an account, so this cannot reveal who is registered.
 */
authRouter.post(
  '/forgot',
  wrap(async (req) => {
    const email = normEmail(req.body?.email);
    if (!EMAIL_RE.test(email) || email.length > 200) fail(400, 'Enter a valid email address.');
    if (!emailEnabled()) {
      console.warn('[auth] A password reset was requested, but email is not set up (SMTP_HOST, SMTP_USER, SMTP_PASS).');
      fail(409, 'Password reset emails are not available right now. Please try again later.');
    }
    const generic = {
      ok: true,
      message: `If an account exists for ${email}, we have emailed a 6-digit code and a reset link. They work for ${RESET_HOURS} hours. Check your inbox and spam folder.`,
    };
    if (!allow(`forgot-ip:${req.ip ?? ''}`, 10, 3_600_000) || !allow(`forgot:${email}`, 3, 3_600_000)) return generic;
    const user = db().users.find((u) => u.email.toLowerCase() === email && u.active);
    if (!user) return generic;
    const token = crypto.randomBytes(32).toString('base64url');
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    user.resetTokenHash = sha256(token);
    user.resetCodeHash = codeHash(user, code);
    user.resetTokenExp = new Date(Date.now() + RESET_HOURS * 3_600_000).toISOString();
    user.resetAttempts = 0;
    save();
    const site = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const link = `${site}/#/reset?token=${token}`;
    const sent = await sendMail(
      user.email,
      'Reset your USAII password',
      `Hello ${user.name},\n\nWe received a request to reset the password of your USAII account.\n\nYour reset code: ${code}\n\nEnter this code on the "Reset your password" screen, or open this link to choose a new password:\n${link}\n\nThe code and the link work for ${RESET_HOURS} hours and only once. If you ask again, only the newest email works.\n\nIf you did not ask for this, ignore this email. Your password stays the same.\n\nUSAII`,
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827">` +
        `<p>Hello ${escHtml(user.name)},</p>` +
        `<p>We received a request to reset the password of your USAII account.</p>` +
        `<p style="margin:22px 0 6px">Your reset code:</p>` +
        `<p style="margin:0 0 22px;font-size:30px;font-weight:700;letter-spacing:8px">${code}</p>` +
        `<p>Enter this code on the <b>Reset your password</b> screen, or use the button below.</p>` +
        `<p style="margin:22px 0"><a href="${link}" style="background:#1F6BFF;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;display:inline-block">Choose a new password</a></p>` +
        `<p style="color:#4b5563">The code and the link work for ${RESET_HOURS} hours and only once. If you ask again, only the newest email works.</p>` +
        `<p style="color:#4b5563">If you did not ask for this, ignore this email. Your password stays the same.</p>` +
        `<p>USAII</p></div>`,
    );
    if (!sent) console.warn(`[auth] The password reset email to ${user.email} could not be sent. Check the SMTP settings.`);
    audit(user, 'PASSWORD_RESET_REQUEST', `Requested a password reset code and link${sent ? '' : ' (the email could not be sent)'}.`);
    return generic;
  }),
);

/**
 * The reset request a link token, or an email plus 6-digit code, points to. Wrong codes are counted;
 * after five, the code stops working and a new one must be requested.
 */
function findReset(body: any): UserRecord {
  const expired = 'This reset code or link has expired or was already used. Ask for a new one.';
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const now = Date.now();
  if (token) {
    const h = sha256(token);
    const user = db().users.find((u) => sameHash(u.resetTokenHash, h));
    if (!user || !user.resetTokenExp || Date.parse(user.resetTokenExp) < now) fail(400, expired);
    return user!;
  }
  const email = normEmail(body?.email);
  const code = String(body?.code ?? '').replace(/\D/g, '');
  if (!EMAIL_RE.test(email)) fail(400, 'Enter the email address the code was sent to.');
  if (code.length !== 6) fail(400, 'Enter the 6-digit code from the email.');
  const user = db().users.find((u) => u.email.toLowerCase() === email);
  if (!user || !user.resetCodeHash || !user.resetTokenExp || Date.parse(user.resetTokenExp) < now) fail(400, expired);
  if (!sameHash(user!.resetCodeHash, codeHash(user!, code))) {
    user!.resetAttempts = (user!.resetAttempts ?? 0) + 1;
    if (user!.resetAttempts >= RESET_MAX_TRIES) {
      clearResetRequest(user!);
      save();
      fail(400, 'Too many wrong codes, so this code no longer works. Ask for a new one.');
    }
    save();
    const left = RESET_MAX_TRIES - user!.resetAttempts;
    fail(400, `That code is not correct. You can try ${left} more ${left === 1 ? 'time' : 'times'}.`);
  }
  return user!;
}

/** Check a reset code or link before showing the "new password" form (nothing changes yet). */
authRouter.post(
  '/reset/check',
  wrap((req) => {
    if (!allow(`reset-ip:${req.ip ?? ''}`, 40, 3_600_000)) fail(429, 'Too many attempts. Please wait a while and try again.');
    const user = findReset(req.body);
    if (!user.active) fail(403, `This account is not active. ${supportLine()}`);
    return { ok: true, email: user.email };
  }),
);

/** Set a new password with the emailed code or link. The person is signed in; every other sign-in ends. */
authRouter.post(
  '/reset',
  wrap((req, res) => {
    if (!allow(`reset-ip:${req.ip ?? ''}`, 40, 3_600_000)) fail(429, 'Too many attempts. Please wait a while and try again.');
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = findReset(req.body);
    if (!user.active) fail(403, `This account is not active. ${supportLine()}`);
    const pwErr = validatePassword(password);
    if (pwErr) fail(400, pwErr);
    setPassword(user, password); // also ends the reset request: the code and link stop working
    user.mustChangePassword = false;
    clearFailures(user.email);
    audit(user, 'PASSWORD_RESET', 'Password reset with the emailed code or link.');
    save();
    const t = issueToken(user.id);
    setMediaCookie(req, res, t, userForToken(t).exp);
    return { token: t, user: sessionUser(user) };
  }),
);

authRouter.post(
  '/login',
  wrap((req, res) => {
    const email = normEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) fail(400, 'Enter your email and password.');
    if (password.length > 256) fail(400, 'That email and password combination did not match.');
    const ip = req.ip ?? '';
    const wait = loginLocked(email, ip);
    if (wait) fail(429, `Too many attempts. Please wait ${wait > 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`} and try again.`);
    const user = db().users.find((u) => u.email.toLowerCase() === email);
    if (!user) verifyUnknownUser(password);
    if (!user || !verifyPassword(password, user)) {
      recordFailure(email, ip);
      fail(401, 'That email and password combination did not match.');
    }
    if (!user!.active) fail(403, user!.suspension ? `Your account is currently suspended under the USAII\u00AE Terms of Use. ${supportLine()}` : `This account has been deactivated. ${supportLine()}`);
    // The sign-in page has a Learner tab and an Admin tab. Only after the password is proven
    // do we say which one this account uses (so this never helps anyone guess accounts).
    const wanted = req.body?.role;
    if ((wanted === 'learner' || wanted === 'instructor') && wanted !== user!.role)
      fail(403, user!.role === 'instructor' ? 'This is an admin account. Choose the Admin tab to sign in.' : 'This is a learner account. Choose the Learner tab to sign in.');
    clearFailures(email);
    recordEvent(user!.id, 'login');
    const token = issueToken(user!.id);
    setMediaCookie(req, res, token, userForToken(token).exp);
    return { token, user: sessionUser(user!) };
  }),
);

/** The password rule, so every screen shows the same wording the server enforces. */
authRouter.get('/password-rule', (_req, res) => res.json({ rule: PASSWORD_RULE }));

authRouter.get('/me', requireAuth, wrap((req) => ({ user: sessionUser(me(req)) })));

/** Sign out: the app forgets its token; this clears the media cookie that opens uploaded files. */
authRouter.post('/logout', (req, res) => {
  clearMediaCookie(req, res);
  res.json({ ok: true });
});

authRouter.post(
  '/change-password',
  requireAuth,
  wrap((req, res) => {
    const u = me(req);
    const { current, next } = req.body ?? {};
    if (!u.mustChangePassword && !verifyPassword(String(current ?? ''), u)) fail(400, 'Your current password is incorrect.');
    const err = validatePassword(next);
    if (err) fail(400, err);
    if (verifyPassword(String(next), u)) fail(400, 'Choose a password that is different from your current one.');
    setPassword(u, next);
    u.mustChangePassword = false;
    audit(u, 'CHANGE_PASSWORD', 'Password changed.');
    save();
    // Every other sign-in with the old password has just ended; give this browser a fresh token.
    const token = issueToken(u.id);
    setMediaCookie(req, res, token, userForToken(token).exp);
    return { user: sessionUser(u), token };
  }),
);

authRouter.patch(
  '/profile',
  requireAuth,
  wrap((req) => {
    const u = me(req);
    const b = req.body ?? {};
    if (typeof b.name === 'string' && b.name.trim().length >= 2) {
      u.name = b.name.trim().slice(0, 100);
      u.initials = initials(u.name);
    }
    if (typeof b.onboarded === 'boolean') u.onboarded = b.onboarded;
    if (['read', 'watch', 'listen', 'do'].includes(b.learnMode)) u.learnMode = b.learnMode as LearnMode;
    if (b.goal === null) delete u.goal;
    else if (b.goal && typeof b.goal === 'object') {
      u.goal = {
        statement: String(b.goal.statement ?? '').slice(0, 300),
        why: String(b.goal.why ?? '').slice(0, 500),
        minutesPerDay: Math.max(5, Math.min(240, Number(b.goal.minutesPerDay) || 20)),
        daysPerWeek: Math.max(1, Math.min(7, Number(b.goal.daysPerWeek) || 4)),
      };
    }
    save();
    return { user: sessionUser(u) };
  }),
);
