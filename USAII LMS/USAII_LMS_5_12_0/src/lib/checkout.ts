/**
 * Paying for a course, shared by the sign-up form and Explore Courses.
 *
 * The server starts the checkout with the gateway, then:
 *  - Stripe and PayPal: the learner goes to the gateway's own secure page and comes back to
 *    ?checkout=... (handled by components/CheckoutReturn.tsx, which confirms the payment).
 *  - Razorpay: its payment window opens over this page; the server verifies the payment.
 * A course opens only after the server has confirmed the payment with the gateway.
 */
import { api, ApiError } from './api';

export type Gateway = 'razorpay' | 'stripe' | 'paypal';

export interface PaymentConfig {
  ready: boolean;
  provider: Gateway | null;
  currency: string;
  methods?: { id: Gateway; title: string; detail: string }[];
}

export type Checkout =
  | { alreadyEnrolled: true }
  | { provider: 'stripe' | 'paypal'; paymentId: string; url: string }
  | { provider: 'razorpay'; paymentId: string; keyId: string; orderId: string; amount: number; currency: string; courseTitle: string; prefill: { name: string; email: string; contact?: string } };

export const formatPrice = (amount: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
};

/** Razorpay's checkout script, loaded once, only when a learner actually pays. */
let razorpayScript: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  if ((window as any).Razorpay) return Promise.resolve();
  razorpayScript ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      razorpayScript = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return razorpayScript;
}

export interface CheckoutHandlers {
  /** The payment is confirmed by the server (or the course was already open). */
  paid: () => void;
  /** The learner closed the Razorpay window without paying. */
  dismissed: () => void;
  /** The payment failed or could not be confirmed; nothing was charged unless the message says so. */
  failed: (message: string, pending: boolean) => void;
  /** The browser is leaving for the gateway's own payment page. */
  redirecting: () => void;
}

/** Start paying for one course with the chosen gateway (or the only one that is on). */
export async function startCheckout(courseId: string, gateway: Gateway | undefined, h: CheckoutHandlers): Promise<void> {
  const r = await api<Checkout>(`/payments/checkout/${encodeURIComponent(courseId)}`, { body: { gateway } });
  if ('alreadyEnrolled' in r) {
    h.paid();
    return;
  }
  if (r.provider !== 'razorpay') {
    h.redirecting();
    window.location.assign(r.url); // The gateway's own secure page; it sends the learner back here.
    return;
  }
  await loadRazorpay();
  let settled = false;
  const rz = new (window as any).Razorpay({
    key: r.keyId,
    order_id: r.orderId,
    amount: r.amount,
    currency: r.currency,
    name: 'USAII®',
    description: r.courseTitle,
    prefill: r.prefill,
    theme: { color: '#1F6BFF' },
    handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
      settled = true;
      try {
        await api('/payments/razorpay/verify', { body: { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature } });
        h.paid();
      } catch (e) {
        h.failed((e as Error).message, (e as ApiError).status === 402);
      }
    },
    modal: {
      ondismiss: () => {
        if (!settled) h.dismissed();
      },
    },
  });
  rz.on('payment.failed', (resp: { error?: { description?: string } }) => {
    h.failed(resp.error?.description || 'The payment did not go through. You have not been charged. You can try again.', false);
  });
  rz.open();
}
