import { createContext, useContext } from 'react';
import type { PublicUser, Course, Enrollment, LearnerSnapshot } from '../../shared/types';

export interface CourseItem {
  course: Course;
  enrollment: Enrollment;
  snapshot: LearnerSnapshot;
  /** One course at a time: set when this course opens only after another one's certificate. */
  waitingFor?: { id: string; title: string } | null;
}

export interface HomeData {
  items: CourseItem[];
  feedbackDue: boolean;
}

export interface LearnerCtx {
  home: HomeData;
  reload: () => Promise<void>;
  activeId: string;
  setActiveId: (id: string) => void;
  active: CourseItem | undefined;
  /** Replace one course's snapshot/enrollment after a mutation, without a full reload. */
  patchItem: (courseId: string, patch: Partial<Pick<CourseItem, 'enrollment' | 'snapshot'>>) => void;
  /** The learner whose portal this is (differs from the session user in read-only staff view). */
  learner: PublicUser;
  /** When set, the portal is a read-only admin preview. */
  readOnly?: boolean;
}

export const LearnerContext = createContext<LearnerCtx | null>(null);

export function useLearner(): LearnerCtx {
  const c = useContext(LearnerContext);
  if (!c) throw new Error('useLearner outside provider');
  return c;
}

/** Choose the most relevant course: first one not yet finished, else the first one. */
export function pickDefaultCourse(items: CourseItem[]): string {
  return (items.find((i) => !i.waitingFor && !i.snapshot.credentialEarned && i.snapshot.completion.lessonsTotal > 0) ?? items[0])?.course.id ?? '';
}
