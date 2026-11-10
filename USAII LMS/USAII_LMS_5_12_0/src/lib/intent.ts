/**
 * The course a visitor chose on the public website.
 *
 * "Apply Now" and "Enroll Now" on the website open the LMS at
 *   #/signup?course=<courseId>   (new learners: create an account)
 *   #/login?course=<courseId>    (returning learners: sign in)
 * The course is remembered for this browser tab, so it survives creating the account and the short
 * onboarding. The learner then lands on Explore Courses with that course ready to enroll.
 */
const KEY = 'usaii.lms.intentCourse';

function fromHash(): string {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [view, query = ''] = h.split('?');
  if (!['signup', 'login', 'explore'].includes(view.split('/')[0] ?? '')) return '';
  return (new URLSearchParams(query).get('course') ?? '').trim().slice(0, 80);
}

/** Read once at start-up: keeps the course from the address, if there is one. */
export function captureCourseIntent() {
  const id = fromHash();
  if (!id) return;
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* private mode: the course still travels in the address */
  }
}

export function courseIntent(): string {
  try {
    return sessionStorage.getItem(KEY) || fromHash();
  } catch {
    return fromHash();
  }
}

/** Remember a course for this tab (for example, picked on the sign-up form before choosing "Sign in"). */
export function setCourseIntent(courseId: string) {
  try {
    if (courseId) sessionStorage.setItem(KEY, courseId);
  } catch {
    /* private mode */
  }
}

export function clearCourseIntent() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Where a learner goes after signing in or finishing onboarding: the course chosen on the website, or
 * the paid course they chose at sign up and have not paid for yet (to finish paying); otherwise home.
 */
export function learnerHome(user?: { pendingCourseId?: string } | null): string {
  const id = courseIntent() || user?.pendingCourseId || '';
  return id ? `#/explore?course=${encodeURIComponent(id)}` : '#/dashboard';
}

/** The course the learner portal shows first (read by LearnerApp when it opens). */
export const ACTIVE_COURSE_KEY = 'usaii.lms.activeCourse';

export function rememberActiveCourse(courseId: string) {
  try {
    localStorage.setItem(ACTIVE_COURSE_KEY, courseId);
  } catch {
    /* storage unavailable: the portal picks a course itself */
  }
}

/** The sign-in page mode the address asks for. */
export function authModeFromHash(): 'signin' | 'signup' | null {
  const view = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  if (view === 'signup') return 'signup';
  if (view === 'login') return 'signin';
  return null;
}
