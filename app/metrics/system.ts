import type { RoomNode } from '@app/document';

/**
 * Read-only accessor for the SYSTEM-backed node fields, so every UI (Properties, Attributes,
 * legends) names and reads them the same way. They are not metrics: they are the document's own
 * data, edited through the system controls (type picker, move gizmo), never as attributes.
 * - Function = `typeId` (the project's node type);
 * - Level = `grid[2]`, the lowest storey of the room (z is up). A multi-storey room also spans
 *   `grid[2] + size[2] - 1`, reported as `topLevel` (equal to `level` for a one-storey room).
 */
export type SystemFieldId = 'function' | 'level';

export interface SystemField {
  readonly id: SystemFieldId;
  readonly label: string;
  /** What the field is bound to in the document. */
  readonly source: 'typeId' | 'grid[2]';
  readonly definition: string;
}

export const SYSTEM_FIELDS: readonly SystemField[] = Object.freeze([
  Object.freeze({ id: 'function', label: 'Function', source: 'typeId', definition: 'The room’s node type (its programme). Required; chosen from the project’s types.' } as const),
  Object.freeze({ id: 'level', label: 'Level', source: 'grid[2]', definition: 'The storey the room stands on (grid z of its lowest cell). Change it by moving the room.' } as const),
]);

export interface SystemFieldValues {
  /** `typeId`. */
  readonly function: string;
  /** `grid[2]`. */
  readonly level: number;
  /** Highest storey the room occupies: `grid[2] + size[2] - 1`. */
  readonly topLevel: number;
}

export function systemFieldValues(node: Pick<RoomNode, 'typeId' | 'grid' | 'size'>): SystemFieldValues {
  return { function: node.typeId, level: node.grid[2], topLevel: node.grid[2] + node.size[2] - 1 };
}

export interface SystemFieldRow {
  readonly id: SystemFieldId;
  readonly label: string;
  /** Raw value: `typeId` or the level number. */
  readonly value: string | number;
  /** Display text, e.g. "Gallery" or "1" / "0–1" for a two-storey room. */
  readonly text: string;
  readonly definition: string;
  readonly readOnly: true;
}

/**
 * Display rows for a node's system fields, in `SYSTEM_FIELDS` order. `typeLabel` maps a type id to
 * its project label (default: the id itself).
 */
export function systemFieldRows(node: Pick<RoomNode, 'typeId' | 'grid' | 'size'>, typeLabel: (typeId: string) => string = (id) => id): SystemFieldRow[] {
  const v = systemFieldValues(node);
  const [fn, level] = SYSTEM_FIELDS as readonly [SystemField, SystemField];
  return [
    { id: 'function', label: fn.label, value: v.function, text: typeLabel(v.function), definition: fn.definition, readOnly: true },
    {
      id: 'level',
      label: level.label,
      value: v.level,
      text: v.topLevel === v.level ? String(v.level) : `${v.level}–${v.topLevel}`,
      definition: level.definition,
      readOnly: true,
    },
  ];
}
