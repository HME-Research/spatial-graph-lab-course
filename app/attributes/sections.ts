/**
 * Attribute sections (Programme P4, shared definition, 19 November 2026; docs/DECISIONS.md).
 *
 * Every place that lists attributes — the Attributes panel, Properties, and the Data view's
 * table — groups them into these five sections, in this order. Pure data: no React.
 *
 * - identity:   what the graph needs to exist (node id; edge id + its two endpoints). Locked.
 * - required:   what this app needs on every item (node Function, edge Relationship).
 * - geometry:   where a node is and how big it is (app-specific; stored in `position` / `size`,
 *               never in `custom`; each ONE attribute with three values, x | y | z), and how an
 *               edge's corridor looks (`corridor`: ONE optional attribute with three values,
 *               walls | roof | width; a built-in edge attribute, 19 November 2026).
 * - custom:     attributes defined by the project / toolkit (stored in `custom`).
 * - calculated: values the app works out (metrics). Never stored. Locked.
 */

import type { BoundaryShift, RoofStyle, WallStyle } from '@app/document';
import { isBaselineField, type ActiveToolkit, type AttributeCollection, type AttributeField } from '@app/extensions';

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
    summary: 'Where a node’s room is and how big it is, in voxels, and how an edge’s corridor looks. Specific to this app, not to graphs.',
    editable: true,
  },
  custom: {
    title: 'Custom',
    summary: 'Attributes from your toolkit (cannot be deleted) or added by you (can be deleted).',
    editable: true,
  },
  calculated: {
    title: 'Calculated',
    summary: 'Values the app works out from the graph and geometry. Never saved; cannot be edited.',
    editable: false,
  },
};

/**
 * Properties only (owner 2026-11-24): an edge's corridor look (walls, roof, width) in a section of its
 * own after Geometry, so it is not mixed with the edge's other geometry. In the Attributes panel
 * and the Data table the `corridor` attribute stays in Geometry.
 */
export const CORRIDOR_SECTION: AttributeSectionInfo = {
  title: 'Corridor',
  summary: 'How the corridor generated for this edge looks: walls, roof and width. Used only when its rooms do not touch.',
  editable: true,
};

/** A section shown in Properties: one of the five, or the edge's Corridor. */
export type PropertiesSectionId = AttributeSectionId | 'corridor';

export const sectionInfo = (section: PropertiesSectionId): AttributeSectionInfo =>
  section === 'corridor' ? CORRIDOR_SECTION : ATTRIBUTE_SECTIONS[section];

/**
 * Where a Custom attribute comes from, shown as a small rounded tag on its row (same tag style as
 * Analyse: `Toolkit: <name>` / `Yours`). Toolkit attributes cannot be deleted; yours can.
 */
export type CustomAttributeSource = { readonly kind: 'toolkit'; readonly toolkitName: string } | { readonly kind: 'yours' };

export const customAttributeTag = (source: CustomAttributeSource): string =>
  source.kind === 'toolkit' ? `Toolkit: ${source.toolkitName}` : 'Yours';

export const canDeleteCustomAttribute = (source: CustomAttributeSource): boolean => source.kind === 'yours';

/**
 * Where a custom attribute comes from (P4, item C). Derived, never stored: "toolkit" when the active
 * toolkit's files declare it (`isBaselineField` against `ActiveToolkit.attributeBaseline`, the key
 * rule `mergeBaseline` uses, so renames, reloads, project files and attribute exports keep it),
 * otherwise "yours". No toolkit (or a project without one) → always yours. Pure; usable by views.
 */
export function customAttributeSource(
  field: Pick<AttributeField, 'key' | 'formerKeys'>,
  collection: AttributeCollection,
  toolkit: Pick<ActiveToolkit, 'definition' | 'attributeBaseline'> | null | undefined,
): CustomAttributeSource {
  return toolkit && isBaselineField(field, collection, toolkit.attributeBaseline.schema)
    ? { kind: 'toolkit', toolkitName: toolkit.definition.name }
    : { kind: 'yours' };
}

/** Built-in (non-custom, non-calculated) members of each section, in display order. */
export interface BuiltInAttribute {
  /** The stored key (`position`, `size`, …): the attribute's name in the saved JSON. */
  readonly id: string;
  readonly name: string;
  readonly section: Exclude<AttributeSectionId, 'custom' | 'calculated'>;
  /**
   * An attribute of several values, each its own table column: the label of each value (Position,
   * Size: x | y | z; an edge's Corridor: walls | roof | width).
   */
  readonly axes?: readonly string[];
}

export const NODE_BUILT_IN_ATTRIBUTES: readonly BuiltInAttribute[] = [
  { id: 'id', name: 'ID', section: 'identity' },
  { id: 'function', name: 'Function', section: 'required' },
  { id: 'position', name: 'Position', section: 'geometry', axes: ['x', 'y', 'z (Level)'] },
  { id: 'size', name: 'Size', section: 'geometry', axes: ['x', 'y', 'z (Floors)'] },
];

/**
 * One value of a three-number Geometry attribute (`position` or `size`, axis 0–2): what Properties
 * and the Data table edit as one cell. `id` is `<attribute>.<x|y|z>`; `label` the column label under
 * the attribute (`x`, `y`, `z (Level)`); `name` the cell's name in messages.
 */
export interface GeometryAxis {
  readonly id: string;
  readonly part: 'position' | 'size';
  readonly axis: 0 | 1 | 2;
  readonly label: string;
  readonly name: string;
}

export const GEOMETRY_AXES: readonly GeometryAxis[] = [
  { id: 'position.x', part: 'position', axis: 0, label: 'x', name: 'Position x' },
  { id: 'position.y', part: 'position', axis: 1, label: 'y', name: 'Position y' },
  { id: 'position.z', part: 'position', axis: 2, label: 'z (Level)', name: 'Level' },
  { id: 'size.x', part: 'size', axis: 0, label: 'x', name: 'Size x' },
  { id: 'size.y', part: 'size', axis: 1, label: 'y', name: 'Size y' },
  { id: 'size.z', part: 'size', axis: 2, label: 'z (Floors)', name: 'Floors' },
];

export const EDGE_BUILT_IN_ATTRIBUTES: readonly BuiltInAttribute[] = [
  { id: 'id', name: 'ID', section: 'identity' },
  { id: 'source', name: 'Source', section: 'identity' },
  { id: 'target', name: 'Target', section: 'identity' },
  { id: 'relationship', name: 'Relationship', section: 'required' },
  { id: 'corridor', name: 'Corridor', section: 'geometry', axes: ['walls', 'roof', 'width'] },
  { id: 'boundaryShift', name: 'Boundary shift', section: 'geometry' },
];

/** One choice of a corridor value (also used by Properties' selects, via `@app/ui`). */
export interface CorridorChoice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description: string;
}

/** Walls of a generated corridor (the same words as a room card's walls). */
export const CORRIDOR_WALL_CHOICES: readonly CorridorChoice<WallStyle>[] = [
  { value: 'enclosed', label: 'Enclosed', description: 'A side wall on each side.' },
  { value: 'open', label: 'Open', description: 'Open sides; slim posts carry the roof (no roof: no posts).' },
];

/** Roof of a generated corridor (the same words as a room card's roof). */
export const CORRIDOR_ROOF_CHOICES: readonly CorridorChoice<RoofStyle>[] = [
  { value: 'flat', label: 'Flat', description: 'A flat roof.' },
  { value: 'pergola', label: 'Pergola (open slats)', description: 'Open slats across the corridor, like a room pergola.' },
  { value: 'none', label: 'None (open top)', description: 'No roof, open to the sky.' },
];

/**
 * One value of an edge's Corridor (Geometry): what Properties and the Data table edit as one cell.
 * `id` is `corridor.<walls|roof>`; `label` the column label under Corridor; `name` the cell's
 * name in messages. Not stored = the design's Corridors card applies.
 */
export interface CorridorPart {
  readonly id: 'corridor.walls' | 'corridor.roof';
  readonly part: 'walls' | 'roof';
  readonly label: string;
  readonly name: string;
  readonly choices: readonly CorridorChoice<string>[];
}

export const CORRIDOR_PARTS: readonly CorridorPart[] = [
  { id: 'corridor.walls', part: 'walls', label: 'walls', name: 'Corridor walls', choices: CORRIDOR_WALL_CHOICES },
  { id: 'corridor.roof', part: 'roof', label: 'roof', name: 'Corridor roof', choices: CORRIDOR_ROOF_CHOICES },
];

/** The label of a corridor value (`enclosed` → "Enclosed"). */
export const corridorChoiceLabel = (part: CorridorPart, value: string): string => part.choices.find((c) => c.value === value)?.label ?? value;

/**
 * The third value of an edge's Corridor (2026-11-19): its built width in metres, a number (not a
 * choice). Same rules as the choice parts: not stored = the design's Corridors card applies.
 */
export interface CorridorWidthPart {
  readonly id: 'corridor.width';
  readonly part: 'width';
  readonly label: string;
  readonly name: string;
}

export const CORRIDOR_WIDTH_PART: CorridorWidthPart = { id: 'corridor.width', part: 'width', label: 'width', name: 'Corridor width' };

/** An edge's three Boundary shift requests, in display order (Properties, the Data table). */
export const BOUNDARY_SHIFT_CHOICES: readonly { readonly value: BoundaryShift; readonly label: string }[] = [
  { value: 'none', label: 'No shift' },
  { value: 'toward-source', label: 'Toward source' },
  { value: 'toward-target', label: 'Toward target' },
];

/** The label of a Boundary shift request (`toward-source` → "Toward source"). */
export const boundaryShiftLabel = (value: BoundaryShift): string => BOUNDARY_SHIFT_CHOICES.find((c) => c.value === value)?.label ?? value;
