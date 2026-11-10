/**
 * Sign up: choose a course (with its price), enter personal details, "Create my account", pay.
 *
 * 1. The account is created and signed in at once (the sign-in stays in this browser).
 * 2. A paid course goes straight to the payment gateway. Razorpay opens over this page; Stripe and
 *    PayPal open their own page and return to components/CheckoutReturn.tsx.
 * 3. When the server has confirmed the payment, the learner portal opens on that course. No second
 *    sign-in is needed. After signing out, the person signs in with their email and password.
 * If the payment is not completed, the account stays; signing in later leads back to paying.
 * A free course opens straight after the account is created.
 */
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, BookOpen, CheckCircle2, CreditCard, Eye, EyeOff, Globe, Lock, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { PublicUser } from '../../shared/types';
import { COUNTRY_CODES, countryName, normalizePhone } from '../../shared/countries';
import { api, tokenStore } from '../lib/api';
import { formatPrice, startCheckout, type Gateway, type PaymentConfig } from '../lib/checkout';
import { clearCourseIntent, rememberActiveCourse } from '../lib/intent';
import { cx, Input, Label, Select } from './ui';

interface SignupCourse {
  id: string;
  slug: string;
  title: string;
  price: number;
  access: string;
  durationLabel?: string;
}
type Account = { user: PublicUser; course: { id: string; title: string; price: number } };
type Stage = 'form' | 'paying' | 'redirecting' | 'pay';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const strongPassword = (v: string) => v.length >= 12 && v.length <= 128 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v);
const PASSWORD_HELP = 'At least 12 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.';

export const SUBMIT_CLS =
  'btn-shine group flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-nblue via-npurple to-npink bg-[length:200%_100%] bg-left font-semibold text-white shadow-lg shadow-npurple/30 transition-[background-position] duration-500 hover:bg-right disabled:opacity-70';

export function BusyDot() {
  return <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white" />;
}

function Field({ id, label, icon, children }: { id: string; label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="group relative">
        {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint transition group-focus-within:text-nblue">{icon}</span>}
        {children}
      </div>
    </div>
  );
}

export default function Signup({
  initialCourseId,
  payments,
  onSignIn,
  onWelcome,
}: {
  initialCourseId: string;
  payments: PaymentConfig | null;
  onSignIn: (courseId: string) => void;
  onWelcome: (u: PublicUser) => void;
}) {
  const [courses, setCourses] = useState<SignupCourse[] | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [loadError, setLoadError] = useState('');
  const [courseId, setCourseId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [gateway, setGateway] = useState<Gateway | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const account = useRef<Account | null>(null);

  // Courses anyone can enroll in, with today's prices from the LMS.
  useEffect(() => {
    api<{ currency: string; courses: SignupCourse[] }>('/public/catalog')
      .then((r) => {
        const open = r.courses.filter((c) => c.access === 'open');
        setCourses(open);
        setCurrency(r.currency || 'USD');
        // The course chosen on the website ("Enroll Now") is selected for them.
        const wanted = open.find((c) => c.id === initialCourseId || c.slug === initialCourseId);
        if (wanted) setCourseId(wanted.id);
        else if (open.length === 1) setCourseId(open[0].id);
      })
      .catch((e) => setLoadError((e as Error).message));
  }, [initialCourseId]);

  const methods = payments?.methods ?? [];
  useEffect(() => {
    if (!gateway && methods.length) setGateway(methods[0].id);
  }, [methods, gateway]);

  const countries = useMemo(() => COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name)), []);
  const course = courses?.find((c) => c.id === courseId);
  const paid = !!course && course.price > 0;
  const price = (c: { price: number }) => (c.price > 0 ? formatPrice(c.price, currency) : 'Free');
  const payReady = !!payments?.ready;

  // A short shake on errors. Only the form's frame moves; what was typed stays (it lives in this component).
  const [shake, setShake] = useState(0);
  const fail = (message: string) => {
    setError(message);
    setShake((x) => x + 1);
  };

  /** The portal opens on the course, already signed in. */
  const welcome = async (cid: string) => {
    rememberActiveCourse(cid);
    clearCourseIntent();
    // The address still reads #/signup?course=...: replace it, so the portal opens on the course's home.
    window.history.replaceState(null, '', `${window.location.pathname}#/dashboard`);
    let u = account.current?.user ?? null;
    try {
      u = (await api<{ user: PublicUser }>('/auth/me')).user;
    } catch {
      /* use the account as created */
    }
    if (u) onWelcome(u);
  };

  const pay = async (cid: string) => {
    setStage('paying');
    setError('');
    setInfo('');
    try {
      await startCheckout(cid, gateway, {
        paid: () => void welcome(cid),
        dismissed: () => {
          setStage('pay');
          setInfo('Payment not completed. You have not been charged. Pay now to open your course, or pay later.');
        },
        failed: (message, pending) => {
          setStage('pay');
          if (pending) setInfo(message);
          else setError(message);
        },
        redirecting: () => setStage('redirecting'),
      });
    } catch (e) {
      setStage('pay');
      setError((e as Error).message);
    }
  };

  const validate = (): string => {
    if (!courseId || !course) return 'Choose the course you want to enroll in.';
    if (name.trim().length < 2) return 'Enter your full name.';
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (!normalizePhone(phone)) return 'Enter a valid mobile number with its country code, for example +1 555 123 4567.';
    if (!country) return 'Choose your country.';
    if (!strongPassword(password)) return `Choose a stronger password: ${PASSWORD_HELP.charAt(0).toLowerCase()}${PASSWORD_HELP.slice(1)}`;
    if (password !== confirm) return 'The two passwords do not match.';
    if (paid && !payReady) return 'Online payment is not available right now. Please try again later.';
    return '';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const problem = validate();
    if (problem) return fail(problem);
    setBusy(true);
    try {
      const r = await api<Account & { token: string }>('/auth/register', { body: { courseId, name, email, phone, country, password } });
      tokenStore.set(r.token);
      account.current = { user: r.user, course: r.course };
      if (r.course.price > 0) await pay(r.course.id);
      else await welcome(r.course.id);
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const methodChooser = paid && methods.length > 1 && (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-semibold text-ink">Pay with</legend>
      <div className="space-y-2">
        {methods.map((m) => (
          <label key={m.id} className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-2.5 transition', gateway === m.id ? 'border-nblue bg-nblue-soft/40' : 'border-line hover:border-nblue/40')}>
            <input type="radio" name="gateway" value={m.id} checked={gateway === m.id} onChange={() => setGateway(m.id)} className="mt-1 accent-[#1F6BFF]" />
            <span>
              <span className="block text-sm font-bold text-ink">{m.title}</span>
              <span className="block text-xs text-ink-soft">{m.detail}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  const messages = (
    <>
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
    </>
  );

  /* ---------- After the account exists: paying ---------- */
  if (stage === 'paying' || stage === 'redirecting')
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center text-center" data-testid="signup-paying">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-nblue to-npurple text-white">
          <ShieldCheck className="h-7 w-7" />
        </span>
        <div className="mt-4 font-display text-xl font-bold">{stage === 'redirecting' ? 'Taking you to the secure payment page…' : 'Opening secure payment…'}</div>
        <p className="mt-1 text-sm text-ink-soft">Your account is ready. Your course opens as soon as the payment is confirmed.</p>
      </div>
    );

  if (stage === 'pay' && account.current) {
    const a = account.current;
    return (
      <div data-testid="signup-pay">
        <div className="flex items-center gap-2 text-sm font-semibold text-ngreen-ink">
          <CheckCircle2 className="h-5 w-5" /> Account created for {a.user.email}
        </div>
        <h2 className="mt-3 font-display text-2xl font-bold">Complete your payment</h2>
        <p className="mt-1 text-sm text-ink-soft">Pay once to open your course and start learning.</p>
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-npurple/20 bg-npurple-soft/60 px-3.5 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-nblue to-npurple text-white">
            <BookOpen className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{a.course.title}</span>
          <span className="shrink-0 text-sm font-bold text-ink">{price(a.course)}</span>
        </div>
        <div className="mt-5 space-y-4">
          {methodChooser}
          {messages}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={() => void pay(a.course.id)} className={SUBMIT_CLS}>
            <CreditCard className="h-4 w-4" /> Pay {price(a.course)} securely
          </motion.button>
        </div>
        <div className="mt-4 text-center text-[13px]">
          <button type="button" onClick={() => onWelcome(a.user)} className="font-semibold text-nblue hover:underline">
            Pay later and go to my account
          </button>
        </div>
      </div>
    );
  }

  /* ---------- The sign-up form ---------- */
  return (
    <motion.div key={shake} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }}>
      <h2 className="font-display text-2xl font-bold">Create your account</h2>
      <p className="mt-1 text-sm text-ink-soft">Choose your course, add your details, then pay securely and start learning.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate data-testid="signup-form">
        <Field id="su-course" label="Course" icon={<BookOpen className="h-4 w-4" />}>
          <Select id="su-course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className="pl-10" disabled={!courses || !courses.length}>
            <option value="">{courses ? (courses.length ? 'Select a course' : 'No course is open for enrollment') : loadError ? 'Courses could not be loaded' : 'Loading courses…'}</option>
            {courses?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · {price(c)}
              </option>
            ))}
          </Select>
        </Field>
        {loadError && <p className="text-xs text-npink">{loadError}</p>}
        {paid && !payReady && <p className="text-xs text-npink">Online payment is not available right now. Please try again later.</p>}

        <Field id="su-name" label="Full name" icon={<User className="h-4 w-4" />}>
          <Input id="su-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="pl-10" placeholder="Your name, as on your certificate" maxLength={80} />
        </Field>
        <Field id="su-email" label="Email" icon={<Mail className="h-4 w-4" />}>
          <Input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" placeholder="you@example.com" maxLength={200} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="su-phone" label="Mobile number" icon={<Phone className="h-4 w-4" />}>
            <Input id="su-phone" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-10" placeholder="+1 555 123 4567" maxLength={25} />
          </Field>
          <Field id="su-country" label="Country" icon={<Globe className="h-4 w-4" />}>
            <Select id="su-country" autoComplete="country" value={country} onChange={(e) => setCountry(e.target.value)} className="pl-10">
              <option value="">Select</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field id="su-password" label="Password" icon={<Lock className="h-4 w-4" />}>
          <Input id="su-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-11" aria-describedby="su-pw-rule" maxLength={128} />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-mist hover:text-ink">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </Field>
        <p id="su-pw-rule" className="-mt-2 text-xs text-ink-faint">
          {PASSWORD_HELP}
        </p>
        <Field id="su-confirm" label="Confirm password" icon={<Lock className="h-4 w-4" />}>
          <Input id="su-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={cx('pl-10', confirm && confirm !== password && '!border-npink/60')} maxLength={128} />
        </Field>
        {methodChooser}
        {messages}
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={busy || !courses?.length} className={SUBMIT_CLS}>
          {busy ? (
            <BusyDot />
          ) : (
            <>
              Create my account <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </>
          )}
        </motion.button>
        {course && (
          <p className="text-center text-xs text-ink-faint">
            {paid ? `Next: a secure payment of ${price(course)}. Your course opens as soon as it is confirmed.` : 'Your course opens right after your account is created.'}
          </p>
        )}
      </form>
      <p className="mt-4 text-center text-[13px] text-ink-soft">
        Already have an account?{' '}
        <button type="button" onClick={() => onSignIn(courseId)} className="font-semibold text-nblue hover:underline">
          Sign in
        </button>
      </p>
    </motion.div>
  );
}
