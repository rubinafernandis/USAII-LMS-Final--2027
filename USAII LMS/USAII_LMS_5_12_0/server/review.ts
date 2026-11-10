/**
 * Applying a decision to a learner's activity. The admin's review screen and the automatic evaluation
 * both go through here, so the rules are identical: every dimension decided, the decision agrees with
 * the dimensions, the revision limit holds, the learner is told (in the LMS and by email), and the
 * certificate is issued the moment the last requirement is met.
 */
import type { ActivityReview, Course, Lesson, RubricLevel, UserRecord } from '../shared/types';
import { canResubmit, canReturnForRevision, revisionLimit, rubricKind, RUBRIC_MAX } from '../shared/metrics';
import { db, nowIso, save } from './db';
import { audit, fail, getEnrollment, maybeIssueCredential, notify } from './services';

const REVIEW_TEXT: Record<ActivityReview, { title: string; result: string }> = {
  approved: { title: 'Your activity was approved', result: 'approved' },
  not_approved: { title: 'Your activity was not approved', result: 'not approved' },
  resubmit: { title: 'Please revise and resubmit your activity', result: 'please revise and resubmit it' },
};

export interface ReviewInput {
  course: Course;
  lesson: Lesson;
  learnerId: string;
  decision: ActivityReview;
  feedback?: string;
  /** Pass / Needs Work rubric: dimension id → passed. */
  dimensions?: Record<string, unknown>;
  /** Rubric PDF: points awarded. */
  rubricPoints?: unknown;
  /** Legacy criteria: criterion id → level. */
  criteria?: Record<string, unknown>;
  /** The admin, or undefined for the automatic evaluation. */
  admin?: UserRecord;
}

export const AUTO_REVIEWER = 'Automatic evaluation';

export function applyReview(input: ReviewInput) {
  const { course, lesson, learnerId, decision, admin } = input;
  const enr = getEnrollment(learnerId, course.id) ?? fail(404, 'Enrollment not found.');
  const p = enr!.lessons[lesson.id];
  if (!p?.activity) fail(404, 'No submission found.');
  if (!decision || !REVIEW_TEXT[decision]) fail(400, 'Choose Approve, Not approved, or Request resubmission.');
  const feedback = String(input.feedback ?? '').trim().slice(0, 5000);
  if (decision !== 'approved' && feedback.length < 2) fail(400, 'Tell the learner why, so they know what to change.');
  const act = lesson.activity;
  const a = p!.activity!;
  const now = nowIso();
  const kind = rubricKind(act);
  const reviewer = admin?.name ?? AUTO_REVIEWER;
  // A certificate issued on this approval stays valid; the decision cannot be quietly reversed afterwards.
  if (enr!.certificateIssuedAt && act?.requiredForCertificate && a.review === 'approved' && decision !== 'approved')
    fail(400, `A certificate (${enr!.certificateId}) was already issued on this approval, so it cannot be changed to "${REVIEW_TEXT[decision].result}".`);
  if (decision === 'resubmit' && !canReturnForRevision(act, a)) {
    const n = revisionLimit(act);
    fail(400, `This is the learner’s ${n === 1 ? 'revision' : 'last allowed revision'}, and the rubric allows ${n === 1 ? 'one revision' : `${n} revisions`}. Approve it, or mark it Not approved.`);
  }
  if (kind === 'pass') {
    const dims = act!.passRubric!.dimensions;
    const given = input.dimensions ?? {};
    if (dims.some((d) => typeof given[d.id] !== 'boolean')) fail(400, 'Mark every dimension Pass or Needs Work first.');
    const results = dims.map((d) => ({ id: d.id, label: d.label, pass: given[d.id] === true }));
    const needsWork = results.filter((r) => !r.pass);
    if (decision === 'approved' && needsWork.length) fail(400, `Every dimension must pass before the work is approved. Needs work: ${needsWork.map((r) => r.label).join(', ')}.`);
    if (decision !== 'approved' && !needsWork.length) fail(400, 'Every dimension is marked Pass. Approve the work, or mark the dimension that needs work.');
    a.rubric = { scores: [], dimensions: results, percent: Math.round(((results.length - needsWork.length) / results.length) * 100), scoredBy: reviewer, scoredAt: now };
  } else if (act?.rubricPdf?.url) {
    const pdf = act.rubricPdf;
    const raw = input.rubricPoints;
    const given = raw !== undefined && raw !== null && raw !== '';
    const pts = Number(raw);
    if (given && (!Number.isFinite(pts) || pts < 0 || pts > pdf.maxPoints)) fail(400, `Enter a rubric score from 0 to ${pdf.maxPoints}.`);
    if (!given && decision !== 'resubmit') fail(400, `Enter the rubric score (out of ${pdf.maxPoints}) first.`);
    if (given) {
      const points = Math.round(pts * 2) / 2;
      a.rubric = { scores: [], points, maxPoints: pdf.maxPoints, rubricName: pdf.name, percent: Math.round((points / pdf.maxPoints) * 100), scoredBy: reviewer, scoredAt: now };
    }
  } else {
    const criteria = act?.rubric ?? [];
    const rubricIn = input.criteria ?? {};
    const valid = criteria.map((c) => ({ c, level: rubricIn[c.id] })).filter((x) => x.level === 0 || x.level === 1 || x.level === 2);
    if (criteria.length && valid.length && valid.length < criteria.length) fail(400, 'Score every rubric criterion, or leave all of them blank.');
    if (criteria.length && decision !== 'resubmit' && valid.length < criteria.length) fail(400, 'Score every rubric criterion first.');
    if (criteria.length && valid.length === criteria.length) {
      const total = valid.reduce((sum, x) => sum + (x.level as number), 0);
      a.rubric = { scores: valid.map((x) => ({ id: x.c.id, label: x.c.label, level: x.level as RubricLevel })), percent: Math.round((total / (criteria.length * RUBRIC_MAX)) * 100), scoredBy: reviewer, scoredAt: now };
    }
  }
  a.review = decision;
  a.reviewedBy = reviewer;
  a.reviewedAt = now;
  a.reviewedAutomatically = admin ? undefined : true;
  if (feedback) {
    a.feedback = feedback;
    a.feedbackBy = reviewer;
    a.feedbackAt = now;
  }
  // An admin's decision settles any automatic evaluation still pending for this version.
  if (admin && a.autoEval && a.autoEval.status !== 'done') a.autoEval = { ...a.autoEval, status: 'done', note: 'Decided by an admin.', updatedAt: now };
  const what = act?.title ?? lesson.title;
  const final = decision === 'not_approved' && !canResubmit(act, a);
  notify(learnerId, {
    kind: 'feedback',
    title: REVIEW_TEXT[decision].title,
    body: `Your work "${what}" in ${course.title} was evaluated against its rubric: ${REVIEW_TEXT[decision].result}.${final ? ' The revision this rubric allows is used, so this decision is final.' : ''} Open the activity to read the feedback.`,
    link: { view: 'study', courseId: course.id, lessonId: lesson.id },
    email: true,
  });
  const learner = db().users.find((u) => u.id === learnerId && u.role === 'learner');
  const actor = admin ?? ({ id: 'system', name: AUTO_REVIEWER, role: 'instructor' } as UserRecord);
  audit(actor, admin ? 'REVIEW_ACTIVITY' : 'AUTO_REVIEW_ACTIVITY', `${REVIEW_TEXT[decision].result}: "${what}" for ${learner?.name ?? 'a learner'} (${course.title}).`);
  const credentialIssued = learner ? maybeIssueCredential(learner, course) : false;
  save();
  return { activity: a, credentialIssued };
}
