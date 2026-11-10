/**
 * The data a brand new LMS starts with: ONE admin account (the owner) and the eight USAII courses,
 * published at the launch price (SEED_COURSE_PRICE, default 49; "none" keeps them as drafts).
 * There are no demo learners and no passwords written in the code.
 *
 *   SEED_ADMIN_EMAIL     the owner's real email (password-reset links go here)
 *   SEED_ADMIN_NAME      the name learners see on reviews (default "USAII Admin")
 *   SEED_ADMIN_PASSWORD  12+ characters with upper and lower case, a number and a symbol
 *
 * Without SEED_ADMIN_PASSWORD a strong random password is generated, shown ONCE in the server
 * log (and, with file storage, saved to DATA_DIR/initial-credentials.txt). The owner must choose a
 * new password on first sign-in. These settings are used only when the database is first created.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Course, Database, UserRecord } from '../shared/types';
import { hashPassword, initials, tempPassword, validatePassword } from './auth';
import { DATA_DIR, DB_VERSION, storageMode } from './db';
import { buildUsaiiCourses } from './content/usaiiCourses';
import { applyUsaiiDefaults, launchPrice, publishAtLaunch } from './content/listings';

export const OWNER_ID = 'u_instructor';

export function seedDatabase(): Database {
  const now = new Date().toISOString();
  const email = (process.env.SEED_ADMIN_EMAIL ?? process.env.SEED_INSTRUCTOR_EMAIL ?? 'admin@usaii.org').trim().toLowerCase();
  const name = (process.env.SEED_ADMIN_NAME ?? process.env.SEED_INSTRUCTOR_NAME ?? 'USAII Admin').trim() || 'USAII Admin';
  const fromEnv = process.env.SEED_ADMIN_PASSWORD ?? process.env.SEED_INSTRUCTOR_PASSWORD;
  if (fromEnv) {
    const err = validatePassword(fromEnv);
    if (err) throw new Error(`SEED_ADMIN_PASSWORD is too weak: ${err}`);
  }
  const password = fromEnv || tempPassword();
  if (!fromEnv) announce(email, password);

  const owner: UserRecord = {
    id: OWNER_ID,
    name,
    email,
    role: 'instructor',
    initials: initials(name),
    active: true,
    createdAt: now,
    onboarded: true,
    // A generated password is only for the first sign-in.
    mustChangePassword: !fromEnv,
    ...hashPassword(password),
  };

  // The USAII courses are published at the launch price (SEED_COURSE_PRICE, default 49), so the
  // website lists them from the first start. SEED_COURSE_PRICE=none keeps them as unpriced drafts.
  const courses: Course[] = buildUsaiiCourses(OWNER_ID, now);
  const price = launchPrice();
  if (price !== null) for (const c of courses) publishAtLaunch(c, price);
  // Website card text, the certificate line and the struck selling price (SEED_LIST_PRICE, default 147).
  for (const c of courses) applyUsaiiDefaults(c);

  return {
    version: DB_VERSION,
    users: [owner],
    courses,
    enrollments: [],
    events: [],
    notifications: [],
    feedback: [],
    audit: [],
    transcriptTranslations: {},
    videoCaptions: {},
    payments: [],
    uploads: [],
    enquiries: [],
  };
}

function announce(email: string, password: string) {
  if (storageMode === 'file') {
    try {
      fs.writeFileSync(
        path.join(DATA_DIR, 'initial-credentials.txt'),
        `USAII LMS owner account (generated on first start). Sign in, choose a new password, then delete this file.\n\n  ${email}\n  ${password}\n`,
        { mode: 0o600 },
      );
    } catch {
      /* read-only disk: the log below is enough */
    }
  }
  console.log('');
  console.log('  ======================================================================');
  console.log('   FIRST START: the owner (admin) account was created.');
  console.log(`     Email:    ${email}`);
  console.log(`     Password: ${password}`);
  console.log('   This is shown only once. Sign in and choose your own password.');
  console.log('   (Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to choose them yourself.)');
  console.log('  ======================================================================');
  console.log('');
}
