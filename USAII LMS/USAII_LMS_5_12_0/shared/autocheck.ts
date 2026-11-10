// USAII Intuitive LMS: automatic pre-checks on submitted work
//
// What a computer can check reliably, so the reviewer spends their time on judgment:
//   - every answer is filled in, and none looks unfinished or copied from the question
//   - word limits written in a question ("150 to 250 words") are met
//   - the same text is not pasted into several answers
//   - no email address, phone, card or ID number is left in (the data-safety rule)
//   - for a Pass / Needs Work rubric: each dimension's evidence pages (earlier activities)
//     are submitted and filled in
//
// What it cannot judge: whether a workflow is usable, whether the work is grounded in a real
// task, whether a checklist is applied rather than just named. Those stay with the reviewer
// (an AI suggestion can help when a key is set). Nothing here changes a score or a decision.
//
// Pure functions: the server (for the reviewer) and the browser (for the learner, before
// submitting) run exactly the same checks.

import type { ActivityField, Course, Enrollment, Lesson, LessonActivity } from './types';
import { fieldDisplayLabel } from './template';

/** The longest answer one activity question accepts (longer work can be attached as a file). */
export const ACTIVITY_FIELD_MAX = 20000;

export interface AutoCheck {
  id: string;
  /** The rubric dimension this check informs, or undefined for checks on the activity itself. */
  dimensionId?: string;
  label: string;
  ok: boolean;
  /** What was found, in one short line. */
  detail?: string;
}

export interface AutoCheckReport {
  checks: AutoCheck[];
  passed: number;
  total: number;
}

export interface EvidencePage {
  lessonId: string;
  lessonTitle: string;
  activityTitle: string;
  submittedAt?: string;
  fields: { label: string; value: string }[];
  fileUrl?: string;
  fileName?: string;
}

/** Answered: has at least one letter or digit ("1" is a valid rank, "Mon" a valid day). */
export const isAnswered = (v: string | undefined): boolean => /[\p{L}\p{N}]/u.test(v ?? '');

/** Text that is clearly a placeholder rather than an answer. "None" and "N/A" are real answers, so they are not listed. */
const FILLER = /^(?:test(?:ing)?|asdf\w*|qwerty|x{2,}|lorem ipsum.*|tbd|todo|to do|xyz|abc|blah.*|(.)\1{3,})$/i;
export const looksUnfinished = (v: string): boolean => FILLER.test(v.trim().replace(/[.!?]+$/, ''));

export const wordCount = (v: string): number => (v.trim() ? v.trim().split(/\s+/).length : 0);

/** A word limit written into a question: "150 to 250 words", "at least 100 words", "up to 50 words". */
export function wordRange(f: Pick<ActivityField, 'label' | 'hint'>): { min?: number; max?: number } | null {
  const t = `${f.label} ${f.hint ?? ''}`;
  const both = /(\d{1,4})\s*(?:to|-|–|—)\s*(\d{1,4})\s*words/i.exec(t);
  if (both) return { min: Number(both[1]), max: Number(both[2]) };
  const min = /(?:at least|minimum(?: of)?)\s*(\d{1,4})\s*words/i.exec(t);
  const max = /(?:up to|at most|no more than|maximum(?: of)?)\s*(\d{1,4})\s*words/i.exec(t);
  return min || max ? { min: min ? Number(min[1]) : undefined, max: max ? Number(max[1]) : undefined } : null;
}

/** Personal data that should have been removed before it went into an AI tool or a playbook. */
export function findPersonalData(text: string): string[] {
  const found: string[] = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) found.push('an email address');
  for (const m of text.match(/\+?\d[\d\s().-]{8,}\d/g) ?? []) {
    const digits = m.replace(/\D/g, '').length;
    if (digits >= 10 && digits <= 12 && !found.includes('a phone or ID number')) found.push('a phone or ID number');
    if (digits >= 13 && digits <= 19 && !found.includes('a card or account number')) found.push('a card or account number');
  }
  if (/\b[A-Z]{5}\d{4}[A-Z]\b/.test(text)) found.push('a tax ID (PAN) number');
  return found;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quoted = (labels: string[]) => labels.slice(0, 3).map((l) => `“${l}”`).join(', ') + (labels.length > 3 ? ` and ${labels.length - 3} more` : '');

function lessonById(course: Course, id: string): Lesson | undefined {
  for (const m of course.modules) for (const l of m.lessons) if (l.id === id) return l;
  return undefined;
}

/** The activities named as evidence by the rubric's dimensions, in course order, without the activity itself. */
export function evidenceLessonIds(course: Course, lesson: Lesson): string[] {
  const wanted = new Set((lesson.activity?.passRubric?.dimensions ?? []).flatMap((d) => d.evidence ?? []));
  wanted.delete(lesson.id);
  return course.modules.flatMap((m) => m.lessons).filter((l) => wanted.has(l.id) && l.activity).map((l) => l.id);
}

/** The learner's earlier pages that the rubric draws on, so the reviewer reads the whole piece of work in one place. */
export function evidencePages(course: Course, lesson: Lesson, enrollment: Enrollment | undefined): EvidencePage[] {
  return evidenceLessonIds(course, lesson).map((id) => {
    const l = lessonById(course, id)!;
    const sub = enrollment?.lessons[id]?.activity;
    return {
      lessonId: id,
      lessonTitle: l.title,
      activityTitle: l.activity!.title,
      submittedAt: sub?.submittedAt,
      fields: sub ? l.activity!.fields.map((f) => ({ label: fieldDisplayLabel(f), value: sub.fields[f.id] ?? '' })) : [],
      fileUrl: sub?.fileUrl,
      fileName: sub?.fileName,
    };
  });
}

/**
 * Runs every automatic check on one activity.
 * @param fields the answers to check (the submitted version, or a learner's draft)
 */
export function runAutoChecks(input: { course: Course; lesson: Lesson; fields: Record<string, string>; enrollment?: Enrollment }): AutoCheckReport {
  const { course, lesson, fields, enrollment } = input;
  const act = lesson.activity;
  const checks: AutoCheck[] = [];
  if (!act) return { checks, passed: 0, total: 0 };
  const value = (f: ActivityField) => (fields[f.id] ?? '').trim();

  // 1. Every answer is filled in.
  const blank = act.fields.filter((f) => !isAnswered(value(f)));
  checks.push({
    id: 'answered',
    label: 'Every answer is filled in',
    ok: blank.length === 0,
    detail: blank.length ? `${plural(blank.length, 'answer')} left blank: ${quoted(blank.map(fieldDisplayLabel))}` : `${plural(act.fields.length, 'answer')} filled in`,
  });

  // 2. Nothing looks unfinished or copied from the question.
  const unfinished = act.fields.filter((f) => {
    const v = value(f);
    if (!isAnswered(v)) return false;
    const same = (x?: string) => !!x && x.trim().toLowerCase() === v.toLowerCase();
    return looksUnfinished(v) || same(f.label) || same(f.hint) || same(f.placeholder);
  });
  checks.push({
    id: 'unfinished',
    label: 'No answer looks like a placeholder',
    ok: unfinished.length === 0,
    detail: unfinished.length ? `Check ${quoted(unfinished.map((f) => f.label))}` : undefined,
  });

  // 3. Word limits written into a question.
  for (const f of act.fields) {
    const range = wordRange(f);
    if (!range) continue;
    const n = wordCount(value(f));
    const ok = (range.min === undefined || n >= range.min) && (range.max === undefined || n <= range.max);
    const want = range.min !== undefined && range.max !== undefined ? `${range.min} to ${range.max}` : range.min !== undefined ? `at least ${range.min}` : `up to ${range.max}`;
    checks.push({ id: `words-${f.id}`, label: `“${f.label}” is ${want} words`, ok, detail: `${plural(n, 'word')} now` });
  }

  // 4. The same text pasted into several answers.
  const seen = new Map<string, string[]>();
  for (const f of act.fields) {
    const v = value(f).toLowerCase().replace(/\s+/g, ' ');
    if (v.length >= 40) seen.set(v, [...(seen.get(v) ?? []), f.label]);
  }
  const repeated = [...seen.values()].filter((labels) => labels.length > 1).flat();
  if (act.fields.length > 1)
    checks.push({ id: 'repeated', label: 'Each answer is written for its own question', ok: repeated.length === 0, detail: repeated.length ? `The same text appears in ${quoted(repeated)}` : undefined });

  // 5. Personal data, here and in the pages this work draws on.
  const scan: { where: string; label: string; text: string }[] = act.fields.map((f) => ({ where: '', label: f.label, text: value(f) }));
  for (const id of evidenceLessonIds(course, lesson)) {
    const l = lessonById(course, id)!;
    const sub = enrollment?.lessons[id]?.activity;
    if (sub) for (const f of l.activity!.fields) scan.push({ where: l.activity!.title, label: f.label, text: sub.fields[f.id] ?? '' });
  }
  const leaks = scan.flatMap((s) => findPersonalData(s.text).map((kind) => `${kind} in “${s.label}”${s.where ? ` (${s.where})` : ''}`));
  checks.push({
    id: 'personal-data',
    label: 'No email, phone, card or ID number left in',
    ok: leaks.length === 0,
    detail: leaks.length ? `Found ${leaks.slice(0, 2).join('; ')}${leaks.length > 2 ? `; and ${leaks.length - 2} more` : ''}` : undefined,
  });

  // 6. Each rubric dimension: its evidence pages are submitted and filled in.
  for (const d of act.passRubric?.dimensions ?? []) {
    for (const id of d.evidence ?? []) {
      const l = lessonById(course, id);
      if (!l?.activity) continue;
      const own = id === lesson.id;
      const sub = own ? { fields } : enrollment?.lessons[id]?.activity;
      if (!sub) {
        checks.push({ id: `${d.id}-${id}`, dimensionId: d.id, label: l.activity.title, ok: false, detail: `Not submitted yet (${l.title})` });
        continue;
      }
      const filled = l.activity.fields.filter((f) => isAnswered(sub.fields[f.id])).length;
      const total = l.activity.fields.length;
      checks.push({
        id: `${d.id}-${id}`,
        dimensionId: d.id,
        label: own ? `${l.activity.title} (this submission)` : l.activity.title,
        ok: filled === total,
        detail: `${own ? '' : 'Submitted, '}${filled} of ${total} answers filled in`,
      });
    }
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}

/** The checks that inform one dimension, and how many passed. */
export function dimensionChecks(report: AutoCheckReport, dimensionId: string) {
  const checks = report.checks.filter((c) => c.dimensionId === dimensionId);
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

/** The activity's general checks (not tied to a dimension). */
export const generalChecks = (report: AutoCheckReport) => report.checks.filter((c) => !c.dimensionId);

/** True when the activity has anything for the learner to see before submitting. */
export const hasPreChecks = (act: LessonActivity | undefined) => !!act?.passRubric?.dimensions?.length || !!act?.requiredForCertificate;
