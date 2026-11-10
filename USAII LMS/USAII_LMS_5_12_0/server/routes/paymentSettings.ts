/**
 * The admin's Payment settings screen: turn gateways on, paste keys, test them.
 * Secrets are write-only: the browser sees whether each is set and its last four characters, never the value.
 */
import { Router } from 'express';
import type { PaymentProvider, PaymentSettings } from '../../shared/types';
import { requireAuth, requireRole, sealSecret, openSecret } from '../auth';
import { db, nowIso, save } from '../db';
import { envLocked, gateways } from '../paymentConfig';
import { mailStatus, sendTestMail } from '../mailer';
import { testGateway } from '../payments';
import { audit, fail } from '../services';
import { me, wrap } from './util';

export const paymentSettingsRouter = Router();
paymentSettingsRouter.use(requireAuth, requireRole('instructor'));

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];
const SECRET_FIELDS: Record<PaymentProvider, string[]> = { razorpay: ['keySecret', 'webhookSecret'], stripe: ['secretKey', 'webhookSecret'], paypal: ['clientSecret'] };
const PLAIN_FIELDS: Record<PaymentProvider, string[]> = { razorpay: ['keyId'], stripe: [], paypal: ['clientId', 'webhookId'] };

const tail = (v: string) => (v ? `ends ${v.slice(-4)}` : '');

function view(req: { protocol: string; get: (h: string) => string | undefined }) {
  const s = db().settings?.payments ?? {};
  const g = gateways();
  const site = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  const secret = (stored: string | undefined, effective: string) => ({ set: !!effective, hint: tail(effective), unreadable: !!stored && !openSecret(stored) });
  return {
    currency: g.currency,
    currencies: CURRENCIES,
    locked: envLocked(),
    publicUrlSet: !!process.env.PUBLIC_URL,
    site,
    razorpay: {
      enabled: s.razorpay?.enabled !== false,
      on: g.razorpay.on,
      keyId: g.razorpay.keyId,
      keySecret: secret(s.razorpay?.keySecret, g.razorpay.keySecret),
      webhookSecret: secret(s.razorpay?.webhookSecret, g.razorpay.webhookSecret),
      webhookUrl: `${site}/api/payments/webhook/razorpay`,
    },
    stripe: {
      enabled: s.stripe?.enabled !== false,
      on: g.stripe.on,
      secretKey: secret(s.stripe?.secretKey, g.stripe.secretKey),
      webhookSecret: secret(s.stripe?.webhookSecret, g.stripe.webhookSecret),
      webhookUrl: `${site}/api/payments/webhook/stripe`,
    },
    paypal: {
      enabled: s.paypal?.enabled !== false,
      on: g.paypal.on,
      mode: g.paypal.mode,
      clientId: g.paypal.clientId,
      clientSecret: secret(s.paypal?.clientSecret, g.paypal.clientSecret),
      webhookId: g.paypal.webhookId,
      webhookUrl: `${site}/api/payments/webhook/paypal`,
    },
    updatedAt: s.updatedAt,
  };
}

paymentSettingsRouter.get('/', wrap((req) => view(req)));

/**
 * Save. Body: { currency?, razorpay?: {...}, stripe?: {...}, paypal?: {...} }.
 * A secret field that is missing or empty keeps its stored value; send `null` to remove it.
 */
paymentSettingsRouter.put(
  '/',
  wrap((req) => {
    const actor = me(req);
    const d = db();
    const cur: PaymentSettings = JSON.parse(JSON.stringify(d.settings?.payments ?? {}));
    const body = req.body ?? {};
    const changed: string[] = [];
    if (body.currency !== undefined) {
      const c = String(body.currency).toUpperCase();
      if (!CURRENCIES.includes(c)) fail(400, `Choose one of: ${CURRENCIES.join(', ')}.`);
      if (cur.currency !== c) changed.push(`currency ${c}`);
      cur.currency = c;
    }
    for (const g of ['razorpay', 'stripe', 'paypal'] as const) {
      const inp = body[g];
      if (!inp || typeof inp !== 'object') continue;
      const out: Record<string, unknown> = { ...(cur[g] ?? {}) };
      if (inp.enabled !== undefined) {
        if (out.enabled !== !!inp.enabled) changed.push(`${g} ${inp.enabled ? 'on' : 'off'}`);
        out.enabled = !!inp.enabled;
      }
      if (g === 'paypal' && inp.mode !== undefined) {
        if (inp.mode !== 'sandbox' && inp.mode !== 'live') fail(400, 'PayPal mode must be sandbox or live.');
        out.mode = inp.mode;
      }
      for (const f of PLAIN_FIELDS[g]) {
        if (inp[f] === undefined) continue;
        const v = String(inp[f] ?? '').trim();
        if (v.length > 300) fail(400, 'That value is too long.');
        if (out[f] !== v) changed.push(`${g} ${f}`);
        out[f] = v || undefined;
      }
      for (const f of SECRET_FIELDS[g]) {
        if (inp[f] === null) {
          if (out[f]) changed.push(`${g} ${f} removed`);
          delete out[f];
        } else if (typeof inp[f] === 'string' && inp[f].trim()) {
          const v = inp[f].trim();
          if (v.length > 500) fail(400, 'That value is too long.');
          out[f] = sealSecret(v);
          changed.push(`${g} ${f} replaced`);
        }
      }
      // Catch the most common paste mistakes early, with a plain message.
      if (g === 'razorpay' && out.keyId && !/^rzp_(test|live)_/.test(String(out.keyId))) fail(400, 'A Razorpay Key ID starts with rzp_test_ or rzp_live_.');
      if (g === 'stripe' && typeof inp.secretKey === 'string' && inp.secretKey.trim() && !/^(sk|rk)_(test|live)_/.test(inp.secretKey.trim()))
        fail(400, 'Use the Stripe Secret key (it starts with sk_test_ or sk_live_), not the Publishable key.');
      if (g === 'stripe' && typeof inp.webhookSecret === 'string' && inp.webhookSecret.trim() && !inp.webhookSecret.trim().startsWith('whsec_'))
        fail(400, 'A Stripe webhook signing secret starts with whsec_.');
      (cur as Record<string, unknown>)[g] = out;
    }
    cur.updatedAt = nowIso();
    cur.updatedBy = actor.id;
    d.settings = { ...(d.settings ?? {}), payments: cur };
    if (changed.length) audit(actor, 'PAYMENT_SETTINGS', `Payment settings changed: ${changed.join(', ')}.`);
    save();
    return view(req);
  }),
);

paymentSettingsRouter.post(
  '/test/:gateway',
  wrap(async (req) => {
    const g = req.params.gateway as PaymentProvider;
    if (!['razorpay', 'stripe', 'paypal'].includes(g)) fail(404, 'Unknown gateway.');
    return testGateway(g);
  }),
);

/* ---------------- Email (sign up, password reset codes, receipts) ---------------- */

/** Whether email is set up and who it is sent from (never the password). */
paymentSettingsRouter.get(
  '/email',
  wrap(() => mailStatus()),
);

/** Send a test email to the signed-in admin and report the real result. */
paymentSettingsRouter.post(
  '/email/test',
  wrap(async (req) => {
    const actor = me(req);
    try {
      await sendTestMail(actor.email);
    } catch (e) {
      return { ok: false, message: `The email could not be sent: ${(e as Error).message}` };
    }
    audit(actor, 'EMAIL_TEST', `Sent a test email to ${actor.email}.`);
    return { ok: true, message: `Test email sent to ${actor.email}. Check that inbox (and its spam folder).` };
  }),
);
