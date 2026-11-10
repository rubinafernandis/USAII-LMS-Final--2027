/**
 * Reads a rubric file and turns it into Pass / Needs Work dimensions the admin can check and save.
 *  - Word (.docx): the table "Dimension | Pass definition" (the USAII grading sheet format).
 *  - Text or Markdown: a table, or one "Dimension: what Pass looks like" per line.
 *  - PDF: read by the AI service (needs ANTHROPIC_API_KEY or GEMINI_API_KEY).
 * The revision limit is read from the wording ("returned once", "one round"); otherwise one revision.
 */
import path from 'node:path';
import mammoth from 'mammoth';
import { callLLM, aiEngine, extractJson } from './ai';
import { nameFromUrl, readUpload } from './files';
import { fail } from './services';

export interface ImportedRubric {
  dimensions: { id: string; label: string; pass: string; evidence: string[] }[];
  revisionLimit: number;
  /** What was read, in one line, for the admin. */
  note: string;
}

const decode = (s: string) =>
  s
    .replace(/<\/p>\s*<p>/g, ' ')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const HEADER = /^(dimension|criteri(on|a)|area|component|category)s?$/i;
const NOT_A_DIMENSION = /^(learner|date|overall|feedback|total|score|reviewer|the certificate gate)\b/i;

function finish(rows: { label: string; pass: string }[], fullText: string, note: string): ImportedRubric {
  const seen = new Set<string>();
  const dimensions = rows
    .map((r) => ({ label: r.label.replace(/[:*]+$/, '').trim(), pass: r.pass.trim() }))
    .filter((r) => r.label && r.pass.length >= 12 && r.label.length <= 80 && !HEADER.test(r.label) && !NOT_A_DIMENSION.test(r.label))
    .slice(0, 12)
    .map((r) => {
      let id = r.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dimension';
      while (seen.has(id)) id += '-2';
      seen.add(id);
      return { id, label: r.label, pass: r.pass, evidence: [] as string[] };
    });
  const t = fullText.toLowerCase();
  const revisionLimit = /\b(no revisions?|not returned|cannot be revised)\b/.test(t) ? 0 : /\b(two revisions|returned twice|two rounds)\b/.test(t) ? 2 : 1;
  return { dimensions, revisionLimit, note };
}

function fromTextRows(text: string): { label: string; pass: string }[] {
  const rows: { label: string; pass: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^\|?\s*-{3,}/.test(line)) continue;
    if (line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.replace(/\*\*/g, '').trim()).filter(Boolean);
      if (cells.length >= 2) rows.push({ label: cells[0], pass: cells[1] });
      continue;
    }
    const m = /^[-*•\d.)\s]*\**([A-Za-z][A-Za-z /&-]{1,60}?)\**\s*[:–—-]\s+(.{12,})$/.exec(line);
    if (m) rows.push({ label: m[1], pass: m[2] });
  }
  return rows;
}

async function withAi(input: { pdf?: Buffer; text?: string }): Promise<{ label: string; pass: string }[]> {
  if (!aiEngine()) return [];
  const system =
    'You extract a grading rubric. Return JSON only, no code fences: {"dimensions": [{"label": "<dimension name>", "pass": "<what Pass looks like, in the rubric\\u2019s own words>"}]}. ' +
    'Include only the rubric\\u2019s dimensions or criteria, in order. Do not invent any.';
  const r = await callLLM(system, input.text ? `Rubric document:\n${input.text.slice(0, 40_000)}` : 'The rubric is the attached PDF.', { pdf: input.pdf, maxTokens: 1500, temperature: 0 });
  const j = r ? extractJson(r.text) : null;
  return Array.isArray(j?.dimensions) ? j.dimensions.map((d: any) => ({ label: String(d?.label ?? ''), pass: String(d?.pass ?? '') })) : [];
}

export async function importRubric(url: string): Promise<ImportedRubric> {
  const name = nameFromUrl(url) ?? fail(400, 'Upload the rubric file first.');
  const ext = path.extname(name!).toLowerCase();
  const buf = (await readUpload(url, 15 * 1024 * 1024)) ?? fail(404, 'The rubric file could not be read (missing, or larger than 15 MB).');
  if (ext === '.docx') {
    const html = (await mammoth.convertToHtml({ buffer: buf! })).value;
    const text = (await mammoth.extractRawText({ buffer: buf! })).value;
    const rows: { label: string; pass: string }[] = [];
    for (const tr of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
      const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map(decode);
      if (cells.length >= 2) rows.push({ label: cells[0], pass: cells[1] });
    }
    let out = finish(rows, text, 'Read from the table in the Word file.');
    if (!out.dimensions.length) out = finish(fromTextRows(text), text, 'Read from the lines of the Word file.');
    if (!out.dimensions.length) out = finish(await withAi({ text }), text, 'Read by the AI service from the Word file.');
    return out;
  }
  if (ext === '.txt' || ext === '.md') {
    const text = buf!.toString('utf8');
    const out = finish(fromTextRows(text), text, 'Read from the text file.');
    return out.dimensions.length ? out : finish(await withAi({ text }), text, 'Read by the AI service from the text file.');
  }
  if (ext === '.pdf') {
    if (!aiEngine()) fail(400, 'Reading a PDF rubric needs ANTHROPIC_API_KEY or GEMINI_API_KEY. Upload the rubric as a Word (.docx) or text file instead, or type the dimensions.');
    return finish(await withAi({ pdf: buf! }), '', 'Read by the AI service from the PDF.');
  }
  return fail(400, 'Upload the rubric as a Word (.docx), PDF, or text file.');
}
