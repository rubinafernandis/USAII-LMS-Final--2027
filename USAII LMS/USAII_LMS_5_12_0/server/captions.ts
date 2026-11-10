/**
 * The words spoken in a lesson video, read from the video's own captions.
 *
 * The transcript a learner sees is ONLY what the video says. Nothing is taken from the lesson page.
 *
 * Where the captions come from:
 *   - YouTube: the caption track already on the video (the CC the player shows). Uploaded captions are
 *     preferred; YouTube's automatic captions are used when there are none.
 *   - Vimeo:   the video's text track (needs VIMEO_ACCESS_TOKEN, because Vimeo only serves captions
 *              through its API).
 *   - A video uploaded to the LMS: the caption file (.vtt/.srt) the admin attached. The same file
 *     is also offered as the CC track on the player.
 *
 * Translation into the learner's language, in order:
 *   1. A caption track already published in that language on YouTube.
 *   2. YouTube's own caption translation of the video's captions (the same one the player's
 *      "Auto-translate" uses). No key needed.
 *   3. Server-side machine translation of the captions, line by line with timings kept:
 *      ANTHROPIC_API_KEY / GEMINI_API_KEY, or GOOGLE_TRANSLATE_API_KEY (Cloud Translation).
 * Every result is cached and shared, so each video is fetched/translated once per language.
 */
import type { ContentBlock } from '../shared/types';
import { cuesToText, mergeShortCues, parseTranscript, type TranscriptCue } from '../shared/transcript';
import { SOURCE_LANGUAGE } from '../shared/languages';
import { aiEngine, translateTranscript } from './ai';

export type VideoRef = { provider: 'youtube'; id: string } | { provider: 'vimeo'; id: string } | { provider: 'file'; id: string };

export function videoRef(url: string | undefined): VideoRef {
  const u = (url ?? '').trim();
  const yt = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i.exec(u);
  if (yt) return { provider: 'youtube', id: yt[1] };
  const vm = /vimeo\.com\/(?:.*?\/)?(?:video\/)?(\d{5,})/i.exec(u);
  if (vm) return { provider: 'vimeo', id: vm[1] };
  return { provider: 'file', id: u };
}

/** Same language, ignoring region: "en" matches "en-US", "pt-BR" matches "pt". */
export const sameLang = (a: string, b: string) => a.toLowerCase().split(/[-_]/)[0] === b.toLowerCase().split(/[-_]/)[0];

/* ---------------- YouTube ---------------- */

// Overridable for a corporate proxy (and for automated tests).
const YT_BASE = () => (process.env.YOUTUBE_BASE_URL || 'https://www.youtube.com').replace(/\/+$/, '');

interface YtTrack {
  baseUrl: string;
  lang: string;
  asr: boolean;
  translatable: boolean;
}

/** YouTube uses a few codes of its own for caption translation. */
const YT_LANG: Record<string, string> = { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', he: 'iw', 'pt-BR': 'pt', 'fr-CA': 'fr', 'es-419': 'es-419', jv: 'jv', fil: 'fil', 'mni': 'mni-Mtei' };
const ytLang = (code: string) => YT_LANG[code] ?? code;

const YT_HEADERS = {
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  // Skips the cookie-consent page some regions get, which has no captions on it.
  cookie: 'CONSENT=YES+cb; SOCS=CAI',
};

/** Pull a JSON array/object that starts right after `marker` out of a page, by matching brackets. */
function extractJson(html: string, marker: string): any {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  let i = at + marker.length;
  while (i < html.length && html[i] !== '[' && html[i] !== '{') i++;
  const open = html[i];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  for (let j = i; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (ch === '\\') j++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      try {
        return JSON.parse(html.slice(i, j + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const toTracks = (raw: any[]): YtTrack[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((t) => t?.baseUrl && t?.languageCode)
    .map((t) => ({ baseUrl: String(t.baseUrl), lang: String(t.languageCode), asr: t.kind === 'asr', translatable: t.isTranslatable !== false }));

async function youtubeTracks(videoId: string): Promise<YtTrack[]> {
  let apiKey = '';
  let pageTracks: YtTrack[] = [];
  try {
    const r = await fetch(`${YT_BASE()}/watch?v=${videoId}&hl=en`, { headers: YT_HEADERS, signal: AbortSignal.timeout(15_000) });
    if (r.ok) {
      const html = await r.text();
      apiKey = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1] ?? '';
      pageTracks = toTracks(extractJson(html, '"captionTracks":'));
    }
  } catch (e) {
    console.warn('[captions] YouTube page:', (e as Error).message);
  }
  // The player API (as the Android app calls it) returns caption links that download without a browser session.
  try {
    const r = await fetch(`${YT_BASE()}/youtubei/v1/player${apiKey ? `?key=${apiKey}` : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-language': 'en-US', 'user-agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip' },
      body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en' } }, videoId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) {
      const j: any = await r.json();
      const tracks = toTracks(j?.captions?.playerCaptionsTracklistRenderer?.captionTracks);
      if (tracks.length) return tracks;
    }
  } catch (e) {
    console.warn('[captions] YouTube player API:', (e as Error).message);
  }
  return pageTracks;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m,
    )
    .replace(/\s+/g, ' ')
    .trim();

/** YouTube's caption download comes as XML (two flavours) or JSON; all become timed cues. */
export function parseYoutubeCaptions(body: string): TranscriptCue[] {
  const text = body.trim();
  const cues: TranscriptCue[] = [];
  if (text.startsWith('{')) {
    try {
      const j = JSON.parse(text);
      for (const ev of j.events ?? []) {
        const line = decode((ev.segs ?? []).map((s: any) => s.utf8 ?? '').join(''));
        if (line) cues.push({ start: (ev.tStartMs ?? 0) / 1000, text: line });
      }
    } catch {
      return [];
    }
  } else if (/<p\s[^>]*\bt="/.test(text)) {
    for (const m of text.matchAll(/<p\s[^>]*?\bt="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)) {
      const line = decode(m[2]);
      if (line) cues.push({ start: Number(m[1]) / 1000, text: line });
    }
  } else {
    for (const m of text.matchAll(/<text\s[^>]*?\bstart="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
      const line = decode(m[2]);
      if (line) cues.push({ start: Number(m[1]), text: line });
    }
  }
  return mergeShortCues(cues);
}

async function downloadYoutubeTrack(track: YtTrack, tlang?: string): Promise<TranscriptCue[]> {
  const url = new URL(track.baseUrl.replace(/&fmt=[^&]*/, ''));
  if (tlang) url.searchParams.set('tlang', ytLang(tlang));
  const r = await fetch(url, { headers: YT_HEADERS, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return [];
  return parseYoutubeCaptions(await r.text());
}

/** The track that best represents what is actually said in the video. */
function originalTrack(tracks: YtTrack[]): YtTrack | undefined {
  const spoken = tracks.find((t) => t.asr)?.lang;
  return (
    (spoken && tracks.find((t) => !t.asr && sameLang(t.lang, spoken))) ||
    tracks.find((t) => !t.asr && sameLang(t.lang, SOURCE_LANGUAGE)) ||
    tracks.find((t) => !t.asr) ||
    tracks[0]
  );
}

/* ---------------- Vimeo ---------------- */

async function vimeoCaptions(videoId: string): Promise<{ lang: string; cues: TranscriptCue[] } | null> {
  const token = process.env.VIMEO_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.vimeo.com/videos/${videoId}/texttracks`, { headers: { authorization: `bearer ${token}`, accept: 'application/vnd.vimeo.*+json;version=3.4' }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    const list: any[] = (j.data ?? []).filter((t: any) => t.link && (t.type === 'captions' || t.type === 'subtitles'));
    const track = list.find((t) => t.active) ?? list[0];
    if (!track) return null;
    const v = await fetch(track.link, { signal: AbortSignal.timeout(20_000) });
    if (!v.ok) return null;
    const cues = parseTranscript(await v.text());
    return cues.length ? { lang: String(track.language || SOURCE_LANGUAGE), cues } : null;
  } catch (e) {
    console.warn('[captions] Vimeo:', (e as Error).message);
    return null;
  }
}

/* ---------------- Machine translation of caption lines ---------------- */

/*
 * Without any key, caption lines are translated with Google's public web translator (the one the
 * translate.google.com pages use): no sign up and nothing to configure, so transcripts translate on
 * every server, http or https. It has no service guarantee; for steady, heavy use set
 * GOOGLE_TRANSLATE_API_KEY or an AI key, which are tried first. FREE_TRANSLATION=off turns it off.
 */
const freeTranslationOn = () => (process.env.FREE_TRANSLATION ?? 'on').trim().toLowerCase() !== 'off';

export const canMachineTranslate = () => !!aiEngine() || !!process.env.GOOGLE_TRANSLATE_API_KEY || freeTranslationOn();

async function webTranslate(text: string, target: string, source: string): Promise<string | null> {
  const u = new URL('https://translate.googleapis.com/translate_a/single');
  u.searchParams.set('client', 'gtx');
  u.searchParams.set('sl', source || 'auto');
  u.searchParams.set('tl', target);
  u.searchParams.set('dt', 't');
  u.searchParams.set('q', text);
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (USAII LMS)' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j: any = await r.json();
  if (!Array.isArray(j?.[0])) return null;
  return j[0].map((seg: any) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : '')).join('');
}

/** One request per batch of whole caption lines (one line each), so every line keeps its time. */
async function freeTranslate(cues: TranscriptCue[], target: string, source: string): Promise<TranscriptCue[] | null> {
  if (!freeTranslationOn() || !cues.length) return null;
  const sl = source.split(/[-_]/)[0] || 'auto';
  const one = (t: string) => t.replace(/\s*\n\s*/g, ' ').trim();
  const out: TranscriptCue[] = [];
  try {
    let i = 0;
    while (i < cues.length) {
      let j = i + 1;
      while (j < cues.length && encodeURIComponent(cues.slice(i, j + 1).map((c) => one(c.text)).join('\n')).length <= 1800) j += 1;
      const batch = cues.slice(i, j);
      const tr = await webTranslate(batch.map((c) => one(c.text)).join('\n'), target, sl);
      const lines = (tr ?? '').replace(/\r/g, '').replace(/\n+$/, '').split('\n');
      if (tr != null && lines.length === batch.length) batch.forEach((c, k) => out.push({ start: c.start, text: lines[k].trim() || c.text }));
      else for (const c of batch) out.push({ start: c.start, text: ((await webTranslate(one(c.text), target, sl)) ?? c.text).trim() || c.text }); // lines merged: one by one
      i = j;
    }
    return out;
  } catch (e) {
    console.warn('[captions] Free translation:', (e as Error).message);
    return null;
  }
}

async function googleCloudTranslate(cues: TranscriptCue[], target: string, source: string): Promise<TranscriptCue[] | null> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;
  const out: TranscriptCue[] = [];
  try {
    for (let i = 0; i < cues.length; i += 100) {
      const batch = cues.slice(i, i + 100);
      const r = await fetch(`https://translation.googleapis.com/language/translate/v2`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ q: batch.map((c) => c.text), target, source: source.split('-')[0], format: 'text' }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) {
        console.warn('[captions] Cloud Translation failed:', r.status, (await r.text()).slice(0, 200));
        return null;
      }
      const j: any = await r.json();
      const tr: any[] = j.data?.translations ?? [];
      batch.forEach((c, k) => out.push({ start: c.start, text: decode(String(tr[k]?.translatedText ?? c.text)) }));
    }
    return out;
  } catch (e) {
    console.warn('[captions] Cloud Translation error:', (e as Error).message);
    return null;
  }
}

/** Translate caption cues on the server, keeping each line's time. Null when no engine is configured or it fails. */
export async function machineTranslate(cues: TranscriptCue[], target: { code: string; name: string }, sourceLang: string): Promise<TranscriptCue[] | null> {
  if (aiEngine()) {
    const r = await translateTranscript(cuesToText(cues), target);
    if (r) {
      const tr = parseTranscript(r.text);
      if (tr.length) return tr;
    }
  }
  const cloud = await googleCloudTranslate(cues, target.code, sourceLang);
  if (cloud?.length) return cloud;
  return freeTranslate(cues, target.code, sourceLang);
}

/* ---------------- The video's own captions ---------------- */

export interface Captions {
  lang: string;
  cues: TranscriptCue[];
  source: 'youtube' | 'vimeo' | 'lms';
  /** For YouTube: lets us ask YouTube for a translation of these exact captions. */
  yt?: { tracks: YtTrack[]; original: YtTrack };
}

/** Captions attached to the block by the admin (the CC file of an uploaded video). */
export function lmsCaptions(block: ContentBlock): Captions | null {
  const cues = parseTranscript(block.transcript);
  return cues.length ? { lang: SOURCE_LANGUAGE, cues, source: 'lms' } : null;
}

export async function originalCaptions(block: ContentBlock): Promise<Captions | null> {
  const ref = videoRef(block.url);
  if (ref.provider === 'youtube') {
    const tracks = await youtubeTracks(ref.id);
    const original = originalTrack(tracks);
    if (original) {
      const cues = await downloadYoutubeTrack(original);
      if (cues.length) return { lang: original.lang, cues, source: 'youtube', yt: { tracks, original } };
    }
  } else if (ref.provider === 'vimeo') {
    const v = await vimeoCaptions(ref.id);
    if (v) return { ...v, source: 'vimeo' };
  }
  // Uploaded video, or the platform's captions could not be read: the admin's caption file.
  return lmsCaptions(block);
}

/** YouTube's own captions in `lang`: a published track in that language, or YouTube's caption translation. */
export async function youtubeInLanguage(c: Captions, lang: string): Promise<{ cues: TranscriptCue[]; translated: boolean } | null> {
  if (!c.yt) return null;
  const published = c.yt.tracks.find((t) => !t.asr && sameLang(t.lang, lang) && t.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0]));
  if (published) {
    const cues = await downloadYoutubeTrack(published);
    if (cues.length) return { cues, translated: false };
  }
  if (c.yt.original.translatable) {
    const cues = await downloadYoutubeTrack(c.yt.original, lang);
    // YouTube returns the untranslated captions when it cannot translate; that is not a translation.
    if (cues.length && cuesToText(cues) !== cuesToText(c.cues)) return { cues, translated: true };
  }
  return null;
}
