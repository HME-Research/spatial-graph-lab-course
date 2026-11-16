/**
 * Concept explanations behind the small `i` buttons (pure data). Deliberately few: only genuine
 * concepts that students confuse, each with a diagram and at most two short contrasting parts.
 * No walls of text: every sentence is ≤ 160 characters (tested).
 */
export const CONCEPT_IDS = ['access-open', 'project-scenario', 'calculated-values', 'repeat-stretch'] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

export interface ConceptPart {
  readonly heading: string;
  readonly text: string;
}

export interface Concept {
  readonly id: ConceptId;
  /** Dialog title and the `i` button's accessible name ("About …"). */
  readonly title: string;
  /** One sentence under the title. */
  readonly lead: string;
  /** Two contrasting parts, shown side by side under the diagram. */
  readonly parts: readonly [ConceptPart, ConceptPart];
  /** Short text alternative of the diagram. */
  readonly diagramLabel: string;
}

export const CONCEPTS: Readonly<Record<ConceptId, Concept>> = {
  'access-open': {
    id: 'access-open',
    title: 'Access and Open',
    lead: 'Both are relationships between two rooms. They differ in what is built between them.',
    parts: [
      { heading: 'Access', text: 'Separate rooms that people can pass between: a door in the shared wall, or a floor opening.' },
      { heading: 'Open', text: 'The rooms flow into one space: the shared wall (or floor) is left out.' },
    ],
    diagramLabel: 'Two pairs of rooms in plan: Access keeps the shared wall with a door gap; Open removes the shared wall.',
  },
  'project-scenario': {
    id: 'project-scenario',
    title: 'Project and Scenario',
    lead: 'A project holds the shared rules; each scenario is one complete design alternative.',
    parts: [
      { heading: 'Project', text: 'Shared by every scenario: functions, attribute fields and settings.' },
      { heading: 'Scenario', text: 'Its own rooms, relationships, values and undo history. Switch scenarios in the Scenarios tab.' },
    ],
    diagramLabel: 'A project box containing shared fields, with three scenario cards (A, B, C) inside it.',
  },
  'calculated-values': {
    id: 'calculated-values',
    title: 'Calculated values',
    lead: 'Calculated values are worked out from the design. You cannot type them; they update when the design changes.',
    parts: [
      { heading: 'Inputs you edit', text: 'Position, size, relationships and attribute values.' },
      { heading: 'Calculated (read-only)', text: 'For example area from the size, or degree from the relationships. They are never saved as values.' },
    ],
    diagramLabel: 'Editable inputs (size, relationships) flow through an arrow into a read-only calculated value with a lock.',
  },
  'repeat-stretch': {
    id: 'repeat-stretch',
    title: 'Repeat and Stretch',
    lead: 'Two ways to fit one façade module to walls of different lengths.',
    parts: [
      { heading: 'Repeat', text: 'The module keeps its size and is placed again and again along the wall.' },
      { heading: 'Stretch', text: 'One module is scaled to cover the whole wall.' },
    ],
    diagramLabel: 'A wall with four identical window modules (Repeat) above a wall with one wide stretched module (Stretch).',
  },
};

export const conceptOf = (id: string): Concept | undefined => (CONCEPT_IDS as readonly string[]).includes(id) ? CONCEPTS[id as ConceptId] : undefined;
