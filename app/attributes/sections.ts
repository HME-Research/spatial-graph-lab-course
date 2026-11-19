/**
 * Attribute sections (Programme P4, shared definition, 19 November 2026; docs/DECISIONS.md).
 *
 * Every place that lists attributes — the Attributes panel, Properties, and the Data view's
 * table — groups them into these five sections, in this order. Pure data: no React.
 *
 * - identity:   what the graph needs to exist (node id; edge id + its two endpoints). Locked.
 * - required:   what this app needs on every item (node Function, edge Relationship).
 * - geometry:   where a node is and how big it is (app-specific; stored in `grid` / `size`,
 *               never in `attributes`).
 * - custom:     attributes defined by the project / toolkit (stored in `attributes`).
 * - calculated: values the app works out (metrics). Never stored. Locked.
 */

export const ATTRIBUTE_SECTION_IDS = ['identity', 'required', 'geometry', 'custom', 'calculated'] as const;
export type AttributeSectionId = (typeof ATTRIBUTE_SECTION_IDS)[number];

export interface AttributeSectionInfo {
  readonly title: string;
  /** One short sentence for the ⓘ tooltip. */
  readonly summary: string;
  /** Whether values in this section can ever be edited by the student. */
  readonly editable: boolean;
}

export const ATTRIBUTE_SECTIONS: Readonly<Record<AttributeSectionId, AttributeSectionInfo>> = {
  identity: {
    title: 'Identity',
    summary: 'What every graph needs: a unique id, and for an edge the two nodes it joins. Never changes.',
    editable: false,
  },
  required: {
    title: 'Required by the app',
    summary: 'What this app needs on every item; the toolkit supplies the choices.',
    editable: true,
  },
  geometry: {
    title: 'Geometry',
    summary: 'Where a room is and how big it is, in voxels. Specific to this app, not to graphs.',
    editable: true,
  },
  custom: {
    title: 'Custom',
    summary: 'Attributes defined by your toolkit or project.',
    editable: true,
  },
  calculated: {
    title: 'Calculated',
    summary: 'Values the app works out from the graph and geometry. Never saved; cannot be edited.',
    editable: false,
  },
};

/** Built-in (non-custom, non-calculated) members of each section, in display order. */
export interface BuiltInAttribute {
  readonly id: string;
  readonly name: string;
  readonly section: Exclude<AttributeSectionId, 'custom' | 'calculated'>;
}

export const NODE_BUILT_IN_ATTRIBUTES: readonly BuiltInAttribute[] = [
  { id: 'id', name: 'ID', section: 'identity' },
  { id: 'function', name: 'Function', section: 'required' },
  { id: 'position-x', name: 'Position X', section: 'geometry' },
  { id: 'position-y', name: 'Position Y', section: 'geometry' },
  { id: 'level', name: 'Level', section: 'geometry' },
  { id: 'size-x', name: 'Size X', section: 'geometry' },
  { id: 'size-y', name: 'Size Y', section: 'geometry' },
  { id: 'floors', name: 'Floors', section: 'geometry' },
];

export const EDGE_BUILT_IN_ATTRIBUTES: readonly BuiltInAttribute[] = [
  { id: 'id', name: 'ID', section: 'identity' },
  { id: 'source', name: 'Source', section: 'identity' },
  { id: 'target', name: 'Target', section: 'identity' },
  { id: 'relationship', name: 'Relationship', section: 'required' },
];
