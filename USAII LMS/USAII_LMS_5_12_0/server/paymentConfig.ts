/**
 * Which payment gateways are on, and their keys.
 *
 * Keys come from the admin's Payment settings screen (stored encrypted in the database), or from
 * environment variables on the host. An environment variable always wins, so a host-level setting can
 * never be overridden from the browser. Secrets are never sent to the browser: the screen only sees
 * whether each one is set and its last four characters.
 */
import type { PaymentProvider, PaymentSettings } from '../shared/types';
import { openSecret } from './auth';
import { db } from './db';

const env = (k: string) => (process.env[k] ?? '').trim();
const stored = (): PaymentSettings => db().settings?.payments ?? {};

export interface Gateways {
  currency: string;
  razorpay: { on: boolean; keyId: string; keySecret: string; webhookSecret: string };
  stripe: { on: boolean; secretKey: string; webhookSecret: string };
  paypal: { on: boolean; mode: 'sandbox' | 'live'; clientId: string; clientSecret: string; webhookId: string };
}

/** The effective configuration (environment first, then the settings screen). */
export function gateways(): Gateways {
  const s = stored();
  const rz = {
    keyId: env('RAZORPAY_KEY_ID') || s.razorpay?.keyId || '',
    keySecret: env('RAZORPAY_KEY_SECRET') || openSecret(s.razorpay?.keySecret),
    webhookSecret: env('RAZORPAY_WEBHOOK_SECRET') || openSecret(s.razorpay?.webhookSecret),
  };
  const st = {
    secretKey: env('STRIPE_SECRET_KEY') || openSecret(s.stripe?.secretKey),
    webhookSecret: env('STRIPE_WEBHOOK_SECRET') || openSecret(s.stripe?.webhookSecret),
  };
  const pp = {
    mode: ((env('PAYPAL_MODE') || s.paypal?.mode || 'sandbox') === 'live' ? 'live' : 'sandbox') as 'sandbox' | 'live',
    clientId: env('PAYPAL_CLIENT_ID') || s.paypal?.clientId || '',
    clientSecret: env('PAYPAL_CLIENT_SECRET') || openSecret(s.paypal?.clientSecret),
    webhookId: env('PAYPAL_WEBHOOK_ID') || s.paypal?.webhookId || '',
  };
  // A gateway configured by environment variables is on; one configured on the screen follows its switch.
  const fromEnv = { razorpay: !!env('RAZORPAY_KEY_ID'), stripe: !!env('STRIPE_SECRET_KEY'), paypal: !!env('PAYPAL_CLIENT_ID') };
  // PAYMENT_PROVIDER (older setting) limits checkout to one gateway.
  const only = env('PAYMENT_PROVIDER').toLowerCase();
  const allow = (g: PaymentProvider) => !only || only === g;
  return {
    currency: (env('PAYMENT_CURRENCY') || s.currency || 'USD').toUpperCase(),
    razorpay: { ...rz, on: allow('razorpay') && !!(rz.keyId && rz.keySecret) && (fromEnv.razorpay || s.razorpay?.enabled !== false) },
    stripe: { ...st, on: allow('stripe') && !!st.secretKey && (fromEnv.stripe || s.stripe?.enabled !== false) },
    paypal: { ...pp, on: allow('paypal') && !!(pp.clientId && pp.clientSecret) && (fromEnv.paypal || s.paypal?.enabled !== false) },
  };
}

/** Gateways learners can pay with right now, in the order they are offered. */
export function enabledGateways(): PaymentProvider[] {
  const g = gateways();
  return (['razorpay', 'stripe', 'paypal'] as const).filter((k) => g[k].on);
}

/** How each gateway is described to learners at checkout. */
export const METHOD_LABEL: Record<PaymentProvider, { title: string; detail: string }> = {
  razorpay: { title: 'UPI, cards, netbanking', detail: 'UPI apps, debit and credit cards, netbanking, wallets (Razorpay)' },
  stripe: { title: 'Card, Apple Pay, Google Pay', detail: 'International debit and credit cards, Apple Pay, Google Pay (Stripe)' },
  paypal: { title: 'PayPal', detail: 'Your PayPal balance, or a card through PayPal' },
};

/** Which values are set on the host (so the screen shows them as fixed, not editable). */
export function envLocked() {
  return {
    currency: !!env('PAYMENT_CURRENCY'),
    razorpay: { keyId: !!env('RAZORPAY_KEY_ID'), keySecret: !!env('RAZORPAY_KEY_SECRET'), webhookSecret: !!env('RAZORPAY_WEBHOOK_SECRET') },
    stripe: { secretKey: !!env('STRIPE_SECRET_KEY'), webhookSecret: !!env('STRIPE_WEBHOOK_SECRET') },
    paypal: { mode: !!env('PAYPAL_MODE'), clientId: !!env('PAYPAL_CLIENT_ID'), clientSecret: !!env('PAYPAL_CLIENT_SECRET'), webhookId: !!env('PAYPAL_WEBHOOK_ID') },
  };
}
