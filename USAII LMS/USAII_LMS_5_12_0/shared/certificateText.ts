/**
 * Certificate of Completion wording, shared by the server (issuing) and the browser (the PDF).
 *
 * The eight USAII courses each have their own approved template (public/certificates/<course id>.jpg) with
 * the course name, its description and Dr. Milton Mattox's signature already in the artwork. The LMS adds the
 * learner's name, the line below (CERT_INTRO), the date of issue and the certificate number. Any other course
 * uses public/certificates/generic.jpg, with the course name and its certificate line added as text.
 */
export const CERT_INTRO = 'Has successfully completed the 10-Day Applied AI Sprint and earned the AI Micro Credential';

/** Courses with their own template, and the course name printed in that artwork. */
export const CERTIFICATE_TEMPLATES: Record<string, string> = {
  c_ai_fluency: 'AI Fluency for the Workplace',
  c_prompt_context: 'Prompting and Context Design',
  c_agentic_ai: 'Agentic AI Foundations',
  c_rag_assistants: 'RAG and Enterprise Knowledge Assistants',
  c_data_analysis: 'AI for Data Analysis, Excel, and BI',
  c_project_delivery: 'AI for Project Management',
  c_hr_workforce: 'AI for HR, Recruiting, and Workforce Planning',
  c_marketing_content: 'AI for Marketing and Content Creation',
};

const BY = 'Designed by the United States Artificial Intelligence Institute (USAII\u00AE) to ';
/** The line under the course name (already in each course's template artwork; also the default text). */
export const CERTIFICATE_LINES: Record<string, string> = {
  c_ai_fluency: BY + 'build AI awareness and workplace productivity skills.',
  c_prompt_context: BY + 'build robust context frameworks, output optimization, and prompt error elimination.',
  c_agentic_ai: BY + 'build, road-test, and govern bounded agentic workflows with strict supervision.',
  c_rag_assistants: BY + 'deploy grounded enterprise knowledge assistants that trace answers to verified sources.',
  c_data_analysis: BY + 'automate spreadsheet analysis, structure datasets, and execute validation workflows.',
  c_project_delivery: BY + 'streamline project planning, work breakdown structures, and risk-managed deliveries.',
  c_hr_workforce: BY + 'implement bias-free AI across the employee lifecycle, recruitment, and onboarding.',
  c_marketing_content: BY + 'conduct audience research, scale multi-channel content, and enforce brand-voice compliance.',
};
export const GENERIC_CERTIFICATE_LINE = BY + 'build practical AI skills for the workplace.';

/** True when the course has its own template AND the certificate carries the course name in that artwork. */
export function hasCertificateTemplate(courseId?: string, title?: string): boolean {
  if (!courseId || !(courseId in CERTIFICATE_TEMPLATES)) return false;
  return !title || CERTIFICATE_TEMPLATES[courseId] === title;
}

export function certificateLineFor(c: { id?: string; certificateLine?: string }): string {
  return c.certificateLine?.trim() || (c.id ? CERTIFICATE_LINES[c.id] : '') || GENERIC_CERTIFICATE_LINE;
}
