/**
 * Payment settings (admins): turn on Razorpay, Stripe and PayPal, paste their keys, test them.
 * Secrets are write-only: once saved, only "ends 4f2a" is shown. Values set on the host (environment
 * variables) are shown as fixed and cannot be changed here.
 */
import { CheckCircle2, Copy, CreditCard, Landmark, Loader2, Mail, Send, ShieldCheck, XCircle } from 'lucide-react';
import { copyText } from '../lib/clipboard';
import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import { api } from '../lib/api';
import { Button, Card, ErrorBox, Loading, PageHeader, cx, useLoad, useToast } from '../components/ui';

type Secret = { set: boolean; hint: string; unreadable: boolean };
interface View {
  currency: string;
  currencies: string[];
  locked: {
    currency: boolean;
    razorpay: Record<string, boolean>;
    stripe: Record<string, boolean>;
    paypal: Record<string, boolean>;
  };
  publicUrlSet: boolean;
  site: string;
  razorpay: { enabled: boolean; on: boolean; keyId: string; keySecret: Secret; webhookSecret: Secret; webhookUrl: string };
  stripe: { enabled: boolean; on: boolean; secretKey: Secret; webhookSecret: Secret; webhookUrl: string };
  paypal: { enabled: boolean; on: boolean; mode: 'sandbox' | 'live'; clientId: string; clientSecret: Secret; webhookId: string; webhookUrl: string };
  updatedAt?: string;
}
type Gw = 'razorpay' | 'stripe' | 'paypal';

const INPUT = 'h-10 w-full rounded-xl border border-line bg-mist/50 px-3 text-sm outline-none focus:border-nblue focus:bg-white disabled:opacity-60';

/** A field: the label is only the field name; help text is linked as its description (screen readers read both, separately). */
function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const control = isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { id, 'aria-describedby': hint ? hintId : undefined }) : children;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold">
        {label}
      </label>
      {control}
      {hint && (
        <span id={hintId} className="mt-1 block text-[12px] text-ink-faint">
          {hint}
        </span>
      )}
    </div>
  );
}

function SecretInput({ label, value, onChange, secret, locked, placeholder }: { label: string; value: string; onChange: (v: string) => void; secret: Secret; locked?: boolean; placeholder: string }) {
  const hint = locked
    ? 'Set on the server (environment variable). Change it there.'
    : secret.unreadable
      ? 'The saved value can no longer be read (the server secret changed). Paste it again.'
      : secret.set
        ? `Saved (${secret.hint}). Leave empty to keep it, or paste a new one to replace it.`
        : 'Not set yet.';
  return (
    <Row label={label} hint={hint}>
      <input type="password" autoComplete="off" spellCheck={false} disabled={locked} value={value} onChange={(e) => onChange(e.target.value)} placeholder={secret.set ? '••••••••  (saved)' : placeholder} className={INPUT} />
    </Row>
  );
}

function WebhookUrl({ url }: { url: string }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2 rounded-xl bg-mist/60 px-3 py-2 text-[12.5px]">
      <span className="shrink-0 font-semibold text-ink-soft">Webhook URL</span>
      <code className="min-w-0 flex-1 truncate">{url}</code>
      <button
        type="button"
        aria-label="Copy webhook URL"
        onClick={() => copyText(url).then(() => toast('success', 'Webhook URL copied.'), () => toast('info', 'Select the URL to copy it.'))}
        className="flex h-7 w-7 items-center justify-center rounded-full text-nblue hover:bg-nblue-soft"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function GatewayCard({
  id,
  title,
  methods,
  where,
  on,
  enabled,
  onToggle,
  children,
  testing,
  onTest,
  result,
}: {
  id: Gw;
  title: string;
  methods: string;
  where: ReactNode;
  on: boolean;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
  testing: boolean;
  onTest: () => void;
  result?: { ok: boolean; message: string };
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-[13px] text-ink-soft">{methods}</p>
        </div>
        {/* Say why a gateway is not offered: switched off, or switched on but still missing its keys. */}
        <span className={cx('rounded-full px-2.5 py-1 text-[12px] font-bold', on ? 'bg-ngreen-soft text-ngreen-ink' : enabled ? 'bg-npink-soft text-npink' : 'bg-mist text-ink-soft')}>
          {on ? 'Live at checkout' : enabled ? 'Needs keys' : 'Off'}
        </span>
        <label className="flex items-center gap-2 text-[13px] font-semibold">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 accent-[#1a5fe6]" aria-label={`Offer ${title} at checkout`} />
          Offer at checkout
        </label>
      </div>
      <p className="mt-3 rounded-xl bg-nblue-soft/50 px-3 py-2 text-[12.5px] text-ink-soft">{where}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onTest} loading={testing} icon={<ShieldCheck className="h-4 w-4" />}>
          Test connection
        </Button>
        {result && (
          <span role="status" className={cx('inline-flex items-center gap-1.5 text-[13px] font-semibold', result.ok ? 'text-ngreen-ink' : 'text-npink')}>
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {result.message}
          </span>
        )}
      </div>
      <span className="sr-only">{id}</span>
    </Card>
  );
}

export default function PaymentSettings() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<View>('/staff/payment-settings'), []);
  const [v, setV] = useState<View | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Gw | ''>('');
  const [results, setResults] = useState<Partial<Record<Gw, { ok: boolean; message: string }>>>({});
  useEffect(() => {
    if (data) setV(data);
  }, [data]);

  if (loading && !v) return <Loading />;
  if (error && !v) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!v) return null;

  const sec = (k: string) => secrets[k] ?? '';
  const setSec = (k: string, val: string) => setSecrets((s) => ({ ...s, [k]: val }));
  const patch = <G extends Gw>(g: G, p: Partial<View[G]>) => setV((x) => (x ? { ...x, [g]: { ...x[g], ...p } } : x));

  const body = () => ({
    currency: v.locked.currency ? undefined : v.currency,
    razorpay: { enabled: v.razorpay.enabled, keyId: v.locked.razorpay.keyId ? undefined : v.razorpay.keyId, keySecret: sec('rz.keySecret'), webhookSecret: sec('rz.webhookSecret') },
    stripe: { enabled: v.stripe.enabled, secretKey: sec('st.secretKey'), webhookSecret: sec('st.webhookSecret') },
    paypal: { enabled: v.paypal.enabled, mode: v.locked.paypal.mode ? undefined : v.paypal.mode, clientId: v.locked.paypal.clientId ? undefined : v.paypal.clientId, clientSecret: sec('pp.clientSecret'), webhookId: v.locked.paypal.webhookId ? undefined : v.paypal.webhookId },
  });

  const saveAll = async (quiet = false) => {
    setSaving(true);
    try {
      const r = await api<View>('/staff/payment-settings', { method: 'PUT', body: body() });
      setV(r);
      setSecrets({});
      if (!quiet) toast('success', 'Payment settings saved.');
      return true;
    } catch (e) {
      toast('error', (e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const test = async (g: Gw) => {
    setTesting(g);
    try {
      // Test what is on screen: save first, so the server checks exactly these keys.
      if (!(await saveAll(true))) return;
      const r = await api<{ ok: boolean; message: string }>(`/staff/payment-settings/test/${g}`, { body: {} });
      setResults((x) => ({ ...x, [g]: r }));
    } catch (e) {
      setResults((x) => ({ ...x, [g]: { ok: false, message: (e as Error).message } }));
    } finally {
      setTesting('');
    }
  };

  const anyOn = v.razorpay.on || v.stripe.on || v.paypal.on;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments and email"
        subtitle="Choose how learners pay for courses. Paste each gateway's keys, test the connection, and turn it on. Secret keys are stored encrypted and never shown again. Check the email that sends password reset codes at the bottom."
        actions={
          <Button onClick={() => saveAll()} loading={saving} icon={<CreditCard className="h-4 w-4" />}>
            Save settings
          </Button>
        }
      />

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Currency for course prices" hint={v.locked.currency ? 'Set on the server (PAYMENT_CURRENCY).' : 'Course prices you type in Course details are charged in this currency.'}>
            <select value={v.currency} disabled={v.locked.currency} onChange={(e) => setV({ ...v, currency: e.target.value })} className={INPUT}>
              {v.currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Row>
          <div className="text-[13px] text-ink-soft">
            <div className="mb-1 font-semibold text-ink">Status</div>
            {anyOn ? (
              <p className="flex items-center gap-1.5 text-ngreen-ink">
                <CheckCircle2 className="h-4 w-4" /> Learners can buy paid courses.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-npink">
                <XCircle className="h-4 w-4" /> No gateway is on. Learners cannot buy paid courses yet.
              </p>
            )}
            {!v.publicUrlSet && <p className="mt-1">Tip: set PUBLIC_URL on the server to your site address (for example https://lms.example.com) so the webhook URLs below never change.</p>}
          </div>
        </div>
      </Card>

      <GatewayCard
        id="razorpay"
        title="Razorpay"
        methods="UPI (Google Pay, PhonePe, Paytm and others), debit and credit cards, netbanking, wallets. Best for learners in India."
        where={<>Razorpay Dashboard, Account &amp; Settings, API Keys: generate a key pair. Use Test mode first. For USD, ask Razorpay to turn on International payments.</>}
        on={v.razorpay.on}
        enabled={v.razorpay.enabled}
        onToggle={(x) => patch('razorpay', { enabled: x })}
        testing={testing === 'razorpay'}
        onTest={() => test('razorpay')}
        result={results.razorpay}
      >
        <Row label="Key ID" hint={v.locked.razorpay.keyId ? 'Set on the server (environment variable).' : 'Starts with rzp_test_ or rzp_live_.'}>
          <input value={v.razorpay.keyId} disabled={v.locked.razorpay.keyId} onChange={(e) => patch('razorpay', { keyId: e.target.value })} placeholder="rzp_test_..." className={INPUT} spellCheck={false} />
        </Row>
        <SecretInput label="Key Secret" value={sec('rz.keySecret')} onChange={(x) => setSec('rz.keySecret', x)} secret={v.razorpay.keySecret} locked={v.locked.razorpay.keySecret} placeholder="Paste the Key Secret" />
        <SecretInput label="Webhook secret (recommended)" value={sec('rz.webhookSecret')} onChange={(x) => setSec('rz.webhookSecret', x)} secret={v.razorpay.webhookSecret} locked={v.locked.razorpay.webhookSecret} placeholder="The secret you typed when adding the webhook" />
        <div className="self-end">
          <WebhookUrl url={v.razorpay.webhookUrl} />
          <p className="mt-1 text-[12px] text-ink-faint">Events: payment.captured, order.paid, refund.processed</p>
        </div>
      </GatewayCard>

      <GatewayCard
        id="stripe"
        title="Stripe"
        methods="International debit and credit cards, Apple Pay, Google Pay. Best for learners outside India."
        where={<>Stripe Dashboard, Developers, API keys: copy the Secret key (sk_test_ or sk_live_). Never use the Publishable key here.</>}
        on={v.stripe.on}
        enabled={v.stripe.enabled}
        onToggle={(x) => patch('stripe', { enabled: x })}
        testing={testing === 'stripe'}
        onTest={() => test('stripe')}
        result={results.stripe}
      >
        <SecretInput label="Secret key" value={sec('st.secretKey')} onChange={(x) => setSec('st.secretKey', x)} secret={v.stripe.secretKey} locked={v.locked.stripe.secretKey} placeholder="sk_test_..." />
        <SecretInput label="Webhook signing secret (recommended)" value={sec('st.webhookSecret')} onChange={(x) => setSec('st.webhookSecret', x)} secret={v.stripe.webhookSecret} locked={v.locked.stripe.webhookSecret} placeholder="whsec_..." />
        <div className="sm:col-span-2">
          <WebhookUrl url={v.stripe.webhookUrl} />
          <p className="mt-1 text-[12px] text-ink-faint">Events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, charge.refunded</p>
        </div>
      </GatewayCard>

      <GatewayCard
        id="paypal"
        title="PayPal"
        methods="PayPal balance, or a debit or credit card through PayPal. Trusted worldwide."
        where={<>developer.paypal.com, Apps &amp; Credentials: create an app, copy its Client ID and Secret. Sandbox keys for testing, Live keys for real payments.</>}
        on={v.paypal.on}
        enabled={v.paypal.enabled}
        onToggle={(x) => patch('paypal', { enabled: x })}
        testing={testing === 'paypal'}
        onTest={() => test('paypal')}
        result={results.paypal}
      >
        <Row label="Mode" hint={v.locked.paypal.mode ? 'Set on the server (PAYPAL_MODE).' : 'Sandbox for testing; Live for real money. Keys must match the mode.'}>
          <select value={v.paypal.mode} disabled={v.locked.paypal.mode} onChange={(e) => patch('paypal', { mode: e.target.value as 'sandbox' | 'live' })} className={INPUT}>
            <option value="sandbox">Sandbox (testing)</option>
            <option value="live">Live (real payments)</option>
          </select>
        </Row>
        <Row label="Client ID" hint={v.locked.paypal.clientId ? 'Set on the server (environment variable).' : undefined}>
          <input value={v.paypal.clientId} disabled={v.locked.paypal.clientId} onChange={(e) => patch('paypal', { clientId: e.target.value })} placeholder="Paste the Client ID" className={INPUT} spellCheck={false} />
        </Row>
        <SecretInput label="Secret" value={sec('pp.clientSecret')} onChange={(x) => setSec('pp.clientSecret', x)} secret={v.paypal.clientSecret} locked={v.locked.paypal.clientSecret} placeholder="Paste the Secret" />
        <Row label="Webhook ID (recommended)" hint={v.locked.paypal.webhookId ? 'Set on the server (environment variable).' : 'Shown by PayPal after you add the webhook URL below.'}>
          <input value={v.paypal.webhookId} disabled={v.locked.paypal.webhookId} onChange={(e) => patch('paypal', { webhookId: e.target.value })} placeholder="For example 8PT597110X687430LKGECATA" className={INPUT} spellCheck={false} />
        </Row>
        <div className="sm:col-span-2">
          <WebhookUrl url={v.paypal.webhookUrl} />
          <p className="mt-1 text-[12px] text-ink-faint">Events: Payment capture completed, Payment capture refunded</p>
        </div>
      </GatewayCard>

      <Card>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ngreen-soft text-ngreen-ink">
            <Landmark className="h-5 w-5" />
          </span>
          <div className="text-[13px] text-ink-soft">
            <div className="font-semibold text-ink">Where the money goes</div>
            <p className="mt-0.5">
              Payments are paid out to the bank account registered in each gateway’s own dashboard (Razorpay: Account &amp; Settings, Bank account; Stripe: Settings, Payouts; PayPal: Wallet, Link a bank). The LMS never asks for or stores bank details.
            </p>
          </div>
        </div>
      </Card>

      <EmailCard />

      <p className="flex items-center gap-1.5 text-[12.5px] text-ink-faint">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}A full refund in any gateway closes the course for that learner automatically (their progress is kept). Every change here is written to the audit log.
      </p>
    </div>
  );
}

/** Email (sign up, password reset codes, receipts): who it is sent from, and a test email. */
function EmailCard() {
  const { data, error, loading } = useLoad(() => api<{ enabled: boolean; outbox: boolean; host: string; port: number; user: string; from: string; missing: string[] }>('/staff/payment-settings/email'), []);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      setResult(await api<{ ok: boolean; message: string }>('/staff/payment-settings/email/test', { body: {} }));
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setSending(false);
    }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nblue-soft text-nblue">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <div className="font-display text-lg font-bold">Email</div>
            <p className="text-[13px] text-ink-soft">Sends password reset codes and links, payment receipts and other messages to learners.</p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => void send()} loading={sending} disabled={!data?.enabled} icon={<Send className="h-4 w-4" />}>
          Send test email
        </Button>
      </div>
      <div className="mt-4 text-[13px] text-ink-soft">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : error ? (
          <p className="text-npink">{error}</p>
        ) : data?.enabled ? (
          <p className="flex flex-wrap items-center gap-1.5 text-ngreen-ink">
            <CheckCircle2 className="h-4 w-4" />
            {data.outbox ? 'Test mode: emails are written to the outbox file, not sent.' : `On. Sent from ${data.from} through ${data.host}:${data.port}.`}
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-1.5 text-npink">
            <XCircle className="h-4 w-4" /> Off. Learners cannot reset a forgotten password until email is set up.
          </p>
        )}
        <p className="mt-2">
          The sender is set on the server (environment variables): <code className="font-mono text-[12px]">SMTP_HOST</code>, <code className="font-mono text-[12px]">SMTP_PORT</code> (465 or 587),{' '}
          <code className="font-mono text-[12px]">SMTP_USER</code>, <code className="font-mono text-[12px]">SMTP_PASS</code> and <code className="font-mono text-[12px]">MAIL_FROM</code>. Restart the LMS after changing them.
          {data && !data.enabled && data.missing.length > 0 && <> Missing now: {data.missing.join(', ')}.</>}
        </p>
        {result && (
          <p role="status" className={cx('mt-3 rounded-xl px-3 py-2 font-medium', result.ok ? 'bg-ngreen-soft text-ngreen-ink' : 'bg-npink-soft text-npink')}>
            {result.message}
          </p>
        )}
      </div>
    </Card>
  );
}
