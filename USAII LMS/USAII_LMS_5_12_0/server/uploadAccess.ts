/**
 * Who may open an uploaded file (anything under /uploads/).
 *
 * Every request needs a valid sign-in (the HttpOnly media cookie set by requireAuth). Then:
 *  - Admins: any file (they build courses, review learners' work, and manage the navigation video).
 *  - Learners:
 *      - files they uploaded themselves (activity attachments);
 *      - files referenced in their own enrollment (older attachments recorded before the upload registry);
 *      - media, rubrics and study plans of a course they can open (paid, free, or given by an admin);
 *      - the cover image of a published course (shown on Explore Courses before buying);
 *      - the navigation video.
 * A course's lessons stay private to the people who paid for it, even if someone shares a file link.
 */
import type { Course, UserRecord } from '../shared/types';
import { db } from './db';
import { getActiveEnrollment } from './services';

/** Every /uploads/ URL a course refers to, cached until the course is edited. */
const refsCache = new Map<string, { updatedAt: string; urls: Set<string> }>();
function courseRefs(c: Course): Set<string> {
  const hit = refsCache.get(c.id);
  if (hit && hit.updatedAt === c.updatedAt) return hit.urls;
  const urls = new Set(JSON.stringify(c).match(/\/uploads\/[A-Za-z0-9._-]+/g) ?? []);
  refsCache.set(c.id, { updatedAt: c.updatedAt, urls });
  return urls;
}

/** A video is fetched in many small range requests; remember each decision briefly. */
const decisions = new Map<string, { ok: boolean; until: number }>();

export function canViewUpload(user: UserRecord, url: string): boolean {
  if (user.role === 'instructor') return true;
  const key = `${user.id}|${url}`;
  const now = Date.now();
  const hit = decisions.get(key);
  if (hit && hit.until > now) return hit.ok;
  const ok = decide(user, url);
  decisions.set(key, { ok, until: now + 30_000 });
  if (decisions.size > 20_000) decisions.clear();
  return ok;
}

function decide(user: UserRecord, url: string): boolean {
  const d = db();
  if ((d.uploads ?? []).some((u) => u.url === url && u.userId === user.id)) return true;
  if (d.settings?.navVideo?.url === url) return true;
  for (const e of d.enrollments) if (e.userId === user.id && JSON.stringify(e.lessons).includes(url)) return true;
  for (const c of d.courses) {
    if (c.status === 'published' && c.coverImage === url) return true;
    if (courseRefs(c).has(url) && getActiveEnrollment(user.id, c.id)) return true;
  }
  return false;
}
