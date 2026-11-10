/**
 * Video transcripts in the learner's own language.
 *
 * The transcript is the video's own captions (see server/captions.ts) and nothing else: no lesson text,
 * no page text. The server reads them from the video, translates them into the learner's language when
 * asked, and caches the result, so each video is fetched and translated once per language for everyone.
 *
 * It only ever works on a video that is part of a course the learner can open (never arbitrary text or
 * URLs sent by a browser), so this cannot be used as a free translation or download service.
 */
import { Router } from 'express';
import type { ContentBlock, VideoCaptionCache } from '../../shared/types';
import { languageByCode } from '../../shared/languages';
import { cuesToText, hashText, parseTranscript } from '../../shared/transcript';
import { flattenLessons } from '../../shared/analytics';
import { requireAuth } from '../auth';
import { db, nowIso, save } from '../db';
import { canTranscribeMedia } from '../ai';
import { canMachineTranslate, machineTranslate, originalCaptions, sameLang, videoRef, youtubeInLanguage } from '../captions';
import { canAccessCourse, fail, getCourse, isStaff } from '../services';
import { me, wrap } from './util';

export const transcriptRouter = Router();
transcriptRouter.use(requireAuth);

const MAX_CACHE_ENTRIES = 4000;
/** Captions on YouTube/Vimeo can be edited by their owner, so re-read them after a week. */
const PLATFORM_TTL_MS = 7 * 86_400_000;
const NEW_WORK_PER_HOUR = 40;
const recent = new Map<string, number[]>();
const inFlight = new Map<string, Promise<VideoCaptionCache | null>>();
/** Videos found to have no platform captions, so we do not ask the platform again on every play. */
const noCaptions = new Map<string, number>();

function allowNewWork(userId: string): boolean {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= NEW_WORK_PER_HOUR) {
    recent.set(userId, list);
    return false;
  }
  list.push(now);
  recent.set(userId, list);
  return true;
}

function findMediaBlock(courseId: string, lessonId: string, blockId: string): ContentBlock {
  const course = getCourse(courseId);
  const lesson = flattenLessons(course).find((f) => f.lesson.id === lessonId)?.lesson ?? fail(404, 'Lesson not found.');
  const block = lesson.blocks.find((b) => b.id === blockId && (b.type === 'video' || b.type === 'audio'));
  return block ?? fail(404, 'This video is not saved in the course yet. Save the lesson, then try again.');
}

const cache = () => (db().videoCaptions ??= {});

function remember(key: string, entry: VideoCaptionCache) {
  const c = cache();
  c[key] = entry;
  const keys = Object.keys(c);
  if (keys.length > MAX_CACHE_ENTRIES) {
    keys.sort((a, b) => c[a].at.localeCompare(c[b].at));
    for (const k of keys.slice(0, keys.length - MAX_CACHE_ENTRIES)) delete c[k];
  }
  save();
}

const fresh = (e: VideoCaptionCache | undefined) => !!e && (e.source === 'lms' || e.source === 'machine' || Date.now() - Date.parse(e.at) < PLATFORM_TTL_MS);

/** The admin's caption file for this video (uploaded videos, or when the platform has none). */
function lmsOriginal(block: ContentBlock) {
  const cues = parseTranscript(block.transcript);
  return cues.length ? { id: `lms:${block.id}`, entry: { text: cuesToText(cues), lang: 'en', source: 'lms' as const, at: nowIso() } } : null;
}

/** The video's captions in their original language (cached for YouTube/Vimeo). */
async function original(block: ContentBlock, userId: string): Promise<{ id: string; entry: VideoCaptionCache } | null> {
  const ref = videoRef(block.url);
  if (ref.provider === 'file') return lmsOriginal(block);
  const id = `${ref.provider}:${ref.id}`;
  const key = `${id}:_orig`;
  const hit = cache()[key];
  if (fresh(hit)) return { id, entry: hit! };
  if ((noCaptions.get(id) ?? 0) > Date.now()) return lmsOriginal(block);
  let job = inFlight.get(key);
  if (!job) {
    if (!allowNewWork(userId)) fail(429, 'Many videos were opened in a short time. Please try again in a few minutes.');
    job = originalCaptions(block)
      .then((c): VideoCaptionCache | null => (c ? { text: cuesToText(c.cues), lang: c.lang, source: c.source, at: nowIso() } : null))
      .finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  const got = await job;
  if (!got || got.source === 'lms') {
    // No readable captions on the platform; the admin's caption file stands in. Ask the platform again later.
    noCaptions.set(id, Date.now() + 30 * 60_000);
    return lmsOriginal(block);
  }
  remember(key, got);
  return { id, entry: got };
}

/** What this server can do. */
transcriptRouter.get(
  '/status',
  wrap(() => ({ translate: canMachineTranslate(), transcribe: canTranscribeMedia(), youtube: true, vimeo: !!process.env.VIMEO_ACCESS_TOKEN })),
);

/**
 * The transcript of one lesson video in one language.
 * Body: { courseId, lessonId, blockId, lang }
 * Returns the cues as text with [m:ss] stamps. If the language cannot be produced, the original
 * captions come back with `translated: false` and `unavailable: true` (the app then tries the
 * browser's own on-device translator, and otherwise shows the original).
 */
const videoTranscript = wrap(async (req) => {
  const u = me(req);
  const courseId = String(req.body?.courseId ?? '');
  const lessonId = String(req.body?.lessonId ?? '');
  const blockId = String(req.body?.blockId ?? '');
  const lang = languageByCode(String(req.body?.lang ?? ''));
  if (!lang) fail(400, 'Choose a language from the list.');
  if (!canAccessCourse(u.id, isStaff(u.role), courseId)) fail(403, 'You do not have access to this course.');
  const block = findMediaBlock(courseId, lessonId, blockId);

  const orig = await original(block, u.id);
  if (!orig) fail(404, 'This video has no captions, so there is no transcript to show.');
  const { id, entry } = orig!;
  const base = { sourceLang: entry.lang, requested: lang!.code };
  if (sameLang(lang!.code, entry.lang)) return { ...base, lang: entry.lang, text: entry.text, source: entry.source, translated: false, cached: true };

  const key = `${id}:${lang!.code}:${hashText(entry.text)}`;
  const hit = cache()[key];
  if (fresh(hit)) return { ...base, lang: lang!.code, text: hit!.text, source: hit!.source, translated: true, cached: true };

  let job = inFlight.get(key);
  if (!job) {
    if (!allowNewWork(u.id)) fail(429, 'Many transcripts were opened in a short time. Please try again in a few minutes.');
    job = (async (): Promise<VideoCaptionCache | null> => {
      // 1–2) YouTube's own captions in that language (a published track, or YouTube's caption translation).
      if (entry.source === 'youtube') {
        const full = await originalCaptions(block);
        if (full?.yt) {
          const y = await youtubeInLanguage(full, lang!.code);
          if (y) return { text: cuesToText(y.cues), lang: lang!.code, source: y.translated ? 'youtube-translated' : 'youtube', at: nowIso() };
        }
      }
      // 3) Server-side translation of the captions, line by line, keeping the times.
      if (!canMachineTranslate()) return null;
      const tr = await machineTranslate(parseTranscript(entry.text), lang!, entry.lang);
      return tr?.length ? { text: cuesToText(tr), lang: lang!.code, source: 'machine', at: nowIso() } : null;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  const r = await job;
  if (!r) return { ...base, lang: entry.lang, text: entry.text, source: entry.source, translated: false, unavailable: true, cached: false };
  remember(key, r);
  return { ...base, lang: lang!.code, text: r.text, source: r.source, translated: true, cached: false };
});

transcriptRouter.post('/video', videoTranscript);
/** Older app builds call this name. */
transcriptRouter.post('/translate', videoTranscript);
