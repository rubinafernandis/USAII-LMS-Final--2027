/**
 * Upgrades saved data to the current format without losing learners' work. A copy of the old data is
 * always kept first (see server/db.ts).
 *
 *  8 → 9   (5.7)   Video transcripts come from the video's own captions; payment records are created.
 *  9 → 10  (5.9)   Course 1's capstone gets its Pass / Needs Work rubric.
 * 10 → 11  (5.10)  Courses 6, 7 and 8 are added as drafts.
 * 12 → 13  (5.11.1) Certificates are named after their course.
 * 16 → 17  (5.14)  Selling price (struck out on the website), certificate line and the revised website card
 *                  text for the USAII courses. Only empty fields or untouched old defaults change.
 * 13 → 14  (5.12)  Public website: the USAII courses get their website listing (only where none is set)
 *                  and website enquiries are kept. Titles, prices and publish status are never changed.
 * 11 → 12  (5.11)  Self-paced platform:
 *    - Questions, direct messages and admin guidance are removed (there is no learner-admin messaging).
 *    - The imported USAII content is repaired (see server/content/cleanup.ts) and Courses 2 to 5 get
 *      their capstone rubric. Nothing an admin wrote is overwritten.
 *    - A lesson is complete when Learn, Check, Apply and Reflect are done; lessons that already meet
 *      that are marked complete.
 *    - Notifications are kept per person (newest 100 each).
 *    - The demo accounts of earlier versions are removed when they still use the passwords that were
 *      published in the source code; a starter admin still on one gets a new random password.
 */
import type { Database } from '../shared/types';
import { lessonRequirements } from '../shared/analytics';
import { hashPassword, tempPassword, verifyPassword } from './auth';
import { buildUsaiiCourses, clearLessonTextTranscripts, USAII_COURSE_IDS } from './content/usaiiCourses';
import { applyCapstoneRubric } from './content/rubrics';
import { cleanUpCourseContent } from './content/cleanup';
import { applyUsaiiDefaults, applyWebsiteListing } from './content/listings';

/** The USAII courses first shipped in LMS 5.10. */
const ADDED_IN_V11 = new Set(['c_project_delivery', 'c_hr_workforce', 'c_marketing_content']);

/** Passwords that earlier versions published in their source code for local test accounts. */
const PUBLISHED: Record<string, string[]> = {
  u_instructor: ['VJ%NTj+R%zgvTp3wmc', 'Admin@2026'],
  u_alex: ['7rcV%5qXmNTFttj_Dw', 'Learner@2026'],
  u_jordan: ['Vv_rG%?6Jyj78bt+Kx', 'Learner@2026'],
  u_morgan: ['&8gr-?MB?eA!7t2ztK', 'Learner@2026'],
};

export function migrateDatabase(d: Database): boolean {
  if (d.version < 8 || d.version > 16) return false;
  const now = new Date().toISOString();
  if (d.version === 8) {
    let cleared = 0;
    for (const c of d.courses) if (USAII_COURSE_IDS.has(c.id)) cleared += clearLessonTextTranscripts(c);
    d.transcriptTranslations = {};
    d.videoCaptions ??= {};
    d.payments ??= [];
    d.version = 9;
    console.log(`[migrate] 8 → 9: ${cleared} transcript(s) copied from lesson text removed; payments enabled.`);
  }
  if (d.version === 9) {
    for (const c of d.courses) if (USAII_COURSE_IDS.has(c.id)) applyCapstoneRubric(c);
    d.version = 10;
  }
  if (d.version === 10) {
    const instructor = d.users.find((u) => u.role === 'instructor')?.id ?? 'u_instructor';
    const added = buildUsaiiCourses(instructor, now).filter((c) => ADDED_IN_V11.has(c.id) && !d.courses.some((x) => x.id === c.id));
    d.courses.push(...added);
    d.version = 11;
  }
  if (d.version <= 11) {
    migrateTo12(d);
    d.version = 12;
  }
  // 12 → 13 (5.11.1): every certificate is named after its course. Issued ones keep the course name
  // they were issued under.
  if (d.version === 12) {
    for (const c of d.courses) c.credentialName = c.title;
    for (const e of d.enrollments) {
      const c = d.courses.find((x) => x.id === e.courseId);
      if (e.certificateIssuedAt && !e.certificateCourseTitle && c) e.certificateCourseTitle = c.title;
    }
    d.version = 13;
  }
  // 13 → 14 (5.12): the public website. Listings are added only where a course has none.
  if (d.version === 13) {
    d.enquiries ??= [];
    let listed = 0;
    for (const c of d.courses) if (USAII_COURSE_IDS.has(c.id) && applyWebsiteListing(c)) listed += 1;
    d.version = 14;
    console.log(`[migrate] 13 → 14: website listing added to ${listed} course(s); website enquiries enabled.`);
  }
  // 14 → 15 (5.13.2): course 6 is named "AI for Project Management", and the eight USAII courses move
  // from the launch price of 49 to 74. Only an untouched old name or a price still at 49 changes,
  // so anything an admin chose stays as it is.
  if (d.version === 14) {
    let renamed = 0;
    let repriced = 0;
    for (const c of d.courses) {
      if (!USAII_COURSE_IDS.has(c.id)) continue;
      if (c.title === 'AI Assisted Project Delivery') {
        c.title = 'AI for Project Management';
        if (c.credentialName) c.credentialName = c.credentialName.replace('AI Assisted Project Delivery', 'AI for Project Management');
        renamed += 1;
      }
      if (c.priceSet && c.price === 49) {
        c.price = 74;
        repriced += 1;
      }
    }
    d.version = 15;
    console.log(`[migrate] 14 → 15: ${renamed} course(s) renamed, ${repriced} course price(s) set to 74.`);
  }
  // 15 → 16 (5.13.3): course 6's website page follows its new name (ai-for-project-management.html).
  if (d.version === 15) {
    let moved = 0;
    for (const c of d.courses) {
      if (c.id === 'c_project_delivery' && c.listing?.slug === 'ai-assisted-project-delivery') {
        c.listing.slug = 'ai-for-project-management';
        moved += 1;
      }
    }
    d.version = 16;
    console.log(`[migrate] 15 → 16: ${moved} course page address(es) updated.`);
  }
  // 16 → 17 (5.14): selling price, certificate line and the revised website card text. Prices an admin
  // set, listing text an admin changed and every issued certificate stay exactly as they are.
  if (d.version === 16) {
    let updated = 0;
    for (const c of d.courses) if (USAII_COURSE_IDS.has(c.id) && applyUsaiiDefaults(c)) updated += 1;
    d.version = 17;
    console.log(`[migrate] 16 → 17: ${updated} course(s) given a selling price, certificate line or card text.`);
  }
  return true;
}

function migrateTo12(d: Database) {
  const raw = d as unknown as Record<string, unknown>;
  // 1. No messaging between learners and admins.
  delete raw.threads;
  delete raw.messages;
  for (const e of d.enrollments) delete (e as unknown as Record<string, unknown>).guidance;
  d.events = d.events.filter((e) => (e.type as string) !== 'post' && (e.type as string) !== 'reply');
  const perUser = new Map<string, number>();
  d.notifications = d.notifications.filter((n) => {
    const kind = n.kind as string;
    const view = n.link?.view ?? '';
    if (kind === 'reply' || kind === 'message' || ['ask', 'messages', 'inbox'].includes(view)) return false;
    const c = (perUser.get(n.userId) ?? 0) + 1;
    perUser.set(n.userId, c);
    return c <= 100;
  });

  // 2. Content repairs and capstone rubrics for the USAII courses.
  let repaired = 0;
  for (const c of d.courses)
    if (USAII_COURSE_IDS.has(c.id)) {
      const n = cleanUpCourseContent(c) + (applyCapstoneRubric(c) ? 1 : 0);
      if (n) {
        repaired += 1;
        c.updatedAt = new Date().toISOString();
      }
    }

  // 3. Lessons whose four steps are all done are complete.
  let completed = 0;
  for (const e of d.enrollments) {
    const course = d.courses.find((c) => c.id === e.courseId);
    if (!course) continue;
    for (const m of course.modules)
      for (const l of m.lessons) {
        const p = e.lessons[l.id];
        if (p && p.status !== 'done' && lessonRequirements(l, p).complete) {
          p.status = 'done';
          p.completedAt = new Date().toISOString();
          completed += 1;
        }
      }
  }

  // 4. Demo accounts with passwords that were published in earlier source code.
  const removed: string[] = [];
  for (const [id, passwords] of Object.entries(PUBLISHED)) {
    const u = d.users.find((x) => x.id === id);
    if (!u || !passwords.some((pw) => verifyPassword(pw, u))) continue;
    if (u.role === 'learner') {
      d.users = d.users.filter((x) => x.id !== id);
      d.enrollments = d.enrollments.filter((e) => e.userId !== id);
      d.notifications = d.notifications.filter((n) => n.userId !== id);
      removed.push(u.email);
    } else {
      const pw = tempPassword();
      Object.assign(u, hashPassword(pw), { passwordChangedAt: new Date().toISOString(), mustChangePassword: true });
      console.log(`[migrate] The admin account ${u.email} still used a password published in old source code. New one-time password: ${pw}`);
    }
  }
  console.log(`[migrate] 11 → 12: messaging removed; ${repaired} course(s) repaired; ${completed} lesson(s) marked complete${removed.length ? `; demo accounts removed: ${removed.join(', ')}` : ''}.`);
}
