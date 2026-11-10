import { Router } from 'express';
import { certificateLineFor } from '../../shared/certificateText';
import type { CheckAttempt, CheckQuestion, LessonProgress } from '../../shared/types';
import { attemptsLeft, emptyProgress, lessonRequirements } from '../../shared/analytics';
import { buildItems, canResubmit, certificateGate, needsReview, versionOf } from '../../shared/metrics';
import { ACTIVITY_FIELD_MAX } from '../../shared/autocheck';
import { requireAuth, requireRole, supportLine } from '../auth';
import { db, nowIso, save, uid } from '../db';
import {
  audit,
  completeLessonIfReady,
  fail,
  findLesson,
  getCourse,
  getActiveEnrollment,
  getEnrollment,
  hasCourseAccess,
  notifyCourseStaff,
  maybeIssueCredential,
  notify,
  notifyStaff,
  recordEvent,
  requireEnrollment,
  sanitizeCourse,
  snapshotFor, requireTurn, waitingFor } from '../services';
import { me, wrap } from './util';
import { paymentPublicConfig, refundAmountFor, REFUND_DEDUCTION, REFUND_WINDOW_HOURS } from '../payments';
import type { Payment } from '../../shared/types';
import { evaluatesAutomatically, queueEvaluation } from '../evaluator';

export const learnerRouter = Router();
learnerRouter.use(requireAuth, requireRole('learner'));

const lessonProgress = (enr: ReturnType<typeof requireEnrollment>, lessonId: string): LessonProgress => {
  if (!enr.lessons[lessonId]) enr.lessons[lessonId] = emptyProgress();
  return enr.lessons[lessonId];
};

/**
 * Grade answers against the answer key. `objectiveFor` records which learning objective each
 * question measured, so Comprehension and Mastery stay correct even if the course is edited later.
 */
function grade(questions: CheckQuestion[], answers: unknown, objectiveFor: (q: CheckQuestion) => string | undefined) {
  const arr = Array.isArray(answers) ? answers : [];
  const results = questions.map((q, i) => {
    const chosen = Number.isInteger(arr[i]) ? (arr[i] as number) : -1;
    return { questionId: q.id, chosen, correct: chosen === q.correctIndex, correctIndex: q.correctIndex, rationale: q.rationale };
  });
  const score = questions.length ? Math.round((results.filter((r) => r.correct).length / questions.length) * 100) : 0;
  const chosen = results.map((r) => r.chosen);
  return { score, results, answers: chosen, items: buildItems(questions, chosen, objectiveFor) };
}

/** Everything the learner home needs: enrolled courses with live analytics. */
learnerRouter.get(
  '/home',
  wrap((req) => {
    const u = me(req);
    const d = db();
    // Only courses the learner may actually open: free, paid for, or given by an admin.
    const items = d.enrollments
      .filter((e) => e.userId === u.id)
      .map((e) => ({ e, c: d.courses.find((c) => c.id === e.courseId) }))
      .filter((x) => !!x.c && x.c.status === 'published' && hasCourseAccess(x.e, x.c))
      .map((x) => x.c!)
      .map((c) => ({ course: sanitizeCourse(c), enrollment: getEnrollment(u.id, c.id)!, snapshot: snapshotFor(u, c), waitingFor: waitingFor(u.id, c.id) }));
    const askedFeedback = d.feedback.some((f) => f.userId === u.id && (f.kind ?? 'pulse') === 'pulse' && Date.now() - Date.parse(f.createdAt) < 30 * 86_400_000);
    const lessonsDone = items.reduce((a, i) => a + i.snapshot.completion.lessonsDone, 0);
    return { items, feedbackDue: !askedFeedback && lessonsDone >= 2 };
  }),
);

learnerRouter.get(
  '/catalog',
  wrap((req) => {
    const u = me(req);
    const d = db();
    return {
      payments: paymentPublicConfig(),
      courses: d.courses
        .filter((c) => c.status === 'published')
        .map((c) => ({
          id: c.id,
          title: c.title,
          subtitle: c.subtitle,
          description: c.description,
          credentialName: c.credentialName,
          durationLabel: c.durationLabel,
          level: c.level,
          price: c.price,
          access: c.access,
          accent: c.accent,
          coverImage: c.coverImage,
          modules: c.modules.map((m) => ({ title: m.title, lessons: m.lessons.length })),
          lessons: c.modules.reduce((a, m) => a + m.lessons.length, 0),
          minutes: c.modules.reduce((a, m) => a + m.lessons.reduce((b, l) => b + l.estimatedMinutes, 0), 0),
          hasFinal: !!c.finalExam?.questions.length,
          enrolled: !!getActiveEnrollment(u.id, c.id),
          waitingFor: getActiveEnrollment(u.id, c.id) ? waitingFor(u.id, c.id) : null,
          learners: d.enrollments.filter((e) => e.courseId === c.id && hasCourseAccess(e, c)).length,
          requested: d.notifications.some((n) => !!n.key && n.key.startsWith(`req-${u.id}-${c.id}-`)),
        })),
    };
  }),
);

learnerRouter.post(
  '/enroll/:courseId',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    if (c.status !== 'published') fail(404, 'Course not available.');
    if (c.access !== 'open') fail(403, 'This course is by invitation. Use "Request access" and an admin will respond.');
    // A paid course is never opened here. It opens only after the payment gateway confirms the
    // payment (see server/routes/payments.ts), or when an admin gives access.
    if (c.price > 0) {
      if (getActiveEnrollment(u.id, c.id)) return { ok: true };
      fail(402, 'This course needs payment before it opens. Use "Enroll" on Explore Courses to pay.');
    }
    const existing = getEnrollment(u.id, c.id);
    if (!existing) {
      db().enrollments.push({ id: uid('enr'), userId: u.id, courseId: c.id, enrolledAt: nowIso(), access: 'free', lessons: {} });
      audit(u, 'ENROLL', `Enrolled in ${c.title} (free).`);
      save();
    } else if (!existing.access) {
      existing.access = 'free';
      save();
    }
    return { ok: true };
  }),
);

learnerRouter.post(
  '/request-access/:courseId',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    notifyStaff({
      key: `req-${u.id}-${c.id}`,
      kind: 'access',
      title: `Access request: ${u.name}`,
      body: `${u.name} (${u.email}) asked to join ${c.title}.`,
      link: { view: 'learners' },
    });
    return { ok: true };
  }),
);

learnerRouter.get(
  '/course/:courseId',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    return { course: sanitizeCourse(c), enrollment: enr, snapshot: snapshotFor(u, c), waitingFor: waitingFor(u.id, c.id) };
  }),
);

learnerRouter.post(
  '/course/:courseId/target-date',
  wrap((req) => {
    const u = me(req);
    const enr = requireEnrollment(u.id, req.params.courseId);
    const date = String(req.body?.date ?? '');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'Invalid date.');
    enr.targetDate = date || undefined;
    save();
    return { enrollment: enr };
  }),
);

learnerRouter.post(
  '/lesson/:courseId/:lessonId/open',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    requireTurn(u.id, c.id); // one course at a time
    findLesson(c, req.params.lessonId);
    const p = lessonProgress(enr, req.params.lessonId);
    if (p.status === 'not_started') {
      p.status = 'in_progress';
      p.startedAt = nowIso();
    }
    save();
    return { progress: p, enrollment: enr };
  }),
);

/** Light usage signals from the learner portal, so admins can see which resources get used. */
const TRACKABLE = new Set(['guide_view', 'guide_download', 'work_view', 'work_download', 'plan_view']);
learnerRouter.post(
  '/track',
  wrap((req) => {
    const u = me(req);
    const type = String(req.body?.type ?? '');
    const courseId = String(req.body?.courseId ?? '');
    if (!TRACKABLE.has(type)) fail(400, 'Unknown event.');
    if (!getActiveEnrollment(u.id, courseId)) fail(403, 'You do not have access to this course.');
    if (waitingFor(u.id, courseId)) return { ok: true };
    // One view per half hour is enough: reopening the viewer should not inflate the count.
    const recent = db().events.some((e) => e.userId === u.id && e.courseId === courseId && e.type === type && Date.now() - Date.parse(e.at) < 30 * 60_000);
    if (!(type === 'guide_view' && recent)) recordEvent(u.id, type as 'guide_view', courseId);
    return { ok: true };
  }),
);

learnerRouter.post(
  '/heartbeat',
  wrap((req) => {
    const u = me(req);
    const { courseId, lessonId } = req.body ?? {};
    const seconds = Math.max(0, Math.min(60, Math.round(Number(req.body?.seconds) || 0)));
    if (!seconds || typeof courseId !== 'string') return { ok: true };
    const enr = getActiveEnrollment(u.id, courseId);
    if (!enr || waitingFor(u.id, courseId)) return { ok: true };
    if (typeof lessonId === 'string' && enr.lessons[lessonId]) enr.lessons[lessonId].activeSeconds += seconds;
    recordEvent(u.id, 'study', courseId, seconds);
    return { ok: true };
  }),
);

learnerRouter.post(
  '/lesson/:courseId/:lessonId/quiz-start',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    requireTurn(u.id, c.id); // one course at a time
    const lesson = findLesson(c, req.params.lessonId);
    const p = lessonProgress(enr, lesson.id);
    if (attemptsLeft(lesson, p) <= 0) fail(400, 'You have used all attempts for this quiz.');
    if (p.status === 'not_started') {
      p.status = 'in_progress';
      p.startedAt = nowIso();
    }
    const open =
      p.quizStartedAt &&
      !p.attempts.some((a) => Date.parse(a.at) >= Date.parse(p.quizStartedAt!)) &&
      (!lesson.checkSettings.timeLimitMin || Date.now() - Date.parse(p.quizStartedAt) < lesson.checkSettings.timeLimitMin * 60_000);
    if (!open) p.quizStartedAt = nowIso();
    save();
    return { quizStartedAt: p.quizStartedAt, serverNow: nowIso() };
  }),
);

learnerRouter.post(
  '/lesson/:courseId/:lessonId/check',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    requireTurn(u.id, c.id); // one course at a time
    const lesson = findLesson(c, req.params.lessonId);
    if (!lesson.check.length) fail(400, 'This lesson has no check.');
    const p = lessonProgress(enr, lesson.id);
    const graded = attemptsLeft(lesson, p) > 0;
    // Timed quizzes must be started first. Submissions after the timer are accepted as auto-submissions
    // (the client submits whatever was answered when time runs out).
    if (lesson.checkSettings.mode === 'quiz' && graded && !p.quizStartedAt) fail(400, 'Start the quiz first.');
    const g = grade(lesson.check, req.body?.answers, () => lesson.id);
    const wasDone = p.status === 'done';
    const attempt: CheckAttempt = { at: nowIso(), score: g.score, answers: g.answers, kind: graded ? 'check' : 'review', items: g.items };
    p.attempts.push(attempt);
    p.quizStartedAt = undefined;
    if (p.status === 'not_started') {
      p.status = 'in_progress';
      p.startedAt = nowIso();
    }
    if (wasDone) p.lastReviewedAt = nowIso();
    recordEvent(u.id, 'check', c.id);
    const lessonCompleted = completeLessonIfReady(lesson, p);
    const issued = maybeIssueCredential(u, c);
    save();
    return { attempt, results: g.results, graded, lessonCompleted, credentialIssued: issued, snapshot: snapshotFor(u, c), enrollment: enr };
  }),
);

learnerRouter.get(
  '/lesson/:courseId/:lessonId/answer-key',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    requireTurn(u.id, c.id); // one course at a time
    const lesson = findLesson(c, req.params.lessonId);
    const p = enr.lessons[lesson.id];
    if (!p?.attempts.length) fail(403, 'The answer key unlocks after your first attempt.');
    if (lesson.checkSettings.mode === 'quiz' && attemptsLeft(lesson, p!) > 0 && p!.quizStartedAt) fail(403, 'Finish your quiz first.');
    return { questions: lesson.check, lastAnswers: p!.attempts[p!.attempts.length - 1].answers };
  }),
);

learnerRouter.post(
  '/lesson/:courseId/:lessonId/activity',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    requireTurn(u.id, c.id); // one course at a time
    const lesson = findLesson(c, req.params.lessonId);
    if (!lesson.activity) fail(400, 'This lesson has no activity.');
    const fieldsIn = req.body?.fields ?? {};
    const fields: Record<string, string> = {};
    for (const f of lesson.activity!.fields) {
      const v = String(fieldsIn[f.id] ?? '');
      // Never cut a learner's work short without telling them.
      if (v.length > ACTIVITY_FIELD_MAX) fail(400, `“${f.label}” is longer than ${ACTIVITY_FIELD_MAX.toLocaleString('en-US')} characters. Shorten it, or attach it as a file.`);
      fields[f.id] = v;
    }
    const fileUrl = typeof req.body?.fileUrl === 'string' && req.body.fileUrl.startsWith('/uploads/') ? req.body.fileUrl : undefined;
    const hasText = Object.values(fields).some((v) => v.trim().length >= 3);
    if (!hasText && !fileUrl) fail(400, 'Write a response or attach a file before submitting.');
    const p = lessonProgress(enr, lesson.id);
    // A rubric with a revision limit: approved work is final, and once the revision is used the decision stands.
    if (!canResubmit(lesson.activity, p.activity))
      fail(
        400,
        p.activity!.review === 'approved'
          ? 'This activity is approved and final. Nothing more to do here.'
          : 'You have used the revision this rubric allows, so the decision is final. Read the feedback on the activity.',
      );
    if (p.status === 'not_started') {
      p.status = 'in_progress';
      p.startedAt = nowIso();
    }
    const before = p.activity;
    p.activity = {
      fields,
      // A new version after a review; editing work that is not reviewed yet keeps its version.
      version: before ? versionOf(before) + (before.review ? 1 : 0) : 1,
      fileUrl,
      fileName: fileUrl ? String(req.body?.fileName ?? 'Attachment').slice(0, 200) : undefined,
      submittedAt: nowIso(),
      // A resubmission starts a fresh review, but keeps what the admin said last time.
      // The latest rubric score is kept too: it stays the Mastery evidence until the new version is scored.
      // Editing an unreviewed version again keeps the earlier review as it was.
      ...(before && (before.review || before.feedback || before.rubric)
        ? {
            previous: {
              review: before.review,
              feedback: before.feedback,
              by: before.reviewedBy ?? before.feedbackBy,
              at: before.reviewedAt ?? before.feedbackAt,
              submittedAt: before.submittedAt,
              rubric: before.rubric ?? before.previous?.rubric,
            },
          }
        : before?.previous
          ? { previous: before.previous }
          : {}),
    };
    // Work with a rubric is evaluated automatically when that is on; otherwise it reaches the course's
    // admin (in the LMS, and by email when set up).
    if (evaluatesAutomatically(lesson.activity)) queueEvaluation(c.id, u.id, lesson.id);
    else if (needsReview(lesson.activity) && (!before || before.review))
      notifyCourseStaff(c, {
        kind: 'review',
        title: before ? `Revised work to review: ${lesson.activity!.title}` : `New work to review: ${lesson.activity!.title}`,
        body: `${u.name} ${before ? 'resubmitted' : 'submitted'} "${lesson.activity!.title}" in ${c.title}. It is waiting in Assessments.`,
        link: { view: 'assessments' },
        email: true,
      });
    recordEvent(u.id, 'activity', c.id);
    const lessonCompleted = completeLessonIfReady(lesson, p);
    const issued = maybeIssueCredential(u, c);
    save();
    return { progress: p, lessonCompleted, credentialIssued: issued, snapshot: snapshotFor(u, c), enrollment: enr };
  }),
);

learnerRouter.post(
  '/lesson/:courseId/:lessonId/reflect',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    requireTurn(u.id, c.id); // one course at a time
    const lesson = findLesson(c, req.params.lessonId);
    const p = lessonProgress(enr, lesson.id);
    const conf = Number(req.body?.selfConfidence);
    if (conf >= 1 && conf <= 5) p.selfConfidence = Math.round(conf);
    if (typeof req.body?.reflection === 'string') p.reflection = req.body.reflection.slice(0, 5000);
    if (p.status === 'not_started') {
      p.status = 'in_progress';
      p.startedAt = nowIso();
    }
    const lessonCompleted = completeLessonIfReady(lesson, p);
    const issued = lessonCompleted ? maybeIssueCredential(u, c) : false;
    save();
    return { progress: p, lessonCompleted, credentialIssued: issued, snapshot: snapshotFor(u, c), enrollment: enr };
  }),
);

learnerRouter.post(
  '/lesson/:courseId/:lessonId/complete',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    requireTurn(u.id, c.id); // one course at a time
    const lesson = findLesson(c, req.params.lessonId);
    const p = lessonProgress(enr, lesson.id);
    const r = lessonRequirements(lesson, p);
    if (!r.checkDone) fail(400, 'Take the knowledge check before completing this lesson.');
    if (!r.activityDone) fail(400, 'Submit the activity before completing this lesson.');
    if (!r.reflectDone) fail(400, 'Answer the Reflect question before completing this lesson.');
    completeLessonIfReady(lesson, p);
    const issued = maybeIssueCredential(u, c);
    save();
    return { progress: p, credentialIssued: issued, snapshot: snapshotFor(u, c), enrollment: enr };
  }),
);

/* ---------------- Final assessment ---------------- */

learnerRouter.post(
  '/final/:courseId/start',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    requireTurn(u.id, c.id); // one course at a time
    const fe = c.finalExam;
    if (!fe?.questions.length) fail(400, 'This course has no final assessment.');
    const snap = snapshotFor(u, c);
    if (!snap.eligibleForFinal) fail(400, 'Complete every lesson to unlock the final assessment.');
    enr.finalExam ??= { attempts: [] };
    if (enr.finalExam.attempts.some((a) => a.score >= c.passMark)) fail(400, 'You have already passed the final assessment.');
    if (fe!.attemptsAllowed && enr.finalExam.attempts.length >= fe!.attemptsAllowed) fail(400, 'No attempts remaining.');
    const st = enr.finalExam.startedAt;
    const stillOpen = st && !enr.finalExam.attempts.some((a) => Date.parse(a.at) >= Date.parse(st)) && (!fe!.timeLimitMin || Date.now() - Date.parse(st) < fe!.timeLimitMin * 60_000);
    if (!stillOpen) enr.finalExam.startedAt = nowIso();
    save();
    return { startedAt: enr.finalExam.startedAt, serverNow: nowIso(), questions: sanitizeCourse(c).finalExam!.questions, timeLimitMin: fe!.timeLimitMin };
  }),
);

learnerRouter.post(
  '/final/:courseId/submit',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    requireTurn(u.id, c.id); // one course at a time
    const fe = c.finalExam;
    if (!fe?.questions.length || !enr.finalExam?.startedAt) fail(400, 'Start the final assessment first.');
    const st = Date.parse(enr.finalExam!.startedAt!);
    if (enr.finalExam!.attempts.some((a) => Date.parse(a.at) >= st)) fail(400, 'This attempt was already submitted.');
    // The time limit is enforced here too (with 60 s of grace for slow connections), not only on the timer.
    if (fe!.timeLimitMin && Date.now() - st > fe!.timeLimitMin * 60_000 + 60_000) fail(400, 'The time for this attempt has ended. Start a new attempt if you have one left.');
    // Record the forecast exactly as it stood before this result, so forecast accuracy can be measured later.
    const before = snapshotFor(u, c);
    const lessonIds = new Set(c.modules.flatMap((m) => m.lessons.map((l) => l.id)));
    const g = grade(fe!.questions, req.body?.answers, (q) => (q.objectiveId && lessonIds.has(q.objectiveId) ? q.objectiveId : undefined));
    const attempt: CheckAttempt = { at: nowIso(), score: g.score, answers: g.answers, kind: 'check', items: g.items };
    enr.finalExam!.attempts.push(attempt);
    (enr.forecastLog ??= []).push({
      at: attempt.at,
      predictedGrade: before.prediction.predictedGrade,
      low: before.prediction.range.low,
      high: before.prediction.range.high,
      passConfidence: before.prediction.passConfidence,
      evidence: before.prediction.evidence,
      comprehension: before.metrics.comprehension,
      mastery: before.metrics.mastery,
      finalScore: g.score,
    });
    recordEvent(u.id, 'final', c.id);
    const passed = g.score >= c.passMark;
    const issued = maybeIssueCredential(u, c);
    if (!passed) {
      notify(u.id, {
        kind: 'nudge',
        title: 'Your final result is in',
        body: `You scored ${g.score}%. Review your weakest topics before your next attempt.`,
        link: { view: 'progress', courseId: c.id },
      });
    }
    save();
    return { attempt, passed, passMark: c.passMark, results: g.results, credentialIssued: issued, snapshot: snapshotFor(u, c), enrollment: enr };
  }),
);

/* ---------------- Purchases and refunds (Settings) ---------------- */

/**
 * Refund policy: a learner can apply for a refund ONLY within the first 24 hours after paying for a course
 * (and before its certificate is issued). Applying sends a request to the admins (Payments, Refund requests);
 * nothing is refunded automatically. When an admin approves, 80% of the price (20% deduction) goes back
 * through the same gateway and the course closes. The Apply for Refund button shows only inside the window.
 */
function purchaseView(p: Payment, userId: string) {
  const d = db();
  const c = d.courses.find((x) => x.id === p.courseId);
  const enr = d.enrollments.find((e) => e.userId === userId && e.courseId === p.courseId);
  const paidAt = p.paidAt ?? p.createdAt;
  const until = Date.parse(paidAt) + REFUND_WINDOW_HOURS * 3_600_000;
  let reason = '';
  if (p.status === 'refunded') reason = 'Refunded.';
  else if (p.status !== 'paid') reason = 'This payment did not complete.';
  else if (p.amount <= 0) reason = 'Free enrollments have nothing to refund.';
  else if (p.refund?.status === 'pending' || p.refund?.status === 'failed') reason = 'Your refund request is waiting for admin review.';
  else if (p.refund?.status === 'declined') reason = 'Your refund request was declined.';
  else if (Date.now() > until) reason = `The ${REFUND_WINDOW_HOURS} hour refund window has closed.`;
  else if (enr?.certificateIssuedAt) reason = 'The certificate for this course has already been issued, so it cannot be refunded.';
  return {
    id: p.id, courseId: p.courseId, courseTitle: c?.title ?? 'Course', amount: p.amount, currency: p.currency, provider: p.provider,
    paidAt, status: p.status, refundableUntil: new Date(until).toISOString(), refundable: !reason, reason,
    refundAmount: refundAmountFor(p.amount), deduction: p.amount - refundAmountFor(p.amount), refund: p.refund ?? null, refundedAt: p.refundedAt ?? null,
  };
}

learnerRouter.get(
  '/purchases',
  wrap((req) => {
    const u = me(req);
    const list = (db().payments ?? []).filter((p) => p.userId === u.id && (p.status === 'paid' || p.status === 'refunded')).sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt));
    return { windowHours: REFUND_WINDOW_HOURS, deductionPercent: Math.round(REFUND_DEDUCTION * 100), purchases: list.map((p) => purchaseView(p, u.id)) };
  }),
);

learnerRouter.post(
  '/purchases/:paymentId/refund',
  wrap((req) => {
    const u = me(req);
    const p = (db().payments ?? []).find((x) => x.id === req.params.paymentId && x.userId === u.id) ?? fail(404, 'Purchase not found.');
    const v = purchaseView(p!, u.id);
    // Strictly within the first 24 hours after buying (checked again here, not only in the browser).
    if (!v.refundable) fail(400, v.reason || 'This purchase cannot be refunded.');
    const amount = refundAmountFor(p!.amount);
    p!.refund = { requestedAt: nowIso(), amount, deduction: p!.amount - amount, status: 'pending' };
    const c = db().courses.find((x) => x.id === p!.courseId);
    const amt = (n: number) => `${(n / 100).toFixed(2)} ${p!.currency}`;
    audit(u, 'REFUND_REQUESTED', `Refund requested for ${c?.title ?? p!.courseId}: ${amt(amount)} of ${amt(p!.amount)} (20% deduction).`);
    notify(u.id, { kind: 'access', key: `refund-request-${p!.id}`, title: 'Refund request received', body: `We received your refund request for ${c?.title ?? 'your course'}. If it is approved, ${amt(amount)} (the price less the 20% deduction) is returned to your original payment method. We will email you the decision.`, email: true });
    if (c) notifyCourseStaff(c, { kind: 'access', key: `refund-request-${p!.id}`, title: `Refund request: ${u.name}`, body: `${u.name} (${u.email}) asked for a refund of ${amt(amount)} for ${c.title}. Review it in Payments, Refund requests.`, link: { view: 'payments' }, email: true });
    save();
    return { purchase: purchaseView(p!, u.id) };
  }),
);

/* ---------------- Credential ---------------- */

learnerRouter.get(
  '/credential/:courseId',
  wrap((req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    const enr = requireEnrollment(u.id, c.id);
    const snap = snapshotFor(u, c);
    return {
      earned: !!enr.certificateIssuedAt,
      certificateId: enr.certificateId,
      issuedAt: enr.certificateIssuedAt,
      learnerName: enr.certificateName ?? u.name,
      courseTitle: enr.certificateCourseTitle ?? c.title,
      credentialName: enr.certificateCourseTitle ?? c.title,
      courseId: c.id,
      certificateLine: enr.certificateLine ?? certificateLineFor(c),
      durationLabel: c.durationLabel,
      lessonsTotal: snap.completion.lessonsTotal,
      finalQuestions: c.finalExam?.questions.length ?? 0,
      finalPassCount: c.finalExam?.questions.length ? Math.ceil((c.passMark / 100) * c.finalExam.questions.length) : 0,
      capstones: certificateGate(c, enr).map((g) => g.title),
      requirements: [
        { label: `Complete all ${snap.completion.lessonsTotal} lessons and their activities`, met: snap.completion.lessonsDone === snap.completion.lessonsTotal },
        ...(c.finalExam?.questions.length
          ? [{ label: `Pass the final knowledge check (at least ${Math.ceil((c.passMark / 100) * c.finalExam.questions.length)} of ${c.finalExam.questions.length})`, met: (enr.finalExam?.attempts ?? []).some((a) => a.score >= c.passMark) }]
          : []),
        ...certificateGate(c, enr).map((g) => ({ label: `“${g.title}” passes every rubric dimension`, met: g.state === 'approved' })),
      ],
    };
  }),
);
