import type { FaceDirection, FaceOrientation } from '@app/building';
import type { GridCoord } from '@core/spatial';
import type { Selection } from '@core/viewer/selection';

/**
 * Level filter of the Voxel and Building views (owner 2026-11-20): which storeys are previewed.
 * Pure (no React, no Three.js). It is view state only, remembered per panel; it never changes the
 * design, its resolution or the building model, it only chooses what a view draws and picks.
 *
 * - `all`: everything (default).
 * - `only`: one storey.
 * - `up-to`: that storey and every storey below it (the upper floors taken off).
 *
 * Multi-storey rooms are CLIPPED to the shown storeys (a section cut): a double-height room shows
 * only its part on the shown storeys, so "Up to level 0" never covers level 0 with the upper half
 * of a tall room.
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

/**
 * The rooms on the shown storeys, each clipped to them (position z / size z), in input order.
 * Rooms with no storey in the range are left out. All levels returns `nodes` itself.
 */
export function clipToLevels<N extends LevelSized>(nodes: readonly N[], range: LevelRange | null): readonly N[] {
  if (range === null) return nodes;
  const out: N[] = [];
  for (const n of nodes) {
    const [sx, sy, sz] = n.size ?? [1, 1, 1];
    const bottom = n.position[2];
    const top = bottom + sz - 1;
    const lo = Math.max(bottom, range.lo);
    const hi = Math.min(top, range.hi);
    if (lo > hi) continue;
    if (lo === bottom && hi === top) out.push(n);
    else out.push({ ...n, position: [n.position[0], n.position[1], lo], size: [sx, sy, hi - lo + 1] });
  }
  return out;
}

/** A building face as the filter needs it (`BuildingFace` has these fields). */
export interface LevelFace {
  readonly cell: GridCoord;
  readonly direction: FaceDirection;
  readonly orientation: FaceOrientation;
  /** The room on the other side (null: exterior). */
  readonly neighbourNodeId: number | null;
}

/**
 * Whether a building face is drawn under `range`.
 * - A wall belongs to its cell's storey.
 * - A horizontal face (floor, slab, roof) lies on a storey boundary `b` (between storeys b-1 and b).
 *   Between two shown storeys (lo < b ≤ hi) it is drawn. At the bottom (b = lo) it is drawn only as
 *   the floor of a shown room (not the roof of a lower wing that nothing on storey lo stands on).
 *   At the top (b = hi + 1) it is the lid of a shown room (its roof, or the slab under the next
 *   storey), drawn only when `showTop` (the Building view's Roofs toggle): with Roofs off the
 *   chosen storey is seen open from above, with Roofs on it is closed.
 */
export function isFaceShown(face: LevelFace, range: LevelRange | null, showTop: boolean): boolean {
  if (range === null) return true;
  const z = face.cell[2];
  if (face.direction !== '+z' && face.direction !== '-z') return isLevelShown(z, range);
  const up = face.direction === '+z';
  const boundary = up ? z + 1 : z;
  const shared = face.neighbourNodeId !== null;
  if (boundary > range.lo && boundary <= range.hi) return true;
  // The owner cell is above the boundary for a -z face, below it for a +z face.
  if (boundary === range.lo) return !up || shared;
  if (boundary === range.hi + 1) return showTop && (up || shared);
  return false;
}

/** A corridor (connector) element or reserved cell belongs to its route cell's storey. */
export const isCellShown = (cell: readonly [number, number, number], range: LevelRange | null): boolean => isLevelShown(cell[2], range);

/** Info line when the selected room is not drawn under the filter (the selection itself is kept). */
export function hiddenSelectionNote(selection: Selection, shownNodeIds: ReadonlySet<number>, filter: LevelFilter): string | null {
  if (filter.kind === 'all' || selection.kind !== 'node' || shownNodeIds.has(selection.id)) return null;
  return 'The selected room is on a hidden level.';
}
