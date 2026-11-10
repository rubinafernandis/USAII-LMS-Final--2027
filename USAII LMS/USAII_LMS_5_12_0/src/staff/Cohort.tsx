import { ArrowLeft, Ban, Eye, Search, UserCheck, UserX, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CompletionEstimate, Course, Enrollment, LearnerSnapshot, PublicUser, RiskFactor } from '../../shared/types';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime, pct, scoreColor, scoreInk } from '../lib/format';
import { Avatar, Bar, Button, Card, cx, Empty, ErrorBox, Input, Label, Loading, Modal, navigate, PageHeader, Ring, Select, Tabs, Textarea, useLoad, useToast } from '../components/ui';
import { LearnerProvider } from '../learner/LearnerApp';
import Dashboard from '../learner/Dashboard';
import Progress from '../learner/Progress';
import Learning from '../learner/Learning';
import SuspendModal, { type SuspendTarget } from './SuspendLearner';

export interface CohortCard {
  user: PublicUser;
  enrolledAt: string;
  targetDate?: string;
  passConfidence: number;
  predictedGrade: number;
  predictedLetter: string;
  evidence?: 'none' | 'early' | 'solid';
  range?: { low: number; high: number };
  currentGrade: number | null;
  avgCheck: number | null;
  comprehension: number | null;
  activitiesDone: number;
  activitiesTotal: number;
  studyDays: number;
  loginDays: number;
  avgSession: number;
  activeMinutes7: number;
  engagement: number;
  completion: CompletionEstimate;
  modules: { id: string; title: string; percent: number }[];
  weakAreas: { topic: string; score: number }[];
  risk: { needsSupport: boolean; factors: RiskFactor[] };
  nextStep: string;
  credential: boolean;
  lastActiveAt?: string;
}

interface CohortData {
  courses: { id: string; title: string; status: string }[];
  course?: { id: string; title: string; passMark: number };
  cards: CohortCard[];
  /** Learners in this course who are suspended; left out of `cards` and `stats`. */
  suspended?: PublicUser[];
  stats: null | { total: number; needsSupport: number; avgConfidence: number | null; avgCheck: number | null; avgCompletion: number | null; avgEngagement: number | null; credentials: number };
}


export function CourseSelect({ courses, value, onChange }: { courses: { id: string; title: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="!w-auto min-w-[260px] !rounded-full !py-2" aria-label="Course">
      {courses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </Select>
  );
}

function Num({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl bg-mist/70 px-3 py-2 text-center">
      <div className="font-display text-lg font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] font-medium text-ink-soft">{label}</div>
    </div>
  );
}

/** A plain summary figure: no accent stripe and no hover effect, since it is not clickable. */
function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-line bg-white p-4">
      <div className="text-[13px] font-semibold text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-[28px] font-extrabold">{value}</div>
    </div>
  );
}

/** Someone with no recorded activity for two weeks or more. */
const INACTIVE_DAYS = 14;
const daysSince = (iso?: string) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);

function InactiveModal({ open, onClose, cards }: { open: boolean; onClose: () => void; cards: CohortCard[] }) {
  const inactive = cards.filter((c) => !c.credential && (daysSince(c.lastActiveAt) ?? 999) >= INACTIVE_DAYS).sort((a, b) => (daysSince(b.lastActiveAt) ?? 999) - (daysSince(a.lastActiveAt) ?? 999));
  return (
    <Modal open={open} onClose={onClose} title="Inactive Learners" wide footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <p className="text-sm text-ink-soft">Learners with no activity for {INACTIVE_DAYS} days or more. The LMS reminds them of their next step when they return. If many stop at the same lesson, that lesson may need attention.</p>
      {inactive.length === 0 ? (
        <Empty icon={<Users className="h-6 w-6" />} title="Everybody is active" text="No learner has been away for two weeks." />
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {inactive.map((c) => (
            <li key={c.user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar initials={c.user.initials} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.user.name}</div>
                  <div className="truncate text-[12px] text-ink-soft">{c.user.email}</div>
                  <div className="text-[12px] font-semibold text-npink">
                    Last seen {c.lastActiveAt ? `${fmtDateTime(c.lastActiveAt)} · ${daysSince(c.lastActiveAt)} days ago` : 'never'}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}


export default function Cohort({ initialCourseId }: { initialCourseId?: string }) {
  const [courseId, setCourseId] = useState(initialCourseId ?? '');
  useEffect(() => {
    if (initialCourseId) setCourseId(initialCourseId);
  }, [initialCourseId]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [suspendFor, setSuspendFor] = useState<SuspendTarget | null>(null);
  const { data, error, loading, reload } = useLoad(() => api<CohortData>(`/staff/cohort${courseId ? `?courseId=${courseId}` : ''}`), [courseId]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = data?.cards ?? [];
    if (!q) return all;
    return all.filter((c) => c.user.name.toLowerCase().includes(q) || (c.user.email ?? '').toLowerCase().includes(q));
  }, [data, search]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />;
  const s = data?.stats;
  const cards = data?.cards ?? [];
  const inactiveCount = cards.filter((c) => !c.credential && (daysSince(c.lastActiveAt) ?? 999) >= INACTIVE_DAYS).length;
  const suspended = data?.suspended ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Cohort" subtitle="Every learner in this course, and how far along they are." actions={data?.courses.length ? <CourseSelect courses={data.courses} value={data.course?.id ?? ''} onChange={setCourseId} /> : undefined} />
      {!s ? (
        <Empty icon={<Users className="h-6 w-6" />} title="No courses yet" text="Create a course and add learners to see them here." action={<Button onClick={() => navigate('courses')}>Go to My Courses</Button>} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Tile label="Total Learners" value={s.total} />
            <Tile label="Average Completion" value={pct(s.avgCompletion)} />
            <Tile label="Credentials Earned by Learners" value={s.credentials} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or email" className="!pl-9" aria-label="Filter learners by name or email" />
            </div>
            <Button variant="secondary" icon={<UserX className="h-4 w-4" />} onClick={() => setShowInactive(true)}>
              Inactive Learners{inactiveCount ? ` (${inactiveCount})` : ''}
            </Button>
          </div>

          {rows.length === 0 ? (
            <Empty icon={<Users className="h-6 w-6" />} title={search ? 'No learner matches that search' : suspended.length ? 'No active learners in this course' : 'No learners in this course yet'} action={search ? undefined : <Button onClick={() => navigate('learners')}>Add Learners</Button>} />
          ) : (
            <Card className="!p-0">
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-[12px] uppercase tracking-wide text-ink-soft">
                      <th className="px-4 py-3 font-bold">Learner</th>
                      <th className="px-4 py-3 font-bold">Enrolled In</th>
                      <th className="px-4 py-3 font-bold">Expected Course Completion</th>
                      <th className="px-4 py-3 font-bold">Projected grade</th>
                      <th className="px-4 py-3 font-bold">Final Score</th>
                      <th className="px-4 py-3 font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((c) => (
                      <tr key={c.user.id} className="transition hover:bg-mist/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar initials={c.user.initials} size={32} />
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{c.user.name}</div>
                              <div className="truncate text-[12px] text-ink-soft">{c.user.email}</div>
                            </div>
                          </div>
                          {c.risk.factors.length > 0 && (
                            <details className="mt-1.5 max-w-[320px] text-[12px]">
                              <summary className={cx('cursor-pointer font-semibold', c.risk.needsSupport ? 'text-npink' : 'text-ink-soft')}>
                                {c.risk.needsSupport ? 'Needs support' : 'Watch'}: {c.risk.factors.length} {c.risk.factors.length === 1 ? 'signal' : 'signals'}
                              </summary>
                              <ul className="mt-1 space-y-1.5">
                                {c.risk.factors.map((f) => (
                                  <li key={f.label}>
                                    <span className="font-semibold">{f.severity === 'high' ? 'High' : f.severity === 'medium' ? 'Medium' : 'Low'}: {f.label}.</span>{' '}
                                    <span className="text-ink-soft">Next step: {f.advice}</span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{data!.course!.title}</div>
                          <div className="text-[12px] text-ink-soft">{c.completion.percent}% complete</div>
                        </td>
                        <td className="px-4 py-3">{c.credential ? <span className="font-semibold text-ngreen-ink">Completed</span> : fmtDate(c.completion.estimatedDate)}</td>
                        <td className="px-4 py-3">
                          {c.credential ? (
                            <span className="text-ink-faint">&mdash;</span>
                          ) : (
                            c.evidence === 'early' && c.range && c.avgCheck !== null ? (
                              <span className="font-bold text-ink-soft">
                                {c.range.low} to {c.range.high}%<span className="block text-[11px] font-medium text-ink-faint">Early estimate</span>
                              </span>
                            ) : (
                              <span className="font-bold" style={{ color: scoreInk(c.predictedGrade) }}>
                                {c.avgCheck === null ? 'After first quiz' : `${c.predictedGrade}% (${c.predictedLetter})`}
                              </span>
                            )
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {c.credential ? (
                            <span className="font-bold" style={{ color: scoreInk(c.currentGrade) }}>
                              {pct(c.currentGrade)}
                            </span>
                          ) : (
                            <span className="text-ink-faint">Not passed yet</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => navigate(`learner/${c.user.id}?course=${data!.course!.id}`)} icon={<Eye className="h-3.5 w-3.5" />}>
                              View
                            </Button>
                            <Button size="sm" variant="secondary" className="!text-npink hover:!border-npink/40" onClick={() => setSuspendFor(c.user)} icon={<Ban className="h-3.5 w-3.5" />}>
                              Suspend
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {suspended.length > 0 && (
            <Card className="!border-npink/30">
              <div className="mb-3 flex items-center gap-2">
                <Ban className="h-4 w-4 text-npink" />
                <h3 className="font-bold">Suspended learners ({suspended.length})</h3>
                <span className="text-xs text-ink-faint">Not counted in the figures above. They cannot sign in until reinstated.</span>
              </div>
              <div className="divide-y divide-line">
                {suspended.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Avatar initials={u.initials} size={32} />
                    <div className="min-w-[200px] flex-1">
                      <div className="font-semibold">{u.name}</div>
                      <div className="text-[12px] text-ink-soft">
                        {u.email}
                        {u.suspension && ` · Suspended ${fmtDate(u.suspension.at)} by ${u.suspension.byName}`}
                        {u.suspension?.reason && ` · ${u.suspension.reason}`}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => navigate(`learner/${u.id}?course=${data!.course!.id}`)} icon={<Eye className="h-3.5 w-3.5" />}>
                      View
                    </Button>
                    <Button size="sm" variant="secondary" className="!text-ngreen-ink" onClick={() => setSuspendFor(u)} icon={<UserCheck className="h-3.5 w-3.5" />}>
                      Reinstate
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <InactiveModal open={showInactive} onClose={() => setShowInactive(false)} cards={cards} />
        </>
      )}
      <SuspendModal target={suspendFor} onClose={() => setSuspendFor(null)} onDone={() => void reload(true)} />
    </div>
  );
}

/* ---------------- Read-only learner portal ---------------- */

interface PortalData {
  user: PublicUser;
  items: { course: Course; enrollment: Enrollment; snapshot: LearnerSnapshot }[];
}

export function LearnerPortal({ userId, courseId }: { userId: string; courseId?: string }) {
  const [tab, setTab] = useState<'dashboard' | 'progress' | 'learning'>('dashboard');
  const [suspendOpen, setSuspendOpen] = useState(false);
  const { data, setData, error, loading, reload } = useLoad(() => api<PortalData>(`/staff/learner/${userId}`), [userId]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Not found'} onRetry={() => void reload()} />;
  const home = { items: data.items, feedbackDue: false };
  return (
    <div>
      <button onClick={() => history.back()} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-nblue">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 border-npurple/30 bg-npurple-soft/40 !py-3">
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5 text-npurple" />
          <span className="text-sm">
            Read-only view of <b>{data.user.name}</b>’s portal. Nothing you do here changes their data.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.user.active ? (
            <Button size="sm" variant="secondary" className="!text-npink" icon={<Ban className="h-4 w-4" />} onClick={() => setSuspendOpen(true)}>
              Suspend
            </Button>
          ) : (
            <Button size="sm" variant="secondary" className="!text-ngreen-ink" icon={<UserCheck className="h-4 w-4" />} onClick={() => setSuspendOpen(true)}>
              Reinstate
            </Button>
          )}
        </div>
      </Card>
      {!data.user.active && (
        <Card className="mb-5 flex items-center gap-3 !border-npink/40 bg-npink-soft/40 !py-3 text-sm">
          <Ban className="h-5 w-5 shrink-0 text-npink" />
          <span>
            <b>{data.user.name}</b> is suspended and cannot sign in
            {data.user.suspension ? ` (since ${fmtDate(data.user.suspension.at)}, by ${data.user.suspension.byName}${data.user.suspension.reason ? `: “${data.user.suspension.reason}”` : ''})` : ''}.
          </span>
        </Card>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'dashboard', label: 'Dashboard' },
          { value: 'progress', label: 'Progress' },
          { value: 'learning', label: 'Lessons' },
        ]}
      />
      <LearnerProvider home={home} reload={() => reload(true)} learner={data.user} readOnly initialCourseId={courseId}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'progress' && <Progress />}
        {tab === 'learning' && <Learning />}
      </LearnerProvider>
      <SuspendModal target={suspendOpen ? data.user : null} onClose={() => setSuspendOpen(false)} onDone={(u) => setData((d) => (d ? { ...d, user: u } : d))} />
    </div>
  );
}
