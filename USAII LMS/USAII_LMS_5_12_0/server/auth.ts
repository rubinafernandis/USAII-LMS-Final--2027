import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { PublicUser, Role, UserRecord } from '../shared/types';
import { db, getMeta, setMeta } from './db';

/**
 * Signs sign-in tokens and seals stored payment keys. AUTH_SECRET wins; otherwise one is generated
 * once and kept with the data (in PostgreSQL, or in DATA_DIR/secret.key), so a restart never signs
 * everyone out or makes saved payment keys unreadable.
 */
let SECRET = '';
let SEAL_KEY: Buffer | null = null;

export async function initAuthSecret(): Promise<void> {
  const fromEnv = process.env.AUTH_SECRET || process.env.SESSION_SECRET;
  if (fromEnv) {
    if (fromEnv.length < 32) console.warn('[auth] AUTH_SECRET is short. Use at least 32 random characters.');
    SECRET = fromEnv;
  } else {
    SECRET = (await getMeta('secret')) ?? '';
    if (!SECRET) {
      SECRET = crypto.randomBytes(48).toString('hex');
      await setMeta('secret', SECRET);
    }
  }
  SEAL_KEY = crypto.createHash('sha256').update(`usaii-payment-keys:${SECRET}`).digest();
}

function secret(): string {
  if (!SECRET) throw new Error('Sign-in secret is not ready yet.');
  return SECRET;
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { passwordHash, salt };
}

export function verifyPassword(password: string, user: UserRecord): boolean {
  const { passwordHash } = hashPassword(password, user.salt);
  const a = Buffer.from(passwordHash, 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Shown next to every password box, so the rule is the same everywhere. */
export const PASSWORD_RULE = 'At least 12 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.';

const COMMON = new Set(['password1234', 'password@123', 'welcome@1234', 'qwerty123456', 'admin@123456', 'letmein12345', 'learner@2026', 'admin@2026', 'usaii@123456', 'changeme1234']);

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 128) return 'Password must be 128 characters or fewer.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw))
    return 'Password must include an uppercase letter, a lowercase letter, a number, and a symbol.';
  if (COMMON.has(pw.toLowerCase())) return 'This password is too common. Choose another one.';
  if (/(.)\1{3,}/.test(pw)) return 'Avoid repeating the same character four or more times.';
  return null;
}

/** A strong random password that meets the rule (used for generated test accounts). */
export function tempPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#%^&*-_=+?'];
  const all = sets.join('');
  const chars = sets.map((set) => set[crypto.randomInt(set.length)]);
  while (chars.length < 18) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (s: string) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');

export function issueToken(userId: string): string {
  const now = Date.now();
  const payload = b64(JSON.stringify({ uid: userId, iat: now, exp: now + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string): { uid: string; iat: number; exp: number } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const { uid, exp, iat } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof uid !== 'string' || typeof exp !== 'number' || Date.now() > exp) return null;
    return { uid, iat: typeof iat === 'number' ? iat : 0, exp };
  } catch {
    return null;
  }
}

export function toPublic(u: UserRecord): PublicUser {
  const { passwordHash: _h, salt: _s, passwordChangedAt: _p, resetTokenHash: _r, resetCodeHash: _c, resetTokenExp: _e, resetAttempts: _a, ...rest } = u;
  return rest;
}

/** Set a new password and end every sign-in made with the old one. */
export function setPassword(u: UserRecord, password: string) {
  Object.assign(u, hashPassword(password), { passwordChangedAt: new Date().toISOString() });
  // A new password makes any emailed reset link or code useless.
  clearResetRequest(u);
}

/** Forget a pending "Forgot password" request (link, code, expiry and wrong-code count). */
export function clearResetRequest(u: UserRecord) {
  delete u.resetTokenHash;
  delete u.resetCodeHash;
  delete u.resetTokenExp;
  delete u.resetAttempts;
}

/** Spend the same time on an unknown email as on a known one, so response time does not reveal which emails exist. */
const DUMMY = hashPassword('timing-equaliser-not-a-real-password');
export function verifyUnknownUser(password: string) {
  verifyPassword(password, { ...DUMMY } as UserRecord);
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w) && !/^(dr|mr|mrs|ms)\.?$/i.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || name.slice(0, 2).toUpperCase()
  );
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRecord;
    }
  }
}

/**
 * The user a sign-in token belongs to, or why it is not valid. Shared by the API (Bearer header)
 * and by uploaded files (the media cookie), so both apply exactly the same rules.
 */
export function userForToken(token: string): { user?: UserRecord; error: string; exp: number } {
  const tok = token ? readToken(token) : null;
  let user = tok ? db().users.find((u) => u.id === tok.uid) : undefined;
  // A token issued before the last password change is no longer valid (allow 1 s of clock rounding).
  if (user && user.passwordChangedAt && tok!.iat < Date.parse(user.passwordChangedAt) - 1000) user = undefined;
  if (user && !user.active) return { error: user.suspension ? `Your account is currently suspended under the USAII\u00AE Terms of Use. ${supportLine()}` : `This account has been deactivated. ${supportLine()}`, exp: 0 };
  if (!user) return { error: 'Your session has ended. Please sign in again.', exp: 0 };
  return { user, error: '', exp: tok!.exp };
}

/** How a learner reaches the platform team (account, payment and access questions). Never an admin chat. */
export function supportLine(): string {
  const email = (process.env.SUPPORT_EMAIL ?? '').trim();
  return email ? `Contact support at ${email}.` : 'Contact USAII support.';
}

/* ---------------- Media cookie: lets <img>, <video> and PDF links reach /uploads ---------------- */

export const MEDIA_COOKIE = 'usaii_media';

export function readCookie(req: Request, name: string): string {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

/**
 * The same signed token as the API uses, in an HttpOnly cookie scoped to /uploads only: page scripts
 * cannot read it, and it is sent with nothing but requests for uploaded files.
 */
/**
 * The media cookie (it opens uploaded videos, images and PDFs) is marked Secure only when the visitor's
 * page is on https. Some web servers and hosting panels tell the LMS "https" while visitors use plain
 * http; a Secure cookie is then dropped by the browser and no uploaded file opens. The page's own
 * address (Origin, or Referer) shows which one the visitor really uses.
 */
function secureFlag(req: Request): string {
  const page = req.get('origin') || req.get('referer') || '';
  const https = page ? /^https:/i.test(page) : req.secure;
  return https ? '; Secure' : '';
}

export function setMediaCookie(req: Request, res: Response, token: string, exp: number) {
  const maxAge = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  res.append('Set-Cookie', `${MEDIA_COOKIE}=${encodeURIComponent(token)}; Path=/uploads; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag(req)}`);
}

export function clearMediaCookie(req: Request, res: Response) {
  res.append('Set-Cookie', `${MEDIA_COOKIE}=; Path=/uploads; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const r = userForToken(token);
  if (!r.user) return res.status(401).json({ error: r.error });
  req.user = r.user;
  // Keep the media cookie in step with the session, so uploaded files load for this signed-in person.
  if (readCookie(req, MEDIA_COOKIE) !== token) setMediaCookie(req, res, token, r.exp);
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: 'You do not have access to this area.' });
    next();
  };
}

// Brute-force protection for sign-in, by account and by network address.
// Per account: after 5 failures the account waits 1 minute, then 5, then 15 (it resets after a success
// or 30 quiet minutes). Per address: at most 30 failures in 15 minutes across all accounts.
const failures = new Map<string, { count: number; strikes: number; until: number; last: number }>();
const ipFailures = new Map<string, number[]>();
const LOCK_STEPS = [60_000, 5 * 60_000, 15 * 60_000];
const IP_WINDOW = 15 * 60_000;
const IP_MAX = 30;

export function loginLocked(email: string, ip = ''): number {
  const now = Date.now();
  const f = failures.get(email);
  if (f && f.until > now) return Math.ceil((f.until - now) / 1000);
  const list = (ipFailures.get(ip) ?? []).filter((t) => now - t < IP_WINDOW);
  ipFailures.set(ip, list);
  if (list.length >= IP_MAX) return Math.ceil((list[0] + IP_WINDOW - now) / 1000);
  return 0;
}
export function recordFailure(email: string, ip = '') {
  const now = Date.now();
  const f = failures.get(email) ?? { count: 0, strikes: 0, until: 0, last: 0 };
  if (now - f.last > 30 * 60_000) Object.assign(f, { count: 0, strikes: 0 });
  f.last = now;
  f.count += 1;
  if (f.count >= 5) {
    f.until = now + LOCK_STEPS[Math.min(f.strikes, LOCK_STEPS.length - 1)];
    f.strikes += 1;
    f.count = 0;
  }
  failures.set(email, f);
  const list = ipFailures.get(ip) ?? [];
  list.push(now);
  ipFailures.set(ip, list);
  // Keep memory bounded.
  if (failures.size > 10_000) failures.clear();
  if (ipFailures.size > 10_000) ipFailures.clear();
}
export function clearFailures(email: string) {
  failures.delete(email);
}

/* ---------------- Sealing stored secrets (payment keys) ---------------- */

/** Encrypt a secret for storage (AES-256-GCM). Returns "enc:v1:<iv>.<tag>.<data>". */
export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  secret();
  const c = crypto.createCipheriv('aes-256-gcm', SEAL_KEY!, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

/** Decrypt a stored secret; '' if it cannot be read (for example after the server secret changed). */
export function openSecret(stored: string | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith('enc:v1:')) return stored;
  try {
    const [iv, tag, data] = stored.slice(7).split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', SEAL_KEY!, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}
