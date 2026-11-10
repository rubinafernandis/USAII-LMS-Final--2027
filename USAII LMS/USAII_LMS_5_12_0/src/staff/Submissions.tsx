import { AlertTriangle, Award, CheckCircle2, ChevronDown, ExternalLink, Eye, FileCheck2, FileText, Paperclip, RotateCcw, Search, Sparkles, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ActivityReview, ActivitySubmission, PassRubric, RubricCriterion, RubricDocument, RubricLevel } from '../../shared/types';
import { RUBRIC_LEVELS } from '../../shared/metrics';
import { dimensionChecks, generalChecks, type AutoCheck, type AutoCheckReport, type EvidencePage } from '../../shared/autocheck';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Avatar, Button, Card, cx, Empty, Modal, Select, Textarea, useConfirm, useToast } from '../components/ui';

export interface SubmissionRow {
  userId: string;
  learnerName: string;
  learnerEmail?: string;
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  activityTitle: string;
  fieldLabels: Record<string, string>;
  /** The activity's rubric criteria. Empty means the activity counts toward progress only. */
  rubric: RubricCriterion[];
  /** The rubric PDF the work is evaluated against (5.6+). */
  rubricPdf?: RubricDocument;
  /** A Pass / Needs Work rubric (5.9+): every dimension must pass to approve. */
  passRubric?: PassRubric;
  rubricKind?: 'pdf' | 'pass' | 'criteria' | null;
  /** False when the activity has no rubric and the certificate does not wait for it: it is complete once submitted. */
  needsReview?: boolean;
  /** The certificate is issued only after this activity is approved. */
  requiredForCertificate?: boolean;
  /** 1 for the first submission, 2 for the first revision, and so on. */
  version?: number;
  /** False once the rubric's revision limit is reached: approve it, or mark it Not approved. */
  canReturn?: boolean;
  /** What the LMS checked automatically. */
  autoCheck?: AutoCheckReport;
  /** The activity's instructions as plain text, for context while reviewing. */
  instructions?: string;
  submission: ActivitySubmission;
}

export interface SubmissionsData {
  courses: { id: string; title: string }[];
  submissions: SubmissionRow[];
  /** True when the server has an AI key, so "Suggest a score" can read the rubric PDF. */
  aiAvailable?: boolean;
}

type Status = 'pending' | 'submitted' | ActivityReview;
/** "Awaiting review" only for work someone has to evaluate; the rest is complete once submitted. */
export const statusOf = (s: ActivitySubmission, needsReview = true): Status => s.review ?? (needsReview ? 'pending' : 'submitted');
export const rowStatus = (r: Pick<SubmissionRow, 'submission' | 'needsReview'>): Status => statusOf(r.submission, r.needsReview !== false);

export const STATUS: Record<Status, { label: string; className: string }> = {
  pending: { label: 'Awaiting review', className: 'bg-nblue-soft text-nblue' },
  submitted: { label: 'Submitted · no review needed', className: 'bg-mist text-ink-soft' },
  approved: { label: 'Approved', className: 'bg-ngreen-soft text-ngreen-ink' },
  not_approved: { label: 'Not approved', className: 'bg-npink-soft text-npink' },
  resubmit: { label: 'Resubmission requested', className: 'bg-[#fff4d9] text-[#9a5b00]' },
};

export function StatusPill({ s, needsReview = true }: { s: ActivitySubmission; needsReview?: boolean }) {
  const st = STATUS[statusOf(s, needsReview)];
  const ae = s.autoEval?.status;
  const label = !s.review && (ae === 'queued' || ae === 'running') ? 'Being evaluated automatically' : !s.review && (ae === 'needs_admin' || ae === 'failed') ? 'Needs your decision' : s.reviewedAutomatically ? `${st.label} · automatic` : st.label;
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', st.className)}>{label}</span>;
}

const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);

/* ---------------- The review window ---------------- */

const DECISIONS: { value: ActivityReview; label: string; icon: typeof CheckCircle2; className: string }[] = [
  { value: 'approved', label: 'Approve', icon: CheckCircle2, className: 'bg-ngreen text-white hover:brightness-95' },
  { value: 'resubmit', label: 'Request resubmission', icon: RotateCcw, className: 'bg-[#F5A300] text-white hover:brightness-95' },
  { value: 'not_approved', label: 'Not approved', icon: XCircle, className: 'bg-npink text-white hover:brightness-95' },
];

interface Suggestion {
  points: number;
  maxPoints: number;
  criteria: { name: string; points: number; max: number; reason: string }[];
  feedback: string;
}
interface PassSuggestion {
  dimensions: { id: string; label: string; pass: boolean; reason: string }[];
  feedback: string;
}

/* ---------------- Automatic checks ---------------- */

function CheckLine({ c }: { c: AutoCheck }) {
  return (
    <li className="flex gap-2 py-1 text-[13px]">
      {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ngreen" aria-label="Passed" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#c27c00]" aria-label="Look at this" />}
      <span className="min-w-0">
        <span className={cx('font-medium', !c.ok && 'text-ink')}>{c.label}</span>
        {c.detail && <span className="text-ink-soft">. {c.detail}</span>}
      </span>
    </li>
  );
}

/** Checks on the submission itself: blanks, placeholders, word limits, repeated text, personal data. */
function GeneralChecks({ report }: { report?: AutoCheckReport }) {
  const list = report ? generalChecks(report) : [];
  if (!list.length) return null;
  const flagged = list.filter((c) => !c.ok).length;
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">Checked automatically</div>
        <div className={cx('text-xs font-semibold', flagged ? 'text-[#9a5b00]' : 'text-ngreen-ink')}>{flagged ? `${flagged} to look at` : 'Nothing to flag'}</div>
      </div>
      <ul className="mt-1">
        {list.map((c) => (
          <CheckLine key={c.id} c={c} />
        ))}
      </ul>
    </div>
  );
}

/** The learner's earlier pages this rubric draws on (for a capstone, the whole playbook). */
function EvidencePages({ pages, loading }: { pages: EvidencePage[] | null; loading: boolean }) {
  if (loading) return <p className="rounded-2xl bg-mist/70 px-4 py-3 text-sm text-ink-soft">Loading the learner’s earlier pages…</p>;
  if (!pages?.length) return null;
  const missing = pages.filter((p) => !p.submittedAt).length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">The pages this work draws on</div>
        <div className="text-xs text-ink-soft">{missing ? `${missing} of ${pages.length} not submitted yet` : `All ${pages.length} submitted`}</div>
      </div>
      <div className="divide-y divide-line rounded-2xl border border-line">
        {pages.map((p) => (
          <details key={p.lessonId} className="group px-4 py-2.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="font-semibold">{p.activityTitle}</span>
                <span className="text-ink-faint"> · {p.lessonTitle}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs">
                {p.submittedAt ? <span className="text-ink-soft">Submitted {fmtDateTime(p.submittedAt)}</span> : <span className="font-semibold text-npink">Not submitted</span>}
                <ChevronDown className="h-4 w-4 text-ink-faint transition-transform group-open:rotate-180" />
              </span>
            </summary>
            {p.submittedAt && (
              <div className="mt-2 space-y-2 pb-1">
                {p.fields.map((f, i) => (
                  <div key={i}>
                    <div className="text-xs font-semibold text-ink-faint">{f.label}</div>
                    <p className="whitespace-pre-line text-[14px] leading-relaxed">{f.value.trim() || '—'}</p>
                  </div>
                ))}
                {p.fileUrl && (
                  <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-nblue hover:underline">
                    <Paperclip className="h-4 w-4" /> {p.fileName ?? 'Attachment'}
                  </a>
                )}
              </div>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}

function ReviewModal({ row, onClose, onDone, aiAvailable }: { row: SubmissionRow | null; onClose: () => void; onDone: () => void; aiAvailable?: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<ActivityReview | null>(null);
  const [err, setErr] = useState('');
  const [levels, setLevels] = useState<Record<string, RubricLevel>>({});
  const [points, setPoints] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [passSuggestion, setPassSuggestion] = useState<PassSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [pages, setPages] = useState<EvidencePage[] | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  // What the automatic evaluation found, ready to use when it handed the decision to an admin.
  useEffect(() => {
    const sg = row?.submission.autoEval?.suggestion;
    if (sg && !row?.submission.review) setPassSuggestion(sg as unknown as PassSuggestion);
  }, [row]);
  const [rerunning, setRerunning] = useState(false);
  const rerun = async () => {
    if (!row) return;
    setRerunning(true);
    try {
      await api('/staff/auto-evaluate', { body: { userId: row.userId, courseId: row.courseId, lessonId: row.lessonId } });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRerunning(false);
    }
  };
  useEffect(() => {
    const r = row?.submission.rubric;
    setPoints(r && r.maxPoints !== undefined && r.points !== undefined && r.maxPoints === row?.rubricPdf?.maxPoints ? String(r.points) : '');
    setSuggestion(null);
    setPassSuggestion(null);
    setSuggesting(false);
    setText(row?.submission.feedback ?? '');
    setErr('');
    setBusy(null);
    // Start from this version's scores, if it was scored already.
    setLevels(Object.fromEntries((row?.submission.rubric?.scores ?? []).filter((x) => row?.rubric.some((c) => c.id === x.id)).map((x) => [x.id, x.level])));
    setMarks(Object.fromEntries((r?.dimensions ?? []).filter((x) => row?.passRubric?.dimensions.some((d) => d.id === x.id)).map((x) => [x.id, x.pass])));
    // A Pass / Needs Work rubric reads the learner's earlier pages too (for a capstone, the whole playbook).
    setPages(null);
    if (!row?.passRubric) return;
    let live = true;
    setPagesLoading(true);
    api<{ pages: EvidencePage[] }>(`/staff/submission-evidence?userId=${encodeURIComponent(row.userId)}&courseId=${encodeURIComponent(row.courseId)}&lessonId=${encodeURIComponent(row.lessonId)}`)
      .then((r2) => live && setPages(r2.pages))
      .catch(() => live && setPages([]))
      .finally(() => live && setPagesLoading(false));
    return () => {
      live = false;
    };
  }, [row]);
  if (!row) return null;
  const sub = row.submission;
  const current = rowStatus(row);
  const dims = row.passRubric?.dimensions ?? [];
  const passMode = dims.length > 0;
  const marked = dims.filter((d) => marks[d.id] !== undefined).length;
  const allMarked = passMode && marked === dims.length;
  const needsWork = dims.filter((d) => marks[d.id] === false);
  const canReturn = row.canReturn !== false;
  const version = row.version ?? (sub.previous ? 2 : 1);
  const limit = row.passRubric?.revisionLimit ?? 0;

  const pdf = row.rubricPdf?.url ? row.rubricPdf : undefined;
  // With a rubric PDF the typed criteria (if any are left from an older version) are not used.
  const criteria = pdf ? [] : row.rubric ?? [];
  const scoring = !!pdf || criteria.length > 0 || dims.length > 0;
  const pts = points.trim() === '' ? null : Number(points);
  const ptsValid = pts !== null && Number.isFinite(pts) && pts >= 0 && !!pdf && pts <= pdf.maxPoints;
  const pdfPercent = ptsValid && pdf ? Math.round((pts! / pdf.maxPoints) * 100) : null;

  const suggest = async () => {
    setSuggesting(true);
    setErr('');
    try {
      const r = await api<{ suggestion: Suggestion | PassSuggestion }>('/staff/rubric-suggest', { body: { userId: row.userId, courseId: row.courseId, lessonId: row.lessonId } });
      if ('dimensions' in r.suggestion) setPassSuggestion(r.suggestion);
      else setSuggestion(r.suggestion);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  };
  const scored = criteria.filter((c) => levels[c.id] !== undefined).length;
  const allScored = criteria.length > 0 && scored === criteria.length;
  const percent = allScored ? Math.round((criteria.reduce((a, c) => a + levels[c.id], 0) / (criteria.length * 2)) * 100) : null;

  const decide = async (decision: ActivityReview) => {
    if (passMode) {
      // Pass / Needs Work: every dimension decided, and the decision agrees with them.
      if (!allMarked) return setErr('Mark every dimension Pass or Needs Work first.');
      if (decision === 'approved' && needsWork.length) return setErr(`Every dimension must pass before you approve. Needs work: ${needsWork.map((d) => d.label).join(', ')}.`);
      if (decision !== 'approved' && !needsWork.length) return setErr('Every dimension is marked Pass. Approve the work, or mark the dimension that needs work.');
      if (decision === 'resubmit' && !canReturn) return setErr('The rubric’s revision is used. Approve the work, or mark it Not approved.');
    }
    // Approving needs no note; the other two tell the learner what to change.
    if (decision !== 'approved' && text.trim().length < 2) {
      setErr(passMode ? `Add a note that names what ${needsWork.map((d) => d.label).join(' and ')} needs, so the learner knows what to change.` : 'Add a short note so the learner knows what to change.');
      return;
    }
    if (pdf) {
      if (pts !== null && !ptsValid) {
        setErr(`Enter a rubric score from 0 to ${pdf.maxPoints}.`);
        return;
      }
      if (decision !== 'resubmit' && pts === null) {
        setErr(`Enter the rubric score (out of ${pdf.maxPoints}) first. It is this learner’s Mastery evidence for the activity.`);
        return;
      }
      if (decision === 'approved' && pdfPercent !== null && pdfPercent < 50) {
        const ok = await confirm({ title: 'Approve with a low rubric score?', text: `The rubric score is ${pdfPercent}%. If the learner should improve the work, choose Request resubmission instead.`, confirm: 'Approve anyway' });
        if (!ok) return;
      }
      if (decision === 'not_approved' && pdfPercent === 100) {
        const ok = await confirm({ title: 'Mark Not approved with full marks?', text: 'The rubric score is 100%. Check the score or the decision before you continue.', confirm: 'Mark Not approved anyway', danger: true });
        if (!ok) return;
      }
    }
    // Rubric scores are all or nothing; they are required to Approve or mark Not approved.
    if (criteria.length && scored > 0 && !allScored) {
      setErr('Score every criterion, or leave all of them blank.');
      return;
    }
    if (criteria.length && decision !== 'resubmit' && !allScored) {
      setErr('Score every criterion first. The scores are this learner’s Mastery evidence for the activity.');
      return;
    }
    // The decision and the scores are separate, but they should not contradict each other.
    if (allScored) {
      const notMet = criteria.filter((c) => levels[c.id] === 0).length;
      const allMet = criteria.every((c) => levels[c.id] === 2);
      if (decision === 'approved' && notMet > 0) {
        const ok = await confirm({
          title: 'Approve with criteria not met?',
          text: `${notMet} ${notMet === 1 ? 'criterion is' : 'criteria are'} scored Not met. Approving ends the review for this activity. If the learner should improve it, choose Request resubmission instead.`,
          confirm: 'Approve anyway',
        });
        if (!ok) return;
      }
      if (decision === 'not_approved' && allMet) {
        const ok = await confirm({
          title: 'Mark Not approved when every criterion is met?',
          text: 'Every criterion is scored Met. Check the scores or the decision before you continue.',
          confirm: 'Mark Not approved anyway',
          danger: true,
        });
        if (!ok) return;
      }
    }
    setErr('');
    setBusy(decision);
    try {
      const r = await api<{ credentialIssued?: boolean }>('/staff/activity-feedback', {
        body: { userId: row.userId, courseId: row.courseId, lessonId: row.lessonId, decision, feedback: text, rubric: allScored ? levels : undefined, rubricPoints: pdf && ptsValid ? pts : undefined, dimensions: passMode ? marks : undefined },
      });
      toast('success', `${STATUS[decision].label}. ${row.learnerName} has been notified.`);
      if (r.credentialIssued) toast('success', `${row.learnerName} earned the certificate.`);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={!!row} onClose={onClose} wide={pdf ? 'xl' : true} title={row.activityTitle}>
      <div className="space-y-5">
        <div className="grid gap-3 rounded-2xl bg-mist/70 p-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-ink-faint">Learner</div>
            <div className="font-semibold">{row.learnerName}</div>
            {row.learnerEmail && <div className="text-xs text-ink-soft">{row.learnerEmail}</div>}
          </div>
          <div>
            <div className="text-xs font-semibold text-ink-faint">Course</div>
            <div className="font-semibold">{row.courseTitle}</div>
            <div className="text-xs text-ink-soft">{row.lessonTitle}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-ink-faint">Submitted</div>
            <div className="font-semibold">{fmtDateTime(sub.submittedAt)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-ink-faint">Status</div>
            <div className="mt-0.5">
              <StatusPill s={sub} />
              {sub.reviewedAt && <span className="ml-2 text-xs text-ink-soft">by {sub.reviewedBy} · {fmtDateTime(sub.reviewedAt)}</span>}
            </div>
          </div>
        </div>

        {(row.requiredForCertificate || limit > 0) && (
          <div className="flex gap-2.5 rounded-2xl bg-mist/70 px-4 py-3 text-[13px] text-ink-soft">
            <Award className="mt-0.5 h-4 w-4 shrink-0 text-npurple" />
            <span>
              {row.requiredForCertificate && <>The learner’s certificate waits for your approval of this work. </>}
              {limit > 0 &&
                (canReturn
                  ? `Version ${version}. The rubric allows ${limit === 1 ? 'one revision' : `${limit} revisions`}; if a dimension needs work, return it with feedback that names it.`
                  : `Version ${version}: this is the learner’s ${limit === 1 ? 'revision' : 'last allowed revision'}, so it cannot be returned again. Approve it, or mark it Not approved.`)}
            </span>
          </div>
        )}

        {sub.previous && (
          <div className="rounded-2xl border border-line p-4 text-sm">
            <div className="font-semibold">This is a resubmission</div>
            <p className="mt-0.5 text-ink-soft">
              The earlier version (submitted {fmtDateTime(sub.previous.submittedAt)}) was marked <b className="text-ink">{sub.previous.review ? STATUS[sub.previous.review].label : 'with feedback'}</b>
              {sub.previous.by ? ` by ${sub.previous.by}` : ''}.
            </p>
            {sub.previous.feedback && <p className="mt-2 border-l-4 border-line pl-3 italic text-ink-soft">“{sub.previous.feedback}”</p>}
            {!!sub.previous.rubric?.dimensions?.some((d) => !d.pass) && (
              <p className="mt-2 text-ink-soft">
                Needed work last time: <b className="text-ink">{sub.previous.rubric.dimensions.filter((d) => !d.pass).map((d) => d.label).join(', ')}</b>
              </p>
            )}
          </div>
        )}

        <div className={cx(pdf && 'grid gap-4 lg:grid-cols-2')}>
        <div className="min-w-0">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">The learner’s work</div>
          <div className={cx("space-y-3 rounded-2xl border border-line p-4", pdf && "lg:h-[520px] lg:overflow-y-auto scroll-thin")}>
            {Object.entries(sub.fields).map(([k, v]) => (
              <div key={k}>
                <div className="text-xs font-semibold text-ink-faint">{row.fieldLabels[k] ?? k}</div>
                <p className="whitespace-pre-line text-[14.5px] leading-relaxed">{v || '—'}</p>
              </div>
            ))}
            {sub.fileUrl && (
              <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-nblue hover:underline">
                <Paperclip className="h-4 w-4" /> {sub.fileName}
              </a>
            )}
          </div>
        </div>

          {pdf && (
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Rubric · out of {pdf.maxPoints} points</div>
                <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-nblue hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Open in a new tab
                </a>
              </div>
              <iframe src={`${pdf.url}#view=FitH`} title={`Rubric: ${pdf.name}`} className="h-[460px] w-full rounded-2xl border border-line bg-mist lg:h-[520px]" />
              <div className="mt-1 truncate text-[11.5px] text-ink-faint">
                <FileText className="mr-1 inline h-3 w-3" />
                {pdf.name}
              </div>
            </div>
          )}
        </div>

        <GeneralChecks report={row.autoCheck} />

        {passMode && <EvidencePages pages={pages} loading={pagesLoading} />}

        {passMode && (
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Step 1 · Decide each dimension</div>
              <div className="text-xs text-ink-soft">
                {allMarked ? (needsWork.length ? `${needsWork.length} need${needsWork.length === 1 ? 's' : ''} work` : 'All pass') : `${marked} of ${dims.length} decided`} · all must pass to approve
              </div>
            </div>
            <div className="divide-y divide-line rounded-2xl border border-line">
              {dims.map((d) => {
                const auto = row.autoCheck ? dimensionChecks(row.autoCheck, d.id) : { checks: [], passed: 0, total: 0 };
                const ai = passSuggestion?.dimensions.find((x) => x.id === d.id);
                return (
                  <div key={d.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-[220px] flex-1">
                        <div className="text-sm font-semibold">{d.label}</div>
                        <div className="text-[12.5px] leading-snug text-ink-soft">Pass: {d.pass}</div>
                      </div>
                      <div className="flex gap-1" role="radiogroup" aria-label={d.label}>
                        {([true, false] as const).map((v) => (
                          <button
                            key={String(v)}
                            type="button"
                            role="radio"
                            aria-checked={marks[d.id] === v}
                            onClick={() => setMarks((x) => ({ ...x, [d.id]: v }))}
                            className={cx(
                              'rounded-full px-3 py-1 text-xs font-semibold transition',
                              marks[d.id] === v ? (v ? 'bg-ngreen text-white' : 'bg-[#F5A300] text-white') : 'bg-mist text-ink-soft hover:text-ink',
                            )}
                          >
                            {v ? 'Pass' : 'Needs work'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {auto.total > 0 ? (
                      <details className="mt-1.5">
                        <summary className={cx('cursor-pointer text-xs font-semibold', auto.passed === auto.total ? 'text-ngreen-ink' : 'text-[#9a5b00]')}>
                          Automatic checks: {auto.passed} of {auto.total} in place
                        </summary>
                        <ul className="mt-1">
                          {auto.checks.map((c) => (
                            <CheckLine key={c.id} c={c} />
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <div className="mt-1.5 text-xs text-ink-faint">Your judgment: nothing here can be checked automatically.</div>
                    )}
                    {ai && (
                      <div className="mt-1.5 text-xs text-npurple">
                        AI suggests <b>{ai.pass ? 'Pass' : 'Needs work'}</b>. <span className="text-ink-soft">{ai.reason}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="flex-1 text-xs text-ink-faint">The automatic checks only confirm the pieces are there. Whether the work is usable, real and applied is your call.</p>
              {aiAvailable && (
                <Button size="sm" variant="secondary" loading={suggesting} icon={<Sparkles className="h-4 w-4" />} onClick={suggest}>
                  Suggest a decision for each dimension
                </Button>
              )}
            </div>
            {row.submission.autoEval && (
              <div className={cx('mt-2 rounded-2xl border p-3 text-sm', row.submission.autoEval.status === 'done' ? 'border-ngreen/30 bg-ngreen-soft/40' : 'border-[#F5A300]/40 bg-[#fff8e8]')}>
                <div className="font-semibold">
                  {row.submission.reviewedAutomatically
                    ? 'Decided by the automatic evaluation. You can change the decision below; the learner is notified again.'
                    : row.submission.autoEval.status === 'queued' || row.submission.autoEval.status === 'running'
                      ? 'The automatic evaluation is working on this version.'
                      : row.submission.autoEval.status === 'done'
                        ? 'Automatic evaluation finished.'
                        : 'The automatic evaluation handed this to you.'}
                </div>
                {row.submission.autoEval.note && <p className="mt-1 text-ink-soft">{row.submission.autoEval.note}</p>}
                {!row.submission.review && (row.submission.autoEval.status === 'failed' || row.submission.autoEval.status === 'needs_admin') && (
                  <Button size="sm" variant="secondary" className="mt-2" loading={rerunning} onClick={() => void rerun()}>
                    Run the automatic evaluation again
                  </Button>
                )}
              </div>
            )}
            {passSuggestion && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-npurple/25 bg-npurple-soft/40 p-3 text-sm">
                <span className="flex-1 text-ink-soft">A suggestion only. Read the work and decide each dimension yourself.</span>
                <Button size="sm" variant="secondary" onClick={() => setMarks((m) => ({ ...m, ...Object.fromEntries(passSuggestion.dimensions.map((x) => [x.id, x.pass])) }))}>
                  Use these decisions
                </Button>
                {passSuggestion.feedback && (
                  <Button size="sm" variant="ghost" onClick={() => setText(passSuggestion.feedback)}>
                    Use the feedback
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {pdf && (
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Step 1 · Score against the rubric PDF</div>
              {pdfPercent !== null && (
                <div className="text-xs text-ink-soft">
                  Activity score <b className="text-ink">{pdfPercent}%</b> · counts toward Mastery
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-4">
              <label htmlFor="rubric-points" className="text-sm font-semibold">
                Points awarded
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="rubric-points"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={pdf.maxPoints}
                  step={0.5}
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  className={cx('h-10 w-24 rounded-xl border bg-white px-3 text-right font-semibold outline-none focus:border-nblue', points && !ptsValid ? 'border-npink' : 'border-line')}
                />
                <span className="text-sm text-ink-soft">/ {pdf.maxPoints}</span>
              </div>
              {aiAvailable && (
                <Button size="sm" variant="secondary" className="ml-auto" loading={suggesting} icon={<Sparkles className="h-4 w-4" />} onClick={suggest}>
                  Suggest a score from the rubric
                </Button>
              )}
            </div>
            {suggestion && (
              <div className="mt-3 rounded-2xl border border-npurple/25 bg-npurple-soft/40 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-npurple">
                    AI suggestion: {suggestion.points} / {suggestion.maxPoints}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setPoints(String(suggestion.points))}>
                      Use this score
                    </Button>
                    {suggestion.feedback && (
                      <Button size="sm" variant="ghost" onClick={() => setText(suggestion.feedback)}>
                        Use the feedback
                      </Button>
                    )}
                  </div>
                </div>
                {suggestion.criteria.length > 0 && (
                  <ul className="mt-2 divide-y divide-npurple/10">
                    {suggestion.criteria.map((c, i) => (
                      <li key={i} className="flex gap-3 py-1.5">
                        <span className="min-w-0 flex-1">
                          <b className="font-semibold">{c.name}</b>
                          <span className="text-ink-soft">. {c.reason}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {c.points}/{c.max}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-ink-faint">A suggestion only. Check it against the rubric and the work; your score and decision are what count.</p>
              </div>
            )}
            <p className="mt-1.5 text-xs text-ink-faint">Required to Approve or mark Not approved. Optional when you request a resubmission.</p>
          </div>
        )}

        {pdf || passMode ? null : criteria.length > 0 ? (
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Step 1 · Score against the rubric</div>
              <div className="text-xs text-ink-soft">
                {percent !== null ? (
                  <>
                    Activity score <b className="text-ink">{percent}%</b> · counts toward Mastery
                  </>
                ) : (
                  `${scored} of ${criteria.length} scored`
                )}
              </div>
            </div>
            <div className="divide-y divide-line rounded-2xl border border-line">
              {criteria.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-[200px] flex-1">
                    <div className="text-sm font-semibold">{c.label}</div>
                    {c.description && <div className="text-xs text-ink-soft">Met looks like: {c.description}</div>}
                  </div>
                  <div className="flex gap-1" role="radiogroup" aria-label={c.label}>
                    {RUBRIC_LEVELS.map((l) => (
                      <button
                        key={l.level}
                        type="button"
                        role="radio"
                        aria-checked={levels[c.id] === l.level}
                        onClick={() => setLevels((x) => ({ ...x, [c.id]: l.level }))}
                        className={cx(
                          'rounded-full px-3 py-1 text-xs font-semibold transition',
                          levels[c.id] === l.level
                            ? l.level === 2
                              ? 'bg-ngreen text-white'
                              : l.level === 1
                                ? 'bg-[#F5A300] text-white'
                                : 'bg-npink text-white'
                            : 'bg-mist text-ink-soft hover:text-ink',
                        )}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">
              The scores measure the quality of the work and become the learner’s Mastery evidence. Required to Approve or mark Not approved. Optional when you request a resubmission.
            </p>
          </div>
        ) : (
          <p className="rounded-2xl bg-mist/70 px-4 py-3 text-xs text-ink-soft">
            This activity has no rubric, so it counts toward progress only, not Mastery.{row.needsReview === false ? ' It was complete when the learner submitted it; a decision and feedback are optional.' : ''} Add a rubric in Course Builder to score it.
          </p>
        )}

        <div>
          <label htmlFor="review-note" className="mb-1.5 block text-sm font-semibold">
            {scoring && 'Step 2 · '}Feedback on activity <span className="font-normal text-ink-faint">({passMode ? 'needed to return it or mark it Not approved; name what each dimension needs' : 'needed for Request resubmission and Not approved'})</span>
          </label>
          <Textarea id="review-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="What works, and what to change. Be specific and encouraging." className="!min-h-[96px]" />
          {err && (
            <p role="alert" className="mt-2 rounded-xl bg-npink-soft px-3 py-2 text-sm font-medium text-npink">
              {err}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {DECISIONS.map((d) => {
            // With a Pass / Needs Work rubric the dimensions decide which choices make sense.
            const blocked =
              passMode && allMarked && ((d.value === 'approved' && needsWork.length > 0) || (d.value !== 'approved' && needsWork.length === 0))
                ? true
                : d.value === 'resubmit' && !canReturn;
            const why = d.value === 'resubmit' && !canReturn ? 'The rubric’s revision is used' : d.value === 'approved' ? 'Every dimension must pass' : 'Mark the dimension that needs work first';
            return (
              <button
                key={d.value}
                type="button"
                disabled={!!busy || blocked}
                title={blocked ? why : undefined}
                onClick={() => void decide(d.value)}
                className={cx('inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40', d.className, current === d.value && 'ring-4 ring-offset-2 ring-ink/10')}
              >
                {busy === d.value ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <d.icon className="h-4 w-4" />}
                {d.value === 'resubmit' && passMode ? 'Return for revision' : d.label}
              </button>
            );
          })}
        </div>
        <p className="-mt-2 text-center text-xs text-ink-faint">
          {scoring && 'Step 3 · Your decision tells the learner what happens next. '}The learner is notified right away and sees your decision, your note{pdf ? ', and the rubric score' : criteria.length > 0 ? ', and each criterion result' : passMode ? ', and each dimension' : ''} on the activity.
        </p>
      </div>
    </Modal>
  );
}

/* ---------------- The list ---------------- */

/**
 * Activity submissions: who submitted what, in which course, and its review
 * status. Details open in "View Assessment", where the admin approves,
 * marks not approved, or requests a resubmission.
 */
export function SubmissionsPanel({ data, reload }: { data: SubmissionsData; reload: () => void }) {
  const [course, setCourse] = useState('all');
  // Open on the work that is waiting for a decision, when there is any.
  const [status, setStatus] = useState<'all' | Status>(() => (data.submissions.some((s) => rowStatus(s) === 'pending') ? 'pending' : 'all'));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<SubmissionRow | null>(null);

  const inCourse = useMemo(() => data.submissions.filter((s) => course === 'all' || s.courseId === course), [data, course]);
  const counts = useMemo(() => {
    const c: Record<'all' | Status, number> = { all: inCourse.length, pending: 0, submitted: 0, approved: 0, not_approved: 0, resubmit: 0 };
    inCourse.forEach((s) => (c[rowStatus(s)] += 1));
    return c;
  }, [inCourse]);
  const needle = q.trim().toLowerCase();
  const rows = inCourse.filter((s) => (status === 'all' || rowStatus(s) === status) && (!needle || s.learnerName.toLowerCase().includes(needle) || (s.learnerEmail ?? '').toLowerCase().includes(needle)));

  const chips: ['all' | Status, string][] = [
    ['all', 'All'],
    ['pending', STATUS.pending.label],
    ['approved', STATUS.approved.label],
    ['resubmit', STATUS.resubmit.label],
    ['not_approved', STATUS.not_approved.label],
    ['submitted', 'No review needed'],
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={course} onChange={(e) => setCourse(e.target.value)} className="!w-auto min-w-[240px] !rounded-full !py-2" aria-label="Course">
            <option value="all">All my courses</option>
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by learner name or email"
              aria-label="Search by learner name or email"
              className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm outline-none focus:border-npurple"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {chips.map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={status === v}
              onClick={() => setStatus(v)}
              className={cx('rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition', status === v ? 'bg-ink text-white' : 'bg-mist text-ink-soft hover:text-ink')}
            >
              {l} <span className="opacity-70">({counts[v]})</span>
            </button>
          ))}
        </div>
      </Card>

      {data.submissions.length === 0 ? (
        <Empty icon={<FileCheck2 className="h-6 w-6" />} title="No activities submitted yet" text="Submissions appear here as soon as learners send them." />
      ) : rows.length === 0 ? (
        <Empty icon={<Search className="h-6 w-6" />} title="Nothing matches these filters" />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-mist/60 text-[12px] uppercase tracking-wide text-ink-soft">
                  <th className="px-5 py-3 font-bold">Learner</th>
                  <th className="px-4 py-3 font-bold">Course</th>
                  <th className="px-4 py-3 font-bold">Assessment submitted</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((s) => (
                  <tr key={`${s.userId}-${s.courseId}-${s.lessonId}`} className="transition hover:bg-mist/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar initials={initialsOf(s.learnerName)} size={32} />
                        <span className="font-semibold">{s.learnerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{s.courseTitle}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.activityTitle}</div>
                      <div className="text-xs text-ink-faint">
                        {fmtDateTime(s.submission.submittedAt)}
                        {s.submission.previous && ' · resubmitted'}
                        {s.requiredForCertificate && ' · certificate waits for it' }
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill s={s.submission} needsReview={s.needsReview !== false} />
                      {(s.rubricPdf?.url || s.rubric.length > 0 || s.passRubric) && (
                        <div className="mt-1 text-xs text-ink-faint">
                          {s.submission.rubric
                            ? s.submission.rubric.dimensions
                              ? `${s.submission.rubric.dimensions.filter((x) => x.pass).length} of ${s.submission.rubric.dimensions.length} dimensions pass`
                              : s.submission.rubric.maxPoints !== undefined
                                ? `Rubric ${s.submission.rubric.points}/${s.submission.rubric.maxPoints} (${s.submission.rubric.percent}%)`
                                : `Rubric ${s.submission.rubric.percent}%`
                            : 'Rubric not scored yet'}
                        </div>
                      )}
                      {s.autoCheck && s.autoCheck.passed < s.autoCheck.total && rowStatus(s) === 'pending' && (
                        <div className="mt-0.5 text-xs font-semibold text-[#9a5b00]">{s.autoCheck.total - s.autoCheck.passed} automatic check{s.autoCheck.total - s.autoCheck.passed === 1 ? '' : 's'} to look at</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant={rowStatus(s) === 'pending' ? 'primary' : 'secondary'} icon={<Eye className="h-4 w-4" />} onClick={() => setOpen(s)}>
                        View Assessment
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ReviewModal
        row={open}
        aiAvailable={data.aiAvailable}
        onClose={() => setOpen(null)}
        onDone={() => {
          setOpen(null);
          reload();
        }}
      />
    </div>
  );
}
