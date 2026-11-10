import { HelpCircle, LifeBuoy, Mail, PlayCircle } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Card, PageHeader, useLoad } from '../components/ui';

/**
 * Help & Support. This is a self-paced platform: learners do not message admins. The platform's
 * support team (SUPPORT_EMAIL) handles account, payment, access and attempt questions.
 */
export default function Support({ onOpenGuide }: { onOpenGuide: () => void }) {
  const { data } = useLoad(() => api<{ email: string | null }>('/support'), []);
  const email = data?.email ?? null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Help & Support" subtitle="Your courses are self-paced: everything you need is inside each lesson." />
      <div className="grid gap-4">
        <Card>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <HelpCircle className="h-5 w-5 text-npurple" /> How your course works
          </h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-ink-soft">
            <li>Each lesson has up to four steps: Learn, Check, Apply and Reflect. The lesson completes by itself when the last step is done.</li>
            <li>Activities show how they are evaluated before you submit. When your work is reviewed, the decision and the reviewer’s feedback appear on the activity, and you get a notification.</li>
            <li>Your certificate is issued automatically once every requirement on Steps to Completion is met.</li>
          </ul>
          <Button variant="secondary" className="mt-4" icon={<PlayCircle className="h-4 w-4" />} onClick={onOpenGuide}>
            Watch: How to navigate the LMS
          </Button>
        </Card>
        <Card>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <LifeBuoy className="h-5 w-5 text-nblue" /> Contact support
          </h3>
          <p className="mt-2 text-[15px] text-ink-soft">For your account, a payment, course access, or assessment attempts.</p>
          {email ? (
            <a href={`mailto:${email}`} className="mt-3 inline-flex items-center gap-2 font-semibold text-nblue hover:underline">
              <Mail className="h-4 w-4" /> {email}
            </a>
          ) : (
            <p className="mt-3 text-[15px] font-semibold">Contact USAII support.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
