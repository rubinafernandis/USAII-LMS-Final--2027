import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, GraduationCap, KeyRound, Lock, Mail, Presentation } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { PublicUser } from '../../shared/types';
import { api, tokenStore } from '../lib/api';
import type { PaymentConfig } from '../lib/checkout';
import { authModeFromHash, courseIntent, setCourseIntent } from '../lib/intent';
import Signup, { BusyDot, SUBMIT_CLS } from './Signup';
import { cx, Input, Label, Logo, passwordOk } from './ui';

/** Soft floating dots in the brand colors. */
function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: `${(i * 41) % 100}%`,
        bottom: `${(i * 17) % 30}%`,
        delay: `${(i * 0.9) % 10}s`,
        dur: `${10 + ((i * 7) % 8)}s`,
        color: ['#1F6BFF', '#8B3DFF', '#FF2E93', '#00C77F'][i % 4],
      })),
    [],
  );
  return (
    <>
      {dots.map((d, i) => (
        <span key={i} className="particle" style={{ left: d.left, bottom: d.bottom, animationDelay: d.delay, animationDuration: d.dur, background: d.color, boxShadow: `0 0 10px ${d.color}` }} />
      ))}
    </>
  );
}

const HEADLINE = ['AI', 'is', 'for', 'Everyone.'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_HELP = 'At least 12 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.';
type Mode = 'signin' | 'signup' | 'forgot' | 'code' | 'reset';

export default function Login({ onAuthed, notice, hint }: { onAuthed: (u: PublicUser) => void; notice?: string; hint?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(notice ?? '');
  const [success, setSuccess] = useState<PublicUser | null>(null);
  const [shake, setShake] = useState(0);
  // Three doors into the same portal: it tells people they are in the right place.
  const [role, setRole] = useState<'learner' | 'instructor'>('learner');
  const ROLES = [
    { id: 'learner' as const, label: 'Learner', icon: GraduationCap, color: '#1F6BFF', hint: 'Take courses and earn your micro-credential.' },
    { id: 'instructor' as const, label: 'Admin', icon: Presentation, color: '#8B3DFF', hint: 'Build and publish courses, and review learners’ work.' },
  ];
  const current = ROLES.find((r) => r.id === role)!;

  // Sign in; sign up (components/Signup.tsx); or reset a forgotten password:
  //   forgot (email) -> code (the 6-digit code from the email) -> reset (new password), or
  //   the emailed link (#/reset?token=...) -> reset (new password).
  const resetToken = useMemo(() => {
    const h = window.location.hash;
    return h.startsWith('#/reset') ? new URLSearchParams(h.split('?')[1] ?? '').get('token') ?? '' : '';
  }, []);
  const [linkToken, setLinkToken] = useState(resetToken);
  const [linkBad, setLinkBad] = useState(false);
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : authModeFromHash() ?? 'signin');
  const [info, setInfo] = useState(hint ?? '');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [opts, setOpts] = useState<{ signup: boolean; emailReset: boolean; siteUrl?: string | null; payments?: PaymentConfig }>({ signup: true, emailReset: true });
  useEffect(() => {
    api<{ signup: boolean; emailReset: boolean; siteUrl?: string | null; payments?: PaymentConfig }>('/auth/options')
      .then(setOpts)
      .catch(() => undefined);
  }, []);
  // A course chosen on the website (or on the sign-up form) is not shown here: signing in is for
  // existing accounts. After signing in, the learner still lands on that course (lib/intent.ts).
  // "Send a new code" waits a minute between emails.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  // Opened from the emailed link: check it first, so an old link says so before a password is typed.
  useEffect(() => {
    if (!resetToken) return;
    api('/auth/reset/check', { body: { token: resetToken } }).catch((e) => {
      setLinkBad(true);
      setError((e as Error).message);
    });
  }, [resetToken]);

  const go = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
    if (m !== 'signin') setRole('learner');
    if (m === 'forgot') {
      setLinkToken('');
      setLinkBad(false);
    }
    // Keep the address in step, so a reload or the back button shows the same form.
    if (m === 'signin' || m === 'signup') {
      const id = courseIntent();
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${m === 'signup' ? 'signup' : 'login'}${id ? `?course=${encodeURIComponent(id)}` : ''}`);
    } else if (window.location.hash.startsWith('#/reset')) {
      // Leaving the emailed link: keep its token out of the address.
      window.history.replaceState(null, '', `${window.location.pathname}#/login`);
    }
  };

  const finish = (res: { token: string; user: PublicUser }) => {
    tokenStore.set(res.token);
    if (window.location.hash.startsWith('#/reset')) window.history.replaceState(null, '', window.location.pathname);
    setSuccess(res.user);
    setTimeout(() => onAuthed(res.user), 900);
  };
  // After sign up (already signed in by the sign-up form).
  const welcome = (u: PublicUser) => {
    setSuccess(u);
    setTimeout(() => onAuthed(u), 900);
  };
  const oops = (message: string) => {
    setError(message);
    setShake((x) => x + 1);
  };

  const sendCode = async () => {
    const r = await api<{ message: string }>('/auth/forgot', { body: { email: email.trim() } });
    setCode('');
    setMode('code');
    setError('');
    setInfo(r.message);
    setResendIn(60);
  };

  const resend = async () => {
    if (resendIn > 0 || busy) return;
    setBusy(true);
    try {
      await sendCode();
    } catch (err) {
      oops((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (mode === 'forgot' && !EMAIL_RE.test(email.trim())) return oops('Enter the email address of your account.');
    if (mode === 'code' && code.replace(/\D/g, '').length !== 6) return oops('Enter the 6-digit code from the email.');
    if (mode === 'reset') {
      if (!passwordOk(password) || password.length > 128) return oops(`Choose a stronger password: ${PASSWORD_HELP.charAt(0).toLowerCase()}${PASSWORD_HELP.slice(1)}`);
      if (password !== confirm) return oops('The two passwords do not match.');
    }
    if (mode === 'signin' && (!email.trim() || !password)) return oops('Enter your email and password.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const res = await api<{ token: string; user: PublicUser }>('/auth/login', { body: { email, password, role } });
        tokenStore.set(res.token);
        setSuccess(res.user);
        setTimeout(() => onAuthed(res.user), 900);
        return;
      }
      if (mode === 'forgot') await sendCode();
      else if (mode === 'code') {
        const c = code.replace(/\D/g, '');
        await api('/auth/reset/check', { body: { email: email.trim(), code: c } });
        setCode(c);
        setPassword('');
        setConfirm('');
        setInfo('');
        setMode('reset');
      } else if (mode === 'reset') {
        finish(await api<{ token: string; user: PublicUser }>('/auth/reset', { body: linkToken ? { token: linkToken, password } : { email: email.trim(), code, password } }));
        return;
      }
      setBusy(false);
    } catch (err) {
      oops((err as Error).message);
      setBusy(false);
    }
  };

  const heading: Record<Exclude<Mode, 'signin' | 'signup'>, [string, string]> = {
    forgot: ['Reset your password', 'Enter the email address of your account. We will email you a 6-digit code and a reset link.'],
    code: ['Enter your reset code', 'Type the 6-digit code from the email. The code works for 24 hours.'],
    reset: ['Choose a new password', 'After saving, you are signed in, and any other sign-ins end for safety.'],
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <div className="aurora">
        <span />
        <span />
        <span />
        <span />
      </div>
      <Particles />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
        <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Logo width={320} />
        </motion.header>

        <main className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.15fr_1fr]">
          {/* The promise, in three lines */}
          <div className="text-center lg:text-left">
            <h1 className="text-[44px] font-extrabold leading-[1.04] sm:text-[62px]">
              {HEADLINE.map((w, i) => (
                <span key={w}>
                  <motion.span
                    initial={{ opacity: 0, y: 28, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ delay: 0.15 + i * 0.11, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className={`inline-block ${w === 'Everyone.' ? 'neon-text' : ''}`}
                  >
                    {w}
                  </motion.span>
                  {i < HEADLINE.length - 1 ? ' ' : ''}
                </span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.72, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-5 max-w-xl font-display text-[24px] font-bold leading-snug text-ink sm:text-[30px] lg:mx-0"
            >
              {['Learn AI.', 'Work smarter.', 'Save time.'].map((chunk, i) => (
                <motion.span
                  key={chunk}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.78 + i * 0.14, duration: 0.45 }}
                  className="mr-2 inline-block"
                  style={{ color: ['#1F6BFF', '#8B3DFF', '#FF2E93'][i] }}
                >
                  {chunk}
                </motion.span>
              ))}
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.25, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-4 max-w-xl text-[20px] font-semibold leading-relaxed text-ink-soft sm:text-[23px] lg:mx-0"
            >
              Level up your career with <span className="grad-text font-extrabold">USAII&reg; Micro Credentials!</span>
            </motion.p>

            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-8 h-1.5 w-48 origin-left rounded-full bg-gradient-to-r from-nblue via-npurple to-npink lg:mx-0"
            />
          </div>

          {/* Sign in */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', damping: 20, delay: 0.3 }} className="mx-auto w-full max-w-md">
            <motion.div key={shake} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }} className="beam">
              <div className="beam-inner relative overflow-hidden p-8 sm:p-10">
                <AnimatePresence mode="wait">
                  {success ? (
                    <motion.div key="ok" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} className="flex min-h-[300px] flex-col items-center justify-center text-center">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10 }}>
                        <CheckCircle2 className="h-16 w-16 text-ngreen" />
                      </motion.div>
                      <div className="mt-4 font-display text-2xl font-bold">Welcome, {success.name.split(' ')[0]}</div>
                      <p className="mt-1 text-ink-soft">Opening your workspace…</p>
                    </motion.div>
                  ) : (
                    <motion.div key="form" exit={{ opacity: 0, y: -10 }}>
                      {mode === 'signup' ? (
                        <Signup
                          initialCourseId={courseIntent()}
                          payments={opts.payments ?? null}
                          onWelcome={welcome}
                          onSignIn={(courseId) => {
                            if (courseId) setCourseIntent(courseId);
                            go('signin');
                          }}
                        />
                      ) : (
                        <>
                          {mode !== 'signin' && (
                            <div>
                              <h2 className="font-display text-2xl font-bold">{heading[mode][0]}</h2>
                              <p className="mt-1 text-sm text-ink-soft">{heading[mode][1]}</p>
                            </div>
                          )}
                          {mode === 'signin' && (
                            <>
                              <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-mist p-1.5" role="tablist" aria-label="Choose how you are signing in">
                                {ROLES.map((r) => {
                                  const on = role === r.id;
                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      role="tab"
                                      aria-selected={on}
                                      onClick={() => {
                                        setRole(r.id);
                                        setError('');
                                      }}
                                      className={cx('relative flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[12px] font-bold transition', on ? 'text-white' : 'text-ink-soft hover:text-ink')}
                                    >
                                      {on && <motion.span layoutId="role-pill" className="absolute inset-0 rounded-xl" style={{ background: `linear-gradient(135deg, ${r.color}, ${r.color}bb)` }} transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
                                      <r.icon className="relative h-4 w-4" />
                                      <span className="relative">{r.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              <AnimatePresence mode="wait">
                                <motion.p key={role} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-2.5 text-sm text-ink-soft">
                                  {current.hint}
                                </motion.p>
                              </AnimatePresence>
                            </>
                          )}
                          <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
                            {(mode === 'signin' || mode === 'forgot') && (
                              <div>
                                <Label htmlFor="email">Email</Label>
                                <div className="group relative">
                                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint transition group-focus-within:text-nblue" />
                                  <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" placeholder="you@example.com" autoFocus maxLength={200} />
                                </div>
                              </div>
                            )}
                            {mode === 'code' && (
                              <div>
                                <Label htmlFor="code">6-digit code</Label>
                                <div className="group relative">
                                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint transition group-focus-within:text-nblue" />
                                  <Input
                                    id="code"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="pl-10 font-mono text-lg tracking-[0.5em]"
                                    placeholder="000000"
                                    autoFocus
                                  />
                                </div>
                                <p className="mt-1.5 text-xs text-ink-faint">Sent to {email.trim()}</p>
                              </div>
                            )}
                            {(mode === 'signin' || (mode === 'reset' && !linkBad)) && (
                              <div>
                                <Label htmlFor="password">{mode === 'signin' ? 'Password' : 'New password'}</Label>
                                <div className="group relative">
                                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint transition group-focus-within:text-npurple" />
                                  <Input id="password" type={show ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-11" aria-describedby={mode === 'signin' ? undefined : 'pw-rule'} autoFocus={mode === 'reset'} maxLength={128} />
                                  <button type="button" onClick={() => setShow((x) => !x)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-mist hover:text-ink">
                                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                </div>
                                {mode === 'reset' && (
                                  <p id="pw-rule" className="mt-1.5 text-xs text-ink-faint">
                                    {PASSWORD_HELP}
                                  </p>
                                )}
                              </div>
                            )}
                            {mode === 'reset' && !linkBad && (
                              <div>
                                <Label htmlFor="confirm">Confirm new password</Label>
                                <div className="group relative">
                                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint transition group-focus-within:text-npurple" />
                                  <Input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={cx('pl-10', confirm && confirm !== password && '!border-npink/60')} maxLength={128} />
                                </div>
                              </div>
                            )}
                            {info && (
                              <div role="status" className="rounded-2xl bg-ngreen-soft px-4 py-2.5 text-sm font-medium text-ngreen-ink">
                                {info}
                              </div>
                            )}
                            <AnimatePresence>
                              {error && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} role="alert" className="rounded-2xl bg-npink-soft px-4 py-2.5 text-sm font-medium text-npink">
                                  {error}
                                </motion.div>
                              )}
                            </AnimatePresence>
                            {mode === 'reset' && linkBad ? (
                              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={() => go('forgot')} className={SUBMIT_CLS}>
                                Send me a new code <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                              </motion.button>
                            ) : (
                              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={busy} className={SUBMIT_CLS}>
                                {busy ? (
                                  <BusyDot />
                                ) : (
                                  <>
                                    {mode === 'signin' ? `Sign in as ${current.label}` : mode === 'forgot' ? 'Send reset code' : mode === 'code' ? 'Continue' : 'Save new password'} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                                  </>
                                )}
                              </motion.button>
                            )}
                          </form>
                          <div className="mt-4 space-y-1.5 text-center text-[13px] text-ink-soft">
                            {mode === 'signin' ? (
                              <>
                                <button type="button" onClick={() => go('forgot')} className="font-semibold text-nblue hover:underline">
                                  Forgot password?
                                </button>
                                {role === 'learner' &&
                                  (opts.signup ? (
                                    <p>
                                      New here?{' '}
                                      <button type="button" onClick={() => go('signup')} className="font-semibold text-nblue hover:underline">
                                        Create a learner account
                                      </button>
                                    </p>
                                  ) : (
                                    <p className="text-xs text-ink-faint">New learner accounts are not open right now.</p>
                                  ))}
                              </>
                            ) : (
                              <>
                                {mode === 'code' && (
                                  <p>
                                    Did not get it?{' '}
                                    <button type="button" onClick={() => void resend()} disabled={resendIn > 0 || busy} className="font-semibold text-nblue hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline">
                                      {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
                                    </button>
                                  </p>
                                )}
                                {mode === 'code' && (
                                  <p>
                                    <button type="button" onClick={() => go('forgot')} className="font-semibold text-nblue hover:underline">
                                      Use another email
                                    </button>
                                  </p>
                                )}
                                <button type="button" onClick={() => go('signin')} className="font-semibold text-nblue hover:underline">
                                  Back to sign in
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        </main>

        <footer className="flex flex-col items-center gap-2 text-center text-xs text-ink-faint">
          {opts.siteUrl && (
            <a href={opts.siteUrl} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-nblue hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Explore AI Micro Credentials
            </a>
          )}
          <span>© {new Date().getFullYear()} United States Artificial Intelligence Institute</span>
        </footer>
      </div>
    </div>
  );
}
