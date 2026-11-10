import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PublicUser } from '../shared/types';
import { api, ApiError, setUnauthorizedHandler, tokenStore } from './lib/api';
import { captureCourseIntent, clearCourseIntent, learnerHome } from './lib/intent';
import { SessionCtx, useSession, type Session } from './lib/session';
import CheckoutReturn, { isCheckoutReturn } from './components/CheckoutReturn';
import Login from './components/Login';
import { ChangePasswordModal } from './components/Shell';
import { ConfirmProvider, Loading, Logo, ToastProvider, useRoute } from './components/ui';
import { PrefsProvider } from './learner/prefs';
import { VerifyPage } from './learner/Credential';
import LearnerApp from './learner/LearnerApp';
import Onboarding from './learner/Onboarding';
import StaffApp from './staff/StaffApp';

// A visitor from the website's "Apply Now" brings the chosen course in the address (#/signup?course=...).
captureCourseIntent();

function Authed({ user }: { user: PublicUser }) {
  const session = useSession();
  // Back from Stripe or PayPal: confirm the payment first, then open the portal on that course.
  const [returning, setReturning] = useState(() => user.role === 'learner' && isCheckoutReturn());
  if (returning) return <CheckoutReturn user={user} setUser={session.setUser} onDone={() => setReturning(false)} />;
  if (user.mustChangePassword)
    return (
      <div className="relative flex min-h-screen items-center justify-center">
        <div className="aurora">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="absolute left-6 top-5">
          <Logo />
        </div>
        <ChangePasswordModal open forced onClose={() => undefined} />
      </div>
    );
  if (user.role === 'learner' && !user.onboarded) return <Onboarding />;
  return user.role === 'learner' ? <LearnerApp key={user.id} /> : <StaffApp key={user.id} />;
}

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [booting, setBooting] = useState(!!tokenStore.get());
  // Why the server signed this person out (for example, a suspended account), shown on the sign-in screen.
  const [signedOutReason, setSignedOutReason] = useState('');
  const route = useRoute();

  const logout = useCallback(() => {
    tokenStore.set(null);
    clearCourseIntent();
    setSignedOutReason('');
    setUser(null);
    window.location.hash = '';
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((message) => {
      tokenStore.set(null);
      setUser(null);
      setSignedOutReason(message);
    });
    if (!tokenStore.get()) return;
    api<{ user: PublicUser }>('/auth/me')
      .then((r) => setUser(r.user))
      // Only an expired or rejected sign-in signs the person out; a network hiccup does not.
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) tokenStore.set(null);
      })
      .finally(() => setBooting(false));
  }, []);

  const session: Session | null = useMemo(() => (user ? { user, setUser, logout } : null), [user, logout]);

  // Already signed in and arriving from the website's "Apply Now" or "Login": go straight on.
  useEffect(() => {
    if (!user || (route.view !== 'signup' && route.view !== 'login')) return;
    if (user.role !== 'learner') clearCourseIntent();
    window.location.hash = user.role === 'learner' ? learnerHome(user) : '#/cohort';
  }, [user, route.view]);

  let content;
  if (route.view === 'verify' && route.params[0]) content = <VerifyPage certId={route.params[0]} />;
  else if (booting) content = <Loading label="Signing you in…" />;
  else if (!session)
    content = (
      <Login
        notice={signedOutReason}
        hint={isCheckoutReturn() && new URLSearchParams(window.location.search).get('checkout') !== 'cancelled' ? 'Sign in to finish. Your course opens as soon as your payment is confirmed.' : ''}
        onAuthed={(u) => {
          setSignedOutReason('');
          // Land on the role's home after sign-in: the course chosen on the website, or the course
          // chosen at sign up that still needs paying; otherwise the dashboard.
          if (u.role !== 'learner') clearCourseIntent();
          window.location.hash = u.role === 'learner' ? learnerHome(u) : '#/cohort';
          setUser(u);
        }}
      />
    );
  else
    content = (
      <SessionCtx.Provider value={session}>
        <Authed user={session.user} />
      </SessionCtx.Provider>
    );

  return (
    <PrefsProvider>
      <ToastProvider>
        <ConfirmProvider>{content}</ConfirmProvider>
      </ToastProvider>
    </PrefsProvider>
  );
}
