import { Router } from 'express';
import { markRefunded, sendGatewayRefund } from '../payments';
import { sendSuspensionEmail } from '../accountEmails';
import type { ActivityReview, Course, EvidenceKey, RubricLevel, UserRecord } from '../../shared/types';
import { dateKey, flattenLessons } from '../../shared/analytics';
import { activityRubric, assessmentDesign, canResubmit, canReturnForRevision, hasRubric, needsReview, revisionLimit, rubricKind, versionOf, COURSE_OBJECTIVE, EVIDENCE_LABELS, METRIC_WEIGHTS, questionKind, RUBRIC_MAX } from '../../shared/metrics';
import { evidencePages, runAutoChecks } from '../../shared/autocheck';
import { hashPassword, initials, requireAuth, requireRole, setPassword, toPublic, validatePassword } from '../auth';
import { db, nowIso, save, uid } from '../db';
import { audit, fail, getCourse, getEnrollment, hasCourseAccess, maybeIssueCredential, notify, snapshotFor, validateCourse } from '../services';
import { me, wrap } from './util';
import path from 'node:path';
import { activityInstructionText } from '../../shared/transcript';
import { aiEngine, canTranscribeMedia, suggestPassRubric, suggestRubricScore, transcribeMediaFile } from '../ai';
import { fileExists, nameFromUrl, readUpload, withLocalFile, fileInfo } from '../files';
import { applyReview } from '../review';
import { autoEvaluationAvailable, evaluatesAutomatically, queueEvaluation } from '../evaluator';
import { importRubric } from '../rubricImport';

export const staffRouter = Router();
staffRouter.use(requireAuth, requireRole('instructor'));

/** Admins manage the courses they created. */
export const canManage = (actor: UserRecord, c: Course) => c.createdBy === actor.id;
const myCourses = (actor: UserRecord) => db().courses.filter((c) => canManage(actor, c));
function manageableCourse(actor: UserRecord, id: string): Course {
  const c = getCourse(id);
  if (!canManage(actor, c)) fail(403, 'You can only manage courses you created.');
  return c;
}
const busiestCourseId = (actor: UserRecord) => {
  const d = db();
  return [...myCourses(actor)].sort((a, b) => d.enrollments.filter((e) => e.courseId === b.id).length - d.enrollments.filter((e) => e.courseId === a.id).length)[0]?.id ?? '';
};
const learners = () => db().users.filter((u) => u.role === 'learner');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function learnerCard(u: UserRecord, course: Course) {
  const s = snapshotFor(u, course);
  const enr = getEnrollment(u.id, course.id)!;
  const flat = flattenLessons(course);
  return {
    user: toPublic(u),
    enrolledAt: enr.enrolledAt,
    targetDate: enr.targetDate,
    passConfidence: s.prediction.passConfidence,
    predictedGrade: s.prediction.predictedGrade,
    predictedLetter: s.prediction.predictedLetter,
    // So the Cohort can show an early estimate as a range, the same way the learner sees it.
    evidence: s.prediction.evidence,
    range: s.prediction.range,
    currentGrade: s.prediction.currentGrade,
    avgCheck: s.prediction.avgCheckScore,
    comprehension: s.metrics.comprehension,
    mastery: s.metrics.mastery,
    scoredCheckpoints: s.metrics.scoredCheckpoints,
    activitiesDone: s.engagement.activitiesSubmitted,
    activitiesTotal: flat.filter((f) => f.lesson.activity).length,
    studyDays: s.engagement.activeDaysLast7,
    loginDays: s.engagement.loginDaysLast7,
    avgSession: s.engagement.avgSessionMinutes,
    activeMinutes7: s.engagement.activeMinutesLast7,
    engagement: s.engagement.engagementScore,
    completion: s.completion,
    modules: course.modules.map((m) => {
      const ls = m.lessons;
      const done = ls.filter((l) => enr.lessons[l.id]?.status === 'done').length;
      return { id: m.id, title: m.title, percent: ls.length ? Math.round((done / ls.length) * 100) : 0 };
    }),
    weakAreas: s.weakAreas.slice(0, 3).map((w) => ({ topic: w.topic, score: w.score })),
    risk: s.risk,
    nextStep: s.nextStep.title,
    credential: !!enr.certificateIssuedAt,
    // When this learner was last seen anywhere in the portal, for the inactive list.
    lastActiveAt: db().events.filter((e) => e.userId === u.id).reduce((m, e) => (e.at > m ? e.at : m), ''),
  };
}

/* ---------------- Cohort ---------------- */

staffRouter.get(
  '/cohort',
  wrap((req) => {
    const d = db();
    const actor = me(req);
    const courses = myCourses(actor).filter((c) => c.status === 'published' || d.enrollments.some((e) => e.courseId === c.id));
    const busiest = [...courses].sort((a, b) => d.enrollments.filter((e) => e.courseId === b.id).length - d.enrollments.filter((e) => e.courseId === a.id).length)[0];
    const courseId = typeof req.query.courseId === 'string' && req.query.courseId ? req.query.courseId : busiest?.id;
    if (!courseId) return { courses: [], cards: [], stats: null };
    const course = manageableCourse(actor, courseId);
    const cards = d.enrollments
      // Learners who started a paid course but never paid are not in the cohort.
      .filter((e) => e.courseId === course.id && hasCourseAccess(e, course))
      .map((e) => d.users.find((u) => u.id === e.userId && u.role === 'learner' && u.active))
      .filter((u): u is UserRecord => !!u)
      .map((u) => learnerCard(u, course))
      .sort((a, b) => Number(b.risk.needsSupport) - Number(a.risk.needsSupport) || a.passConfidence - b.passConfidence);
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x !== null);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };
    // Suspended learners stay out of the figures above, but are listed so they can be reinstated.
    const suspended = d.enrollments
      .filter((e) => e.courseId === course.id)
      .map((e) => d.users.find((u) => u.id === e.userId && u.role === 'learner' && !u.active))
      .filter((u): u is UserRecord => !!u)
      .map((u) => toPublic(u));
    return {
      courses: courses.map((c) => ({ id: c.id, title: c.title, status: c.status })),
      course: { id: course.id, title: course.title, passMark: course.passMark },
      cards,
      suspended,
      stats: {
        total: cards.length,
        needsSupport: cards.filter((c) => c.risk.needsSupport).length,
        avgConfidence: avg(cards.map((c) => c.passConfidence)),
        avgCheck: avg(cards.map((c) => c.avgCheck)),
        avgCompletion: avg(cards.map((c) => c.completion.percent)),
        avgEngagement: avg(cards.map((c) => c.engagement)),
        credentials: cards.filter((c) => c.credential).length,
      },
    };
  }),
);

staffRouter.get(
  '/learner/:userId',
  wrap((req) => {
    const d = db();
    const actor = me(req);
    const u = d.users.find((x) => x.id === req.params.userId && x.role === 'learner') ?? fail(404, 'Learner not found.');
    const items = d.enrollments
      .filter((e) => e.userId === u!.id)
      .map((e) => d.courses.find((c) => c.id === e.courseId))
      .filter((c): c is Course => !!c && canManage(actor, c))
      .map((c) => ({ course: c, enrollment: getEnrollment(u!.id, c.id)!, snapshot: snapshotFor(u!, c) }));
    return { user: toPublic(u!), items };
  }),
);

/* ---------------- Learners & access ---------------- */

staffRouter.get(
  '/learners',
  wrap((req) => {
    const d = db();
    const actor = me(req);
    const mine = new Set(myCourses(actor).map((c) => c.id));
    return {
      learners: learners().map((u) => ({
        user: toPublic(u),
        courses: d.enrollments
          .filter((e) => e.userId === u.id && mine.has(e.courseId))
          .map((e) => {
            const c = d.courses.find((x) => x.id === e.courseId);
            const total = c ? flattenLessons(c).length : 0;
            const done = Object.values(e.lessons).filter((p) => p.status === 'done').length;
            return {
              courseId: e.courseId,
              title: c?.title ?? 'Removed course',
              percent: total ? Math.round((done / total) * 100) : 0,
              credential: !!e.certificateIssuedAt,
              // Joined a paid course but has not paid: no access until they pay or you give access.
              awaitingPayment: !!c && !hasCourseAccess(e, c),
              paid: e.access === 'paid',
            };
          }),
        lastActive: d.events.filter((e) => e.userId === u.id).reduce((m, e) => (e.at > m ? e.at : m), ''),
      })),
      courses: myCourses(actor).map((c) => ({ id: c.id, title: c.title, status: c.status })),
    };
  }),
);

staffRouter.post(
  '/learners',
  wrap((req) => {
    const actor = me(req);
    const d = db();
    const name = String(req.body?.name ?? '').trim().slice(0, 100);
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const courseIds: string[] = Array.isArray(req.body?.courseIds) ? req.body.courseIds.map(String) : [];
    if (!EMAIL_RE.test(email)) fail(400, 'Enter a valid email address.');
    let user = d.users.find((u) => u.email.toLowerCase() === email);
    const created = !user;
    if (user && user.role !== 'learner') fail(409, 'That email belongs to a staff account.');
    const courses = courseIds.map((cid) => manageableCourse(actor, cid));
    if (!user) {
      if (name.length < 2) fail(400, 'Enter the learner\'s name.');
      const password = String(req.body?.password ?? '');
      const pwErr = validatePassword(password);
      if (pwErr) fail(400, pwErr);
      user = { id: uid('u'), name, email, role: 'learner', initials: initials(name), active: true, createdAt: nowIso(), onboarded: false, mustChangePassword: false, ...hashPassword(password) };
      d.users.push(user);
      audit(actor, 'ADD_LEARNER', `Added learner ${name} (${email}).`);
    }
    const granted: string[] = [];
    for (const c of courses) {
      const existing = getEnrollment(user.id, c.id);
      if (existing && !hasCourseAccess(existing, c)) {
        existing.grantedBy = actor.id;
        existing.access = 'granted';
        granted.push(c.title);
        notify(user.id, { kind: 'access', title: 'New course access', body: `You now have access to ${c.title}.`, link: { view: 'dashboard', courseId: c.id }, email: true });
      } else if (!existing) {
        d.enrollments.push({ id: uid('enr'), userId: user.id, courseId: c.id, enrolledAt: nowIso(), grantedBy: actor.id, access: 'granted', lessons: {} });
        granted.push(c.title);
        notify(user.id, { kind: 'access', title: 'New course access', body: `You now have access to ${c.title}.`, link: { view: 'dashboard', courseId: c.id }, email: true });
      }
    }
    if (granted.length) audit(actor, 'GRANT_ACCESS', `Granted ${user.name} access to: ${granted.join(', ')}.`);
    save();
    return { user: toPublic(user), created, granted, suspended: !user.active };
  }),
);

staffRouter.post(
  '/access',
  wrap((req) => {
    const actor = me(req);
    const d = db();
    const user = d.users.find((u) => u.id === req.body?.userId && u.role === 'learner') ?? fail(404, 'Learner not found.');
    const c = manageableCourse(actor, String(req.body?.courseId));
    const grant = req.body?.grant !== false;
    const existing = getEnrollment(user!.id, c.id);
    if (grant && existing && !hasCourseAccess(existing, c)) {
      // The learner joined a paid course without paying; the admin now gives access.
      existing.grantedBy = actor.id;
      existing.access = 'granted';
      notify(user!.id, { kind: 'access', title: 'New course access', body: `You now have access to ${c.title}.`, link: { view: 'dashboard', courseId: c.id }, email: true });
      audit(actor, 'GRANT_ACCESS', `Granted ${user!.name} access to ${c.title} (payment waived).`);
    } else if (grant && !existing) {
      d.enrollments.push({ id: uid('enr'), userId: user!.id, courseId: c.id, enrolledAt: nowIso(), grantedBy: actor.id, access: 'granted', lessons: {} });
      notify(user!.id, { kind: 'access', title: 'New course access', body: `You now have access to ${c.title}.`, link: { view: 'dashboard', courseId: c.id }, email: true });
      audit(actor, 'GRANT_ACCESS', `Granted ${user!.name} access to ${c.title}.`);
    } else if (!grant && existing) {
      d.enrollments = d.enrollments.filter((e) => e !== existing);
      audit(actor, 'REVOKE_ACCESS', `Removed ${user!.name} from ${c.title}.`);
    }
    save();
    return { ok: true };
  }),
);

staffRouter.post(
  '/learners/:userId/password',
  wrap((req) => {
    const actor = me(req);
    const user = db().users.find((u) => u.id === req.params.userId && u.role === 'learner') ?? fail(404, 'Learner not found.');
    const password = String(req.body?.password ?? '');
    const pwErr = validatePassword(password);
    if (pwErr) fail(400, pwErr);
    setPassword(user!, password);
    user!.mustChangePassword = false;
    audit(actor, 'SET_PASSWORD', `Set a new password for ${user!.name}.`);
    save();
    return { ok: true };
  }),
);

/**
 * Suspend or reinstate a learner. A suspended learner is signed out on their next action and
 * cannot sign in; their progress and submissions are all kept for when they return.
 */
staffRouter.post(
  '/learners/:userId/suspend',
  wrap(async (req) => {
    const actor = me(req);
    const user = db().users.find((u) => u.id === req.params.userId && u.role === 'learner') ?? fail(404, 'Learner not found.');
    const suspend = req.body?.suspend === true;
    let emailed = false;
    if (suspend && user!.active) {
      const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
      user!.active = false;
      user!.suspension = { at: nowIso(), byId: actor.id, byName: actor.name, ...(reason ? { reason } : {}) };
      audit(actor, 'SUSPEND_LEARNER', `Suspended ${user!.name} (${user!.email})${reason ? `: ${reason}` : '.'}`);
      save();
      // A polite notice to the address the learner signs in with (USAII Terms of Use, support contact).
      emailed = await sendSuspensionEmail(user!);
      if (!emailed) console.warn(`[suspend] No suspension email was sent to ${user!.email} (email is not set up or failed).`);
    } else if (!suspend && !user!.active) {
      user!.active = true;
      delete user!.suspension;
      notify(user!.id, { kind: 'access', title: 'Your account is active again', body: 'Your account is active again. Welcome back.', link: { view: 'dashboard' }, email: true });
      audit(actor, 'REINSTATE_LEARNER', `Reinstated ${user!.name} (${user!.email}).`);
    }
    save();
    return { user: toPublic(user!), emailed };
  }),
);

/** The admin's review of one activity: a decision plus feedback (the same rules as the automatic evaluation). */
staffRouter.post(
  '/activity-feedback',
  wrap((req) => {
    const actor = me(req);
    const { userId, courseId, lessonId } = req.body ?? {};
    // Permission first: only the course's own admin can review its work.
    const course = manageableCourse(actor, String(courseId));
    const lesson = flattenLessons(course).find((f) => f.lesson.id === String(lessonId))?.lesson ?? fail(404, 'Lesson not found.');
    const r = applyReview({
      course,
      lesson: lesson!,
      learnerId: String(userId),
      decision: req.body?.decision,
      feedback: req.body?.feedback,
      dimensions: req.body?.dimensions,
      rubricPoints: req.body?.rubricPoints,
      criteria: req.body?.rubric,
      admin: actor,
    });
    return { ok: true, activity: r.activity, credentialIssued: r.credentialIssued };
  }),
);

/** What this server can do automatically (shown in Course Builder and Assessments). */
staffRouter.get('/capabilities', (_req, res) => {
  res.json({ ai: aiEngine(), autoEvaluation: autoEvaluationAvailable() });
});

/** Read an uploaded rubric file (Word, PDF or text) into Pass / Needs Work dimensions for the admin to check. */
staffRouter.post(
  '/rubric-import',
  wrap(async (req) => {
    me(req);
    return importRubric(String(req.body?.url ?? ''));
  }),
);

/** Re-run the automatic evaluation of one submission (for example after the AI service was down). */
staffRouter.post(
  '/auto-evaluate',
  wrap((req) => {
    const actor = me(req);
    const course = manageableCourse(actor, String(req.body?.courseId ?? ''));
    const lesson = flattenLessons(course).find((f) => f.lesson.id === String(req.body?.lessonId ?? ''))?.lesson ?? fail(404, 'Lesson not found.');
    if (!evaluatesAutomatically(lesson!.activity)) fail(400, autoEvaluationAvailable() ? 'This activity is not set to be evaluated automatically.' : 'Automatic evaluation needs ANTHROPIC_API_KEY or GEMINI_API_KEY on the server.');
    const sub = getEnrollment(String(req.body?.userId ?? ''), course.id)?.lessons[lesson!.id]?.activity ?? fail(404, 'No submission found.');
    if (sub!.review) fail(400, 'This version already has a decision.');
    queueEvaluation(course.id, String(req.body.userId), lesson!.id);
    return { ok: true };
  }),
);

/** How many submitted activities in this admin's courses are waiting for a review (the menu badge). */
staffRouter.get(
  '/review-count',
  wrap((req) => {
    const d = db();
    let awaiting = 0;
    for (const course of myCourses(me(req)))
      for (const e of d.enrollments.filter((x) => x.courseId === course.id))
        for (const f of flattenLessons(course)) {
          const a = e.lessons[f.lesson.id]?.activity;
          if (a && !a.review && needsReview(f.lesson.activity)) awaiting += 1;
        }
    return { awaiting };
  }),
);

/** Every activity submitted in one course, or in all of the admin's courses. */
staffRouter.get(
  '/submissions',
  wrap((req) => {
    const d = db();
    const actor = me(req);
    const mine = myCourses(actor);
    const want = String(req.query.courseId || 'all');
    const courses = want === 'all' ? mine : [manageableCourse(actor, want)];
    const learnerIds = new Set(d.users.filter((u) => u.role === 'learner').map((u) => u.id));
    const submissions = courses.flatMap((course) =>
      d.enrollments
        .filter((e) => e.courseId === course.id && learnerIds.has(e.userId))
        .flatMap((e) =>
          flattenLessons(course)
            .filter((f) => f.lesson.activity && e.lessons[f.lesson.id]?.activity)
            .map((f) => {
              const u = d.users.find((x) => x.id === e.userId)!;
              const act = f.lesson.activity!;
              const sub = e.lessons[f.lesson.id].activity!;
              const kind = rubricKind(act);
              return {
                userId: u.id,
                learnerName: u.name,
                learnerEmail: u.email,
                courseId: course.id,
                courseTitle: course.title,
                lessonId: f.lesson.id,
                lessonTitle: f.lesson.title,
                activityTitle: act.title,
                fieldLabels: Object.fromEntries(act.fields.map((x) => [x.id, x.label])),
                rubric: kind === 'criteria' ? act.rubric ?? [] : [],
                rubricPdf: kind === 'pdf' ? act.rubricPdf : undefined,
                passRubric: kind === 'pass' ? act.passRubric : undefined,
                rubricKind: kind,
                // Activities without a rubric that the certificate does not wait for are complete once submitted.
                needsReview: needsReview(act),
                requiredForCertificate: !!act.requiredForCertificate,
                version: versionOf(sub),
                canReturn: canReturnForRevision(act, sub),
                autoCheck: runAutoChecks({ course, lesson: f.lesson, fields: sub.fields, enrollment: e }),
                instructions: activityInstructionText(act),
                submission: sub,
              };
            }),
        ),
    );
    submissions.sort((a, b) => b.submission.submittedAt.localeCompare(a.submission.submittedAt));
    return { courses: mine.map((c) => ({ id: c.id, title: c.title })), submissions, aiAvailable: !!aiEngine() };
  }),
);

/**
 * The earlier pages a Pass / Needs Work rubric draws on (for a capstone: the learner's Day 1 to 9 work),
 * loaded when the admin opens the review, so the list itself stays light.
 */
staffRouter.get(
  '/submission-evidence',
  wrap((req) => {
    const actor = me(req);
    const course = manageableCourse(actor, String(req.query.courseId ?? ''));
    const lesson = flattenLessons(course).find((f) => f.lesson.id === String(req.query.lessonId ?? ''))?.lesson ?? fail(404, 'Lesson not found.');
    const enr = getEnrollment(String(req.query.userId ?? ''), course.id) ?? fail(404, 'Enrollment not found.');
    return { pages: evidencePages(course, lesson!, enr!) };
  }),
);

/* ---------------- Assessments ---------------- */

staffRouter.get(
  '/assessments',
  wrap((req) => {
    const d = db();
    const actor = me(req);
    const course = manageableCourse(actor, String(req.query.courseId || busiestCourseId(actor)));
    const enrs = d.enrollments.filter((e) => e.courseId === course.id);
    const nameOf = (id: string) => d.users.find((u) => u.id === id)?.name ?? 'Unknown';
    const emailOf = (id: string) => d.users.find((u) => u.id === id)?.email ?? '';
    const lessons = flattenLessons(course).map((f) => {
      const attempts = enrs.flatMap((e) => (e.lessons[f.lesson.id]?.attempts ?? []).filter((a) => a.kind === 'check'));
      const firsts = enrs.map((e) => e.lessons[f.lesson.id]?.attempts.find((a) => a.kind === 'check')).filter(Boolean) as { score: number; answers: number[] }[];
      const bests = enrs
        .map((e) => (e.lessons[f.lesson.id]?.attempts ?? []).filter((a) => a.kind === 'check').map((a) => a.score))
        .filter((xs) => xs.length)
        .map((xs) => Math.max(...xs));
      const questions = f.lesson.check.map((q, qi) => {
        const answered = firsts.filter((a) => a.answers[qi] !== undefined && a.answers[qi] >= 0);
        const correct = answered.filter((a) => a.answers[qi] === q.correctIndex).length;
        return { id: q.id, question: q.question, answered: answered.length, percentCorrect: answered.length ? Math.round((correct / answered.length) * 100) : null };
      });
      return {
        lessonId: f.lesson.id,
        title: f.lesson.title,
        moduleTitle: f.module.title,
        mode: f.lesson.checkSettings.mode,
        questionCount: f.lesson.check.length,
        learnersAttempted: firsts.length,
        attempts: attempts.length,
        avgFirst: firsts.length ? Math.round(firsts.reduce((a, b) => a + b.score, 0) / firsts.length) : null,
        avgBest: bests.length ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length) : null,
        questions,
      };
    });
    const submissions = enrs.flatMap((e) =>
      flattenLessons(course)
        .filter((f) => e.lessons[f.lesson.id]?.activity)
        .map((f) => ({
          userId: e.userId,
          learnerName: nameOf(e.userId),
          learnerEmail: emailOf(e.userId),
          lessonId: f.lesson.id,
          lessonTitle: f.lesson.title,
          activityTitle: f.lesson.activity?.title ?? '',
          fieldLabels: Object.fromEntries((f.lesson.activity?.fields ?? []).map((x) => [x.id, x.label])),
          submission: e.lessons[f.lesson.id]!.activity!,
        })),
    ).sort((a, b) => b.submission.submittedAt.localeCompare(a.submission.submittedAt));
    const finals = enrs
      .filter((e) => e.finalExam?.attempts.length)
      .map((e) => ({ learnerName: nameOf(e.userId), attempts: e.finalExam!.attempts.map((a) => ({ at: a.at, score: a.score })), passed: e.finalExam!.attempts.some((a) => a.score >= course.passMark) }));
    return { course: { id: course.id, title: course.title, passMark: course.passMark }, courses: myCourses(actor).map((c) => ({ id: c.id, title: c.title })), lessons, submissions, finals };
  }),
);

/* ---------------- Comprehension and Mastery ---------------- */

type MetricFlag = 'not_measured' | 'completed_needs_practice' | 'concepts' | 'application' | 'building' | 'on_track';

/**
 * Cohort analytics for the two learning metrics: who is measured, who needs what kind of help,
 * which learning objectives and rubric criteria are weakest, and whether the course's own
 * assessment design gives the metrics the evidence they need.
 */
staffRouter.get(
  '/metrics',
  wrap((req) => {
    const d = db();
    const actor = me(req);
    const cid = String(req.query.courseId || busiestCourseId(actor));
    if (!cid) return { course: null, courses: [] };
    const course = manageableCourse(actor, cid);
    const P = course.passMark;
    const flat = flattenLessons(course);
    const people = d.enrollments
      .filter((e) => e.courseId === course.id)
      .map((e) => ({ e, u: d.users.find((u) => u.id === e.userId && u.role === 'learner' && u.active) }))
      .filter((x): x is { e: typeof x.e; u: UserRecord } => !!x.u);

    const snaps = people.map(({ e, u }) => ({ e, u, s: snapshotFor(u, course) }));
    const rows = snaps.map(({ e, u, s }) => {
      const m = s.metrics;
      const allDone = s.completion.lessonsTotal > 0 && s.completion.lessonsDone === s.completion.lessonsTotal;
      let flag: MetricFlag;
      if (m.comprehension === null) flag = 'not_measured';
      else if (allDone && (m.mastery ?? m.comprehension) < P) flag = 'completed_needs_practice';
      else if (m.comprehension < P) flag = 'concepts';
      else if (m.mastery !== null && m.mastery < P) flag = 'application';
      else if (m.mastery === null) flag = 'building';
      else flag = 'on_track';
      return {
        user: toPublic(u),
        completion: s.completion.percent,
        lessonsDone: s.completion.lessonsDone,
        lessonsTotal: s.completion.lessonsTotal,
        credential: !!e.certificateIssuedAt,
        comprehension: m.comprehension,
        mastery: m.mastery,
        checkpoints: m.scoredCheckpoints,
        awaitingScore: m.awaitingScore,
        flag,
      };
    });

    const avg = (xs: (number | null | undefined)[]) => {
      const v = xs.filter((x): x is number => typeof x === 'number');
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };
    const bands = (vals: (number | null)[]) => {
      const edges = [
        { label: 'Below 60%', lo: 0, hi: Math.min(60, P) },
        { label: `60% to ${P - 1}%`, lo: 60, hi: P },
        { label: `${P}% and above`, lo: P, hi: 101 },
      ].filter((b) => b.hi > b.lo);
      return [
        ...edges.map((b) => ({ label: b.label, count: vals.filter((v) => v !== null && v >= b.lo && v < b.hi).length, tone: b.lo >= P ? 'good' : b.lo >= 60 ? 'near' : 'low' })),
        { label: 'Not measured yet', count: vals.filter((v) => v === null).length, tone: 'none' },
      ];
    };

    // Evidence, averaged over learners who have that evidence.
    const keys: EvidenceKey[] = ['knowledgeChecks', 'scenarioJudgment', 'finalKnowledge', 'appliedActivities', 'finalScenario'];
    const evidence = keys.map((k) => {
      const vals = snaps.map(({ s }) => [...s.metrics.comprehensionParts, ...s.metrics.masteryParts].find((p) => p.key === k)?.score ?? null);
      const weight = k in METRIC_WEIGHTS.comprehension ? (METRIC_WEIGHTS.comprehension as Record<string, number>)[k] : (METRIC_WEIGHTS.mastery as Record<string, number>)[k];
      return { key: k, label: EVIDENCE_LABELS[k], metric: k in METRIC_WEIGHTS.comprehension ? 'comprehension' : 'mastery', weight, avg: avg(vals), learners: vals.filter((v) => v !== null).length };
    });

    // Learning objectives, in course order, with a course-wide row only when it has data.
    const objIds = [...flat.map((f) => f.lesson.id), COURSE_OBJECTIVE];
    const objectives = objIds
      .map((id) => {
        const f = flat.find((x) => x.lesson.id === id);
        const vals = snaps.map(({ s }) => s.metrics.objectives.find((o) => o.objectiveId === id));
        const comp = vals.map((o) => o?.comprehension ?? null);
        const mast = vals.map((o) => o?.mastery ?? null);
        return {
          objectiveId: id,
          title: f ? f.lesson.topic || f.lesson.title : 'Whole course (final assessment)',
          where: f ? `Module ${f.moduleIndex}, lesson ${f.lessonIndex}` : 'Final assessment',
          comprehension: avg(comp),
          comprehensionLearners: comp.filter((v) => v !== null).length,
          mastery: avg(mast),
          masteryLearners: mast.filter((v) => v !== null).length,
        };
      })
      .filter((o) => o.objectiveId !== COURSE_OBJECTIVE || o.comprehensionLearners || o.masteryLearners);

    // Rubric criteria: which observable parts of the applied work are weakest.
    const rubrics = flat
      .filter((f) => hasRubric(f.lesson.activity))
      .map((f) => {
        const results = people.map(({ e }) => (e.lessons[f.lesson.id]?.activity ? activityRubric(e.lessons[f.lesson.id]) : undefined)).filter((x): x is NonNullable<typeof x> => !!x);
        const awaiting = people.filter(({ e }) => {
          const a = e.lessons[f.lesson.id]?.activity;
          return a && !a.rubric;
        }).length;
        return {
          lessonId: f.lesson.id,
          lessonTitle: f.lesson.title,
          activityTitle: f.lesson.activity!.title,
          scored: results.length,
          awaiting,
          avgPercent: avg(results.map((r) => r.percent)),
          kind: rubricKind(f.lesson.activity),
          rubricPdf: f.lesson.activity!.rubricPdf?.url ? { name: f.lesson.activity!.rubricPdf.name, url: f.lesson.activity!.rubricPdf.url, maxPoints: f.lesson.activity!.rubricPdf.maxPoints } : undefined,
          // Score bands for PDF rubrics: how many learners scored 80%+, 50-79%, under 50%.
          bands: {
            high: results.filter((r) => r.percent >= 80).length,
            mid: results.filter((r) => r.percent >= 50 && r.percent < 80).length,
            low: results.filter((r) => r.percent < 50).length,
          },
          // Pass / Needs Work: how many learners passed each dimension (latest scored version).
          criteria: rubricKind(f.lesson.activity) === 'pass'
            ? f.lesson.activity!.passRubric!.dimensions.map((dim) => {
                const marks = results.map((r) => r.dimensions?.find((x) => x.id === dim.id)?.pass).filter((x): x is boolean => x !== undefined);
                const met = marks.filter(Boolean).length;
                return { id: dim.id, label: dim.label, met, partially: 0, notMet: marks.length - met, percent: marks.length ? Math.round((met / marks.length) * 100) : null };
              })
            : (rubricKind(f.lesson.activity) === 'criteria' ? f.lesson.activity!.rubric ?? [] : []).map((c) => {
            const lv = results.map((r) => r.scores.find((x) => x.id === c.id)?.level).filter((x): x is RubricLevel => x !== undefined);
            return {
              id: c.id,
              label: c.label,
              met: lv.filter((x) => x === 2).length,
              partially: lv.filter((x) => x === 1).length,
              notMet: lv.filter((x) => x === 0).length,
              percent: lv.length ? Math.round((lv.reduce<number>((a, b) => a + b, 0) / (lv.length * RUBRIC_MAX)) * 100) : null,
            };
          }),
        };
      });

    // Final assessment items: percent correct on each learner's most recent attempt.
    const fq = course.finalExam?.questions ?? [];
    const lessonTitle = (id?: string) => flat.find((f) => f.lesson.id === id)?.lesson.title;
    const finalItems = fq.map((q, qi) => {
      const latest = people.map(({ e }) => e.finalExam?.attempts.at(-1)).filter((a): a is NonNullable<typeof a> => !!a);
      const answered = latest
        .map((a) => (a.items ? a.items.find((it) => it.qid === q.id)?.correct : a.answers.length === fq.length ? a.answers[qi] === q.correctIndex : undefined))
        .filter((x): x is boolean => x !== undefined);
      return {
        id: q.id,
        question: q.question,
        kind: questionKind(q),
        objective: lessonTitle(q.objectiveId) ?? 'Whole course',
        answered: answered.length,
        percentCorrect: answered.length ? Math.round((answered.filter(Boolean).length / answered.length) * 100) : null,
      };
    });

    const comps = rows.map((r) => r.comprehension);
    const masts = rows.map((r) => r.mastery);
    return {
      course: { id: course.id, title: course.title, passMark: P },
      courses: myCourses(actor).map((c) => ({ id: c.id, title: c.title })),
      weights: METRIC_WEIGHTS,
      summary: {
        learners: rows.length,
        avgComprehension: avg(comps),
        comprehensionMeasured: comps.filter((v) => v !== null).length,
        avgMastery: avg(masts),
        masteryMeasured: masts.filter((v) => v !== null).length,
        completedNeedsPractice: rows.filter((r) => r.flag === 'completed_needs_practice').length,
        applicationGap: rows.filter((r) => r.flag === 'application').length,
        awaitingScore: rows.reduce((a, r) => a + r.awaitingScore, 0),
      },
      distribution: { comprehension: bands(comps), mastery: bands(masts) },
      evidence,
      objectives,
      rubrics,
      // Forecast accuracy: how close the projected grade was to the final assessment result.
      forecast: (() => {
        const log = people.flatMap(({ e }) => e.forecastLog ?? []);
        if (!log.length) return { attempts: 0, meanError: null, withinRange: null };
        return {
          attempts: log.length,
          meanError: Math.round(log.reduce((a, x) => a + Math.abs(x.predictedGrade - x.finalScore), 0) / log.length),
          withinRange: Math.round((log.filter((x) => x.finalScore >= x.low && x.finalScore <= x.high).length / log.length) * 100),
        };
      })(),
      finalItems,
      design: assessmentDesign(course),
      rows: rows.sort((a, b) => (a.mastery ?? a.comprehension ?? 999) - (b.mastery ?? b.comprehension ?? 999)),
    };
  }),
);

/* ---------------- Activity metrics ---------------- */

staffRouter.get(
  '/activity',
  wrap((req) => {
    const d = db();
    const actor = me(req);
    const cid = String(req.query.courseId || busiestCourseId(actor));
    if (!cid) return { course: null, courses: [], rows: [], days: [] };
    const course = manageableCourse(actor, cid);
    const ids = new Set(d.enrollments.filter((e) => e.courseId === course.id).map((e) => e.userId));
    const people = d.users.filter((u) => ids.has(u.id) && u.role === 'learner');
    const rows = people.map((u) => {
      const s = snapshotFor(u, course);
      return { userId: u.id, name: u.name, initials: u.initials, engagement: s.engagement };
    });
    const now = Date.now();
    const days: { date: string; minutes: number; logins: number; activeLearners: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const k = dateKey(now - i * 86_400_000);
      let minutes = 0;
      let logins = 0;
      let activeLearners = 0;
      for (const r of rows) {
        const day = r.engagement.daily.find((x) => x.date === k);
        if (day) {
          minutes += day.minutes;
          if (day.login) logins += 1;
          if (day.minutes > 0) activeLearners += 1;
        }
      }
      days.push({ date: k, minutes, logins, activeLearners });
    }
    // Where the class is on Steps to Completion: how many learners are on each step right now.
    const flat = flattenLessons(course);
    const hasFinal = !!course.finalExam?.questions.length;
    const stepLabels = [...flat.map((_, i) => `Lesson ${i + 1}`), ...(hasFinal ? ['Final'] : [])];
    const onStep = new Array(stepLabels.length + 1).fill(0); // the last slot is "Certified"
    let stalled = 0;
    for (const u of people) {
      const e = getEnrollment(u.id, course.id);
      if (!e) continue;
      if (e.certificateIssuedAt) {
        onStep[stepLabels.length] += 1;
        continue;
      }
      const firstOpen = flat.findIndex((f) => e.lessons[f.lesson.id]?.status !== 'done');
      onStep[firstOpen === -1 ? flat.length : firstOpen] += 1;
      // Stuck: no progress on any step for 7 days or more.
      const touches = Object.values(e.lessons).flatMap((p) => [p.startedAt, p.completedAt, ...p.attempts.map((a) => a.at), p.activity?.submittedAt]).filter(Boolean) as string[];
      const last = touches.sort().at(-1) ?? e.enrolledAt;
      if (Date.now() - Date.parse(last) >= 7 * 86_400_000) stalled += 1;
    }
    const steps = { labels: [...stepLabels, 'Certified'], counts: onStep, stalled };

    // Resources: the Study Guide viewer and PDF, and learners downloading their own work.
    // ("playbook_download" is the name 5.0 used for the same event.)
    const ev = d.events.filter((e) => e.courseId === course.id && ids.has(e.userId));
    const is = (e: { type: string }, t: string) => e.type === t || (t === 'work_download' && e.type === 'playbook_download');
    const count = (t: string) => ev.filter((e) => is(e, t)).length;
    const who = (t: string) => new Set(ev.filter((e) => is(e, t)).map((e) => e.userId)).size;
    const resources = {
      guideViews: count('guide_view'),
      guideViewers: who('guide_view'),
      guideDownloads: count('guide_download'),
      workViews: count('work_view'),
      workViewers: who('work_view'),
      workDownloads: count('work_download'),
      workDownloaders: who('work_download'),
    };

    // Learner feedback: one voice per learner, their latest answer.
    const latest = <T extends { userId: string; createdAt: string }>(list: T[]) => {
      const m = new Map<string, T>();
      for (const f of list) if (!m.has(f.userId) || m.get(f.userId)!.createdAt < f.createdAt) m.set(f.userId, f);
      return [...m.values()];
    };
    const fb = d.feedback.filter((f) => ids.has(f.userId));
    const votes = latest(fb.filter((f) => f.kind === 'recommend'));
    const courseStars = latest(fb.filter((f) => f.kind === 'course' && f.courseId === course.id && f.stars));
    const lmsStars = latest(fb.filter((f) => f.kind === 'platform' && f.stars));
    const avg = (xs: { stars?: number }[]) => (xs.length ? Math.round((xs.reduce((a, f) => a + (f.stars ?? 0), 0) / xs.length) * 10) / 10 : null);
    const feedback = {
      recommendYes: votes.filter((f) => f.recommend).length,
      recommendAnswered: votes.length,
      usaiiYes: lmsStars.filter((f) => f.recommendUsaii === true).length,
      usaiiAnswered: lmsStars.filter((f) => typeof f.recommendUsaii === 'boolean').length,
      courseRating: avg(courseStars),
      courseRatings: courseStars.length,
      lmsRating: avg(lmsStars),
      lmsRatings: lmsStars.length,
      comments: fb
        .filter((f) => f.comment?.trim() && (f.kind === 'platform' || f.courseId === course.id))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5)
        .map((f) => ({ id: f.id, name: d.users.find((u) => u.id === f.userId)?.name ?? 'Learner', comment: f.comment, stars: f.stars ?? null, about: f.kind === 'platform' ? 'The LMS' : f.kind === 'course' ? 'This course' : 'Check-in', at: f.createdAt })),
    };

    return { course: { id: course.id, title: course.title }, courses: myCourses(actor).map((c) => ({ id: c.id, title: c.title })), rows, days, steps, resources, feedback };
  }),
);

/* ---------------- Learner feedback (everything from Give Feedback and the check-in) ---------------- */

staffRouter.get(
  '/feedback',
  wrap((req) => {
    const d = db();
    const actor = me(req);
    const courses = myCourses(actor);
    const courseIds = new Set(courses.map((c) => c.id));
    const sel = String(req.query.courseId || 'all');
    const learners = new Map(d.users.filter((u) => u.role === 'learner').map((u) => [u.id, u]));
    const title = (id?: string) => courses.find((c) => c.id === id)?.title;
    const entries = d.feedback
      .filter((f) => learners.has(f.userId))
      .map((f) => ({ ...f, kind: f.kind ?? ('pulse' as const) }))
      // Course ratings and check-ins belong to a course; only that course's staff see them.
      .filter((f) => (f.kind === 'course' || (f.kind === 'pulse' && f.courseId) ? !!f.courseId && courseIds.has(f.courseId) : true))
      .filter((f) => sel === 'all' || f.kind === 'platform' || f.kind === 'recommend' || f.courseId === sel)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((f) => {
        const u = learners.get(f.userId)!;
        return {
          id: f.id,
          kind: f.kind,
          learner: { id: u.id, name: u.name, email: u.email, initials: u.initials },
          courseId: f.courseId ?? null,
          courseTitle: title(f.courseId) ?? null,
          stars: f.stars ?? null,
          recommend: f.kind === 'recommend' || f.kind === 'pulse' ? f.recommend : null,
          recommendUsaii: f.kind === 'platform' && typeof f.recommendUsaii === 'boolean' ? f.recommendUsaii : null,
          ease: f.kind === 'pulse' && f.ease ? f.ease : null,
          comment: f.comment?.trim() ?? '',
          at: f.createdAt,
        };
      });
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    const of = (k: string) => entries.filter((e) => e.kind === k);
    const yesPct = (xs: { recommend: boolean | null }[]) => (xs.length ? Math.round((xs.filter((x) => x.recommend).length / xs.length) * 100) : null);
    return {
      courses: courses.map((c) => ({ id: c.id, title: c.title })),
      selected: sel,
      summary: {
        recommendUsaii: yesPct(of('recommend')),
        recommendUsaiiAnswers: of('recommend').length,
        courseRating: avg(of('course').map((e) => e.stars!).filter(Boolean)),
        courseRatings: of('course').length,
        lmsRating: avg(of('platform').map((e) => e.stars!).filter(Boolean)),
        lmsRatings: of('platform').length,
        recommendLms: yesPct(of('platform').filter((e) => e.recommendUsaii !== null).map((e) => ({ recommend: e.recommendUsaii }))),
        recommendLmsAnswers: of('platform').filter((e) => e.recommendUsaii !== null).length,
        checkinRecommend: yesPct(of('pulse')),
        checkinEase: avg(of('pulse').map((e) => e.ease!).filter(Boolean)),
        checkins: of('pulse').length,
        comments: entries.filter((e) => e.comment).length,
      },
      entries,
    };
  }),
);

/* ---------------- Website enquiries ("Get More Details") ---------------- */

staffRouter.get(
  '/enquiries',
  wrap(() => {
    const d = db();
    const title = new Map(d.courses.map((c) => [c.id, c.title]));
    return { enquiries: (d.enquiries ?? []).map((e) => ({ ...e, courseTitle: e.courseId ? title.get(e.courseId) ?? null : null })) };
  }),
);

staffRouter.post(
  '/enquiries/:id/contacted',
  wrap((req) => {
    const actor = me(req);
    const e = (db().enquiries ?? []).find((x) => x.id === req.params.id) ?? fail(404, 'Enquiry not found.');
    if (req.body?.contacted === false) {
      delete e.contactedAt;
      delete e.contactedBy;
    } else {
      e.contactedAt = nowIso();
      e.contactedBy = actor.name;
    }
    save();
    return { enquiry: e };
  }),
);

staffRouter.delete(
  '/enquiries/:id',
  wrap((req) => {
    const actor = me(req);
    const d = db();
    const e = (d.enquiries ?? []).find((x) => x.id === req.params.id) ?? fail(404, 'Enquiry not found.');
    d.enquiries = (d.enquiries ?? []).filter((x) => x.id !== e.id);
    audit(actor, 'DELETE_ENQUIRY', `Deleted the website enquiry from ${e.name}.`);
    save();
    return { ok: true };
  }),
);

/* ---------------- Course builder ---------------- */

staffRouter.get(
  '/courses',
  wrap((req) => {
    const d = db();
    const actor = me(req);
    return {
      courses: myCourses(actor).map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: c.subtitle,
        status: c.status,
        accent: c.accent,
        price: c.price,
        priceSet: !!c.priceSet,
        modules: c.modules.length,
        lessons: flattenLessons(c).length,
        learners: d.enrollments.filter((e) => e.courseId === c.id).length,
        createdBy: d.users.find((u) => u.id === c.createdBy)?.name ?? 'Unknown',
        createdById: c.createdBy,
        updatedAt: c.updatedAt,
      })),
    };
  }),
);

staffRouter.get('/courses/:id', wrap((req) => ({ course: manageableCourse(me(req), req.params.id) })));

staffRouter.post(
  '/courses',
  wrap((req) => {
    const actor = me(req);
    const course = validateCourse(req.body ?? {}, undefined, actor);
    db().courses.push(course);
    audit(actor, 'CREATE_COURSE', `Created course "${course.title}".`);
    save();
    return { course };
  }),
);

staffRouter.put(
  '/courses/:id',
  wrap((req) => {
    const actor = me(req);
    const d = db();
    const existing = manageableCourse(actor, req.params.id);
    const updated = validateCourse(req.body ?? {}, existing, actor);
    d.courses = d.courses.map((c) => (c.id === existing.id ? updated : c));
    audit(actor, 'UPDATE_COURSE', `Updated course "${updated.title}".`);
    save();
    return { course: updated };
  }),
);

staffRouter.post(
  '/courses/:id/status',
  wrap((req) => {
    const actor = me(req);
    const c = manageableCourse(actor, req.params.id);
    const status = req.body?.status === 'published' ? 'published' : 'draft';
    if (status === 'published' && !flattenLessons(c).length) fail(400, 'Add at least one lesson before publishing.');
    if (status === 'published' && !c.priceSet) fail(400, 'Set the course price in Course details before publishing.');
    // Things that look unfinished: shown once, and published only when the admin confirms.
    if (status === 'published' && c.status !== 'published' && req.body?.confirm !== true) {
      const warnings = publishWarnings(c);
      if (warnings.length) return { needsConfirm: true, warnings };
    }
    c.status = status;
    c.updatedAt = nowIso();
    audit(actor, status === 'published' ? 'PUBLISH_COURSE' : 'UNPUBLISH_COURSE', `${status === 'published' ? 'Published' : 'Unpublished'} "${c.title}".`);
    save();
    return { course: c };
  }),
);

staffRouter.post(
  '/courses/:id/duplicate',
  wrap((req) => {
    const actor = me(req);
    const c = manageableCourse(actor, req.params.id);
    const copy = validateCourse({ ...JSON.parse(JSON.stringify(c)), title: `${c.title} (copy)` }, undefined, actor);
    // Fresh ids for modules and lessons so progress never collides. Everything that points at a lesson
    // (final assessment objectives, rubric evidence) follows it to its new id.
    const newId = new Map<string, string>();
    copy.modules = copy.modules.map((m) => ({ ...m, id: uid('m'), lessons: m.lessons.map((l) => { const id = uid('l'); newId.set(l.id, id); return { ...l, id }; }) }));
    for (const q of copy.finalExam?.questions ?? []) if (q.objectiveId) q.objectiveId = newId.get(q.objectiveId);
    for (const m of copy.modules)
      for (const l of m.lessons)
        for (const dim of l.activity?.passRubric?.dimensions ?? []) dim.evidence = (dim.evidence ?? []).map((id) => newId.get(id)).filter((x): x is string => !!x);
    db().courses.push(copy);
    audit(actor, 'DUPLICATE_COURSE', `Duplicated "${c.title}".`);
    save();
    return { course: copy };
  }),
);

staffRouter.delete(
  '/courses/:id',
  wrap((req) => {
    const actor = me(req);
    const d = db();
    const c = getCourse(req.params.id);
    const enrolled = d.enrollments.filter((e) => e.courseId === c.id).length;
    {
      if (c.createdBy !== actor.id) fail(403, 'Only the admin who created this course can delete it.');
      if (enrolled) fail(400, 'This course has learners. Unpublish it instead.');
    }
    d.courses = d.courses.filter((x) => x.id !== c.id);
    d.enrollments = d.enrollments.filter((e) => e.courseId !== c.id);
    audit(actor, 'DELETE_COURSE', `Deleted "${c.title}" (${enrolled} enrollments removed).`);
    save();
    return { ok: true };
  }),
);

/** What a learner would find missing or broken in this course. */
function publishWarnings(c: Course): string[] {
  const out: string[] = [];
  const flat = flattenLessons(c);
  const emptyVideo = flat.filter((f) => f.lesson.blocks.some((b) => b.type === 'video' && !b.url)).map((f) => f.lesson.title.split(':')[0]);
  if (emptyVideo.length) out.push(`${emptyVideo.length} lesson(s) have a video slot with no video yet (${emptyVideo.join(', ')}). Learners see the text that introduces the video, but no player.`);
  const noFields = flat.filter((f) => f.lesson.activity && !f.lesson.activity.fields.length && !f.lesson.activity.allowFile).map((f) => f.lesson.title);
  if (noFields.length) out.push(`These activities have nothing a learner can submit: ${noFields.join(', ')}.`);
  for (const f of flat.filter((x) => x.lesson.activity?.requiredForCertificate)) {
    const act = f.lesson.activity!;
    const kind = rubricKind(act);
    if (!kind) out.push(`"${act.title}" holds the certificate but has no rubric, so an admin must approve every submission by hand.`);
    else if (kind === 'pass' && act.passRubric!.autoEvaluate !== false && !autoEvaluationAvailable())
      out.push(`"${act.title}" is set to be evaluated automatically, but no AI key is set on the server, so an admin must review every submission.`);
    else if (kind === 'pdf') out.push(`"${act.title}" uses a points rubric PDF, which an admin scores by hand. Import it as a Pass / Needs Work rubric to have it evaluated automatically.`);
  }
  if (!c.finalExam?.questions.length) out.push('This course has no final assessment.');
  return out;
}

/* ---------------- Rubric PDF: AI-suggested score ---------------- */

/** Read a rubric PDF: an uploaded file, or an https link (up to 15 MB). */
async function readRubricPdf(url: string): Promise<Buffer> {
  if (nameFromUrl(url)) {
    const buf = await readUpload(url, 15 * 1024 * 1024);
    if (!buf) fail(404, 'The rubric PDF file is missing or larger than 15 MB. Upload it again in Course Builder.');
    return buf!;
  }
  if (!/^https:\/\//.test(url)) fail(400, 'The rubric must be an uploaded PDF or an https link.');
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r?.ok) fail(502, 'Could not download the rubric PDF.');
  const buf = Buffer.from(await r!.arrayBuffer());
  if (buf.length > 15 * 1024 * 1024) fail(400, 'The rubric PDF is larger than 15 MB.');
  return buf;
}

/**
 * Suggest a rubric score for one submission by reading the admin's rubric PDF.
 * The suggestion only pre-fills the review form; the admin decides.
 */
staffRouter.post(
  '/rubric-suggest',
  wrap(async (req) => {
    const actor = me(req);
    const course = manageableCourse(actor, String(req.body?.courseId ?? ''));
    const lessonId = String(req.body?.lessonId ?? '');
    const lesson = flattenLessons(course).find((f) => f.lesson.id === lessonId)?.lesson ?? fail(404, 'Lesson not found.');
    const act = lesson.activity;
    const kind = rubricKind(act);
    if (kind !== 'pdf' && kind !== 'pass') fail(400, 'This activity has no rubric. Add one in Course Builder first.');
    const enr = getEnrollment(String(req.body?.userId ?? ''), course.id) ?? fail(404, 'Enrollment not found.');
    const sub = enr.lessons[lessonId]?.activity ?? fail(404, 'No submission found.');
    if (!aiEngine()) fail(409, 'AI scoring suggestions need ANTHROPIC_API_KEY or GEMINI_API_KEY in the .env file.');
    if (kind === 'pass') {
      // Pass / Needs Work: the model reads the dimensions, the evidence package and the earlier pages.
      const suggestion = await suggestPassRubric({
        dimensions: act!.passRubric!.dimensions,
        activityTitle: act!.title,
        instructions: activityInstructionText(act!),
        answers: act!.fields.map((f) => ({ label: f.label, value: sub.fields[f.id] ?? '' })),
        pages: evidencePages(course, lesson, enr),
        attachmentName: sub.fileName,
      });
      if (!suggestion) fail(502, 'The AI service could not evaluate this submission. Please decide yourself or try again.');
      audit(actor, 'RUBRIC_AI_SUGGEST', `AI rubric suggestion for "${act!.title}" (${course.title}).`);
      return { suggestion };
    }
    const pdf = await readRubricPdf(act!.rubricPdf!.url);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') fail(400, 'The rubric file is not a valid PDF.');
    const suggestion = await suggestRubricScore({
      rubricPdf: pdf,
      maxPoints: act!.rubricPdf!.maxPoints,
      activityTitle: act!.title,
      instructions: activityInstructionText(act!),
      answers: act!.fields.map((f) => ({ label: f.label, value: sub.fields[f.id] ?? '' })),
      attachmentName: sub.fileName,
    });
    if (!suggestion) fail(502, 'The AI service could not evaluate this submission. Please score it yourself or try again.');
    audit(actor, 'RUBRIC_AI_SUGGEST', `AI rubric suggestion for "${act!.title}" (${course.title}).`);
    return { suggestion };
  }),
);

/* ---------------- Video and audio: automatic transcript ---------------- */

const MEDIA_MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.flac': 'audio/flac',
};

staffRouter.post(
  '/transcribe',
  wrap(async (req) => {
    const actor = me(req);
    if (!canTranscribeMedia()) fail(409, 'Automatic transcripts need GEMINI_API_KEY in the .env file. You can still paste a transcript or upload a caption file (.vtt, .srt, .txt).');
    const url = String(req.body?.url ?? '');
    const name = nameFromUrl(url);
    if (!name) fail(400, 'Automatic transcripts work for videos uploaded to the LMS. For YouTube or Vimeo, paste the transcript instead.');
    if (!(await fileExists(url))) fail(404, 'The video file was not found. Upload it again.');
    const mime = MEDIA_MIME[path.extname(name!).toLowerCase()];
    if (!mime) fail(400, 'Use an MP4, MOV, WebM, MP3, M4A, or WAV file.');
    if (((await fileInfo(name!))?.size ?? 0) > 2 * 1024 * 1024 * 1024) fail(400, 'The file is too large to transcribe (2 GB maximum).');
    try {
      const transcript = await withLocalFile(url, (file) => transcribeMediaFile(file, mime!));
      audit(actor, 'TRANSCRIBE_MEDIA', `Generated a transcript for ${name}.`);
      return { transcript };
    } catch (e) {
      fail(502, (e as Error).message);
    }
  }),
);

/* ---------------- Refund requests (Payments) ---------------- */

/** Refund requests from learners (24 hour policy, 20% deduction). Nothing is refunded until an admin approves. */
staffRouter.get(
  '/refunds',
  wrap((req) => {
    const actor = me(req);
    const d = db();
    const rows = (d.payments ?? [])
      .filter((p) => p.refund)
      .filter((p) => {
        try {
          manageableCourse(actor, p.courseId);
          return true;
        } catch {
          return false;
        }
      })
      .map((p) => {
        const u = d.users.find((x) => x.id === p.userId);
        const c = d.courses.find((x) => x.id === p.courseId);
        return { id: p.id, learnerName: u?.name ?? 'Learner', learnerEmail: u?.email ?? '', courseTitle: c?.title ?? p.courseId, provider: p.provider, currency: p.currency, amount: p.amount, paidAt: p.paidAt ?? p.createdAt, requestedAt: p.refund!.requestedAt, deduction: p.refund!.deduction, refundAmount: p.refund!.amount, status: p.refund!.status, error: p.refund!.error, decidedAt: p.refund!.decidedAt };
      })
      .sort((a, b) => Number(b.status === 'pending' || b.status === 'failed') - Number(a.status === 'pending' || a.status === 'failed') || b.requestedAt.localeCompare(a.requestedAt));
    return { refunds: rows, pending: rows.filter((r) => r.status === 'pending' || r.status === 'failed').length };
  }),
);

staffRouter.post(
  '/refunds/:paymentId',
  wrap(async (req) => {
    const actor = me(req);
    const d = db();
    const p = (d.payments ?? []).find((x) => x.id === req.params.paymentId) ?? fail(404, 'Payment not found.');
    const course = manageableCourse(actor, p!.courseId);
    const r = p!.refund ?? fail(400, 'This payment has no refund request.');
    if (r!.status !== 'pending' && r!.status !== 'failed') fail(400, `This request is already ${r!.status}.`);
    const learner = d.users.find((u) => u.id === p!.userId);
    const amt = (n: number) => `${(n / 100).toFixed(2)} ${p!.currency}`;
    const decision = req.body?.decision;
    if (decision === 'decline') {
      r!.status = 'declined';
      r!.decidedAt = nowIso();
      r!.decidedBy = actor.id;
      audit(actor, 'REFUND_DECLINED', `Declined the refund request of ${learner?.name ?? p!.userId} for ${course.title}.`);
      if (learner) notify(learner.id, { kind: 'access', key: `refund-decision-${p!.id}`, title: 'Refund request declined', body: `Your refund request for ${course.title} was reviewed and declined. Your access to the course continues. If you have questions, please contact support.`, email: true });
      save();
      return { ok: true, status: r!.status };
    }
    if (decision !== 'approve') fail(400, 'Choose approve or decline.');
    try {
      r!.gatewayRefundId = await sendGatewayRefund(p!, r!.amount);
      r!.status = 'refunded';
      r!.error = undefined;
      r!.decidedAt = nowIso();
      r!.decidedBy = actor.id;
      audit(actor, 'REFUND_APPROVED', `Approved and sent a refund of ${amt(r!.amount)} to ${learner?.name ?? p!.userId} for ${course.title} (${p!.provider} ${r!.gatewayRefundId}).`);
      markRefunded(p!); // closes the course and emails the learner
    } catch (e) {
      r!.status = 'failed';
      r!.error = String((e as Error)?.message ?? e).slice(0, 300);
      save();
      fail(502, `The payment gateway did not accept the refund: ${r!.error} You can try again.`);
    }
    save();
    return { ok: true, status: r!.status };
  }),
);
