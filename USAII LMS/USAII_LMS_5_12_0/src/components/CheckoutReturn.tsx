/**
 * Coming back from a payment page (Stripe or PayPal): the address carries ?checkout=...
 * This runs before anything else in the learner portal, so the payment is confirmed (by the server,
 * with the gateway) the moment the learner returns, including someone who has just signed up.
 * Then the course opens on the learner's home page. Without a sign-in, the sign-in page shows first
 * and this runs right after signing in.
 */
import { useEffect, useRef } from 'react';
import type { PublicUser } from '../../shared/types';
import { api, ApiError } from '../lib/api';
import { clearCourseIntent, learnerHome, rememberActiveCourse } from '../lib/intent';
import { Loading, useToast } from './ui';

/** Whether the address is a return from a payment page. */
export function isCheckoutReturn(): boolean {
  return !!new URLSearchParams(window.location.search).get('checkout');
}

export default function CheckoutReturn({ user, onDone, setUser }: { user: PublicUser; onDone: () => void; setUser: (u: PublicUser) => void }) {
  const toast = useToast();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React may run effects twice in development: confirm once.
    started.current = true;
    const q = new URLSearchParams(window.location.search);
    const state = q.get('checkout');
    const sessionId = q.get('session_id');
    const paypalOrder = q.get('token');
    // Take the gateway's details out of the address, so a reload or a shared link does not repeat this.
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);

    void (async () => {
      if (state === 'cancelled') {
        toast('info', 'Payment cancelled. You have not been charged. You can pay whenever you are ready.');
        onDone();
        return;
      }
      try {
        let courseId = '';
        if (state === 'success' && sessionId) courseId = (await api<{ courseId: string }>('/payments/stripe/confirm', { body: { sessionId } })).courseId;
        else if (state === 'paypal' && paypalOrder) courseId = (await api<{ courseId: string }>('/payments/paypal/capture', { body: { orderId: paypalOrder } })).courseId;
        if (courseId) {
          // One course at a time: a newly bought course waits until the current one's certificate is issued.
          let title = '';
          let wait: { id: string; title: string } | null = null;
          try {
            const c = await api<{ course: { title: string }; waitingFor?: { id: string; title: string } | null }>(`/learner/course/${encodeURIComponent(courseId)}`);
            title = c.course.title;
            wait = c.waitingFor ?? null;
          } catch {
            /* open the portal as usual */
          }
          clearCourseIntent();
          rememberActiveCourse(wait ? wait.id : courseId);
          window.location.hash = '#/dashboard';
          toast(
            'success',
            wait
              ? `Payment received. You are enrolled in ${title || 'your new course'}. It opens after you finish ${wait.title} and receive its certificate.`
              : `Payment received. ${title || 'Your course'} is open. Happy learning!`,
          );
          try {
            setUser((await api<{ user: PublicUser }>('/auth/me')).user);
          } catch {
            /* the portal still opens */
          }
        }
      } catch (e) {
        // 402: the gateway has not finished (for example a bank transfer); the course opens when it does.
        toast((e as ApiError).status === 402 ? 'info' : 'error', (e as Error).message);
        // Show the course again (with "Enroll" ready) rather than an empty home page.
        window.location.hash = learnerHome(user);
      }
      onDone();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Loading label="Confirming your payment…" />;
}
