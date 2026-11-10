import { useCallback, useEffect, useState } from 'react';
import { ReceiptText, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Card, ErrorBox, Loading, PageHeader, useConfirm, useToast } from '../components/ui';

interface Purchase {
  id: string;
  courseTitle: string;
  amount: number;
  currency: string;
  paidAt: string;
  status: 'paid' | 'refunded';
  refundableUntil: string;
  refundable: boolean;
  reason: string;
  refundAmount: number;
  deduction: number;
  refund: { amount: number; status: string; requestedAt: string } | null;
  refundedAt: string | null;
}
interface PurchasesData {
  windowHours: number;
  deductionPercent: number;
  purchases: Purchase[];
}

const money = (minor: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
function left(until: string, now: number) {
  const ms = Date.parse(until) - now;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.max(0, Math.floor((ms % 3_600_000) / 60_000));
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}

/** Learner Settings: purchases and the 24 hour refund window (Apply for Refund). */
export default function Settings() {
  const [data, setData] = useState<PurchasesData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(Date.now());
  const toast = useToast();
  const confirm = useConfirm();
  const load = useCallback(() => {
    setError('');
    api<PurchasesData>('/learner/purchases').then(setData, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  // The button disappears by itself when the 24 hours are over.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const apply = async (p: Purchase) => {
    const ok = await confirm({
      title: 'Apply for a refund?',
      text: `Your request goes to the USAII admin team for review. If it is approved, ${money(p.refundAmount, p.currency)} of the ${money(p.amount, p.currency)} you paid (a ${data?.deductionPercent ?? 20}% deduction of ${money(p.deduction, p.currency)}) is returned to the card or account you paid with, and ${p.courseTitle} closes.`,
      confirm: 'Send refund request',
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      await api(`/learner/purchases/${p.id}/refund`, { method: 'POST' });
      toast('success', 'Refund request sent. The admin team will review it and email you the decision.');
      load();
    } catch (e) {
      toast('error', (e as Error).message);
      load();
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Your purchases and refunds." />
      <Card>
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <ReceiptText className="h-5 w-5 text-npurple" /> Purchases and refunds
        </h3>
        <p className="mt-2 text-[14px] text-ink-soft">
          Refund policy: you can apply for a refund only within the first {data?.windowHours ?? 24} hours after buying a course, before its certificate is issued. The USAII admin team reviews every request. If it is approved, a {data?.deductionPercent ?? 20}% deduction applies, so you receive {100 - (data?.deductionPercent ?? 20)}% of the price you paid, and the course closes.
        </p>
        {error ? (
          <div className="mt-4">
            <ErrorBox message={error} onRetry={load} />
          </div>
        ) : !data ? (
          <div className="mt-4">
            <Loading />
          </div>
        ) : data.purchases.length === 0 ? (
          <p className="mt-4 text-[14px] text-ink-faint">You have no purchases yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line" data-testid="purchases">
            {data.purchases.map((p) => {
              const open = p.refundable && Date.parse(p.refundableUntil) > now;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-4" data-testid="purchase">
                  <div className="min-w-0">
                    <div className="font-semibold">{p.courseTitle}</div>
                    <div className="text-[13px] text-ink-faint">
                      Paid {money(p.amount, p.currency)} on {when(p.paidAt)}
                    </div>
                    {p.status === 'refunded' ? (
                      <div className="mt-1 text-[13px] font-semibold text-ngreen">Refunded {money(p.refund?.amount ?? p.amount, p.currency)}{p.refundedAt ? ` on ${when(p.refundedAt)}` : ''}.</div>
                    ) : p.refund && (p.refund.status === 'pending' || p.refund.status === 'failed') ? (
                      <div className="mt-1 text-[13px] font-semibold text-nblue">Refund request sent on {when(p.refund.requestedAt)}. Waiting for admin review.</div>
                    ) : p.refund?.status === 'declined' ? (
                      <div className="mt-1 text-[13px] text-ink-faint">Your refund request was reviewed and declined.</div>
                    ) : open ? (
                      <div className="mt-1 text-[13px] text-ink-soft">
                        Refund available: {money(p.refundAmount, p.currency)} after the {data.deductionPercent}% deduction ({money(p.deduction, p.currency)}). Until {when(p.refundableUntil)} ({left(p.refundableUntil, now)}).
                      </div>
                    ) : p.reason && p.reason !== 'Refunded.' ? (
                      <div className="mt-1 text-[13px] text-ink-faint">{Date.parse(p.refundableUntil) <= now ? `The ${data.windowHours} hour refund window has closed.` : p.reason}</div>
                    ) : null}
                  </div>
                  {open && (
                    <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} disabled={busy === p.id} onClick={() => void apply(p)}>
                      {busy === p.id ? 'Sending…' : 'Apply for Refund'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
