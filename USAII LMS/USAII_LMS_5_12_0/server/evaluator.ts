/**
 * Automatic evaluation of submissions against their Pass / Needs Work rubric.
 *
 * When a learner submits an activity whose rubric is set to "Evaluate automatically" (and an AI key is
 * set on the server), the work is queued here. The evaluator reads the activity, the learner's answers,
 * the earlier pages the rubric names as evidence, and the attached file (PDF, Word or text), decides
 * every dimension, and applies the decision through the same rules an admin uses (server/review.ts):
 * all pass → approved; otherwise returned for revision while one is allowed, then not approved.
 *
 * It never guesses when it cannot judge fairly. The work goes to the admin instead (with what the
 * evaluator found) when: the attachment cannot be read, the evaluator flags the work, or the AI service
 * does not answer after three tries. Jobs survive restarts: anything queued or running is picked up
 * again on start. An admin can review or change any automatic decision at any time.
 */
import path from 'node:path';
import mammoth from 'mammoth';
import type { ActivitySubmission, Course, Lesson, LessonActivity } from '../shared/types';
import { flattenLessons } from '../shared/analytics';
import { canReturnForRevision, rubricKind } from '../shared/metrics';
import { evidencePages } from '../shared/autocheck';
import { fieldDisplayLabel } from '../shared/template';
import { activityInstructionText } from '../shared/transcript';
import { aiEngine, evaluatePassRubric } from './ai';
import { db, nowIso, save } from './db';
import { readUpload } from './files';
import { applyReview } from './review';
import { getEnrollment, notifyCourseStaff } from './services';

/** Automatic evaluation is on when an AI key is set (AUTO_EVALUATION=off turns it off for the whole site). */
export const autoEvaluationAvailable = () => !!aiEngine() && (process.env.AUTO_EVALUATION ?? 'on').toLowerCase() !== 'off';

/** Whether a submission of this activity is evaluated automatically. */
export function evaluatesAutomatically(act: LessonActivity | undefined): boolean {
  return rubricKind(act) === 'pass' && act!.passRubric!.autoEvaluate !== false && autoEvaluationAvailable();
}

interface Job {
  courseId: string;
  userId: string;
  lessonId: string;
}
const queue: Job[] = [];
let running = false;
const key = (j: Job) => `${j.userId}|${j.courseId}|${j.lessonId}`;

function locate(j: Job): { course: Course; lesson: Lesson; sub: ActivitySubmission } | null {
  const course = db().courses.find((c) => c.id === j.courseId);
  const lesson = course && flattenLessons(course).find((f) => f.lesson.id === j.lessonId)?.lesson;
  const sub = course && getEnrollment(j.userId, course.id)?.lessons[j.lessonId]?.activity;
  return course && lesson && sub ? { course, lesson, sub } : null;
}

/** Queue the learner's latest submission of this activity. */
export function queueEvaluation(courseId: string, userId: string, lessonId: string) {
  const j = { courseId, userId, lessonId };
  const at = locate(j);
  if (!at) return;
  at.sub.autoEval = { status: 'queued', submittedAt: at.sub.submittedAt, attempts: 0, updatedAt: nowIso() };
  save();
  if (!queue.some((q) => key(q) === key(j))) queue.push(j);
  void pump();
}

/** On start: pick up evaluations that were queued or running when the server stopped. */
export function resumeEvaluations() {
  for (const e of db().enrollments)
    for (const [lessonId, p] of Object.entries(e.lessons)) {
      const a = p.activity;
      if (a && !a.review && a.autoEval && (a.autoEval.status === 'queued' || a.autoEval.status === 'running')) queueEvaluation(e.courseId, e.userId, lessonId);
    }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const j = queue.shift()!;
      try {
        await evaluate(j);
      } catch (e) {
        console.error('[evaluator] Unexpected error:', (e as Error).message);
        handOver(j, 'failed', 'The automatic evaluation stopped unexpectedly.');
      }
    }
  } finally {
    running = false;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The attached file as something the evaluator can read, or why it cannot. */
async function readAttachment(sub: ActivitySubmission): Promise<{ name: string; text?: string; pdf?: Buffer; unreadable?: boolean } | undefined> {
  if (!sub.fileUrl) return undefined;
  const name = sub.fileName ?? path.basename(sub.fileUrl);
  const ext = path.extname(sub.fileUrl).toLowerCase();
  const buf = await readUpload(sub.fileUrl, 20 * 1024 * 1024).catch(() => null);
  if (!buf) return { name, unreadable: true };
  try {
    if (ext === '.pdf') return { name, pdf: buf };
    if (ext === '.docx') return { name, text: (await mammoth.extractRawText({ buffer: buf })).value };
    if (['.txt', '.md', '.csv'].includes(ext)) return { name, text: buf.toString('utf8') };
  } catch {
    /* fall through */
  }
  return { name, unreadable: true };
}

function handOver(j: Job, status: 'needs_admin' | 'failed', note: string, suggestion?: NonNullable<ActivitySubmission['autoEval']>['suggestion']) {
  const at = locate(j);
  if (!at || at.sub.review) return;
  at.sub.autoEval = { ...(at.sub.autoEval ?? { submittedAt: at.sub.submittedAt, attempts: 0 }), status, note, suggestion, updatedAt: nowIso() } as ActivitySubmission['autoEval'];
  save();
  const learner = db().users.find((u) => u.id === j.userId);
  notifyCourseStaff(at.course, {
    kind: 'review',
    title: `Please review: ${at.lesson.activity?.title ?? at.lesson.title}`,
    body: `${learner?.name ?? 'A learner'}'s work in ${at.course.title} needs an admin decision. ${note}`,
    link: { view: 'assessments' },
    email: true,
  });
}

async function evaluate(j: Job) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const at = locate(j);
    // Gone, already decided by an admin, or no longer automatic: nothing to do.
    if (!at || at.sub.review || !evaluatesAutomatically(at.lesson.activity)) return;
    const { course, lesson, sub } = at;
    const version = sub.submittedAt;
    sub.autoEval = { status: 'running', submittedAt: version, attempts: attempt, updatedAt: nowIso() };
    save();

    const act = lesson.activity!;
    const attachment = await readAttachment(sub);
    const enr = getEnrollment(j.userId, course.id);
    const result = await evaluatePassRubric({
      dimensions: act.passRubric!.dimensions,
      activityTitle: act.title,
      instructions: activityInstructionText(act),
      answers: act.fields.map((f) => ({ label: fieldDisplayLabel(f), value: sub.fields[f.id] ?? '' })),
      pages: evidencePages(course, lesson, enr),
      attachment: attachment && !attachment.unreadable ? attachment : attachment ? { name: attachment.name } : undefined,
    });

    // The learner may have changed the work, or an admin may have decided, while the evaluator worked.
    const now = locate(j);
    if (!now || now.sub.review) return;
    if (now.sub.submittedAt !== version) {
      queueEvaluation(j.courseId, j.userId, j.lessonId);
      return;
    }
    if (!result) {
      if (attempt < 3) {
        await wait(attempt * 20_000);
        continue;
      }
      handOver(j, 'failed', 'The AI service did not return a complete evaluation after three tries.');
      return;
    }
    const suggestion = { dimensions: result.dimensions, feedback: result.feedback };
    if (attachment?.unreadable && result.dimensions.some((d) => !d.pass)) {
      handOver(j, 'needs_admin', `The attached file "${attachment.name}" could not be read automatically, so a person should decide.`, suggestion);
      return;
    }
    if (result.needsHumanReview) {
      handOver(j, 'needs_admin', result.humanReviewReason || 'The evaluator asked for a person to decide.', suggestion);
      return;
    }
    const allPass = result.dimensions.every((d) => d.pass);
    const decision = allPass ? 'approved' : canReturnForRevision(act, now.sub) ? 'resubmit' : 'not_approved';
    const needsWork = result.dimensions.filter((d) => !d.pass);
    const feedback = [
      result.feedback.trim(),
      needsWork.length ? `What needs work:\n${needsWork.map((d) => `• ${d.label}: ${d.reason}`).join('\n')}` : '',
      'This decision was made by the automatic evaluation against the rubric shown on this activity.',
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      applyReview({ course, lesson, learnerId: j.userId, decision, feedback, dimensions: Object.fromEntries(result.dimensions.map((d) => [d.id, d.pass])) });
      const done = locate(j);
      if (done) {
        done.sub.autoEval = { status: 'done', submittedAt: version, attempts: attempt, updatedAt: nowIso(), suggestion };
        save();
      }
    } catch (e) {
      handOver(j, 'needs_admin', `The automatic decision could not be applied: ${(e as Error).message}`, suggestion);
    }
    return;
  }
}
