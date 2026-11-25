import type { FaceDirection, FaceOrientation } from '@app/building';
import type { GridCoord } from '@core/spatial';
import type { Selection } from '@core/viewer/selection';

/**
 * Level filter of the Graph 3D, Voxel and Building views (owner 2026-11-20): which storeys are previewed.
 * Pure (no React, no Three.js). It is view state only, remembered per panel; it never changes the
 * design, its resolution or the building model, it only chooses what a view draws and picks.
 *
 * - `all`: everything (default).
 * - `only`: one storey.
 * - `up-to`: that storey and every storey below it (the upper floors taken off).
 *
 * A room is shown WHOLE when any of its storeys is in the range (owner follow-up 2026-11-20; it was
 * clipped to the range before): a room on levels 0..1 is shown entire by "Up to level 0" and by
 * "Level 1 only". Its walls, floor and lid follow the room (`isFaceShown`).
 */
export type LevelFilter =
  | { readonly kind: 'all' }
  | { readonly kind: 'only'; readonly level: number }
  | { readonly kind: 'up-to'; readonly level: number };

export const ALL_LEVELS: LevelFilter = { kind: 'all' };

/** Inclusive storey range of a filter; `null` = no limit (All levels). */
export interface LevelRange {
  readonly lo: number;
  readonly hi: number;
}

export function levelRange(filter: LevelFilter): LevelRange | null {
  switch (filter.kind) {
    case 'all':
      return null;
    case 'only':
      return { lo: filter.level, hi: filter.level };
    case 'up-to':
      return { lo: -Infinity, hi: filter.level };
  }
}

/** Display name of a storey, as in the rest of the app (Plan view: "Level 0"). */
export const levelName = (level: number): string => `Level ${level}`;

/**
 * The filter a view applies: the chosen one while its storey exists in the design, otherwise All
 * (a storey removed by an edit, or a design without it). Fewer than two storeys: always All.
 */
export function effectiveLevelFilter(filter: LevelFilter, levels: readonly number[]): LevelFilter {
  if (filter.kind === 'all' || levels.length < 2 || !levels.includes(filter.level)) return ALL_LEVELS;
  return filter;
}

export const levelFilterToValue = (filter: LevelFilter): string => (filter.kind === 'all' ? 'all' : `${filter.kind}:${filter.level}`);

export function levelFilterFromValue(value: string): LevelFilter {
  const m = /^(only|up-to):(-?\d+)$/.exec(value);
  return m ? { kind: m[1] as 'only' | 'up-to', level: Number(m[2]) } : ALL_LEVELS;
}

/** "All levels", "Level 1 only", "Up to level 0". */
export function levelFilterLabel(filter: LevelFilter): string {
  switch (filter.kind) {
    case 'all':
      return 'All levels';
    case 'only':
      return `${levelName(filter.level)} only`;
    case 'up-to':
      return `Up to level ${filter.level}`;
  }
}

export interface LevelFilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Options of the toolbar control for the design's storeys (ascending): All levels, "Level n only"
 * per storey, then "Up to level n" per storey below the top one (up to the top = All). Empty for
 * fewer than two storeys (the control is not shown).
 */
export function levelFilterOptions(levels: readonly number[]): LevelFilterOption[] {
  if (levels.length < 2) return [];
  const filters: LevelFilter[] = [
    ALL_LEVELS,
    ...levels.map((level): LevelFilter => ({ kind: 'only', level })),
    ...levels.slice(0, -1).map((level): LevelFilter => ({ kind: 'up-to', level })),
  ];
  return filters.map((f) => ({ value: levelFilterToValue(f), label: levelFilterLabel(f) }));
}

export const isLevelShown = (level: number, range: LevelRange | null): boolean => range === null || (level >= range.lo && level <= range.hi);

/** A room (or any sized cell box) in grid space: minimum corner + whole cells along x, y, z. */
export interface LevelSized {
  readonly position: GridCoord;
  readonly size?: readonly [number, number, number];
}

/** Whether a room has a storey in the range (it is then shown whole). */
export function isRoomShown(room: LevelSized, range: LevelRange | null): boolean {
  if (range === null) return true;
  const bottom = room.position[2];
  const top = bottom + (room.size?.[2] ?? 1) - 1;
  return bottom <= range.hi && top >= range.lo;
}

/** The rooms with a storey in the range, WHOLE and unchanged, in input order. All levels returns `nodes` itself. */
export function roomsOnLevels<N extends LevelSized>(nodes: readonly N[], range: LevelRange | null): readonly N[] {
  return range === null ? nodes : nodes.filter((n) => isRoomShown(n, range));
}

/** The storeys the given rooms occupy (ascending): level labels follow the shown rooms, so a whole tall room keeps its upper label. */
export function storeysOf(nodes: readonly LevelSized[]): number[] {
  const out = new Set<number>();
  for (const n of nodes) for (let z = 0; z < (n.size?.[2] ?? 1); z++) out.add(n.position[2] + z);
  return [...out].sort((a, b) => a - b);
}

/** A building face as the filter needs it (`BuildingFace` has these fields). */
export interface LevelFace {
  readonly ownerNodeId: number;
  readonly direction: FaceDirection;
  readonly orientation: FaceOrientation;
  /** The room on the other side (null: exterior or a generated corridor). */
  readonly neighbourNodeId: number | null;
}

/**
 * Whether a building face is drawn when only the rooms in `shown` are shown (null: All levels). The
 * faces follow the rooms, so a whole tall room keeps all its walls and slabs:
 * - A wall is drawn when the room on either side of it is shown.
 * - A horizontal face (floor, slab, roof) with a shown room ABOVE it is that room's floor: drawn.
 * - One with a shown room only BELOW it is that room's lid (its roof, or the slab under a hidden
 *   room): drawn only when `showTop` (the Building view's Roofs toggle). With Roofs off each shown
 *   room is open from above wherever nothing shown stands on it; with Roofs on it is closed.
 * - A face of hidden rooms only is not drawn.
 */
export function isFaceShown(face: LevelFace, shown: ReadonlySet<number> | null, showTop: boolean): boolean {
  if (shown === null) return true;
  const owner = shown.has(face.ownerNodeId);
  const other = face.neighbourNodeId !== null && shown.has(face.neighbourNodeId);
  if (face.direction !== '+z' && face.direction !== '-z') return owner || other;
  // A +z face has its owner below the boundary, a -z face above it.
  const ownerBelow = face.direction === '+z';
  const upper = ownerBelow ? other : owner;
  const lower = ownerBelow ? owner : other;
  return upper || (lower && showTop);
}

/**
 * A corridor (connector) element or reserved cell belongs to its route cell's storey (a corridor is
 * not a room: it is not extended with a whole tall room).
 */
export const isCellShown = (cell: readonly [number, number, number], range: LevelRange | null): boolean => isLevelShown(cell[2], range);

/** Info line when the selected room is not drawn under the filter (the selection itself is kept). */
export function hiddenSelectionNote(selection: Selection, shownNodeIds: ReadonlySet<number>, filter: LevelFilter): string | null {
  if (filter.kind === 'all' || selection.kind !== 'node' || shownNodeIds.has(selection.id)) return null;
  return 'The selected node is on a hidden level.';
}
