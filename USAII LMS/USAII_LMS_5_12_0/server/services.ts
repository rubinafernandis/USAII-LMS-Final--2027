import type {
  ActivityEventType,
  ContentBlock,
  Course,
  CourseListing,
  CourseModule,
  Enrollment,
  Lesson,
  ListingCategory,
  Notification,
  PassRubric,
  QuestionKind,
  Role,
  RubricCriterion,
  RubricDocument,
  UserRecord,
} from '../shared/types';
import { INSTRUCTION_BLOCK_TYPES } from '../shared/types';
import {
  buildSnapshot,
  computePrediction,
  dateKey,
  flattenLessons,
  isEligibleForFinal,
  lessonRequirements,
  lessonTopicStatus,
  progressOf,
} from '../shared/analytics';
import type { LessonProgress } from '../shared/types';
import { emailEnabled, sendMail } from './mailer';
import { certificateGate, gateMet } from '../shared/metrics';
import { certificateLineFor } from '../shared/certificateText';
import { gateways } from './paymentConfig';
import { db, nowIso, save, uid } from './db';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

export const isStaff = (role: Role) => role === 'instructor';

export function getCourse(id: string): Course {
  return db().courses.find((c) => c.id === id) ?? fail(404, 'Course not found.');
}

export function getEnrollment(userId: string, courseId: string): Enrollment | undefined {
  return db().enrollments.find((e) => e.userId === userId && e.courseId === courseId);
}

/**
 * Whether this enrollment actually opens the course. A paid course opens only after a verified
 * payment, or when an admin gave access. Joining a free course is always fine.
 *
 * Older enrollments (before 5.7) have no `access` field. On a course that is free they keep working;
 * on a paid course they open only if an admin granted them. That closes the hole where a learner
 * could press "Enroll for $X" and get straight in without paying.
 */
export function hasCourseAccess(enr: Enrollment | undefined, course: Course | undefined): boolean {
  if (!enr || !course) return false;
  if (enr.grantedBy || enr.access === 'granted') return true;
  if (enr.access === 'paid') return !!enr.paymentId && paymentIsValid(enr.paymentId, enr.userId, enr.courseId);
  if (enr.access === 'free') return true;
  return !(course.price > 0);
}

function paymentIsValid(paymentId: string, userId: string, courseId: string): boolean {
  const p = (db().payments ?? []).find((x) => x.id === paymentId);
  return !!p && p.status === 'paid' && p.userId === userId && p.courseId === courseId;
}

/** The learner's enrollment, but only if it really opens the course (paid, free, or granted). */
export function getActiveEnrollment(userId: string, courseId: string): Enrollment | undefined {
  const enr = getEnrollment(userId, courseId);
  return enr && hasCourseAccess(enr, db().courses.find((c) => c.id === courseId)) ? enr : undefined;
}

/** Learners reach a course they can open that is published; admins reach the courses they created. */
export function canAccessCourse(userId: string, staff: boolean, courseId: string) {
  const course = db().courses.find((c) => c.id === courseId);
  if (!staff) return !!course && course.status === 'published' && !!getActiveEnrollment(userId, courseId);
  return course?.createdBy === userId;
}

/* ---------------- One course at a time ----------------
 * A learner may buy several courses but works on one at a time: the earliest one they enrolled in
 * that has no certificate yet. The next course opens when that certificate is issued. Courses the
 * learner cannot open (unpaid, unpublished, deleted) never hold the others back.
 */
export function courseInProgress(userId: string): Enrollment | undefined {
  const d = db();
  return d.enrollments
    .filter((e) => e.userId === userId && !e.certificateIssuedAt)
    .filter((e) => {
      const c = d.courses.find((x) => x.id === e.courseId);
      return !!c && c.status === 'published' && hasCourseAccess(e, c);
    })
    .sort((a, b) => Date.parse(a.enrolledAt) - Date.parse(b.enrolledAt) || a.id.localeCompare(b.id))[0];
}

/** The course this one is waiting for, or null when the learner can work on it now. */
export function waitingFor(userId: string, courseId: string): { id: string; title: string } | null {
  const enr = getEnrollment(userId, courseId);
  if (!enr || enr.certificateIssuedAt) return null;
  const first = courseInProgress(userId);
  if (!first || first.courseId === courseId) return null;
  const c = db().courses.find((x) => x.id === first.courseId);
  return c ? { id: c.id, title: c.title } : null;
}

/** Refuses progress on a course while an earlier one is still waiting for its certificate. */
export function requireTurn(userId: string, courseId: string) {
  const w = waitingFor(userId, courseId);
  if (w) fail(423, `Finish ${w.title} and receive its certificate first. This course opens right after.`);
}

export function requireEnrollment(userId: string, courseId: string): Enrollment {
  const enr = getEnrollment(userId, courseId) ?? fail(403, 'You are not enrolled in this course.');
  if (!hasCourseAccess(enr, db().courses.find((c) => c.id === courseId))) fail(402, 'Complete the payment for this course to open it. Go to Explore Courses to pay.');
  return enr!;
}

export function findLesson(course: Course, lessonId: string): Lesson {
  return flattenLessons(course).find((f) => f.lesson.id === lessonId)?.lesson ?? fail(404, 'Lesson not found.');
}

/** Remove answer keys before sending course content to learners. */
export function sanitizeCourse(course: Course): Course {
  const strip = (qs: Lesson['check']) => qs.map((q) => ({ ...q, correctIndex: -1, rationale: '' }));
  return {
    ...course,
    modules: course.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({ ...l, check: strip(l.check) })),
    })),
    finalExam: course.finalExam ? { ...course.finalExam, questions: strip(course.finalExam.questions) } : undefined,
  };
}

export function snapshotFor(user: UserRecord, course: Course, now = Date.now()) {
  const d = db();
  return buildSnapshot({
    course,
    enrollment: getEnrollment(user.id, course.id),
    userId: user.id,
    goal: user.goal,
    events: d.events,
    now,
  });
}

export function recordEvent(userId: string, type: ActivityEventType, courseId?: string, seconds?: number) {
  const d = db();
  const now = Date.now();
  if (type === 'study' && seconds) {
    // Merge consecutive heartbeats into one event (keeps the log compact).
    for (let i = d.events.length - 1; i >= Math.max(0, d.events.length - 60); i--) {
      const e = d.events[i];
      if (e.userId === userId && e.type === 'study' && e.courseId === courseId) {
        if (now - Date.parse(e.at) < 120_000 && (e.seconds ?? 0) < 900 && dateKey(e.at) === dateKey(now)) {
          e.seconds = (e.seconds ?? 0) + seconds;
          e.at = new Date(now).toISOString();
          save();
          return;
        }
        break;
      }
    }
  }
  d.events.push({ id: uid('ev'), userId, courseId, type, at: new Date(now).toISOString(), seconds });
  save();
}

/** Each person keeps their newest notifications; older ones are dropped (per person, never site-wide). */
const NOTIFICATIONS_PER_USER = 100;

type NewNotification = Omit<Notification, 'id' | 'userId' | 'createdAt' | 'read'>;

/**
 * In-app notification (the bell). With `email: true` and email set up (SMTP_*), the same message is
 * also emailed, for the few things a person must hear about even when they are not signed in:
 * a decision on their work, a certificate, new course access, work waiting for review.
 */
export function notify(userId: string, n: NewNotification & { email?: boolean }) {
  const d = db();
  const { email, ...rest } = n;
  if (rest.key && d.notifications.some((x) => x.userId === userId && x.key === rest.key)) return;
  d.notifications.unshift({ id: uid('nt'), userId, createdAt: nowIso(), read: false, ...rest });
  let mine = 0;
  d.notifications = d.notifications.filter((x) => x.userId !== userId || ++mine <= NOTIFICATIONS_PER_USER);
  save();
  if (email) void emailNotification(userId, rest);
}

/** Where a notification leads inside the LMS, as a full link for an email. */
function linkFor(n: NewNotification, role: Role): string {
  const base = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');
  if (!base) return '';
  const l = n.link;
  let route = role === 'learner' ? 'dashboard' : 'cohort';
  if (l?.view === 'study' && l.courseId && l.lessonId) route = `study/${l.courseId}/${l.lessonId}?step=apply`;
  else if (l?.view === 'credential' && l.courseId) route = `vault/${l.courseId}`;
  else if (l?.view && ['assessments', 'learners', 'progress'].includes(l.view)) route = l.view;
  return `${base}/#/${route}`;
}

async function emailNotification(userId: string, n: NewNotification) {
  if (!emailEnabled()) return;
  const u = db().users.find((x) => x.id === userId && x.active);
  if (!u) return;
  const link = linkFor(n, u.role);
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const text = `Hello ${u.name},\n\n${n.body}\n\n${link ? `Open the LMS: ${link}\n\n` : ''}USAII Learning\n(You received this because it concerns your course work. Please do not reply to this email.)`;
  const html = `<p>Hello ${esc(u.name)},</p><p>${esc(n.body)}</p>${link ? `<p><a href="${esc(link)}">Open the LMS</a></p>` : ''}<p style="color:#666;font-size:12px">USAII Learning. You received this because it concerns your course work. Please do not reply to this email.</p>`;
  await sendMail(u.email, n.title.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim(), text, html);
}

export function notifyStaff(n: NewNotification & { email?: boolean }) {
  for (const u of db().users.filter((x) => isStaff(x.role) && x.active)) notify(u.id, { ...n, key: n.key ? `${n.key}-${u.id}` : undefined });
}

/** Notify the admin who owns this course (or every admin if that account is inactive). */
export function notifyCourseStaff(course: Course, n: NewNotification & { email?: boolean }) {
  const owner = db().users.find((u) => u.active && u.id === course.createdBy);
  const targets = owner ? [owner] : db().users.filter((u) => u.active && u.role === 'instructor');
  const list = targets.length ? targets : db().users.filter((u) => u.active && isStaff(u.role));
  for (const u of list) notify(u.id, { ...n, key: n.key ? `${n.key}-${u.id}` : undefined });
}

export function audit(actor: UserRecord, action: string, details: string) {
  const d = db();
  d.audit.unshift({ id: uid('au'), at: nowIso(), actorId: actor.id, actorName: actor.name, role: actor.role, action, details });
  if (d.audit.length > 1000) d.audit.length = 1000;
  save();
}

/** Issue a credential once every requirement is met. Returns true if newly issued. */
export function maybeIssueCredential(user: UserRecord, course: Course): boolean {
  const enr = getEnrollment(user.id, course.id);
  if (!enr || enr.certificateIssuedAt) return false;
  if (!isEligibleForFinal(course, enr)) return false;
  // The certificate rule (the USAII grading sheet): every lesson complete, the final knowledge check
  // passed at the pass mark, and every capstone approved against its rubric. Practice checks never block it.
  const hasFinal = !!course.finalExam && course.finalExam.questions.length > 0;
  if (hasFinal && !(enr.finalExam?.attempts ?? []).some((a) => a.score >= course.passMark)) return false;
  if (!gateMet(certificateGate(course, enr))) return false;
  enr.certificateIssuedAt = nowIso();
  // The name is printed as it is today; a later profile change does not alter an issued certificate.
  enr.certificateName = user.name;
  // Each certificate is named after its course, as the course is called today.
  enr.certificateCourseTitle = course.title;
  enr.certificateLine = certificateLineFor(course);
  // Short, unambiguous and unguessable: USAII-<year>-<8 random hex characters>.
  enr.certificateId = `USAII-${new Date().getFullYear()}-${uid('c').slice(2, 10).toUpperCase()}`;
  notify(user.id, {
    kind: 'credential',
    title: 'You earned your credential! 🎉',
    body: `Your certificate for ${course.title} is ready to download and share.`,
    link: { view: 'credential', courseId: course.id },
    email: true,
  });
  audit(user, 'CREDENTIAL_ISSUED', `Certificate for ${course.title} issued (${enr.certificateId}).`);
  // One course at a time: the next course the learner bought opens now.
  const next = courseInProgress(user.id);
  const nextCourse = next && db().courses.find((c) => c.id === next.courseId);
  if (nextCourse) {
    notify(user.id, {
      kind: 'access',
      title: `${nextCourse.title} is open`,
      body: `You finished ${course.title}. Your next course is ready to start.`,
      link: { view: 'learning', courseId: nextCourse.id },
      email: true,
    });
  }
  save();
  return true;
}

/**
 * A lesson completes by itself once every step it has is done (Learn, Check, Apply, Reflect).
 * Call after any step changes. Returns true when the lesson has just been completed.
 */
export function completeLessonIfReady(lesson: Lesson, p: LessonProgress): boolean {
  if (p.status === 'done' || !lessonRequirements(lesson, p).complete) return false;
  p.status = 'done';
  p.completedAt = nowIso();
  if (!p.startedAt) p.startedAt = p.completedAt;
  save();
  return true;
}

/** Admins hear about learners who start to fall behind, at most once a week each (in the LMS only). */
function generateStaffAlerts(staff: UserRecord) {
  const d = db();
  const now = Date.now();
  const week = Math.floor(now / (7 * 86_400_000));
  const courses = d.courses.filter((c) => c.status === 'published' && c.createdBy === staff.id);
  let created = 0;
  for (const course of courses) {
    for (const enr of d.enrollments.filter((e) => e.courseId === course.id && !e.certificateIssuedAt)) {
      if (created >= 3) return;
      const learner = d.users.find((u) => u.id === enr.userId && u.role === 'learner' && u.active);
      if (!learner) continue;
      const snap = snapshotFor(learner, course, now);
      if (!snap.risk.needsSupport) continue;
      const before = d.notifications.length;
      notify(staff.id, {
        kind: 'nudge',
        key: `risk-${learner.id}-${course.id}-${week}`,
        title: `${learner.name} may need support`,
        body: `${course.title}: ${snap.risk.factors.slice(0, 2).map((f) => f.label).join(', ')}.`,
        link: { view: 'cohort', courseId: course.id },
      });
      if (d.notifications.length > before) created += 1;
    }
  }
}

export function generateNudges(user: UserRecord) {
  if (user.role !== 'learner') return generateStaffAlerts(user);
  const d = db();
  const now = Date.now();
  const today = dateKey(now);
  let created = 0;
  const push = (n: Omit<Notification, 'id' | 'userId' | 'createdAt' | 'read'>) => {
    if (created >= 3) return;
    const before = d.notifications.length;
    notify(user.id, n);
    if (d.notifications.length > before) created += 1;
  };

  for (const enr of d.enrollments.filter((e) => e.userId === user.id)) {
    const course = d.courses.find((c) => c.id === enr.courseId);
    if (!course || course.status !== 'published' || enr.certificateIssuedAt || !hasCourseAccess(enr, course)) continue;
    const snap = snapshotFor(user, course, now);
    const lastStudy = d.events
      .filter((e) => e.userId === user.id && e.type === 'study' && e.courseId === course.id)
      .reduce((m, e) => Math.max(m, Date.parse(e.at)), 0);
    if (lastStudy && now - lastStudy > 2 * 86_400_000) {
      push({
        key: `idle-${course.id}-${today}`,
        kind: 'nudge',
        title: `Pick up where you left off in ${course.title}`,
        body: `${snap.nextStep.title} · about ${snap.nextStep.minutes} min.`,
        link: { view: 'dashboard', courseId: course.id },
      });
    }
    const due = snap.topics.find((m) => m.reviewDue);
    if (due)
      push({
        key: `review-${due.lessonId}-${today}`,
        kind: 'nudge',
        title: `Memory boost due: ${due.topic}`,
        body: 'A 3-minute review now helps this stick for the long term.',
        link: { view: 'study', courseId: course.id, lessonId: due.lessonId },
      });
    if (enr.targetDate && snap.completion.estimatedDate && snap.completion.estimatedDate > enr.targetDate)
      push({
        key: `pace-${course.id}-${today}`,
        kind: 'nudge',
        title: 'You are a little behind your target date',
        body: `At your current pace you will finish on ${snap.completion.estimatedDate}. Open the what-if planner to see what closes the gap.`,
        link: { view: 'progress', courseId: course.id },
      });
    if (snap.eligibleForFinal && course.finalExam && !snap.credentialEarned)
      push({
        key: `final-${course.id}`,
        kind: 'nudge',
        title: 'Your final assessment is unlocked',
        body: `All lessons are complete in ${course.title}.`,
        link: { view: 'dashboard', courseId: course.id },
      });
  }
}

/* ------------------------------------------------------------------ */
/* Course validation (course builder)                                  */
/* ------------------------------------------------------------------ */

const BLOCK_TYPES = new Set(['heading', 'paragraph', 'text', 'video', 'audio', 'image', 'quote', 'list', 'link']);
const str = (v: unknown, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');

/** The course's public website listing. Missing or empty input keeps what the course had. */
function cleanListing(input: any, existing?: CourseListing): CourseListing | undefined {
  if (input === undefined) return existing;
  if (!input || typeof input !== 'object') return undefined;
  const category: ListingCategory = input.category === 'build' || input.category === 'domain' ? input.category : 'foundations';
  const n = Number(input.number);
  const slug = str(input.slug, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const needs = str(input.needs, 300).trim();
  return {
    category,
    ...(Number.isInteger(n) && n > 0 && n < 1000 ? { number: n } : {}),
    ...(slug ? { slug } : {}),
    tagline: str(input.tagline, 200).trim(),
    youBuild: str(input.youBuild, 200).trim(),
    ...(needs ? { needs } : {}),
    ...(str(input.summary, 600).trim() ? { summary: str(input.summary, 600).trim() } : {}),
    ...(str(input.takeaway, 200).trim() ? { takeaway: str(input.takeaway, 200).trim() } : {}),
    ...(str(input.suited, 300).trim() ? { suited: str(input.suited, 300).trim() } : {}),
  };
}
const num = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
};
const safeUrl = (v: unknown) => {
  const s = str(v, 2000).trim();
  if (!s) return '';
  if (s.startsWith('/uploads/')) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
};

const cleanKind = (v: unknown): QuestionKind => (v === 'scenario' ? 'scenario' : 'knowledge');

/** Rubric criteria: a label is required; ids stay stable so earlier scores keep their meaning. */
function cleanRubric(v: unknown): RubricCriterion[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out = v
    .map((c: any) => {
      let id = str(c?.id, 60) || uid('rc');
      if (seen.has(id)) id = uid('rc');
      seen.add(id);
      return { id, label: str(c?.label, 300).trim(), description: str(c?.description, 1000).trim() || undefined };
    })
    .filter((c) => c.label)
    .slice(0, 10);
  return out.length ? out : undefined;
}

/** Activity instructions: written content and images only (no video or audio players inside instructions). */
const INSTRUCTION_TYPES = new Set<string>(INSTRUCTION_BLOCK_TYPES);
function cleanInstructionBlocks(v: unknown): ContentBlock[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .slice(0, 60)
    .filter((b: any) => b && INSTRUCTION_TYPES.has(b.type))
    .map(cleanBlock)
    .filter((b): b is ContentBlock => !!b)
    .filter((b) => (b.type === 'image' || b.type === 'link' ? !!b.url : b.type === 'list' ? !!b.items?.length : !!b.text?.trim()));
  return out.length ? out : undefined;
}

/** The rubric PDF: an uploaded .pdf (or an https link) and the total points it awards. */
function cleanRubricPdf(v: any): RubricDocument | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const url = safeUrl(v.url);
  if (!url) return undefined;
  if (url.startsWith('/uploads/') && !/\.pdf$/i.test(url)) fail(400, 'The rubric must be a PDF file.');
  const maxPoints = Number(v.maxPoints);
  if (!Number.isFinite(maxPoints) || maxPoints < 1 || maxPoints > 1000) fail(400, 'Enter the rubric total points (1 to 1000).');
  return { url, name: str(v.name, 200).trim() || 'Rubric.pdf', maxPoints: Math.round(maxPoints * 2) / 2 };
}

/**
 * A Pass / Needs Work rubric: each dimension needs a name and what Pass looks like. Evidence may only
 * point at lessons of this course (checked after the lessons are cleaned). Dimension ids stay stable
 * so earlier decisions keep their meaning.
 */
function cleanPassRubric(v: any): PassRubric | undefined {
  if (!v || typeof v !== 'object' || !Array.isArray(v.dimensions)) return undefined;
  const seen = new Set<string>();
  const dimensions = v.dimensions
    .slice(0, 12)
    .map((d: any) => {
      let id = str(d?.id, 60).trim() || uid('dim');
      if (seen.has(id)) id = uid('dim');
      seen.add(id);
      const evidence = (Array.isArray(d?.evidence) ? d.evidence : []).map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 30);
      return { id, label: str(d?.label, 120).trim(), pass: str(d?.pass, 1500).trim(), evidence: [...new Set<string>(evidence)] };
    })
    .filter((d: { label: string }) => d.label);
  for (const d of dimensions) if (!d.pass) fail(400, `Write what Pass looks like for “${d.label}”.`);
  if (!dimensions.length) return undefined;
  const source = v.source && safeUrl(v.source.url) ? { url: safeUrl(v.source.url), name: str(v.source.name, 200) || 'Rubric' } : undefined;
  return { dimensions, revisionLimit: num(v.revisionLimit, 0, 5, 0), autoEvaluate: v.autoEvaluate === false ? false : undefined, source };
}

function cleanBlock(b: any): ContentBlock | null {
  if (!b || !BLOCK_TYPES.has(b.type)) return null;
  const out: ContentBlock = { id: str(b.id, 60) || uid('b'), type: b.type };
  if (b.text !== undefined) out.text = str(b.text);
  if (b.type === 'heading') out.level = b.level === 3 ? 3 : 2;
  if (b.type === 'text') out.tone = b.tone === 'tip' ? 'tip' : 'info'; // no alarming warning boxes inside lessons
  if (['video', 'audio', 'image', 'link'].includes(b.type)) out.url = safeUrl(b.url);
  if (b.label !== undefined) out.label = str(b.label, 300);
  if (b.attribution !== undefined) out.attribution = str(b.attribution, 300);
  if (b.transcript !== undefined) out.transcript = str(b.transcript);
  if (b.type === 'list') {
    out.items = Array.isArray(b.items) ? b.items.map((i: unknown) => str(i, 1000)).filter(Boolean).slice(0, 100) : [];
    out.ordered = !!b.ordered;
  }
  return out;
}

export function validateCourse(input: any, existing: Course | undefined, actor: UserRecord): Course {
  const title = str(input?.title, 200).trim();
  if (!title) fail(400, 'Course title is required.');
  const modulesIn: any[] = Array.isArray(input.modules) ? input.modules.slice(0, 50) : [];
  const seen = new Set<string>();
  const modules: CourseModule[] = modulesIn.map((m, mi) => ({
    id: str(m?.id, 60) || uid('m'),
    title: str(m?.title, 200).trim() || `Module ${mi + 1}`,
    summary: str(m?.summary, 1000),
    lessons: (Array.isArray(m?.lessons) ? m.lessons.slice(0, 100) : []).map((l: any, li: number): Lesson => {
      let id = str(l?.id, 60) || uid('l');
      if (seen.has(id)) id = uid('l');
      seen.add(id);
      const check = (Array.isArray(l?.check) ? l.check.slice(0, 50) : [])
        .map((q: any) => {
          const options = (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => str(o, 500).trim()).filter(Boolean).slice(0, 6);
          return {
            id: str(q?.id, 60) || uid('q'),
            question: str(q?.question, 1000).trim(),
            options,
            correctIndex: num(q?.correctIndex, 0, Math.max(0, options.length - 1), 0),
            rationale: str(q?.rationale, 2000),
            kind: cleanKind(q?.kind),
            // A lesson question always measures its own lesson's objective, so none is stored.
          };
        })
        .filter((q: any) => q.question && q.options.length >= 2);
      const act = l?.activity;
      return {
        id,
        title: str(l?.title, 200).trim() || `Lesson ${li + 1}`,
        topic: str(l?.topic, 200).trim() || str(l?.title, 200).trim() || `Topic ${li + 1}`,
        estimatedMinutes: num(l?.estimatedMinutes, 1, 600, 15),
        summary: str(l?.summary, 1000),
        blocks: (Array.isArray(l?.blocks) ? l.blocks.slice(0, 300) : []).map(cleanBlock).filter(Boolean) as ContentBlock[],
        check,
        checkSettings: {
          mode: l?.checkSettings?.mode === 'quiz' ? 'quiz' : 'practice',
          timeLimitMin: num(l?.checkSettings?.timeLimitMin, 0, 240, 0),
          attemptsAllowed: num(l?.checkSettings?.attemptsAllowed, 0, 10, 0),
        },
        activity:
          act && str(act.title, 200).trim()
            ? {
                title: str(act.title, 200).trim(),
                instructions: (Array.isArray(act.instructions) ? act.instructions : []).map((s: unknown) => str(s, 1000).trim()).filter(Boolean).slice(0, 30),
                instructionBlocks: cleanInstructionBlocks(act.instructionBlocks),
                fields: (Array.isArray(act.fields) ? act.fields : [])
                  .map((f: any) => ({ id: str(f?.id, 60) || uid('f'), label: str(f?.label, 300).trim(), hint: str(f?.hint, 300), multiline: !!f?.multiline, placeholder: str(f?.placeholder, 500), group: str(f?.group, 120).trim() || undefined }))
                  .filter((f: any) => f.label)
                  .slice(0, 40),
                allowFile: !!act.allowFile,
                rubric: cleanRubric(act.rubric),
                rubricPdf: cleanRubricPdf(act.rubricPdf),
                passRubric: cleanPassRubric(act.passRubric),
                requiredForCertificate: act.requiredForCertificate === true || undefined,
              }
            : undefined,
      };
    }),
  }));

  const g = input.grading ?? {};
  let grading = { checks: num(g.checks, 0, 100, 30), activities: num(g.activities, 0, 100, 10), finalExam: num(g.finalExam, 0, 100, 60) };
  const total = grading.checks + grading.activities + grading.finalExam;
  if (total !== 100) {
    if (total === 0) grading = { checks: 30, activities: 10, finalExam: 60 };
    else fail(400, `Grading weights must add up to 100% (currently ${total}%).`);
  }

  const lessonIds = new Set(modules.flatMap((m) => m.lessons.map((l) => l.id)));
  // Rubric evidence can only point at lessons that are still in this course.
  for (const m of modules)
    for (const l of m.lessons)
      for (const d of l.activity?.passRubric?.dimensions ?? []) d.evidence = (d.evidence ?? []).filter((id) => lessonIds.has(id));
  const fe = input.finalExam;
  const feQuestions = fe && Array.isArray(fe.questions) ? fe.questions : [];
  const finalExam = feQuestions.length
    ? {
        questions: feQuestions
          .slice(0, 200)
          .map((q: any) => {
            const options = (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => str(o, 500).trim()).filter(Boolean).slice(0, 6);
            const objectiveId = str(q?.objectiveId, 60);
            return {
              id: str(q?.id, 60) || uid('q'),
              question: str(q?.question, 1000).trim(),
              options,
              correctIndex: num(q?.correctIndex, 0, Math.max(0, options.length - 1), 0),
              rationale: str(q?.rationale, 2000),
              kind: cleanKind(q?.kind),
              // Only a lesson that exists in this course can be the objective; anything else is course-wide.
              ...(objectiveId && lessonIds.has(objectiveId) ? { objectiveId } : {}),
            };
          })
          .filter((q: any) => q.question && q.options.length >= 2),
        timeLimitMin: num(fe.timeLimitMin, 0, 480, 30),
        attemptsAllowed: num(fe.attemptsAllowed, 0, 10, 2),
      }
    : undefined;

  const now = nowIso();
  // The admin sets the price in Course details. In USD a micro-credential costs less than $150.
  let price = existing?.price ?? 0;
  let priceSet = existing?.priceSet ?? false;
  if (input.priceSet !== false && input.price !== undefined && input.price !== null && input.price !== '') {
    const p = Number(input.price);
    if (!Number.isFinite(p) || p < 0) fail(400, 'Enter a course price of 0 or more.');
    // In USD a micro-credential costs less than $150 (MAX_COURSE_PRICE changes it; no limit in other currencies).
    const currency = gateways().currency;
    const max = Number(process.env.MAX_COURSE_PRICE) || (currency === 'USD' ? 150 : Infinity);
    if (p >= max) fail(400, `A micro-credential must cost less than ${max} ${currency}.`);
    price = p;
    priceSet = true;
  }
  // The selling price: shown struck out on the website when it is higher than the price. Display only.
  let listPrice = existing?.listPrice ?? undefined;
  if (input.listPrice === null || input.listPrice === '') listPrice = undefined;
  else if (input.listPrice !== undefined) {
    const lp = Number(input.listPrice);
    if (!Number.isFinite(lp) || lp < 0 || lp >= 1_000_000) fail(400, 'Enter a selling price of 0 or more, or leave it empty.');
    listPrice = Math.round(lp * 100) / 100;
  }
  const certificateLine = input.certificateLine === undefined ? existing?.certificateLine : str(input.certificateLine, 300).trim() || undefined;
  return {
    id: existing?.id ?? uid('course'),
    title,
    subtitle: str(input.subtitle, 300),
    description: str(input.description, 5000),
    // Certificates are named after the course.
    credentialName: title,
    durationLabel: str(input.durationLabel, 100),
    level: str(input.level, 100) || 'Everyone',
    price: Math.round(price * 100) / 100,
    priceSet,
    ...(listPrice !== undefined ? { listPrice } : {}),
    ...(certificateLine ? { certificateLine } : {}),
    access: input.access === 'invite' ? 'invite' : 'open',
    status: existing?.status ?? 'draft',
    accent: ['blue', 'purple', 'pink', 'green'].includes(input.accent) ? input.accent : 'blue',
    coverImage: safeUrl(input.coverImage) || undefined,
    // The study plan PDF learners download from Resources.
    studyPlan: input.studyPlan && safeUrl(input.studyPlan.url) ? { url: safeUrl(input.studyPlan.url), name: str(input.studyPlan.name, 200) || 'Study plan.pdf' } : undefined,
    passMark: num(input.passMark, 1, 100, 70),
    grading,
    modules,
    finalExam,
    listing: cleanListing(input.listing, existing?.listing),
    createdBy: existing?.createdBy ?? actor.id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
