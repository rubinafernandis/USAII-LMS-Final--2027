/**
 * Course payments.
 *
 * A paid course opens ONLY after the payment gateway itself confirms the money arrived. The browser
 * never decides: it can only hand the server an order/session id, and the server checks that id with
 * the gateway (signature + amount + status) before it opens the course.
 *
 * Two gateways are supported. Set the keys of ONE of them (see .env.example):
 *   - Razorpay  (India: UPI, cards, netbanking, wallets)   RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET
 *   - Stripe    (international cards, Apple/Google Pay)     STRIPE_SECRET_KEY
 * If both are set, PAYMENT_PROVIDER=razorpay|stripe chooses. With neither set, paid courses cannot be
 * bought (learners are told so) and only free courses or admin-granted access work.
 *
 * Webhooks (recommended): they open the course even if the learner closes the tab right after paying.
 *   Razorpay: https://YOUR-SITE/api/payments/webhook/razorpay   events: payment.captured, order.paid
 *             secret in RAZORPAY_WEBHOOK_SECRET
 *   Stripe:   https://YOUR-SITE/api/payments/webhook/stripe     events: checkout.session.completed,
 *             checkout.session.async_payment_succeeded, checkout.session.async_payment_failed
 *             secret in STRIPE_WEBHOOK_SECRET
 */
import { supportLine } from './auth';
import crypto from 'node:crypto';
import type { Course, Payment, PaymentProvider, UserRecord } from '../shared/types';
import { db, nowIso, save, uid } from './db';
import { enabledGateways, gateways, METHOD_LABEL } from './paymentConfig';
import { audit, fail, getEnrollment, notify, notifyCourseStaff } from './services';

const RAZORPAY_BASE = () => process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com';
const STRIPE_BASE = () => process.env.STRIPE_API_BASE || 'https://api.stripe.com';
const PAYPAL_BASE = () => process.env.PAYPAL_API_BASE || (gateways().paypal.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

/** Currencies with no minor unit (amount is sent as-is, not ×100). */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'PYG', 'UGX', 'XAF', 'XOF']);

/** The first gateway on (kept for older callers). */
export function paymentProvider(): PaymentProvider | null {
  return enabledGateways()[0] ?? null;
}

/** The currency course prices are charged in. Course prices are entered in this currency. */
export const paymentCurrency = () => gateways().currency;

export const toMinorUnits = (price: number, currency: string) => (ZERO_DECIMAL.has(currency) ? Math.round(price) : Math.round(price * 100));
const toMajorString = (minor: number, currency: string) => (ZERO_DECIMAL.has(currency) ? String(minor) : (minor / 100).toFixed(2));

/** What the learner's browser needs to know (never any secret). */
export function paymentPublicConfig() {
  const on = enabledGateways();
  return {
    ready: on.length > 0,
    provider: on[0] ?? null,
    currency: paymentCurrency(),
    methods: on.map((id) => ({ id, ...METHOD_LABEL[id] })),
  };
}

const payments = () => (db().payments ??= []);

async function gatewayJson(r: Response, what: string): Promise<any> {
  let j: any = null;
  try {
    j = await r.json();
  } catch {
    /* not json */
  }
  if (!r.ok) {
    const msg = j?.error?.description || j?.error?.message || `HTTP ${r.status}`;
    console.warn(`[payments] ${what} failed: ${msg}`);
    fail(502, 'The payment service did not accept the request. Please try again in a minute.');
  }
  return j;
}

const razorpayAuth = () => 'Basic ' + Buffer.from(`${gateways().razorpay.keyId}:${gateways().razorpay.keySecret}`).toString('base64');
const stripeAuth = () => `Bearer ${gateways().stripe.secretKey}`;

/** PayPal access token, cached until shortly before it expires. */
let ppToken: { key: string; token: string; until: number } | null = null;
async function paypalToken(): Promise<string> {
  const g = gateways().paypal;
  const key = `${g.mode}:${g.clientId}`;
  if (ppToken && ppToken.key === key && ppToken.until > Date.now()) return ppToken.token;
  const r = await fetch(`${PAYPAL_BASE()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${g.clientId}:${g.clientSecret}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20_000),
  });
  const j = await gatewayJson(r, 'PayPal sign-in');
  ppToken = { key, token: String(j.access_token), until: Date.now() + (Number(j.expires_in || 3000) - 120) * 1000 };
  return ppToken.token;
}
async function paypal(pathname: string, init: RequestInit = {}, what = 'PayPal request') {
  const r = await fetch(`${PAYPAL_BASE()}${pathname}`, {
    ...init,
    headers: { authorization: `Bearer ${await paypalToken()}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  return { r, j: r.status === 204 ? {} : await r.json().catch(() => ({})) as any, what };
}

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmacHex = (secret: string, data: string | Buffer) => crypto.createHmac('sha256', secret).update(data).digest('hex');

/* ---------------- Start a checkout ---------------- */

export async function createCheckout(user: UserRecord, course: Course, siteUrl: string, wanted?: unknown) {
  const on = enabledGateways();
  if (!on.length) fail(409, `Online payment is not set up on this LMS yet. ${supportLine()}`);
  if (wanted && !on.includes(wanted as PaymentProvider)) fail(400, 'That payment method is not available. Choose another one.');
  const provider = (wanted as PaymentProvider) || on[0];
  if (!(course.price > 0)) fail(400, 'This course is free. Use "Start for free".');
  const currency = paymentCurrency();
  const amount = toMinorUnits(course.price, currency);
  const payment: Payment = {
    id: uid('pay'),
    userId: user.id,
    courseId: course.id,
    provider: provider!,
    amount,
    currency,
    status: 'created',
    orderRef: '',
    createdAt: nowIso(),
  };

  if (provider === 'razorpay') {
    const r = await fetch(`${RAZORPAY_BASE()}/v1/orders`, {
      method: 'POST',
      headers: { authorization: razorpayAuth(), 'content-type': 'application/json' },
      body: JSON.stringify({ amount, currency, receipt: payment.id, notes: { paymentId: payment.id, userId: user.id, courseId: course.id } }),
      signal: AbortSignal.timeout(20_000),
    });
    const order = await gatewayJson(r, 'Razorpay order');
    payment.orderRef = String(order.id);
    payments().push(payment);
    save();
    return {
      provider,
      paymentId: payment.id,
      keyId: gateways().razorpay.keyId,
      orderId: payment.orderRef,
      amount,
      currency,
      courseTitle: course.title,
      prefill: { name: user.name, email: user.email, ...(user.phone ? { contact: user.phone } : {}) },
    };
  }

  const base = siteUrl.replace(/\/+$/, '');
  if (provider === 'paypal') {
    // PayPal Checkout: the learner approves on PayPal, then comes back and the server captures the money.
    const { r, j } = await paypal(
      '/v2/checkout/orders',
      {
        method: 'POST',
        headers: { 'paypal-request-id': payment.id },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{ reference_id: payment.id, custom_id: payment.id, description: course.title.slice(0, 120), amount: { currency_code: currency, value: toMajorString(amount, currency) } }],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: 'USAII',
                user_action: 'PAY_NOW',
                shipping_preference: 'NO_SHIPPING',
                return_url: `${base}/?checkout=paypal#/dashboard`,
                cancel_url: `${base}/?checkout=cancelled#/explore?course=${encodeURIComponent(course.id)}`,
              },
            },
          },
        }),
      },
      'PayPal order',
    );
    if (!r.ok) {
      console.warn('[payments] PayPal order failed:', j?.message || r.status);
      fail(502, 'The payment service did not accept the request. Please try again in a minute.');
    }
    const approve = (j.links ?? []).find((l: any) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
    if (!approve) fail(502, 'PayPal did not return a payment page. Please try again.');
    payment.orderRef = String(j.id);
    payments().push(payment);
    save();
    return { provider, paymentId: payment.id, url: String(approve) };
  }

  // Stripe Checkout (hosted payment page).
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#/dashboard`,
    cancel_url: `${base}/?checkout=cancelled#/explore?course=${encodeURIComponent(course.id)}`,
    client_reference_id: payment.id,
    customer_email: user.email,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': course.title.slice(0, 250),
    'metadata[paymentId]': payment.id,
    'metadata[userId]': user.id,
    'metadata[courseId]': course.id,
    'payment_intent_data[metadata][paymentId]': payment.id,
  });
  const r = await fetch(`${STRIPE_BASE()}/v1/checkout/sessions`, {
    method: 'POST',
    headers: { authorization: stripeAuth(), 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const session = await gatewayJson(r, 'Stripe Checkout session');
  payment.orderRef = String(session.id);
  payments().push(payment);
  save();
  return { provider, paymentId: payment.id, url: String(session.url) };
}

/* ---------------- Mark a payment as paid (idempotent) and open the course ---------------- */

export function markPaid(payment: Payment, paymentRef: string | undefined): boolean {
  const d = db();
  const course = d.courses.find((c) => c.id === payment.courseId);
  const user = d.users.find((u) => u.id === payment.userId);
  const first = payment.status !== 'paid';
  payment.status = 'paid';
  payment.paymentRef = paymentRef || payment.paymentRef;
  payment.paidAt ??= nowIso();
  const existing = getEnrollment(payment.userId, payment.courseId);
  if (existing) {
    if (existing.access !== 'paid' || existing.paymentId !== payment.id) {
      // Keeps any progress the learner already had.
      if (!existing.grantedBy) {
        existing.access = 'paid';
        existing.paymentId = payment.id;
      }
    }
  } else {
    d.enrollments.push({ id: uid('enr'), userId: payment.userId, courseId: payment.courseId, enrolledAt: nowIso(), access: 'paid', paymentId: payment.id, lessons: {} });
  }
  // The course chosen at sign up is paid for now.
  if (user && user.pendingCourseId === payment.courseId) delete user.pendingCourseId;
  if (first && user && course) {
    const amount = `${(ZERO_DECIMAL.has(payment.currency) ? payment.amount : payment.amount / 100).toFixed(ZERO_DECIMAL.has(payment.currency) ? 0 : 2)} ${payment.currency}`;
    audit(user, 'PAYMENT', `Paid ${amount} for ${course.title} via ${payment.provider} (${payment.paymentRef ?? payment.orderRef}).`);
    notify(user.id, { kind: 'access', key: `paid-${payment.id}`, title: 'Payment received', body: `${course.title} is now open. Thank you!`, link: { view: 'dashboard', courseId: course.id }, email: true });
    notifyCourseStaff(course, { kind: 'access', key: `paid-${payment.id}`, title: `New paid enrollment: ${user.name}`, body: `${user.name} paid ${amount} for ${course.title}.`, link: { view: 'learners' } });
  }
  save();
  return first;
}

/* ---------------- Razorpay ---------------- */

/** Called by the browser after Razorpay Checkout succeeds. Everything is re-checked with Razorpay. */
export async function verifyRazorpay(user: UserRecord, input: { orderId?: unknown; paymentId?: unknown; signature?: unknown }) {
  const orderId = String(input.orderId ?? '');
  const rzPaymentId = String(input.paymentId ?? '');
  const signature = String(input.signature ?? '');
  if (!orderId || !rzPaymentId || !signature) fail(400, 'Payment details are missing.');
  const payment = payments().find((p) => p.provider === 'razorpay' && p.orderRef === orderId && p.userId === user.id) ?? fail(404, 'Payment not found.');
  if (payment!.status === 'paid') return payment!;

  // 1) The signature proves Razorpay produced this payment for OUR order.
  const expected = hmacHex(gateways().razorpay.keySecret, `${orderId}|${rzPaymentId}`);
  if (!safeEqualHex(expected, signature)) fail(400, 'The payment could not be verified.');

  // 2) Ask Razorpay for the payment itself: right order, right amount, money captured.
  const r = await fetch(`${RAZORPAY_BASE()}/v1/payments/${encodeURIComponent(rzPaymentId)}`, { headers: { authorization: razorpayAuth() }, signal: AbortSignal.timeout(20_000) });
  let p = await gatewayJson(r, 'Razorpay payment lookup');
  if (p.order_id !== orderId || Number(p.amount) !== payment!.amount || String(p.currency).toUpperCase() !== payment!.currency) fail(400, 'The payment does not match this order.');
  if (p.status === 'authorized') {
    // Accounts without auto-capture: capture it now so the money is actually collected.
    const c = await fetch(`${RAZORPAY_BASE()}/v1/payments/${encodeURIComponent(rzPaymentId)}/capture`, {
      method: 'POST',
      headers: { authorization: razorpayAuth(), 'content-type': 'application/json' },
      body: JSON.stringify({ amount: payment!.amount, currency: payment!.currency }),
      signal: AbortSignal.timeout(20_000),
    });
    p = await gatewayJson(c, 'Razorpay capture');
  }
  if (p.status !== 'captured') fail(402, 'The payment has not completed yet. If money left your account, it will be confirmed shortly.');
  markPaid(payment!, rzPaymentId);
  return payment!;
}

export function handleRazorpayWebhook(raw: Buffer, signature: string | undefined): { ok: boolean; status: number } {
  const secret = gateways().razorpay.webhookSecret;
  if (!secret) return { ok: false, status: 503 };
  if (!signature || !safeEqualHex(hmacHex(secret, raw), signature)) return { ok: false, status: 400 };
  let event: any;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return { ok: false, status: 400 };
  }
  if (event.event === 'refund.processed' || event.event === 'payment.refunded') {
    const entity = event.payload?.payment?.entity;
    const p = payments().find((x) => x.provider === 'razorpay' && (x.paymentRef === entity?.id || x.orderRef === entity?.order_id));
    // Only a full refund removes access; a partial refund is a goodwill gesture, not a cancellation.
    if (p && entity && Number(entity.amount_refunded ?? 0) >= p.amount) markRefunded(p);
    return { ok: true, status: 200 };
  }
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const entity = event.payload?.payment?.entity;
    const orderId = entity?.order_id ?? event.payload?.order?.entity?.id;
    const payment = payments().find((p) => p.provider === 'razorpay' && p.orderRef === orderId);
    if (payment && entity && Number(entity.amount) === payment.amount && entity.status === 'captured') markPaid(payment, String(entity.id));
  }
  return { ok: true, status: 200 };
}

/* ---------------- Stripe ---------------- */

async function stripeSession(sessionId: string) {
  const r = await fetch(`${STRIPE_BASE()}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: { authorization: stripeAuth() }, signal: AbortSignal.timeout(20_000) });
  return gatewayJson(r, 'Stripe session lookup');
}

function sessionMatches(payment: Payment, s: any) {
  return s.client_reference_id === payment.id && Number(s.amount_total) === payment.amount && String(s.currency).toUpperCase() === payment.currency;
}

/** Called when the learner comes back from Stripe Checkout. Re-checked with Stripe. */
export async function confirmStripe(user: UserRecord, sessionIdRaw: unknown) {
  const sessionId = String(sessionIdRaw ?? '');
  if (!sessionId) fail(400, 'Payment details are missing.');
  const payment = payments().find((p) => p.provider === 'stripe' && p.orderRef === sessionId && p.userId === user.id) ?? fail(404, 'Payment not found.');
  if (payment!.status === 'paid') return payment!;
  const s = await stripeSession(sessionId);
  if (!sessionMatches(payment!, s)) fail(400, 'The payment does not match this order.');
  if (s.payment_status !== 'paid') fail(402, 'The payment has not completed yet. If money left your account, it will be confirmed shortly.');
  markPaid(payment!, typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id);
  return payment!;
}

/** Stripe-Signature: t=timestamp,v1=hex  (HMAC-SHA256 of "timestamp.rawBody"). */
export function verifyStripeSignature(raw: Buffer, header: string | undefined, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=').map((x) => x.trim())).filter((x) => x.length === 2)) as Record<string, string>;
  const sigs = header
    .split(',')
    .map((kv) => kv.trim())
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = hmacHex(secret, Buffer.concat([Buffer.from(`${t}.`), raw]));
  return sigs.some((s) => safeEqualHex(expected, s));
}

export function handleStripeWebhook(raw: Buffer, header: string | undefined): { ok: boolean; status: number } {
  const secret = gateways().stripe.webhookSecret;
  if (!secret) return { ok: false, status: 503 };
  if (!verifyStripeSignature(raw, header, secret)) return { ok: false, status: 400 };
  let event: any;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return { ok: false, status: 400 };
  }
  const s = event.data?.object;
  if (!s?.id) return { ok: true, status: 200 };
  if (event.type === 'charge.refunded') {
    const intent = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
    const p = payments().find((x) => x.provider === 'stripe' && x.paymentRef === intent);
    if (p && (s.refunded === true || Number(s.amount_refunded ?? 0) >= p.amount)) markRefunded(p);
    return { ok: true, status: 200 };
  }
  const payment = payments().find((p) => p.provider === 'stripe' && p.orderRef === s.id);
  if (!payment || !sessionMatches(payment, s)) return { ok: true, status: 200 };
  if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && s.payment_status === 'paid') {
    markPaid(payment, typeof s.payment_intent === 'string' ? s.payment_intent : undefined);
  } else if (event.type === 'checkout.session.async_payment_failed' && payment.status !== 'paid') {
    payment.status = 'failed';
    save();
  }
  return { ok: true, status: 200 };
}

/* ---------------- Refunds ---------------- */

/** A full refund closes the course again (progress is kept, in case the learner buys it later). */
/* ---------------- Refund policy (learner Settings) ---------------- */

/** Learners can apply for a refund for this many hours after paying. */
export const REFUND_WINDOW_HOURS = 24;
/** Share of the price kept on a refund (20%). The learner receives the rest. */
export const REFUND_DEDUCTION = 0.2;
export const refundAmountFor = (amount: number) => Math.round(amount * (1 - REFUND_DEDUCTION));
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);

/** Sends a partial refund through the gateway that took the payment. Returns the gateway's refund id. */
export async function sendGatewayRefund(payment: Payment, amount: number): Promise<string> {
  if (!payment.paymentRef) fail(400, 'This payment has no gateway reference, so it cannot be refunded automatically.');
  if (payment.provider === 'stripe') {
    const body = new URLSearchParams({ payment_intent: payment.paymentRef!, amount: String(amount), reason: 'requested_by_customer', 'metadata[paymentId]': payment.id });
    const r = await fetch(`${STRIPE_BASE()}/v1/refunds`, { method: 'POST', headers: { authorization: stripeAuth(), 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20_000) });
    return String((await gatewayJson(r, 'Stripe refund')).id);
  }
  if (payment.provider === 'razorpay') {
    const r = await fetch(`${RAZORPAY_BASE()}/v1/payments/${encodeURIComponent(payment.paymentRef!)}/refund`, {
      method: 'POST',
      headers: { authorization: razorpayAuth(), 'content-type': 'application/json' },
      body: JSON.stringify({ amount, notes: { paymentId: payment.id } }),
      signal: AbortSignal.timeout(20_000),
    });
    return String((await gatewayJson(r, 'Razorpay refund')).id);
  }
  const res = await paypal(`/v2/payments/captures/${encodeURIComponent(payment.paymentRef!)}/refund`, { method: 'POST', body: JSON.stringify({ amount: { value: (amount / 100).toFixed(2), currency_code: payment.currency } }) }, 'PayPal refund');
  if (!res.r.ok || !res.j?.id) fail(502, `PayPal refund failed (${res.r.status}).`);
  return String(res.j.id);
}

export function markRefunded(payment: Payment) {
  if (payment.status === 'refunded') return;
  payment.status = 'refunded';
  payment.refundedAt = nowIso();
  const d = db();
  const course = d.courses.find((c) => c.id === payment.courseId);
  const user = d.users.find((u) => u.id === payment.userId);
  if (user && course) {
    audit(user, 'REFUND', `Payment for ${course.title} refunded via ${payment.provider}; course access closed.`);
    notify(user.id, { kind: 'access', key: `refund-${payment.id}`, title: 'Refund processed', body: payment.refund ? `We refunded ${money(payment.refund.amount, payment.currency)} of the ${money(payment.amount, payment.currency)} you paid for ${course.title}, under the 24 hour refund policy (a 20% deduction of ${money(payment.refund.deduction, payment.currency)} applies). The course is now closed. Your progress is kept if you enroll again.` : `Your payment for ${course.title} was refunded, so the course is closed. Your progress is kept if you enroll again.`, link: { view: 'explore' }, email: true });
    notifyCourseStaff(course, { kind: 'access', key: `refund-${payment.id}`, title: `Refund: ${user.name}`, body: `${user.name}'s payment for ${course.title} was refunded. Their access has closed.`, link: { view: 'learners' } });
  }
  save();
}

/* ---------------- PayPal ---------------- */

/** Called when the learner comes back from PayPal. The server captures the money and checks it. */
export async function capturePaypal(user: UserRecord, orderIdRaw: unknown) {
  const orderId = String(orderIdRaw ?? '');
  if (!orderId) fail(400, 'Payment details are missing.');
  const payment = payments().find((p) => p.provider === 'paypal' && p.orderRef === orderId && p.userId === user.id) ?? fail(404, 'Payment not found.');
  if (payment!.status === 'paid') return payment!;
  let { r, j } = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', headers: { 'paypal-request-id': `cap-${payment!.id}` } }, 'PayPal capture');
  if (!r.ok) {
    // Captured already (a second tab, or the webhook got there first): read the order instead.
    ({ r, j } = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {}, 'PayPal order lookup'));
    if (!r.ok) fail(402, 'PayPal has not confirmed the payment yet. If money left your account, it will be confirmed shortly.');
  }
  const unit = j.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  const okAmount = cap && cap.amount?.currency_code === payment!.currency && toMinorUnits(Number(cap.amount.value), payment!.currency) === payment!.amount;
  if (j.status !== 'COMPLETED' || !cap || cap.status !== 'COMPLETED') fail(402, 'PayPal has not completed the payment yet. If money left your account, it will be confirmed shortly.');
  if (!okAmount || (unit.custom_id && unit.custom_id !== payment!.id)) fail(400, 'The payment does not match this order.');
  markPaid(payment!, String(cap.id));
  return payment!;
}

/** PayPal webhooks are verified by asking PayPal itself (no shared secret exists for them). */
export async function handlePaypalWebhook(raw: Buffer, headers: Record<string, string | undefined>): Promise<{ ok: boolean; status: number }> {
  const g = gateways().paypal;
  if (!g.on || !g.webhookId) return { ok: false, status: 503 };
  let event: any;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return { ok: false, status: 400 };
  }
  try {
    const { r, j } = await paypal('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: g.webhookId,
        webhook_event: event,
      }),
    }, 'PayPal webhook check');
    if (!r.ok || j.verification_status !== 'SUCCESS') return { ok: false, status: 400 };
  } catch {
    return { ok: false, status: 502 };
  }
  const res = event.resource ?? {};
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const orderId = res.supplementary_data?.related_ids?.order_id;
    const p = payments().find((x) => x.provider === 'paypal' && (x.orderRef === orderId || x.id === res.custom_id));
    if (p && res.status === 'COMPLETED' && res.amount?.currency_code === p.currency && toMinorUnits(Number(res.amount.value), p.currency) === p.amount) markPaid(p, String(res.id));
  } else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
    // The event's resource is the capture: it is fully refunded when its status is REFUNDED.
    const p = payments().find((x) => x.provider === 'paypal' && x.paymentRef === res.id);
    if (p && res.status === 'REFUNDED') markRefunded(p);
  }
  return { ok: true, status: 200 };
}

/* ---------------- "Test connection" on the Payment settings screen ---------------- */

/** Checks the keys with the gateway without charging anything. */
export async function testGateway(which: PaymentProvider): Promise<{ ok: boolean; message: string }> {
  const g = gateways();
  try {
    if (which === 'razorpay') {
      if (!g.razorpay.keyId || !g.razorpay.keySecret) return { ok: false, message: 'Add the Key ID and Key Secret first.' };
      const r = await fetch(`${RAZORPAY_BASE()}/v1/orders?count=1`, { headers: { authorization: razorpayAuth() }, signal: AbortSignal.timeout(15_000) });
      return r.ok ? { ok: true, message: `Connected to Razorpay (${g.razorpay.keyId.startsWith('rzp_live') ? 'live' : 'test'} mode).` } : { ok: false, message: r.status === 401 ? 'Razorpay rejected these keys. Copy them again from Razorpay Dashboard, API Keys.' : `Razorpay answered with an error (${r.status}).` };
    }
    if (which === 'stripe') {
      if (!g.stripe.secretKey) return { ok: false, message: 'Add the Secret key first.' };
      const r = await fetch(`${STRIPE_BASE()}/v1/balance`, { headers: { authorization: stripeAuth() }, signal: AbortSignal.timeout(15_000) });
      return r.ok ? { ok: true, message: `Connected to Stripe (${g.stripe.secretKey.startsWith('sk_live') ? 'live' : 'test'} mode).` } : { ok: false, message: r.status === 401 ? 'Stripe rejected this key. Copy the Secret key again from Stripe, Developers, API keys.' : `Stripe answered with an error (${r.status}).` };
    }
    if (!g.paypal.clientId || !g.paypal.clientSecret) return { ok: false, message: 'Add the Client ID and Secret first.' };
    ppToken = null;
    await paypalToken();
    return { ok: true, message: `Connected to PayPal (${g.paypal.mode} mode).` };
  } catch (e) {
    const msg = (e as { message?: string }).message ?? '';
    return { ok: false, message: /did not accept/.test(msg) ? 'The gateway rejected these keys. Copy them again from its dashboard.' : 'Could not reach the gateway. Check the server can reach the internet.' };
  }
}
