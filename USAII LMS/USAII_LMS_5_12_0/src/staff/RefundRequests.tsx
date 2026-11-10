import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Card, ErrorBox, Loading, useConfirm, useToast } from '../components/ui';

interface RefundRow {
  id: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  provider: string;
  currency: string;
  amount: number;
  paidAt: string;
  requestedAt: string;
  deduction: number;
  status: 'pending' | 'refunded' | 'declined' | 'failed';
  error?: string;
  decidedAt?: string;
}
const money = (n: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n / 100);
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const label: Record<RefundRow['status'], string> = { pending: 'Waiting for review', failed: 'Gateway error, try again', refunded: 'Refunded', declined: 'Declined' };

/** Admin: refund requests from learners. Money moves only when an admin approves. */
export default function RefundRequests() {
  const [rows, setRows] = useState<RefundRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const load = useCallback(() => {
    setError('');
    api<{ refunds: RefundRow[] }>('/staff/refunds').then((r) => setRows(r.refunds), (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const decide = async (r: RefundRow, decision: 'approve' | 'decline') => {
    const refund = r.amount - r.deduction;
    const ok = await confirm(
      decision === 'approve'
        ? { title: 'Approve this refund?', text: `${money(refund, r.currency)} (the ${money(r.amount, r.currency)} price less the 20% deduction of ${money(r.deduction, r.currency)}) is sent back to ${r.learnerName} through ${r.provider}. Their access to ${r.courseTitle} ends.`, confirm: `Refund ${money(refund, r.currency)}` }
        : { title: 'Decline this refund?', text: `${r.learnerName} keeps access to ${r.courseTitle} and is told by email that the request was declined.`, confirm: 'Decline request' },
    );
    if (!ok) return;
    setBusy(r.id);
    try {
      await api(`/staff/refunds/${r.id}`, { method: 'POST', body: { decision } });
      toast('success', decision === 'approve' ? `Refund of ${money(refund, r.currency)} sent to ${r.learnerName}.` : `Refund request from ${r.learnerName} declined.`);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy('');
      load();
    }
  };

  return (
    <Card className="mb-6">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <RotateCcw className="h-5 w-5 text-npurple" /> Refund requests
      </h3>
      <p className="mt-1 text-[13px] text-ink-faint">Learners can apply only within the first 24 hours after buying a course. Nothing is refunded until you approve. An approved refund returns the price less a 20% deduction and closes the course.</p>
      {error ? (
        <div className="mt-4"><ErrorBox message={error} onRetry={load} /></div>
      ) : !rows ? (
        <div className="mt-4"><Loading /></div>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-[14px] text-ink-faint">No refund requests.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line" data-testid="refund-requests">
          {rows.map((r) => {
            const open = r.status === 'pending' || r.status === 'failed';
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4" data-testid="refund-request">
                <div className="min-w-0">
                  <div className="font-semibold">{r.learnerName} <span className="font-normal text-ink-faint">({r.learnerEmail})</span></div>
                  <div className="text-[13px] text-ink-soft">{r.courseTitle}: paid {money(r.amount, r.currency)} on {when(r.paidAt)}, requested {when(r.requestedAt)}</div>
                  <div className="text-[13px] text-ink-soft">Refund {money(r.amount - r.deduction, r.currency)} (20% deduction {money(r.deduction, r.currency)})</div>
                  <div className={`mt-1 text-[13px] font-semibold ${r.status === 'refunded' ? 'text-ngreen' : r.status === 'declined' ? 'text-ink-faint' : r.status === 'failed' ? 'text-npink' : 'text-nblue'}`}>
                    {label[r.status]}{r.decidedAt ? ` on ${when(r.decidedAt)}` : ''}{r.status === 'failed' && r.error ? `: ${r.error}` : ''}
                  </div>
                </div>
                {open && (
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={busy === r.id} onClick={() => void decide(r, 'decline')}>Decline</Button>
                    <Button disabled={busy === r.id} onClick={() => void decide(r, 'approve')}>{busy === r.id ? 'Working…' : 'Approve refund'}</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
