/**
 * Pass / Needs Work rubrics from the USAII grading sheets.
 *
 * Courses 2 to 5 (Prompting and Context Design, Agentic AI Foundations, RAG and Enterprise Knowledge
 * Assistants, AI for Data Analysis) use the same five dimensions, written from each course's own Day 10
 * requirements and evidence package. Check them against the official USAII grading sheets before you
 * publish those courses (Course Builder → Day 10 → Activity → Pass / Needs Work rubric).
 *
 * Course 1 (AI Fluency for the Workplace): the Personal AI Productivity Playbook is reviewed on
 * five dimensions at Day 10. Courses 6, 7 and 8 work the same way with their own sheets: the AI Project
 * Management Toolkit, the AI HR Use-Case Playbook and the AI Campaign Builder Template. All five must pass to earn the certificate; work that needs work is
 * returned once with feedback, and the revision is capped at one round.
 *
 * `evidence` names the daily activities that hold each dimension's evidence. The LMS checks those
 * pages automatically and shows them beside the evidence package, so the reviewer reads the whole
 * playbook in one place. To add the rubric of another course, add an entry here (or build it in
 * Course Builder → Lesson → Activity → "Pass / Needs Work rubric").
 */
import type { Course, PassRubric } from '../../shared/types';

interface CapstoneRubric {
  lessonId: string;
  rubric: PassRubric;
  /** Hints added to the capstone's own fields (only where the field has none). */
  fieldHints?: Record<string, string>;
}

export const CAPSTONE_RUBRICS: Record<string, CapstoneRubric> = {
  c_prompt_context: {
    lessonId: 'pc-d10',
    rubric: {
      revisionLimit: 1,
      dimensions: [
        {
          id: 'completeness',
          label: 'Completeness',
          pass: "The canvas fills all five regions for one use case: SCOPE (task, role, success, constraints, format), SUPPLY (sources inventoried and mapped), SHAPE (guardrails with fallbacks, policies, format), STATE (tools, memory, flow, and the human step), and SUSTAIN (a review rubric with a named reviewer, a re-verification cadence, and a fail path).",
          evidence: ['pc-d1', 'pc-d2', 'pc-d5', 'pc-d6', 'pc-d7', 'pc-d8', 'pc-d9'],
        },
        {
          id: 'correctness',
          label: 'Correctness',
          pass: "The regions connect and the design works as written: every supplied source has a job in the task, every guardrail protects a source or a promise, and the before-and-after test shows the full canvas doing better than a thin prompt against the learner’s own criteria. Grade this from the evidence of testing and the checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['pc-d3', 'pc-d4', 'pc-d6', 'pc-d10'],
        },
        {
          id: 'robustness',
          label: 'Robustness',
          pass: "The canvas names the cases that must go to a human and gives every guardrail a fallback, and the SUSTAIN rubric actually checks grounding in current sources and every guardrail. Confirm the guardrails-and-review checklist is present and applied, not just named. Grade this from the evidence of testing and the checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['pc-d7', 'pc-d8', 'pc-d9', 'pc-d10'],
        },
        {
          id: 'applicability',
          label: 'Applicability',
          pass: "The artifact is built on a specific, real task from the learner’s own work or a close proxy. It carries enough detail that a reviewer can see it was grounded in a genuine task rather than filled in from a template.",
          evidence: ['pc-d1', 'pc-d4'],
        },
        {
          id: 'deployability',
          label: 'Deployability',
          pass: "The learner has named where, when, and how they will use the artifact, including any approvals or people involved.",
          evidence: ['pc-d9', 'pc-d10'],
        },
      ],
    },
    fieldHints: {
      'pc-d10-f1': 'Your Day 1 to 9 pages reach your reviewer automatically. Add your final version here, or attach your canvas file.',
    },
  },
  c_agentic_ai: {
    lessonId: 'ag-d10',
    rubric: {
      revisionLimit: 1,
      dimensions: [
        {
          id: 'completeness',
          label: 'Completeness',
          pass: "The submission includes the Agent Design Canvas with all five stages (SELECT, TOOL, ESCALATE, ENGINEER, ROAD-TEST), evidence of a working agent with at least one full run, the road-test log, and the agent risk checklist.",
          evidence: ['ag-d1', 'ag-d3', 'ag-d4', 'ag-d5', 'ag-d8', 'ag-d9'],
        },
        {
          id: 'correctness',
          label: 'Correctness',
          pass: "The working agent matches its canvas: the trigger fires once per event, every step traces to a tool at the lowest permission that works, and the road-test log shows normal, edge, failure and stop-rule cases with expected results written before the run. Grade this from the evidence of testing and the checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['ag-d5', 'ag-d6', 'ag-d7', 'ag-d9', 'ag-d10'],
        },
        {
          id: 'robustness',
          label: 'Robustness',
          pass: "Every outward action waits for a human approval, stop rules are checked first, handoffs name who receives the case, and blocked actions were tested. Confirm the agent risk checklist is present and its controls were tested, not just named. Grade this from the evidence of testing and the checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['ag-d4', 'ag-d6', 'ag-d7', 'ag-d8', 'ag-d10'],
        },
        {
          id: 'applicability',
          label: 'Applicability',
          pass: "The artifact is built on a specific, real task from the learner’s own work or a close proxy. It carries enough detail that a reviewer can see it was grounded in a genuine task rather than filled in from a template.",
          evidence: ['ag-d1', 'ag-d2'],
        },
        {
          id: 'deployability',
          label: 'Deployability',
          pass: "The learner has named where, when, and how they will use the artifact, including any approvals or people involved.",
          evidence: ['ag-d9', 'ag-d10'],
        },
      ],
    },
    fieldHints: {
      'ag-d10-f1': 'Your Day 1 to 9 pages reach your reviewer automatically. Add your final version here, or attach your canvas file.',
    },
  },
  c_rag_assistants: {
    lessonId: 'rg-d10',
    rubric: {
      revisionLimit: 1,
      dimensions: [
        {
          id: 'completeness',
          label: 'Completeness',
          pass: "The submission includes the RAG Readiness Checklist, evidence of a working assistant (the document list, the instructions, a cited answer and a decline), the question test log, the answer evaluation checklist, and the hallucination-reduction step.",
          evidence: ['rg-d1', 'rg-d3', 'rg-d4', 'rg-d5', 'rg-d7', 'rg-d8', 'rg-d9'],
        },
        {
          id: 'correctness',
          label: 'Correctness',
          pass: "The assistant answers only from current, owned documents with correct citations, and the test log covers answerable, tricky and unanswerable questions, with expected answers written in advance and results recorded honestly. Grade this from the evidence of testing and the checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['rg-d3', 'rg-d6', 'rg-d7', 'rg-d9', 'rg-d10'],
        },
        {
          id: 'robustness',
          label: 'Robustness',
          pass: "The assistant declines and routes what its documents do not cover, every number in an answer appears in the cited section, and nothing inside a document or a question can change its rules. Confirm the hallucination-reduction step was tested before and after, not just named. Grade this from the evidence of testing and the checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['rg-d6', 'rg-d8', 'rg-d9', 'rg-d10'],
        },
        {
          id: 'applicability',
          label: 'Applicability',
          pass: "The artifact is built on a specific, real task from the learner’s own work or a close proxy. It carries enough detail that a reviewer can see it was grounded in a genuine task rather than filled in from a template.",
          evidence: ['rg-d1', 'rg-d3'],
        },
        {
          id: 'deployability',
          label: 'Deployability',
          pass: "The learner has named where, when, and how they will use the artifact, including any approvals or people involved.",
          evidence: ['rg-d9', 'rg-d10'],
        },
      ],
    },
    fieldHints: {
      'rg-d10-f1': 'Your Day 1 to 9 pages reach your reviewer automatically. Add your final version here, or attach your checklist file.',
    },
  },
  c_data_analysis: {
    lessonId: 'da-d10',
    rubric: {
      revisionLimit: 1,
      dimensions: [
        {
          id: 'completeness',
          label: 'Completeness',
          pass: "The worksheet covers a data question set, a cleanup plan, at least one insight summary, a trend or anomaly analysis, and the data-validation checklist.",
          evidence: ['da-d2', 'da-d4', 'da-d5', 'da-d6', 'da-d7'],
        },
        {
          id: 'correctness',
          label: 'Correctness',
          pass: "The figures are right and traceable: formulas are explained correctly and checked by hand, the cleanup keeps the totals, and every number in the summaries traces to the source data. Grade this from the evidence of testing and the checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['da-d3', 'da-d4', 'da-d5', 'da-d6', 'da-d8', 'da-d10'],
        },
        {
          id: 'robustness',
          label: 'Robustness',
          pass: "The learner applies the data-validation checklist: every number the AI stated is traced or flagged, the parts add to the totals, and any figure the AI invented is removed before use. Confirm the checklist was applied to real output, not just named. Grade this from the evidence of testing and the checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['da-d7', 'da-d8', 'da-d10'],
        },
        {
          id: 'applicability',
          label: 'Applicability',
          pass: "The artifact is built on a specific, real task from the learner’s own work or a close proxy. It carries enough detail that a reviewer can see it was grounded in a genuine task rather than filled in from a template.",
          evidence: ['da-d1', 'da-d2'],
        },
        {
          id: 'deployability',
          label: 'Deployability',
          pass: "The learner has named where, when, and how they will use the artifact, including any approvals or people involved.",
          evidence: ['da-d9', 'da-d10'],
        },
      ],
    },
    fieldHints: {
      'da-d10-f1': 'Your Day 1 to 9 pages reach your reviewer automatically. Add your final version here, or attach your worksheet file.',
    },
  },
  c_ai_fluency: {
    lessonId: 'af-d10',
    rubric: {
      revisionLimit: 1,
      dimensions: [
        {
          id: 'completeness',
          label: 'Completeness',
          pass: 'The playbook covers the learner’s core use cases, at least one writing workflow and one planning workflow, a quality-review checklist, a safe-use checklist, and a personal adoption plan.',
          evidence: ['af-d2', 'af-d4', 'af-d5', 'af-d6', 'af-d7', 'af-d9'],
        },
        {
          id: 'correctness',
          label: 'Correctness',
          pass: 'The workflows are usable as written. A colleague could follow them and reach the same result. The capability checklist correctly separates tasks AI handles well from tasks it does not.',
          evidence: ['af-d1', 'af-d3', 'af-d4', 'af-d5', 'af-d8'],
        },
        {
          id: 'robustness',
          label: 'Robustness',
          pass: 'The playbook includes the safe-use checklist covering privacy, accuracy, and human judgment. The learner shows they review outputs before relying on them. Confirm the safe-use checklist is present and applied, not just named.',
          evidence: ['af-d6', 'af-d7', 'af-d8', 'af-d10'],
        },
        {
          id: 'applicability',
          label: 'Applicability',
          pass: 'The artifact is built on a specific, real task from the learner’s own work or a close proxy. It carries enough detail that a reviewer can see it was grounded in a genuine task rather than filled in from a template.',
          evidence: ['af-d1', 'af-d2'],
        },
        {
          id: 'deployability',
          label: 'Deployability',
          pass: 'The learner has named where, when, and how they will use the artifact, including any approvals or people involved.',
          evidence: ['af-d9'],
        },
      ],
    },
    fieldHints: {
      'af-d10-f1': 'Your Day 1 to 9 pages reach your reviewer automatically. Add your cover page and any final edits here, or attach your playbook file.',
    },
  },
  c_project_delivery: {
    lessonId: 'pd-d10',
    rubric: {
      revisionLimit: 1,
      dimensions: [
        {
          id: 'completeness',
          label: 'Completeness',
          pass: "The toolkit includes a project charter, a work breakdown, a risk and dependency log, a stakeholder update template, and a meeting-summary workflow.",
          evidence: ['pd-d2', 'pd-d3', 'pd-d4', 'pd-d5', 'pd-d6'],
        },
        {
          id: 'correctness',
          label: 'Correctness',
          pass: "Each component is usable on a real project. The work breakdown is logically sequenced and the risk log identifies genuine risks with plausible responses. Grade this from the evidence of testing and the risk or quality checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['pd-d2', 'pd-d3', 'pd-d4', 'pd-d5', 'pd-d6', 'pd-d7', 'pd-d8', 'pd-d10'],
        },
        {
          id: 'robustness',
          label: 'Robustness',
          pass: "The toolkit includes a review step for AI-generated project content. The learner shows where a human must check AI output before it reaches stakeholders. Confirm the AI output review checklist is present and applied to stakeholder-facing content, not just named. Grade this from the evidence of testing and the risk or quality checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['pd-d5', 'pd-d6', 'pd-d8', 'pd-d9', 'pd-d10'],
        },
        {
          id: 'applicability',
          label: 'Applicability',
          pass: "The artifact is built on a specific, real task from the learner’s own work or a close proxy. It carries enough detail that a reviewer can see it was grounded in a genuine task rather than filled in from a template.",
          evidence: ['pd-d1', 'pd-d2'],
        },
        {
          id: 'deployability',
          label: 'Deployability',
          pass: "The learner has named where, when, and how they will use the artifact, including any approvals or people involved.",
          evidence: ['pd-d8', 'pd-d9', 'pd-d10'],
        },
      ],
    },
    fieldHints: {
      'pd-d10-f1': 'Your Day 1 to 9 pages reach your reviewer automatically. Add your cover page and any final edits here, or attach your toolkit file.',
    },
  },
  c_hr_workforce: {
    lessonId: 'hr-d10',
    rubric: {
      revisionLimit: 1,
      dimensions: [
        {
          id: 'completeness',
          label: 'Completeness',
          pass: "The playbook covers the learner’s priority HR workflows, at minimum a job description, an interview guide, an onboarding workflow, and a workforce-planning use case, plus an HR risk checklist.",
          evidence: ['hr-d1', 'hr-d2', 'hr-d3', 'hr-d4', 'hr-d6', 'hr-d7'],
        },
        {
          id: 'correctness',
          label: 'Correctness',
          pass: "The outputs are job-ready and compliant in tone and content. The job description and interview guide could be used with minimal editing. Grade this from the evidence of testing and the risk or quality checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['hr-d2', 'hr-d3', 'hr-d4', 'hr-d6', 'hr-d10'],
        },
        {
          id: 'robustness',
          label: 'Robustness',
          pass: "The playbook applies the bias, privacy, and fairness checklist to every candidate-facing workflow. The learner shows where human review is mandatory. This dimension is the hard gate for this course. Confirm the HR risk checklist was applied to every candidate-facing and employee-facing workflow, that mandatory human review points are marked, and that no candidate or employee personal data appears anywhere in the submission. Grade this from the evidence of testing and the risk or quality checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['hr-d5', 'hr-d7', 'hr-d8', 'hr-d9', 'hr-d10'],
        },
        {
          id: 'applicability',
          label: 'Applicability',
          pass: "The artifact is built on a specific, real task from the learner’s own work or a close proxy. It carries enough detail that a reviewer can see it was grounded in a genuine task rather than filled in from a template.",
          evidence: ['hr-d1', 'hr-d2'],
        },
        {
          id: 'deployability',
          label: 'Deployability',
          pass: "The learner has named where, when, and how they will use the artifact, including any approvals or people involved.",
          evidence: ['hr-d8', 'hr-d9', 'hr-d10'],
        },
      ],
    },
    fieldHints: {
      'hr-d10-f1': 'Your Day 1 to 9 pages reach your reviewer automatically. Add your cover page and any final edits here, or attach your playbook file.',
    },
  },
  c_marketing_content: {
    lessonId: 'mk-d10',
    rubric: {
      revisionLimit: 1,
      dimensions: [
        {
          id: 'completeness',
          label: 'Completeness',
          pass: "The template includes an audience persona, campaign messaging, a multi-channel content set, a repurposing map, and a brand-voice checklist.",
          evidence: ['mk-d2', 'mk-d3', 'mk-d4', 'mk-d6', 'mk-d7'],
        },
        {
          id: 'correctness',
          label: 'Correctness',
          pass: "The content is on-brief and on-brand. It matches the stated audience and campaign goal and would not need to be rewritten from scratch. Grade this from the evidence of testing and the risk or quality checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['mk-d2', 'mk-d3', 'mk-d4', 'mk-d5', 'mk-d6', 'mk-d10'],
        },
        {
          id: 'robustness',
          label: 'Robustness',
          pass: "The learner applies the brand-voice and quality-control checklist to catch off-brand or inaccurate AI output before it ships. Confirm the brand-voice and quality-control checklist was applied to the content set, and that claims, figures, and testimonials were verified rather than accepted from AI. Grade this from the evidence of testing and the risk or quality checklist in the evidence package, not from the artifact’s appearance alone.",
          evidence: ['mk-d5', 'mk-d6', 'mk-d7', 'mk-d10'],
        },
        {
          id: 'applicability',
          label: 'Applicability',
          pass: "The artifact is built on a specific, real task from the learner’s own work or a close proxy. It carries enough detail that a reviewer can see it was grounded in a genuine task rather than filled in from a template.",
          evidence: ['mk-d1', 'mk-d2'],
        },
        {
          id: 'deployability',
          label: 'Deployability',
          pass: "The learner has named where, when, and how they will use the artifact, including any approvals or people involved.",
          evidence: ['mk-d9', 'mk-d10'],
        },
      ],
    },
    fieldHints: {
      'mk-d10-f1': 'Your Day 1 to 9 pages reach your reviewer automatically. Add your cover page and any final edits here, or attach your template file.',
    },
  },
};

/**
 * Attaches a course's capstone rubric when its capstone activity has none yet. An activity an
 * admin already gave a rubric (PDF, Pass / Needs Work, or criteria) is left exactly as it is.
 * Returns true if anything changed.
 */
export function applyCapstoneRubric(course: Course): boolean {
  const spec = CAPSTONE_RUBRICS[course.id];
  if (!spec) return false;
  const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === spec.lessonId);
  const act = lesson?.activity;
  if (!act || act.rubricPdf?.url || act.passRubric?.dimensions?.length || act.rubric?.length) return false;
  const lessonIds = new Set(course.modules.flatMap((m) => m.lessons.map((l) => l.id)));
  act.passRubric = {
    ...spec.rubric,
    dimensions: spec.rubric.dimensions.map((d) => ({ ...d, evidence: (d.evidence ?? []).filter((id) => lessonIds.has(id)) })),
  };
  act.requiredForCertificate = true;
  for (const f of act.fields) if (!f.hint && spec.fieldHints?.[f.id]) f.hint = spec.fieldHints[f.id];
  return true;
}
