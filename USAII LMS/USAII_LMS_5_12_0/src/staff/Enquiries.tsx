import { CheckCircle2, Download, Inbox, Mail, Phone, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Enquiry } from '../../shared/types';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Button, Card, cx, Empty, ErrorBox, Input, Loading, PageHeader, Pill, Segmented, useConfirm, useLoad, useToast } from '../components/ui';

type Row = Enquiry & { courseTitle: string | null };

/** CSV text for a spreadsheet: every value quoted, quotes doubled. */
function toCsv(rows: Row[]): string {
  const head = ['Received', 'Name', 'Email', 'Mobile', 'Organization', 'Designation', 'Country', 'Course', 'Sent from', 'Contacted'];
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.createdAt, r.name, r.email, r.mobile, r.organization, r.designation, r.country, r.courseTitle ?? '', r.source, r.contactedAt ? `Yes (${r.contactedBy ?? ''})` : 'No'].map((v) => q(String(v ?? ''))).join(','),
  );
  return [head.map(q).join(','), ...lines].join('\r\n');
}

/** "Get More Details" requests sent from the public AI Micro Credentials website. */
export default function Enquiries() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad(() => api<{ enquiries: Row[] }>('/staff/enquiries'), []);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'new' | 'contacted'>('all');
  const [busy, setBusy] = useState('');

  const all = data?.enquiries ?? [];
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((e) => {
      if (show === 'new' && e.contactedAt) return false;
      if (show === 'contacted' && !e.contactedAt) return false;
      if (!needle) return true;
      return [e.name, e.email, e.mobile, e.organization, e.designation, e.country, e.courseTitle ?? '', e.source].some((v) => v.toLowerCase().includes(needle));
    });
  }, [all, q, show]);
  const fresh = all.filter((e) => !e.contactedAt).length;

  const toggle = async (e: Row) => {
    setBusy(e.id);
    try {
      await api(`/staff/enquiries/${e.id}/contacted`, { body: { contacted: !e.contactedAt } });
      await reload(true);
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (e: Row) => {
    const ok = await confirm({ title: `Delete the enquiry from ${e.name}?`, text: 'This cannot be undone.', confirm: 'Delete' });
    if (!ok) return;
    setBusy(e.id);
    try {
      await api(`/staff/enquiries/${e.id}`, { method: 'DELETE' });
      await reload(true);
      toast('success', 'Enquiry deleted.');
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const download = () => {
    const blob = new Blob(['\ufeff' + toCsv(list)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `USAII-website-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />;

  return (
    <div>
      <PageHeader
        title="Website Enquiries"
        subtitle={`"Get More Details" requests from the AI Micro Credentials website. ${fresh} waiting for contact.`}
        actions={
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={download} disabled={!list.length}>
            Download CSV
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, organization, country" className="pl-10" aria-label="Search enquiries" />
        </div>
        <Segmented
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: `All (${all.length})` },
            { value: 'new', label: `New (${fresh})` },
            { value: 'contacted', label: `Contacted (${all.length - fresh})` },
          ]}
        />
      </div>
      {!list.length ? (
        <Empty icon={<Inbox className="h-6 w-6" />} title={all.length ? 'No enquiries match' : 'No enquiries yet'} text={all.length ? 'Try another search or filter.' : 'Requests sent from the website\u2019s Get More Details form appear here.'} />
      ) : (
        <div className="space-y-3">
          {list.map((e) => (
            <Card key={e.id} className={cx('!p-4', !e.contactedAt && 'border-npurple/30')}>
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold">{e.name}</span>
                    {e.contactedAt ? <Pill color="green">Contacted</Pill> : <Pill color="purple">New</Pill>}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-soft">
                    {e.designation}, {e.organization} · {e.country}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1.5 font-semibold text-nblue hover:underline">
                      <Mail className="h-3.5 w-3.5" /> {e.email}
                    </a>
                    <a href={`tel:${e.mobile.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 font-semibold text-nblue hover:underline">
                      <Phone className="h-3.5 w-3.5" /> {e.mobile}
                    </a>
                  </div>
                </div>
                <div className="min-w-[180px] text-sm">
                  <div className="text-ink-faint">Received {fmtDateTime(e.createdAt)}</div>
                  <div className="text-ink-soft">{e.courseTitle ? `About ${e.courseTitle}` : `From ${e.source}`}</div>
                  {e.contactedAt && <div className="text-xs text-ink-faint">Contacted by {e.contactedBy} on {fmtDateTime(e.contactedAt)}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant={e.contactedAt ? 'secondary' : 'primary'} loading={busy === e.id} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void toggle(e)}>
                    {e.contactedAt ? 'Mark as new' : 'Mark contacted'}
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete the enquiry from ${e.name}`} onClick={() => void remove(e)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
