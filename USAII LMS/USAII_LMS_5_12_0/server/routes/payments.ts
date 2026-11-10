import express, { Router } from 'express';
import { requireAuth, requireRole } from '../auth';
import { capturePaypal, confirmStripe, createCheckout, handlePaypalWebhook, handleRazorpayWebhook, handleStripeWebhook, paymentPublicConfig, verifyRazorpay } from '../payments';
import { fail, getActiveEnrollment, getCourse } from '../services';
import { me, wrap } from './util';

/** Learner side: start a checkout and confirm it. */
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, requireRole('learner'));

paymentsRouter.get(
  '/config',
  wrap(() => paymentPublicConfig()),
);

paymentsRouter.post(
  '/checkout/:courseId',
  wrap(async (req) => {
    const u = me(req);
    const c = getCourse(req.params.courseId);
    if (c.status !== 'published') fail(404, 'Course not available.');
    if (c.access !== 'open') fail(403, 'This course is by invitation. Use "Request access" and an admin will respond.');
    if (getActiveEnrollment(u.id, c.id)) return { alreadyEnrolled: true };
    // PUBLIC_URL is the safest source for the return address; otherwise use the address the learner is on.
    const site = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    return createCheckout(u, c, site, req.body?.gateway);
  }),
);

paymentsRouter.post(
  '/razorpay/verify',
  wrap(async (req) => {
    const p = await verifyRazorpay(me(req), req.body ?? {});
    return { ok: true, courseId: p.courseId };
  }),
);

paymentsRouter.post(
  '/stripe/confirm',
  wrap(async (req) => {
    const p = await confirmStripe(me(req), req.body?.sessionId);
    return { ok: true, courseId: p.courseId };
  }),
);

paymentsRouter.post(
  '/paypal/capture',
  wrap(async (req) => {
    const p = await capturePaypal(me(req), req.body?.orderId);
    return { ok: true, courseId: p.courseId };
  }),
);

/**
 * Gateway webhooks. Mounted BEFORE express.json() so the signature is checked against the exact
 * bytes the gateway sent. No sign-in: the HMAC signature is the authentication.
 */
export const paymentWebhookRouter = Router();
paymentWebhookRouter.use(express.raw({ type: '*/*', limit: '1mb' }));

paymentWebhookRouter.post('/razorpay', (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const r = handleRazorpayWebhook(raw, req.get('x-razorpay-signature'));
  res.status(r.status).json({ ok: r.ok });
});

paymentWebhookRouter.post('/stripe', (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const r = handleStripeWebhook(raw, req.get('stripe-signature'));
  res.status(r.status).json({ ok: r.ok });
});

paymentWebhookRouter.post('/paypal', async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const h = (k: string) => req.get(k) ?? undefined;
  const r = await handlePaypalWebhook(raw, {
    'paypal-auth-algo': h('paypal-auth-algo'),
    'paypal-cert-url': h('paypal-cert-url'),
    'paypal-transmission-id': h('paypal-transmission-id'),
    'paypal-transmission-sig': h('paypal-transmission-sig'),
    'paypal-transmission-time': h('paypal-transmission-time'),
  });
  res.status(r.status).json({ ok: r.ok });
});
