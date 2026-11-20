import type { PlanRect } from '@app/building';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize } from '@core/viewer/coordinates';
import type { GizmoMode } from '@core/viewer/three/gizmoMath';
import { applyAxisSteps, type RoomGeometry } from '../three/editing/roomGeometry';

/**
 * Moving and resizing a room in the Plan (pure; no React). The Plan edits only x and y: the room's
 * storey (`position[2]`) and height (`size[2]`) never change here. Validity is NOT decided here:
 * the Plan feeds the draft to the same room-edit session as the 3D gizmo (`proposeEdit` on every
 * snapped change, one `set-node-geometry` command on release).
 *
 * Plan coordinates follow `buildPlan`: plan x = grid x · cell, plan y = −grid y · cell, so on
 * screen grid +y points UP. Handles are named by screen direction: `n` is the top edge (the
 * room's maximum-y face), `e` the right edge (maximum-x face).
 */
export type PlanEdgeHandle = 'n' | 's' | 'e' | 'w';
export type PlanCornerHandle = 'ne' | 'nw' | 'se' | 'sw';
export type PlanResizeHandle = PlanEdgeHandle | PlanCornerHandle;
/** `move` = the room body. */
export type PlanHandle = 'move' | PlanResizeHandle;

export const PLAN_RESIZE_HANDLES: readonly PlanResizeHandle[] = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);

export const handleMode = (handle: PlanHandle): GizmoMode => (handle === 'move' ? 'move' : 'resize');

/** Whole grid cells for a pointer drag of (`dx`, `dy`) plan metres (nearest cell; screen down = grid −y). */
export function planSteps(dx: number, dy: number, cell: CellSize = DEFAULT_CELL_SIZE): { readonly x: number; readonly y: number } {
  return { x: Math.round(dx / cell.horizontal) + 0, y: Math.round(-dy / cell.horizontal) + 0 };
}

/**
 * The snapped draft for a drag of (`dx`, `dy`) plan metres on `handle`, from the room's stored
 * geometry `start`. Move shifts x and y; an edge resizes one axis with the opposite face fixed; a
 * corner resizes both. Sizes stay 1…MAX_ROOM_SIZE (the same clamp as the 3D gizmo); z is untouched.
 */
export function planDraft(start: RoomGeometry, handle: PlanHandle, dx: number, dy: number, cell: CellSize = DEFAULT_CELL_SIZE): RoomGeometry {
  const steps = planSteps(dx, dy, cell);
  if (handle === 'move') return applyAxisSteps(applyAxisSteps(start, 'move', 'x', steps.x), 'move', 'y', steps.y);
  let draft = start;
  if (handle.includes('e')) draft = applyAxisSteps(draft, 'resize', 'x', steps.x, 1);
  if (handle.includes('w')) draft = applyAxisSteps(draft, 'resize', 'x', steps.x, -1);
  if (handle.includes('n')) draft = applyAxisSteps(draft, 'resize', 'y', steps.y, 1);
  if (handle.includes('s')) draft = applyAxisSteps(draft, 'resize', 'y', steps.y, -1);
  return draft;
}

/** The room's footprint in plan metres (the same rectangle `buildPlan` draws for it). */
export function geometryRect(room: RoomGeometry, cell: CellSize = DEFAULT_CELL_SIZE): PlanRect {
  const [x, y, z] = room.position;
  const a = spatialToThree([x - 0.5, y - 0.5, z], cell);
  const b = spatialToThree([x + room.size[0] - 0.5, y + room.size[1] - 0.5, z], cell);
  return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[2], b[2]), y1: Math.max(a[2], b[2]) };
}

/** True when the room spans storey `level`. */
export const spansLevel = (room: RoomGeometry, level: number): boolean => room.position[2] <= level && level < room.position[2] + room.size[2];

/** Where a handle sits on a plan rectangle (screen top = smaller plan y). */
export function handlePoint(rect: PlanRect, handle: PlanResizeHandle): readonly [number, number] {
  const x = handle.includes('e') ? rect.x1 : handle.includes('w') ? rect.x0 : (rect.x0 + rect.x1) / 2;
  const y = handle.includes('n') ? rect.y0 : handle.includes('s') ? rect.y1 : (rect.y0 + rect.y1) / 2;
  return [x, y];
}

/** CSS cursor for a handle. */
export function handleCursor(handle: PlanHandle): string {
  switch (handle) {
    case 'move':
      return 'move';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
  }
}

const HANDLE_NAMES: Readonly<Record<PlanResizeHandle, string>> = {
  n: 'top edge',
  s: 'bottom edge',
  e: 'right edge',
  w: 'left edge',
  ne: 'top-right corner',
  nw: 'top-left corner',
  se: 'bottom-right corner',
  sw: 'bottom-left corner',
};

/** Tooltip of a handle; says that the storey and height stay as they are in the Plan. */
export function handleTitle(handle: PlanHandle): string {
  const keep = 'Its storey and height stay the same in the Plan (change them in Properties or the 3D views).';
  return handle === 'move'
    ? `Drag to move the room by whole cells. ${keep}`
    : `Drag the ${HANDLE_NAMES[handle]} to resize the room by whole cells (at least 1 cell). ${keep}`;
}
