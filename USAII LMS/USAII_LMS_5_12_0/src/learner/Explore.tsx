import { BookOpen, CheckCircle2, Clock, Lock, Sparkles, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { ACCENT, fmtMinutes } from '../lib/format';
import { Button, Card, cx, Empty, ErrorBox, Loading, Modal, navigate, PageHeader, Pill, useConfirm, useLoad, useRoute, useToast } from '../components/ui';
import { clearCourseIntent } from '../lib/intent';
import { formatPrice, loadRazorpay, type Checkout, type Gateway, type PaymentConfig } from '../lib/checkout';
import { useLearner } from './context';

interface CatalogCourse {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  credentialName: string;
  durationLabel: string;
  level: string;
  price: number;
  access: 'open' | 'invite';
  accent: string;
  coverImage?: string;
  modules: { title: string; lessons: number }[];
  lessons: number;
  minutes: number;
  hasFinal: boolean;
  enrolled: boolean;
  /** One course at a time: the course that must be certified before this one opens. */
  waitingFor?: { id: string; title: string } | null;
  learners: number;
  requested: boolean;
}

// Payment types, price formatting and the Razorpay loader are shared with the sign-up form.
export { formatPrice };

export default function Explore() {
  const { reload: reloadHome, setActiveId, readOnly } = useLearner();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad(() => api<{ courses: CatalogCourse[]; payments?: PaymentConfig }>('/learner/catalog'), []);
  const [busy, setBusy] = useState('');
  const currency = data?.payments?.currency ?? 'USD';
  const price = (c: CatalogCourse) => formatPrice(c.price, currency);

  // The course chosen on the website ("Apply Now"): shown first and highlighted, ready to enroll.
  const { query } = useRoute();
  const wanted = query.get('course') ?? '';
  useEffect(() => {
    if (wanted) clearCourseIntent();
  }, [wanted]);
  useEffect(() => {
    if (!data || !wanted) return;
    const t = setTimeout(() => document.getElementById(`course-card-${wanted}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    return () => clearTimeout(t);
  }, [data, wanted]);

  const opened = async (courseId: string, title: string, message?: string) => {
    await reloadHome();
    // One course at a time: a newly bought course waits until the current one's certificate is issued.
    let wait: { id: string; title: string } | null = null;
    try {
      wait = (await api<{ waitingFor?: { id: string; title: string } | null }>(`/learner/course/${courseId}`)).waitingFor ?? null;
    } catch {
      /* show the course as usual */
    }
    if (wait) {
      setActiveId(wait.id);
      toast('success', `You are enrolled in ${title}. It opens after you finish ${wait.title} and receive its certificate.`);
      navigate('dashboard');
      return;
    }
    setActiveId(courseId);
    toast('success', message ?? `You are enrolled in ${title}.`);
    navigate('dashboard');
  };

  // Coming back from Stripe or PayPal is handled before the portal opens: components/CheckoutReturn.tsx.

  const enrollFree = async (c: CatalogCourse) => {
    setBusy(c.id);
    try {
      await api(`/learner/enroll/${c.id}`, { body: {} });
      await opened(c.id, c.title);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const pay = async (c: CatalogCourse) => {
    if (!data?.payments?.ready) {
      toast('error', 'Online payment is not set up on this LMS yet. Please contact support.');
      return;
    }
    const methods = data.payments.methods ?? [];
    let gateway: Gateway | undefined = methods[0]?.id;
    if (methods.length > 1) {
      // Several ways to pay: the learner chooses (UPI for India, cards, PayPal...).
      const picked = await choose(c, methods);
      if (!picked) return;
      gateway = picked;
    } else {
      const ok = await confirm({
        title: `Enroll in ${c.title}?`,
        text: `This micro-credential costs ${price(c)} once, with nothing else to buy. You will pay on a secure payment page${methods[0] ? ` (${methods[0].title})` : ''}, and the course opens as soon as the payment is confirmed.`,
        confirm: `Pay ${price(c)}`,
      });
      if (!ok) return;
    }
    setBusy(c.id);
    try {
      const r = await api<Checkout>(`/payments/checkout/${c.id}`, { body: { gateway } });
      if ('alreadyEnrolled' in r) {
        await opened(c.id, c.title);
        setBusy('');
        return;
      }
      if (r.provider !== 'razorpay') {
        window.location.assign(r.url); // The gateway's own secure page; it sends the learner back here.
        return;
      }
      await loadRazorpay();
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
          try {
            await api('/payments/razorpay/verify', { body: { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature } });
            await opened(c.id, c.title, `Payment received. ${c.title} is open.`);
          } catch (e) {
            toast((e as ApiError).status === 402 ? 'info' : 'error', (e as Error).message);
            void reload(true);
          } finally {
            setBusy('');
          }
        },
        modal: { ondismiss: () => setBusy('') },
      });
      rz.on('payment.failed', (resp: { error?: { description?: string } }) => {
        toast('error', resp.error?.description || 'The payment did not go through. You have not been charged.');
      });
      rz.open();
    } catch (e) {
      toast('error', (e as Error).message);
      setBusy('');
    }
  };

  const enroll = (c: CatalogCourse) => (c.price > 0 ? pay(c) : enrollFree(c));

  // Payment method chooser (shown when more than one gateway is on).
  const [chooser, setChooser] = useState<{ course: CatalogCourse; methods: NonNullable<PaymentConfig['methods']>; pick: Gateway; done: (g: Gateway | null) => void } | null>(null);
  const choose = (course: CatalogCourse, methods: NonNullable<PaymentConfig['methods']>) =>
    new Promise<Gateway | null>((resolve) => setChooser({ course, methods, pick: methods[0].id, done: resolve }));
  const closeChooser = (g: Gateway | null) => {
    chooser?.done(g);
    setChooser(null);
  };
  const chooserUi = chooser && (
    <Modal
      open
      onClose={() => closeChooser(null)}
      title={`Pay for ${chooser.course.title}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => closeChooser(null)}>
            Cancel
          </Button>
          <Button onClick={() => closeChooser(chooser.pick)}>Pay {price(chooser.course)}</Button>
        </div>
      }
    >
      <p className="text-sm text-ink-soft">One payment of {price(chooser.course)}. You pay on the provider's secure page, and the course opens as soon as the payment is confirmed.</p>
      <fieldset className="mt-4 space-y-2">
        <legend className="mb-2 text-sm font-semibold">Choose how to pay</legend>
        {chooser.methods.map((m) => (
          <label key={m.id} className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition', chooser.pick === m.id ? 'border-nblue bg-nblue-soft/40' : 'border-line hover:border-nblue/40')}>
            <input type="radio" name="pay-method" className="mt-1 h-4 w-4 accent-[#1a5fe6]" checked={chooser.pick === m.id} onChange={() => setChooser({ ...chooser, pick: m.id })} />
            <span>
              <span className="block font-semibold">{m.title}</span>
              <span className="block text-[13px] text-ink-soft">{m.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Modal>
  );

  const request = async (c: CatalogCourse) => {
    setBusy(c.id);
    try {
      await api(`/learner/request-access/${c.id}`, { body: {} });
      toast('success', 'Request sent. An admin will respond soon.');
      await reload(true);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />;
  const courses = data?.courses ?? [];
  const chosen = wanted ? courses.find((c) => c.id === wanted) : undefined;

  return (
    <div>
      {chooserUi}
      <PageHeader title="Explore Courses" subtitle="Short, practical AI credentials for everyone. No coding. One fair price, nothing to upgrade." />
      {wanted && (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-3xl border border-npurple/25 bg-gradient-to-r from-nblue-soft to-npurple-soft p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-nblue to-npurple text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            {chosen ? (
              <>
                <div className="font-display font-bold">{chosen.enrolled ? `You are enrolled in ${chosen.title}` : `Your selected course: ${chosen.title}`}</div>
                <div className="text-sm text-ink-soft">{chosen.enrolled && chosen.waitingFor ? `It opens after you finish ${chosen.waitingFor.title} and receive its certificate. One course at a time.` : chosen.enrolled ? 'Open it to continue where you left off.' : chosen.access === 'invite' ? 'This course is by invitation. Request access below.' : `Enroll below to open it. ${chosen.price === 0 ? 'It is free.' : `One payment of ${price(chosen)}.`}`}</div>
              </>
            ) : (
              <>
                <div className="font-display font-bold">That course is not open for enrollment yet</div>
                <div className="text-sm text-ink-soft">Choose any of the courses below, or check back soon.</div>
              </>
            )}
          </div>
          {chosen && !chosen.enrolled && chosen.access !== 'invite' && (
            <Button disabled={readOnly} loading={busy === chosen.id} onClick={() => void enroll(chosen)}>
              {chosen.price === 0 ? 'Start for free' : `Enroll for ${price(chosen)}`}
            </Button>
          )}
        </div>
      )}
      {courses.length === 0 && <Empty icon={<BookOpen className="h-6 w-6" />} title="No courses published yet" />}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((c) => {
          const a = ACCENT[c.accent] ?? ACCENT.blue;
          return (
            <Card key={c.id} id={`course-card-${c.id}`} hover className={cx('flex flex-col !p-0 overflow-hidden', c.id === wanted && 'ring-4 ring-npurple/40')}>
              <div className="relative h-28 overflow-hidden" style={{ background: c.coverImage ? undefined : `linear-gradient(135deg, ${a.hex}, ${a.hex}88 60%, #ffffff)` }}>
                {c.coverImage && <img src={c.coverImage} alt="" className="h-full w-full object-cover" />}
                <div className="absolute bottom-3 left-4 flex gap-1.5">
                  <span className="on-color rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-bold" style={{ color: a.text }}>
                    {c.price === 0 ? 'Free' : price(c)}
                  </span>
                  {c.access === 'invite' && (
                    <span className="on-color inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                      <Lock className="h-3 w-3" /> By invitation
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-bold leading-snug">{c.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{c.subtitle}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Pill color="gray">
                    <Clock className="h-3 w-3" /> {c.durationLabel || fmtMinutes(c.minutes)}
                  </Pill>
                  <Pill color="gray">
                    {c.lessons} lessons{c.hasFinal ? ' + final' : ''}
                  </Pill>
                  <Pill color="gray">
                    <Users className="h-3 w-3" /> {c.learners}
                  </Pill>
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-ink-soft">{c.description}</p>
                <p className="mt-2 text-xs text-ink-faint">Earn: USAII® Certificate of Completion</p>
                <div className="mt-auto pt-5">
                  {c.enrolled && c.waitingFor ? (
                    <div>
                      <Button
                        variant="secondary"
                        className="w-full"
                        icon={<Lock className="h-4 w-4 text-npurple" />}
                        onClick={() => {
                          setActiveId(c.waitingFor!.id);
                          navigate('learning');
                        }}
                      >
                        Enrolled: opens after your current course
                      </Button>
                      <p className="mt-2 text-center text-[12px] text-ink-faint">Finish {c.waitingFor.title} and receive its certificate first.</p>
                    </div>
                  ) : c.enrolled ? (
                    <Button
                      variant="secondary"
                      className="w-full"
                      icon={<CheckCircle2 className="h-4 w-4 text-ngreen" />}
                      onClick={() => {
                        setActiveId(c.id);
                        navigate('dashboard');
                      }}
                    >
                      Enrolled: go to course
                    </Button>
                  ) : c.access === 'invite' ? (
                    <Button variant="secondary" className="w-full" disabled={readOnly || c.requested} loading={busy === c.id} onClick={() => void request(c)}>
                      {c.requested ? 'Access requested' : 'Request access'}
                    </Button>
                  ) : (
                    <Button className="w-full" disabled={readOnly} loading={busy === c.id} onClick={() => void enroll(c)}>
                      {c.price === 0 ? 'Start for free' : `Enroll for ${price(c)}`}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
