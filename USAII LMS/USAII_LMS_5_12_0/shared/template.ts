// Activity templates: fields shown in sections.
//
// Fields next to each other with the same `group` form one section (a row of the original table,
// such as "Task 1" with "Task", "Depends on", "AI helps / Do myself"). The learner's form, the
// reviewer's view, the learner's PDF and the automatic checks all use the same sections, so a label
// like "Depends on" is never shown without the row it belongs to.

import type { ActivityField } from './types';

export interface FieldSection {
  /** The section heading, or undefined for fields that stand on their own. */
  group?: string;
  fields: ActivityField[];
}

export function fieldSections(fields: ActivityField[]): FieldSection[] {
  const out: FieldSection[] = [];
  for (const f of fields) {
    const last = out[out.length - 1];
    if (last && f.group && last.group === f.group) last.fields.push(f);
    else out.push({ group: f.group || undefined, fields: [f] });
  }
  return out;
}

/** "Task 2 · Depends on": the label with its section, for lists that show fields one by one. */
export const fieldDisplayLabel = (f: Pick<ActivityField, 'label' | 'group'>) => (f.group ? `${f.group} · ${f.label}` : f.label);
