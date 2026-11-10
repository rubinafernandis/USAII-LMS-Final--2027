/**
 * Repairs for the USAII course content as it was imported from the course documents.
 *
 *  1. Guided-build steps that arrived as one paragraph ("> 1. ... > > 2. ...") become a numbered list,
 *     and the same steps become the activity's instructions where the activity had none.
 *  2. Activity templates that were tables in the course documents arrived as one long flat form
 *     ("Task 1, Depends on, AI helps / Do myself, Task 2, Depends on..." or "1) 1), 1) Freq...").
 *     Their fields get groups, so each row of the table is shown as its own titled section.
 *  3. The Day 10 evidence packages of Courses 2, 3 and 4 had no fields, no instructions and a wrong
 *     title. They get the four-part evidence package their own Day 10 lesson describes.
 *
 * Every repair is conservative: field ids never change (learners' answers are keyed by id), nothing an
 * admin has already written is overwritten, and running it twice changes nothing.
 * Returns the number of changes made.
 */
import type { ActivityField, ContentBlock, Course, Lesson, LessonActivity } from '../../shared/types';

export function cleanUpCourseContent(course: Course): number {
  let changes = 0;
  for (const m of course.modules)
    for (const l of m.lessons) {
      changes += fixGuidedBuild(l);
      if (l.activity && !l.activity.fields.some((f) => f.group)) {
        const before = JSON.stringify(l.activity.fields);
        l.activity.fields = groupTemplateFields(l.id, l.activity.fields);
        if (JSON.stringify(l.activity.fields) !== before) changes += 1;
      }
    }
  changes += fixCapstone(course);
  changes += nameCapstone(course);
  // Certificates are named after the course.
  if (course.credentialName !== course.title) {
    course.credentialName = course.title;
    changes += 1;
  }
  return changes;
}

/**
 * The artifact each course builds, as its own documents name it. The Day 10 activity carries this
 * name, so the learner, the reviewer and the certificate all say what was actually earned.
 */
export const CAPSTONE_ARTIFACT: Record<string, string> = {
  c_ai_fluency: 'Personal AI Productivity Playbook',
  c_prompt_context: 'AI Context Design Canvas',
  c_agentic_ai: 'Agent Design Canvas and working agent',
  c_rag_assistants: 'RAG Readiness Checklist and working assistant',
  c_data_analysis: 'AI-Assisted Data Analysis Worksheet',
  c_project_delivery: 'AI Project Management Toolkit',
  c_hr_workforce: 'AI HR Use-Case Playbook',
  c_marketing_content: 'AI Campaign Builder Template',
};

function nameCapstone(course: Course): number {
  const name = CAPSTONE_ARTIFACT[course.id];
  const act = course.modules.flatMap((m) => m.lessons).at(-1)?.activity;
  // Only the imported placeholder title is replaced; a title an admin wrote stays.
  if (!name || !act || !/^evidence package\b/i.test(act.title.trim()) || act.title === name) return 0;
  act.title = name;
  return 1;
}

/* ---------------- 1. Guided-build steps ---------------- */

const QUOTED_STEPS = /^\s*>\s*1\.\s/;

function stepsOf(text: string): string[] {
  return text
    .split(/\s*>\s*(?:>\s*)?(?=\d+\.\s)/)
    .map((x) => x.replace(/^\d+\.\s+/, '').replace(/\s*>\s*$/, '').trim())
    .filter(Boolean);
}

function fixGuidedBuild(l: Lesson): number {
  let changes = 0;
  l.blocks = l.blocks.map((b): ContentBlock => {
    if (b.type !== 'paragraph' || !b.text || !QUOTED_STEPS.test(b.text)) return b;
    const items = stepsOf(b.text);
    if (items.length < 2) return b;
    changes += 1;
    return { id: b.id, type: 'list', items, ordered: true };
  });
  // The activity shows the same steps, so the learner can follow them while filling in the template.
  const act = l.activity;
  if (act && !act.instructions.length && !act.instructionBlocks?.length) {
    const steps = l.blocks.find((b) => b.type === 'list' && b.ordered && (b.items?.length ?? 0) >= 3 && /template|save|submit/i.test(b.items!.join(' ')));
    if (steps?.items) {
      act.instructions = [...steps.items];
      changes += 1;
    }
  }
  return changes;
}

/* ---------------- 2. Template field groups ---------------- */

/** What the first column of a numbered table row holds, by lesson (the course documents left it unnamed). */
const ROW_NOUN: Record<string, string> = {
  'ag-d2': 'Task',
  'ag-d3': 'Task',
  'ag-d6': 'Tool',
  'ag-d9': 'Test case',
  'rg-d3': 'Document',
  'rg-d4': 'Document',
  'rg-d6': 'Question',
  'rg-d7': 'Question',
  'rg-d8': 'Question',
  'rg-d9': 'Question',
};

/** Singular names for numbered list items ("1) Ten real questions" → "Question 1"). */
const ITEM_NOUN: [RegExp, string][] = [
  [/^ten real questions/i, 'Question'],
  [/^approval gates/i, 'Approval gate'],
  [/^handoffs/i, 'Handoff'],
  [/^stop rules/i, 'Stop rule'],
  [/^steps in order/i, 'Step'],
];

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const WORD_FOR: Record<string, string> = { Q: 'Question' };

export function groupTemplateFields(lessonId: string, input: ActivityField[]): ActivityField[] {
  const fields = input.map((f) => ({ ...f }));
  const grouped = () => fields.map((f) => !!f.group);

  // A. Numbered table rows: "1) 1)", "1) Freq", "Unanswerable 1) Before" ... and numbered lists "1) Approval gates (...)".
  const RA = /^(?:([A-Za-z][A-Za-z ]*?)\s+)?(\d{1,2})\)\s*(.*)$/;
  const parsedA = fields.map((f) => {
    const m = RA.exec(f.label.trim());
    if (!m) return null;
    const prefix = m[1]?.trim() ?? '';
    const n = Number(m[2]);
    const rest = m[3].trim();
    const header = rest === `${n})` || (!!prefix && rest === `${prefix} ${n})`);
    return { prefix, n, rest, header };
  });
  const families = new Map<string, number[]>();
  parsedA.forEach((p, i) => p && (families.get(p.prefix) ?? families.set(p.prefix, []).get(p.prefix)!).push(i));
  for (const [prefix, idx] of families) {
    const hasHeader = idx.some((i) => parsedA[i]!.header);
    if (hasHeader) {
      const noun = ROW_NOUN[lessonId] ?? 'Item';
      for (const i of idx) {
        const p = parsedA[i]!;
        fields[i].group = `${prefix ? cap(prefix) : noun} ${p.n}`;
        fields[i].label = p.header ? (prefix ? ROW_NOUN[lessonId] ?? 'Item' : noun) : cap(p.rest);
      }
    } else {
      // Lists: the same text numbered 1..n. Kept in number order (two-column tables arrived interleaved).
      const byRest = new Map<string, number[]>();
      for (const i of idx) (byRest.get(parsedA[i]!.rest) ?? byRest.set(parsedA[i]!.rest, []).get(parsedA[i]!.rest)!).push(i);
      for (const [rest, list] of byRest) {
        if (list.length < 2) continue;
        const noun = ITEM_NOUN.find(([re]) => re.test(rest))?.[1] ?? 'Item';
        for (const i of list) {
          fields[i].group = cap(rest);
          fields[i].label = `${noun} ${parsedA[i]!.n}`;
        }
        // Put the list in number order inside its own positions.
        const sorted = [...list].sort((a, b) => parsedA[a]!.n - parsedA[b]!.n).map((i) => fields[i]);
        [...list].sort((a, b) => a - b).forEach((pos, k) => (fields[pos] = sorted[k]));
      }
    }
  }

  // A2. "1. Use case, 1. How often, 1. Rank, 2. Use case..." (several fields per number).
  {
    const g = grouped();
    const RN = /^(\d{1,2})\.\s+(.+)$/;
    const parsed = fields.map((f, i) => (g[i] ? null : RN.exec(f.label.trim())));
    const byN = new Map<number, number[]>();
    parsed.forEach((m, i) => m && (byN.get(Number(m[1])) ?? byN.set(Number(m[1]), []).get(Number(m[1]))!).push(i));
    if (byN.size >= 2 && [...byN.values()].filter((x) => x.length >= 2).length >= 2)
      for (const [n, idx] of byN) {
        if (idx.length < 2) continue;
        const title = `${cap(parsed[idx[0]]![2])} ${n}`;
        for (const i of idx) {
          fields[i].group = title;
          fields[i].label = cap(parsed[i]![2]);
        }
      }
  }

  // A3. "Item 1, Item 1 · Depends on, Item 1 · Owner, Item 2..." (a row name, a number, then its columns after "·").
  {
    const g = grouped();
    const RS = /^(.+?)\s(\d{1,2})(?:\s+·\s+(.+))?$/;
    const parsed = fields.map((f, i) => (g[i] ? null : RS.exec(f.label.trim())));
    const phrases = new Map<string, { ns: Set<number>; subs: number }>();
    parsed.forEach((m) => {
      if (!m) return;
      const e = phrases.get(m[1]) ?? phrases.set(m[1], { ns: new Set(), subs: 0 }).get(m[1])!;
      e.ns.add(Number(m[2]));
      if (m[3]) e.subs += 1;
    });
    parsed.forEach((m, i) => {
      if (!m) return;
      const e = phrases.get(m[1])!;
      if (e.ns.size < 2 || !e.subs) return;
      fields[i].group = `${cap(m[1])} ${m[2]}`;
      fields[i].label = m[3] ? cap(m[3]) : cap(m[1]);
    });
  }

  // B. Sections led by a numbered heading: "Task 1, Depends on, ...", "Case 1: accurate, complete, ...".
  const RB = /^([A-Za-z]+)\s?(\d{1,2})(?=$|[\s:(])\s*:?\s*(.*)$/;
  const isGrouped = grouped();
  const parsedB = fields.map((f, i) => {
    if (isGrouped[i]) return null;
    const m = RB.exec(f.label.trim());
    // Steps and days are sequences, not repeating table rows.
    if (!m || /^(day|step)$/i.test(m[1])) return null;
    return { prefix: m[1], n: Number(m[2]), rest: m[3].trim().replace(/^[·:-]\s*/, '') };
  });
  const distinct = new Map<string, Set<number>>();
  parsedB.forEach((p) => p && (distinct.get(p.prefix) ?? distinct.set(p.prefix, new Set()).get(p.prefix)!).add(p.n));
  const candidates = new Set([...distinct].filter(([, ns]) => ns.size >= 2).map(([p]) => p));
  if (candidates.size) {
    const sections: { prefix: string; n: number; members: number[] }[] = [];
    let cur: (typeof sections)[number] | null = null;
    for (let i = 0; i < fields.length; i++) {
      if (isGrouped[i]) {
        cur = null;
        continue;
      }
      const p = parsedB[i];
      if (p && candidates.has(p.prefix)) {
        if (!cur || cur.prefix !== p.prefix || cur.n !== p.n) {
          cur = { prefix: p.prefix, n: p.n, members: [] };
          sections.push(cur);
        }
        cur.members.push(i);
      } else if (p) {
        cur = null;
      } else if (cur) {
        cur.members.push(i);
      }
    }
    // The last section of each kind keeps the size of the one before it; whatever follows stands alone.
    for (const prefix of candidates) {
      const own = sections.filter((s) => s.prefix === prefix);
      if (own.length >= 2) {
        const last = own[own.length - 1];
        const size = own[own.length - 2].members.length;
        last.members = last.members.slice(0, Math.max(1, size));
      }
      // Real repeating sections have several fields each; a run of single numbered fields ("STEP 1", "STEP 2") is a list.
      if (own.filter((s) => s.members.length >= 2).length < 2) for (const s of own) s.members = [];
    }
    for (const s of sections) {
      const word = WORD_FOR[s.prefix] ?? s.prefix;
      for (const i of s.members) {
        const p = parsedB[i];
        fields[i].group = `${word} ${s.n}`;
        if (p && p.prefix === s.prefix) fields[i].label = !p.rest ? word : p.rest.startsWith('(') ? `${word} ${p.rest}` : cap(p.rest);
        else fields[i].label = cap(fields[i].label);
      }
    }
  }

  // C. The same unnumbered sequence repeated: "Source, job, portion needed, currency / owner" three times.
  {
    const g = grouped();
    const labels = fields.map((f) => f.label);
    for (let i = 0; i < fields.length; i++) {
      if (g[i]) continue;
      const next = labels.indexOf(labels[i], i + 1);
      if (next < 0) continue;
      const step = next - i;
      if (step < 2) continue;
      const seq = labels.slice(i, i + step);
      const starts = [i];
      for (let k = i + step; k + step <= fields.length && labels.slice(k, k + step).every((x, j) => x === seq[j]); k += step) starts.push(k);
      if (starts.length < 2 || starts.some((st) => g.slice(st, st + step).some(Boolean))) continue;
      starts.forEach((st, n) => {
        for (let j = st; j < st + step; j++) {
          fields[j].group = `${cap(seq[0])} ${n + 1}`;
          fields[j].label = cap(fields[j].label);
        }
      });
      for (let j = i; j < starts[starts.length - 1] + step; j++) g[j] = true;
      i = starts[starts.length - 1] + step - 1;
    }
  }

  // D. Rows that repeat one phrase with the same column names: "Runaway loop Applies?", "Runaway loop Control"...
  {
    const g = grouped();
    const words = (s: string) => s.trim().split(/\s+/);
    const commonPrefix = (ls: string[]) => {
      const ws = ls.map(words);
      let k = 0;
      while (ws.every((w) => w.length > k + 1 && w[k] === ws[0][k])) k += 1;
      return k;
    };
    for (let i = 0; i < fields.length; i++) {
      if (g[i]) continue;
      let done = false;
      for (let size = 2; size <= 6 && !done; size++) {
        const block = (st: number) => {
          if (st + size > fields.length || g.slice(st, st + size).some(Boolean)) return null;
          const ls = fields.slice(st, st + size).map((f) => f.label);
          const k = commonPrefix(ls);
          if (!k) return null;
          return { prefix: words(ls[0]).slice(0, k).join(' '), rests: ls.map((l) => words(l).slice(k).join(' ')) };
        };
        const first = block(i);
        if (!first) continue;
        const blocks = [{ st: i, ...first }];
        for (let st = i + size; ; st += size) {
          const b = block(st);
          if (!b || b.rests.join('|') !== first.rests.join('|') || b.prefix === first.prefix) break;
          blocks.push({ st, ...b });
        }
        if (blocks.length < 2) continue;
        for (const b of blocks)
          for (let j = 0; j < size; j++) {
            fields[b.st + j].group = cap(b.prefix);
            fields[b.st + j].label = cap(b.rests[j]);
            g[b.st + j] = true;
          }
        i = blocks[blocks.length - 1].st + size - 1;
        done = true;
      }
    }
  }
  return fields;
}

/* ---------------- 3. Day 10 evidence packages (Courses 2, 3 and 4) ---------------- */

const IMPLEMENTATION = 'Your implementation note of 150 to 250 words';
const EARLIER_PAGES = 'Your Day 1 to 9 pages reach your reviewer automatically. Paste the assembled version here, or attach it as a file.';

const CAPSTONES: Record<string, { lessonId: string; activity: LessonActivity }> = {
  c_prompt_context: {
    lessonId: 'pc-d10',
    activity: {
      title: 'Evidence package: AI Context Design Canvas',
      instructions: [],
      allowFile: true,
      fields: [
        { id: 'pc-d10-f1', label: 'The AI Context Design Canvas: SCOPE, SUPPLY, SHAPE, STATE and SUSTAIN for your one use case', multiline: true, hint: EARLIER_PAGES },
        { id: 'pc-d10-f2', label: `${IMPLEMENTATION}: where, when and how you will use the canvas, and who is involved`, multiline: true },
        { id: 'pc-d10-f3', label: 'Your before-and-after test: the same task with a thin prompt and with your full canvas, judged against your own criteria', multiline: true },
        { id: 'pc-d10-f4', label: 'Your completed guardrails-and-review checklist', multiline: true },
      ],
    },
  },
  c_agentic_ai: {
    lessonId: 'ag-d10',
    activity: {
      title: 'Evidence package: Agent Design Canvas and working agent',
      instructions: [],
      allowFile: true,
      fields: [
        { id: 'ag-d10-f1', label: 'The Agent Design Canvas: SELECT, TOOL, ESCALATE, ENGINEER and ROAD-TEST', multiline: true, hint: EARLIER_PAGES },
        { id: 'ag-d10-f2', label: 'Evidence of your working agent: a share link, or what your attached screenshots or export show (the trigger, connections, flow, and at least one full run)', multiline: true },
        { id: 'ag-d10-f3', label: `${IMPLEMENTATION}: where, when and how you will run the agent, who approves its actions, and who owns it`, multiline: true },
        { id: 'ag-d10-f4', label: 'Your road-test log, including the second run after fixes', multiline: true },
        { id: 'ag-d10-f5', label: 'Your completed agent risk checklist', multiline: true },
      ],
    },
  },
  c_rag_assistants: {
    lessonId: 'rg-d10',
    activity: {
      title: 'Evidence package: RAG Readiness Checklist and working assistant',
      instructions: [],
      allowFile: true,
      fields: [
        { id: 'rg-d10-f1', label: 'The RAG Readiness Checklist and build record', multiline: true, hint: EARLIER_PAGES },
        { id: 'rg-d10-f2', label: 'Evidence of your working assistant: a share link, or what your attached screenshots show (the document list, the instructions, a cited answer, and a decline)', multiline: true },
        { id: 'rg-d10-f3', label: `${IMPLEMENTATION}: where, when and how people will use the assistant, who owns the documents, and how often they are reviewed`, multiline: true },
        { id: 'rg-d10-f4', label: 'Your question test log, including the second run after fixes', multiline: true },
        { id: 'rg-d10-f5', label: 'Your answer evaluation checklist and your hallucination-reduction step', multiline: true },
      ],
    },
  },
};

function fixCapstone(course: Course): number {
  const spec = CAPSTONES[course.id];
  if (!spec) return 0;
  const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === spec.lessonId);
  // Only the empty activity that arrived from the import is replaced; anything an admin built stays.
  if (!lesson?.activity || lesson.activity.fields.length) return 0;
  const steps = lesson.blocks.find((b) => b.type === 'list' && b.ordered)?.items ?? [];
  lesson.activity = {
    ...spec.activity,
    fields: spec.activity.fields.map((f) => ({ ...f })),
    instructions: steps.length ? [...steps] : lesson.activity.instructions,
  };
  return 1;
}
