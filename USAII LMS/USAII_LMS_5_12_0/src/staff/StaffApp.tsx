import { Activity, BookMarked, CreditCard, Gauge, Inbox, MessageSquareHeart, ClipboardCheck, Users, UsersRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import Shell, { type NavItem } from '../components/Shell';
import { useRoute } from '../components/ui';
import Cohort, { LearnerPortal } from './Cohort';
import CourseBuilder from './CourseBuilder';
import Enquiries from './Enquiries';
import Courses from './Courses';
import { ActivityMetrics, Assessments } from './Insights';
import Learners from './Learners';
import Metrics from './Metrics';
import LearnerFeedback from './LearnerFeedback';
import NavVideoManager from './NavVideoManager';
import PaymentSettings from './PaymentSettings';
import RefundRequests from './RefundRequests';

export default function StaffApp() {
  const { view, params, query } = useRoute();
  const [awaiting, setAwaiting] = useState(0);

  // Badge: learners' work waiting for your review.
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ awaiting: number }>('/staff/review-count')
        .then((r) => alive && setAwaiting(r.awaiting))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [view]);

  const v = view || 'cohort';

  const nav: NavItem[] = [
    { id: 'cohort', label: 'Cohort', icon: UsersRound, also: ['learner'] },
    { id: 'learners', label: 'Learners & Access', icon: Users },
    { id: 'metrics', label: 'Comprehension & Mastery', icon: Gauge },
    { id: 'assessments', label: 'Assessments', icon: ClipboardCheck, badge: awaiting },
    { id: 'feedback', label: 'Learner Feedback', icon: MessageSquareHeart },
    { id: 'activity', label: 'Activity Metrics', icon: Activity },
  ];
  const secondary: NavItem[] = [
    { id: 'courses', label: 'My Courses', icon: BookMarked },
    { id: 'enquiries', label: 'Website Enquiries', icon: Inbox },
    { id: 'payments', label: 'Payments & Email', icon: CreditCard },
  ];

  let page: ReactNode;
  switch (v) {
    case 'learner':
      page = <LearnerPortal userId={params[0] ?? ''} courseId={query.get('course') ?? undefined} />;
      break;
    case 'learners':
      page = <Learners />;
      break;
    case 'metrics':
      page = <Metrics />;
      break;
    case 'feedback':
      page = <LearnerFeedback />;
      break;
    case 'assessments':
      page = <Assessments />;
      break;
    case 'activity':
      page = <ActivityMetrics />;
      break;
    case 'payments':
      page = (
        <>
          <RefundRequests />
          <PaymentSettings />
        </>
      );
      break;
    case 'enquiries':
      page = <Enquiries />;
      break;
    case 'courses':
      page = params[0] === 'new' ? <CourseBuilder key="new" /> : params[0] === 'edit' && params[1] ? <CourseBuilder key={params[1]} courseId={params[1]} /> : <Courses />;
      break;
    default:
      page = <Cohort initialCourseId={query.get('course') ?? undefined} />;
  }

  return (
    <Shell nav={nav} secondary={secondary} current={v} headerExtra={<NavVideoManager />}>
      {page}
    </Shell>
  );
}
