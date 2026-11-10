/**
 * The public website (the AI Micro Credentials landing page, Explore Courses and the course pages)
 * reads its courses and sends "Get More Details" requests here. No sign-in is needed.
 *
 *   GET  /api/public/catalog          every PUBLISHED course: title, price, listing
 *   GET  /api/public/catalog/:key     one published course (by id or website slug), with its sessions
 *   POST /api/public/enquiries        a "Get More Details" request
 *
 * The website may live on another address (for example usaii.org while the LMS is learn.usaii.org),
 * so these routes answer cross-origin requests. SITE_ORIGINS limits which sites may call them
 * (comma separated, for example "https://www.usaii.org,https://usaii.org"); unset means any site.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Course, Enquiry } from '../../shared/types';
import { db, nowIso, save, uid } from '../db';
import { emailEnabled, sendMail } from '../mailer';
import { paymentCurrency } from '../payments';
import { fail, notifyStaff } from '../services';
import { wrap } from './util';

/* ---------------- Cross-origin access for the website ---------------- */

function allowedOrigins(): string[] | '*' {
  const raw = (process.env.SITE_ORIGINS ?? '').trim();
  if (!raw || raw === '*') return '*';
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** CORS for /api/public. Runs before the "LMS is starting" check, so a preflight always gets its answer. */
export function siteCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin');
  const allowed = allowedOrigins();
  if (origin && (allowed === '*' || allowed.includes(origin.replace(/\/+$/, '')))) {
    res.setHeader('Access-Control-Allow-Origin', allowed === '*' ? '*' : origin);
    if (allowed !== '*') res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

/* ---------------- Catalog ---------------- */

const published = () => db().courses.filter((c) => c.status === 'published');
const lessonCount = (c: Course) => c.modules.reduce((n, m) => n + m.lessons.length, 0);
const questionCount = (c: Course) => c.modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.check.length, 0), 0) + (c.finalExam?.questions.length ?? 0);

/** What any visitor may see about a published course. No answers, no rubrics, no learner data. */
function publicCourse(c: Course) {
  const l = c.listing;
  return {
    id: c.id,
    slug: l?.slug || c.id,
    number: l?.number ?? null,
    category: l?.category ?? 'foundations',
    title: c.title,
    subtitle: c.subtitle,
    description: c.description,
    tagline: l?.tagline || c.subtitle,
    youBuild: l?.youBuild ?? '',
    needs: l?.needs ?? null,
    summary: l?.summary ?? '',
    takeaway: l?.takeaway ?? '',
    suited: l?.suited ?? '',
    price: c.price,
    // The selling price the website shows struck out (null: none).
    listPrice: c.listPrice ?? null,
    free: c.price === 0,
    access: c.access,
    durationLabel: c.durationLabel,
    sessions: lessonCount(c),
    questions: questionCount(c),
    finalQuestions: c.finalExam?.questions.length ?? 0,
    updatedAt: c.updatedAt,
  };
}

function order(a: Course, b: Course) {
  const na = a.listing?.number ?? 9999;
  const nb = b.listing?.number ?? 9999;
  return na - nb || a.title.localeCompare(b.title);
}

export const siteRouter = Router();

siteRouter.get(
  '/catalog',
  wrap((_req, res) => {
    // Prices and details change in the admin portal; the website must always see the current ones.
    res.setHeader('Cache-Control', 'no-store');
    return {
      currency: paymentCurrency(),
      signup: (process.env.ALLOW_SIGNUP ?? 'true').toLowerCase() !== 'false',
      courses: published().sort(order).map(publicCourse),
    };
  }),
);

siteRouter.get(
  '/catalog/:key',
  wrap((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const key = String(req.params.key);
    const c = published().find((x) => x.id === key || x.listing?.slug === key);
    if (!c) fail(404, 'This course is not open for enrollment right now.');
    return {
      currency: paymentCurrency(),
      course: {
        ...publicCourse(c!),
        // The sessions, as the admin named them in Course Builder.
        modules: c!.modules.map((m) => ({ title: m.title, summary: m.summary, lessons: m.lessons.map((l) => ({ title: l.title, minutes: l.estimatedMinutes })) })),
      },
    };
  }),
);

/* ---------------- "Get More Details" enquiries ---------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** At most 5 enquiries per connection per hour, so the form cannot be used to flood the inbox. */
const recent = new Map<string, number[]>();
function allow(ip: string): boolean {
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= 5) return false;
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 20_000) recent.clear();
  return true;
}

siteRouter.post(
  '/enquiries',
  wrap(async (req) => {
    const b = req.body ?? {};
    // A field people never see. Automated form fillers complete it; the request is quietly accepted.
    if (clean(b.website, 200)) return { ok: true };
    const e: Enquiry = {
      id: uid('enq'),
      name: clean(b.name, 120),
      email: clean(b.email, 200).toLowerCase(),
      mobile: clean(b.mobile, 40),
      organization: clean(b.organization, 160),
      designation: clean(b.designation, 120),
      country: clean(b.country, 80),
      source: clean(b.source, 120) || 'website',
      createdAt: nowIso(),
    };
    if (e.name.length < 2) fail(400, 'Enter your name.');
    if (!EMAIL_RE.test(e.email)) fail(400, 'Enter a valid email address.');
    const digits = e.mobile.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15 || /[^\d\s()+.]/.test(e.mobile)) fail(400, 'Enter a valid mobile number.');
    if (!e.organization) fail(400, 'Enter your organization name.');
    if (!e.designation) fail(400, 'Enter your designation.');
    if (!e.country) fail(400, 'Choose your country.');
    const courseId = clean(b.courseId, 60);
    if (courseId && db().courses.some((c) => c.id === courseId)) e.courseId = courseId;
    if (!allow(req.ip ?? '')) fail(429, 'We already have your details. Our team will be in touch soon.');

    const d = db();
    d.enquiries ??= [];
    d.enquiries.unshift(e);
    if (d.enquiries.length > 10_000) d.enquiries.length = 10_000;
    const course = e.courseId ? d.courses.find((c) => c.id === e.courseId)?.title : undefined;
    notifyStaff({
      kind: 'enquiry',
      title: `New enquiry from ${e.name}`,
      body: `${e.designation}, ${e.organization} (${e.country})${course ? ` about ${course}` : ''}`,
      link: { view: 'enquiries' },
    });
    save();

    // The support inbox gets every enquiry by email, when email is set up.
    const to = (process.env.ENQUIRY_EMAIL ?? process.env.SUPPORT_EMAIL ?? '').trim();
    if (to && emailEnabled()) {
      const rows: [string, string][] = [
        ['Name', e.name],
        ['Email', e.email],
        ['Mobile', e.mobile],
        ['Organization', e.organization],
        ['Designation', e.designation],
        ['Country', e.country],
        ['Course', course ?? 'Not specified'],
        ['Sent from', e.source],
      ];
      const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
      void sendMail(
        to,
        `New AI Micro Credentials enquiry: ${e.name}`,
        rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
        `<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows.map(([k, v]) => `<tr><td style="color:#4f4f6b">${k}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>`,
      );
    }
    return { ok: true };
  }),
);
