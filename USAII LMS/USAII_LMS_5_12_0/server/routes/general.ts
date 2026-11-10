/**
 * Routes every signed-in person uses: notifications (the bell), feedback and ratings, and the public
 * certificate check. This is a self-paced platform: there is deliberately no messaging, question
 * board or chat between learners and admins.
 */
import { Router } from 'express';
import { requireAuth } from '../auth';
import { db, nowIso, save, uid } from '../db';
import { fail, generateNudges, getActiveEnrollment, notifyStaff } from '../services';
import { me, wrap } from './util';

export const generalRouter = Router();
generalRouter.use(requireAuth);

/** How learners reach the platform team (account, payment and access questions). */
generalRouter.get('/support', (_req, res) => {
  res.json({ email: (process.env.SUPPORT_EMAIL ?? '').trim() || null });
});

/* ---------------- Notifications ---------------- */

generalRouter.get(
  '/notifications',
  wrap((req) => {
    const u = me(req);
    generateNudges(u);
    const list = db().notifications.filter((n) => n.userId === u.id).slice(0, 50);
    return { notifications: list, unread: list.filter((n) => !n.read).length };
  }),
);

generalRouter.post(
  '/notifications/read',
  wrap((req) => {
    const u = me(req);
    const ids: string[] | undefined = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
    for (const n of db().notifications) if (n.userId === u.id && (!ids || ids.includes(n.id))) n.read = true;
    save();
    return { ok: true };
  }),
);

/* ---------------- Feedback (would you recommend?) ---------------- */

/**
 * The quick check-in on My Learning. It used to remove every earlier answer from this learner,
 * including their star ratings; now it replaces only their earlier check-in for the same course.
 */
generalRouter.post(
  '/feedback',
  wrap((req) => {
    const u = me(req);
    if (typeof req.body?.recommend !== 'boolean') fail(400, 'Please answer Yes or No.');
    const ease = Math.round(Number(req.body?.ease));
    if (!(ease >= 1 && ease <= 5)) fail(400, 'Please choose how easy it is, from 1 to 5.');
    const raw = String(req.body?.courseId ?? '');
    const courseId = raw && getActiveEnrollment(u.id, raw) ? raw : undefined;
    const d = db();
    d.feedback = d.feedback.filter((f) => !(f.userId === u.id && (f.kind ?? 'pulse') === 'pulse' && f.courseId === courseId));
    d.feedback.unshift({
      id: uid('fb'),
      userId: u.id,
      kind: 'pulse',
      courseId,
      recommend: req.body.recommend,
      ease,
      comment: String(req.body?.comment ?? '').slice(0, 2000),
      createdAt: nowIso(),
    });
    notifyStaff({ kind: 'feedback', title: `New check-in from ${u.name}`, body: `Would recommend the course: ${req.body.recommend ? 'Yes' : 'No'} · Next step ease: ${ease} of 5`, link: { view: 'feedback' } });
    save();
    return { ok: true };
  }),
);

/** The learner's own current answers, so Give Feedback shows what they chose before. */
generalRouter.get(
  '/feedback/mine',
  wrap((req) => {
    const u = me(req);
    const mine = db().feedback.filter((f) => f.userId === u.id);
    const latest = (k: string, courseId?: string) =>
      mine.filter((f) => f.kind === k && (courseId === undefined || f.courseId === courseId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const courses = [...new Set(mine.filter((f) => f.kind === 'course' && f.courseId).map((f) => f.courseId!))];
    return {
      recommend: latest('recommend')?.recommend ?? null,
      platform: latest('platform') ? { stars: latest('platform')!.stars ?? null, comment: latest('platform')!.comment, at: latest('platform')!.createdAt, recommendUsaii: latest('platform')!.recommendUsaii ?? null } : null,
      courses: Object.fromEntries(courses.map((c) => { const f = latest('course', c)!; return [c, { stars: f.stars ?? null, comment: f.comment, at: f.createdAt }]; })),
    };
  }),
);

/* ---------------- Star ratings (courses and the LMS itself) ---------------- */

generalRouter.post(
  '/feedback/rating',
  wrap((req) => {
    const u = me(req);
    const kind = req.body?.kind === 'platform' ? 'platform' : 'course';
    const stars = Math.round(Number(req.body?.stars));
    if (!(stars >= 1 && stars <= 5)) fail(400, 'Please choose a rating from 1 to 5 stars.');
    const courseId = kind === 'course' ? String(req.body?.courseId ?? '') : undefined;
    // "Would you recommend USAII® to others?" is asked on the LMS rating card and is required there.
    const recommendUsaii = req.body?.recommendUsaii;
    if (kind === 'platform' && typeof recommendUsaii !== 'boolean') fail(400, 'Please answer whether you would recommend USAII® to others.');
    if (kind === 'course') {
      if (!courseId) fail(400, 'Please choose the course you are rating.');
      if (!getActiveEnrollment(u.id, String(courseId))) fail(403, 'You are not enrolled in this course.');
    }
    const d = db();
    // One rating per learner per target: rating again replaces the earlier one.
    d.feedback = d.feedback.filter((f) => !(f.userId === u.id && f.kind === kind && (kind === 'platform' || f.courseId === courseId)));
    d.feedback.unshift({
      id: uid('fb'),
      userId: u.id,
      kind,
      courseId,
      stars,
      // "Would you recommend?" is its own question now; for a star rating this only marks 4 or 5 stars.
      recommend: stars >= 4,
      ...(kind === 'platform' ? { recommendUsaii: recommendUsaii as boolean } : {}),
      ease: 0,
      comment: String(req.body?.comment ?? '').slice(0, 2000),
      createdAt: nowIso(),
    });
    notifyStaff({
      kind: 'feedback',
      title: kind === 'course' ? `New course rating from ${u.name}` : `New LMS rating from ${u.name}`,
      body: `${stars} of 5 stars${kind === 'platform' ? ` · Would recommend USAII®: ${recommendUsaii ? 'Yes' : 'No'}` : ''}`,
      link: { view: 'feedback' },
    });
    save();
    return { ok: true };
  }),
);

generalRouter.post(
  '/feedback/recommend',
  wrap((req) => {
    const u = me(req);
    if (typeof req.body?.recommend !== 'boolean') fail(400, 'Please choose Yes or No.');
    const recommend = req.body.recommend as boolean;
    const d = db();
    // One answer per learner: answering again replaces the previous one.
    d.feedback = d.feedback.filter((f) => !(f.userId === u.id && f.kind === 'recommend'));
    d.feedback.unshift({
      id: uid('fb'),
      userId: u.id,
      kind: 'recommend',
      recommend,
      ease: 0,
      comment: '',
      createdAt: nowIso(),
    });
    notifyStaff({ kind: 'feedback', title: `${u.name} answered "Would you recommend USAII® Courses to others?"`, body: recommend ? 'Yes' : 'No', link: { view: 'feedback' } });
    save();
    return { ok: true, recommend };
  }),
);

/* ---------------- Public credential verification ---------------- */

export const publicRouter = Router();
publicRouter.get(
  '/verify/:certId',
  wrap((req) => {
    const d = db();
    const enr = d.enrollments.find((e) => e.certificateId === req.params.certId);
    if (!enr) fail(404, 'No credential found with this ID.');
    const user = d.users.find((u) => u.id === enr!.userId);
    const course = d.courses.find((c) => c.id === enr!.courseId);
    const title = enr!.certificateCourseTitle ?? course?.title;
    return { valid: true, certificateId: enr!.certificateId, learnerName: enr!.certificateName ?? user?.name, credentialName: title, courseTitle: title, issuedAt: enr!.certificateIssuedAt };
  }),
);
