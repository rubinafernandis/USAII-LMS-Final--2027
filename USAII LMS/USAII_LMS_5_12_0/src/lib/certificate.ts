/**
 * The USAII Certificate of Completion, made in the browser as an A4 landscape PDF.
 *
 * Each USAII course has its own approved template (public/certificates/<course id>.jpg): the course name,
 * its description and Dr. Milton Mattox's signature are part of the artwork. This file adds what changes
 * per learner, in the template's own typeface (Fira Sans, public/certificates/fonts):
 *   the learner's name, "Has successfully completed the 10-Day Applied AI Sprint ...", the date of issue and
 *   the certificate number.
 * Courses without a template (or a renamed USAII course) use public/certificates/generic.jpg, with the
 * course name and its certificate line added as text. Issued certificates carry no watermark.
 */
import { jsPDF } from 'jspdf';
import { CERT_INTRO, certificateLineFor, hasCertificateTemplate } from '../../shared/certificateText';

export interface CertificateData {
  learnerName: string;
  courseTitle: string;
  courseId?: string;
  certificateLine?: string;
  issuedAt: string;
  certificateId: string;
  verifyUrl?: string;
}

/** Template pixels (1920 x 1358). Shared with the on-screen preview so both match. */
export const CERT_SIZE = { w: 1920, h: 1358 };
export const CERT_LAYOUT = {
  name: { x: 125, y: 613, size: 66 },
  intro: { x: 125, y: 695, size: 34 },
  title: { x: 123, y: 765, size: 45 },
  line: { x: 125, y: 828, size: 36, gap: 49, maxWidth: 1640 },
  date: { x: 313, y: 1047, size: 31 },
  number: { x: 399, y: 1088, size: 31 },
};
export const CERT_COLORS = { purple: [68, 28, 162] as const, ink: [28, 28, 28] as const, strong: [34, 34, 34] as const };

export const certificateTemplateUrl = (courseId: string | undefined, title: string) =>
  hasCertificateTemplate(courseId, title) ? `/certificates/${courseId}.jpg` : '/certificates/generic.jpg';

/** "6th November 2026", as on the approved template. */
export function formatCertificateDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const n = d.getDate();
  const v = n % 100;
  const s = ['th', 'st', 'nd', 'rd'];
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  return `${n}${suffix} ${d.toLocaleDateString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
}

const W = 841.89;
const H = 595.28;
const K = W / CERT_SIZE.w; // points per template pixel

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`The certificate file ${url} could not be loaded (${r.status}).`);
  return new Uint8Array(await r.arrayBuffer());
}
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let fonts: Promise<{ regular: string; bold: string }> | null = null;
function loadFonts() {
  fonts ??= Promise.all([fetchBytes('/certificates/fonts/FiraSans-Regular.ttf'), fetchBytes('/certificates/fonts/FiraSans-Bold.ttf')])
    .then(([r, b]) => ({ regular: toBase64(r), bold: toBase64(b) }))
    .catch((e) => {
      fonts = null;
      throw e;
    });
  return fonts;
}

/** Fira Sans covers Latin, Greek and Cyrillic. Other scripts are drawn by the browser as an image. */
const firaCovers = (t: string) => /^[\u0020-\u024F\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u2010-\u2027\u00A0-\u00FF]*$/.test(t);

function textAsImage(text: string, px: number, color: readonly number[]) {
  const scale = 3;
  const font = `700 ${px * scale}px "Noto Sans", system-ui, sans-serif`;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 8;
  c.width = w;
  c.height = Math.ceil(px * scale * 1.4);
  g.font = font;
  g.fillStyle = `rgb(${color.join(',')})`;
  g.textBaseline = 'alphabetic';
  g.fillText(text, 4, px * scale * 1.05);
  return { data: c.toDataURL('image/png'), w: w / scale, h: c.height / scale, baseline: px * 1.05 };
}

export async function buildCertificatePdf(d: CertificateData): Promise<jsPDF> {
  const [template, f] = await Promise.all([fetchBytes(certificateTemplateUrl(d.courseId, d.courseTitle)), loadFonts()]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  doc.addFileToVFS('FiraSans-Regular.ttf', f.regular);
  doc.addFont('FiraSans-Regular.ttf', 'FiraSans', 'normal');
  doc.addFileToVFS('FiraSans-Bold.ttf', f.bold);
  doc.addFont('FiraSans-Bold.ttf', 'FiraSans', 'bold');
  doc.setProperties({ title: `${d.courseTitle}: Certificate of Completion`, subject: 'USAII Certificate of Completion', author: 'United States Artificial Intelligence Institute (USAII)', creator: 'USAII LMS' });

  doc.addImage(template, 'JPEG', 0, 0, W, H, undefined, 'NONE');
  const L = CERT_LAYOUT;
  const C = CERT_COLORS;

  // Learner's name.
  const name = d.learnerName.trim();
  if (firaCovers(name)) {
    doc.setFont('FiraSans', 'bold');
    let size = L.name.size * K;
    doc.setFontSize(size);
    while (doc.getTextWidth(name) > L.line.maxWidth * K && size > 36 * K) doc.setFontSize((size -= 0.5));
    doc.setTextColor(...C.purple);
    doc.text(name, L.name.x * K, L.name.y * K);
  } else {
    const img = textAsImage(name, L.name.size, C.purple);
    const w = Math.min(img.w, L.line.maxWidth) * K;
    const h = (img.h * K * w) / (img.w * K);
    doc.addImage(img.data, 'PNG', L.name.x * K, L.name.y * K - (img.baseline * K * w) / (img.w * K), w, h);
  }

  // "Has successfully completed the 10-Day Applied AI Sprint and earned the AI Micro Credential"
  doc.setFont('FiraSans', 'normal');
  doc.setFontSize(L.intro.size * K);
  doc.setTextColor(...C.ink);
  doc.text(CERT_INTRO, L.intro.x * K, L.intro.y * K);

  // Courses without their own template: the course name and its line, as in the template.
  if (!hasCertificateTemplate(d.courseId, d.courseTitle)) {
    doc.setFont('FiraSans', 'bold');
    let size = L.title.size * K;
    doc.setFontSize(size);
    const title = d.courseTitle.toUpperCase();
    while (doc.getTextWidth(title) > L.line.maxWidth * K && size > 24 * K) doc.setFontSize((size -= 0.5));
    doc.setTextColor(...C.strong);
    doc.text(title, L.title.x * K, L.title.y * K);
    doc.setFont('FiraSans', 'normal');
    doc.setFontSize(L.line.size * K);
    doc.setTextColor(...C.ink);
    const lines = (doc.splitTextToSize(d.certificateLine?.trim() || certificateLineFor({ id: d.courseId }), L.line.maxWidth * K) as string[]).slice(0, 3);
    lines.forEach((t, i) => doc.text(t, L.line.x * K, (L.line.y + i * L.line.gap) * K));
  }

  // Date of Issue and Certificate Number, after the labels in the template.
  doc.setFont('FiraSans', 'bold');
  doc.setFontSize(L.date.size * K);
  doc.setTextColor(...C.strong);
  doc.text(formatCertificateDate(d.issuedAt), L.date.x * K, L.date.y * K);
  doc.text(d.certificateId, L.number.x * K, L.number.y * K);
  return doc;
}

export async function downloadCertificatePdf(d: CertificateData) {
  const doc = await buildCertificatePdf(d);
  const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  doc.save(`USAII_Certificate_${safe(d.courseTitle)}_${safe(d.learnerName)}.pdf`);
}
