/**
 * How the eight USAII courses appear on the public website (landing page, Explore Courses and the
 * course pages). The text comes from the AI Micro Credentials landing page (revised November 2026).
 * Admins change it in Course Builder, Course details, "Website listing"; the website shows the change
 * straight away. Prices: Course details, "Selling price" (struck out) and "Current price".
 */
import type { Course, CourseListing } from '../../shared/types';
import { CERTIFICATE_LINES } from '../../shared/certificateText';

export const USAII_LISTINGS: Record<string, CourseListing> = {
  c_ai_fluency: {
    category: 'foundations', number: 1, slug: 'ai-fluency-for-the-workplace',
    tagline: 'Use AI at work with a method, not guesswork.',
    youBuild: 'A Personal AI Productivity Playbook',
    summary: 'Build a Personal AI Productivity Playbook and decide what belongs with AI, write effective prompts, and check every output.',
    takeaway: 'AI Fluency Framework',
    suited: 'Professionals who are new to AI or self taught.',
  },
  c_prompt_context: {
    category: 'foundations', number: 2, slug: 'prompting-and-context-design',
    tagline: 'Get reliable, on policy answers to the tasks that matter most.',
    youBuild: 'An AI Context Design Canvas, proven with a before and after test',
    summary: 'Build an AI Context Design Canvas, test it with a before and after comparison, and turn effective prompts into reusable patterns with the right sources, guardrails, and human review.',
    takeaway: 'Context Design Canvas',
    suited: 'Team leads, analysts, and knowledge workers who already use AI.',
  },
  c_agentic_ai: {
    category: 'build', number: 3, slug: 'agentic-ai-foundations',
    tagline: 'Build a working AI agent. No code. You stay in control.',
    youBuild: 'A working no code AI agent, road tested on a real task',
    needs: 'A no code automation or agent building tool; a free trial with test data is sufficient.',
    summary: 'Build and test a no code AI agent for a bounded task, with appropriate permissions, approval gates, and stop rules.',
    takeaway: 'Agent Design Canvas',
    suited: 'Operations and administrative staff, coordinators, and team leads with repeatable, multistep tasks.',
  },
  c_rag_assistants: {
    category: 'build', number: 4, slug: 'rag-and-enterprise-knowledge-assistants',
    tagline: 'An AI assistant that answers from your documents and shows its source.',
    youBuild: 'A working knowledge assistant that cites sources and declines what it cannot support',
    needs: 'A no code assistant builder that supports document uploads.',
    summary: 'Build a knowledge assistant that cites its sources, declines unsupported questions, and uses trusted documents to reduce unsupported answers.',
    takeaway: 'Knowledge Grounding Framework',
    suited: 'Compliance, policy, HR, support, and training teams that handle recurring questions.',
  },
  c_data_analysis: {
    category: 'domain', number: 5, slug: 'ai-for-data-analysis-excel-and-bi',
    tagline: 'Go from raw data export to a decision you can defend.',
    youBuild: 'An AI Assisted Data Analysis Worksheet',
    summary: 'Ask answerable data questions, clean and chart data with AI, validate every AI stated number, and prepare an executive summary.',
    takeaway: 'Data to Decision Framework',
    suited: 'Financial and operations analysts, sales operations teams, and managers who report in Excel or BI tools.',
  },
  c_project_delivery: {
    category: 'domain', number: 6, slug: 'ai-for-project-management',
    tagline: 'Let AI draft the project paperwork. You keep control of the facts.',
    youBuild: 'An AI Project Management Toolkit',
    summary: 'Use AI to draft project charters, work breakdowns, and risk logs; review stakeholder updates; and build project AI playbooks.',
    takeaway: 'Project Delivery Framework',
    suited: 'Project and program managers, coordinators, team leads, and engineering project staff.',
  },
  c_hr_workforce: {
    category: 'domain', number: 7, slug: 'ai-for-hr-recruiting-and-workforce-planning',
    tagline: 'Faster HR work. Every decision about people stays human.',
    youBuild: 'An AI HR Use Case Playbook',
    summary: 'Create inclusive job descriptions and interview guides, support onboarding and workforce planning, and review workflows for bias, privacy, and fairness.',
    takeaway: 'Responsible HR AI Framework',
    suited: 'HR generalists and business partners, recruiters, people operations teams, and hiring managers.',
  },
  c_marketing_content: {
    category: 'domain', number: 8, slug: 'ai-for-marketing-and-content-creation',
    tagline: 'A month of campaign content. On brand and true.',
    youBuild: 'An AI Campaign Builder Template',
    summary: 'Build personas from real customer evidence, adapt messages for social media, email, landing pages, and ads, and fact check claims before publication.',
    takeaway: 'Campaign to Channel Framework',
    suited: 'Marketing and content teams, brand and communications staff, and small business owners.',
  },
};

/** Earlier default text that is replaced on upgrade, only while an admin has not changed it. */
const OLD_DEFAULTS: Record<string, Partial<CourseListing>> = {
  c_agentic_ai: { needs: 'A no code automation or agent building tool. A free trial with test data works.' },
};

/** Gives a USAII course its website listing when it has none. Never overwrites an admin's listing. */
export function applyWebsiteListing(course: Course): boolean {
  const listing = USAII_LISTINGS[course.id];
  if (!listing || course.listing) return false;
  course.listing = { ...listing };
  return true;
}

/**
 * Fills what a USAII course is missing: its listing, the card text (description, practical takeaway, best
 * suited for), the certificate line and the selling price. Only empty fields (or untouched old defaults) change.
 */
export function applyUsaiiDefaults(course: Course): boolean {
  const def = USAII_LISTINGS[course.id];
  if (!def) return false;
  let changed = applyWebsiteListing(course);
  const l = course.listing!;
  for (const k of ['summary', 'takeaway', 'suited'] as const) {
    if (!l[k] && def[k]) {
      l[k] = def[k];
      changed = true;
    }
  }
  const old = OLD_DEFAULTS[course.id];
  if (old?.needs && l.needs === old.needs) {
    l.needs = def.needs;
    changed = true;
  }
  if (!course.certificateLine && CERTIFICATE_LINES[course.id]) {
    course.certificateLine = CERTIFICATE_LINES[course.id];
    changed = true;
  }
  const lp = launchListPrice();
  if (course.listPrice === undefined && lp !== null && (!course.priceSet || lp > course.price)) {
    course.listPrice = lp;
    changed = true;
  }
  return changed;
}

const money = (raw: string | undefined, fallback: string): number | null => {
  const v = (raw ?? fallback).trim().toLowerCase();
  if (!v || v === 'none' || v === 'off' || v === 'draft') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/**
 * The price a brand new LMS publishes the USAII courses at (SEED_COURSE_PRICE, default 74, in the
 * payment currency). Set SEED_COURSE_PRICE=none to start them as unpriced drafts instead.
 * Used only when the database is first created; after that the admin sets prices in Course details.
 */
export const launchPrice = (): number | null => money(process.env.SEED_COURSE_PRICE, '74');

/** The selling price shown struck out for the USAII courses at launch (SEED_LIST_PRICE, default 147; "none" = no struck price). */
export const launchListPrice = (): number | null => money(process.env.SEED_LIST_PRICE, '147');

/** Sets the launch price and publishes the course (new databases only). */
export function publishAtLaunch(course: Course, price: number) {
  course.price = price;
  course.priceSet = true;
  course.status = 'published';
}
