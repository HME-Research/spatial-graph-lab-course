import type { GizmoAxis, GizmoMode, GizmoSide } from '@core/viewer/three/gizmoMath';

/**
 * Arrow-key nudging of the selected room (owner 2026-11-20), as pure functions of the key event's
 * fields (no React, no DOM). One key press is one whole-cell step, sent through the room-edit
 * session's `nudge` (one validated command, one Undo step):
 *
 * - Arrow: move one cell on the grid axis nearest to that screen direction.
 * - Shift+Arrow: grow one cell towards the arrow (the face on the arrow's side moves out).
 * - Shift+Alt+Arrow: shrink one cell from the arrow's side (that face moves in).
 * - PageUp / PageDown: move one storey up / down (3D views only; the Plan keeps a room's storey).
 *
 * Ctrl/Cmd and a lone Alt are never taken (browser and system shortcuts such as Alt+Left = Back).
 */

/** A grid direction in the horizontal plane. */
export interface GridDirection {
  readonly axis: 'x' | 'y';
  readonly sign: 1 | -1;
}

/** Which grid directions the screen's up and right arrows mean in a view. */
export interface ScreenFrame {
  readonly up: GridDirection;
  readonly right: GridDirection;
}

/** The Plan draws grid +y up and +x right. */
export const PLAN_FRAME: ScreenFrame = Object.freeze({ up: { axis: 'y', sign: 1 }, right: { axis: 'x', sign: 1 } } as const);

/** The fields of a KeyboardEvent this module reads. */
export interface RoomKey {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/** One `nudge` of the room-edit session. */
export interface RoomKeyStep {
  readonly mode: GizmoMode;
  readonly axis: GizmoAxis;
  readonly steps: number;
  readonly side: GizmoSide;
}

/** The nearest grid direction to a horizontal vector in grid coordinates (x, y); ties go to x. */
function nearest(x: number, y: number): GridDirection {
  if (Math.abs(x) >= Math.abs(y)) return { axis: 'x', sign: x < 0 ? -1 : 1 };
  return { axis: 'y', sign: y < 0 ? -1 : 1 };
}

/**
 * The frame of a 3D camera from its viewing direction in Three.js world space (grid x = world X,
 * grid y = world −Z, storeys = world Y): up = the grid axis nearest to where the camera looks on
 * the ground, right = the one nearest to the screen's right. A camera looking straight down keeps
 * the heading of the screen's top (`screenUp`), so it still gives a frame.
 */
export function cameraFrame(direction: readonly [number, number, number], screenUp: readonly [number, number, number] = [0, 1, 0]): ScreenFrame {
  // Heading on the ground in grid coordinates: world (X, Z) → grid (X, −Z).
  let fx = direction[0];
  let fy = -direction[2];
  if (Math.hypot(fx, fy) < 1e-6) {
    // Looking straight down: the screen's top gives the heading.
    fx = screenUp[0];
    fy = -screenUp[2];
  }
  if (Math.hypot(fx, fy) < 1e-6) return PLAN_FRAME;
  const up2 = nearest(fx, fy);
  // The screen's right is that axis turned clockwise (seen from above): (x, y) → (y, −x).
  const right: GridDirection = up2.axis === 'y' ? { axis: 'x', sign: up2.sign } : { axis: 'y', sign: -up2.sign as 1 | -1 };
  return { up: up2, right };
}

const ARROWS: Readonly<Record<string, (f: ScreenFrame) => GridDirection>> = {
  ArrowUp: (f) => f.up,
  ArrowDown: (f) => ({ axis: f.up.axis, sign: -f.up.sign as 1 | -1 }),
  ArrowRight: (f) => f.right,
  ArrowLeft: (f) => ({ axis: f.right.axis, sign: -f.right.sign as 1 | -1 }),
};

/** The step a key asks for, or null when it is not a room key here. `storeys`: PageUp/PageDown move z. */
export function roomKeyStep(event: RoomKey, frame: ScreenFrame, storeys: boolean): RoomKeyStep | null {
  if (event.ctrlKey || event.metaKey) return null;
  if (event.key === 'PageUp' || event.key === 'PageDown') {
    if (!storeys || event.shiftKey || event.altKey) return null;
    return { mode: 'move', axis: 'z', steps: event.key === 'PageUp' ? 1 : -1, side: 1 };
  }
  const direction = ARROWS[event.key]?.(frame);
  if (!direction) return null;
  if (!event.shiftKey) return event.altKey ? null : { mode: 'move', axis: direction.axis, steps: direction.sign, side: 1 };
  // Resize: the face on the arrow's side moves out (grow) or, with Alt, in (shrink).
  return { mode: 'resize', axis: direction.axis, steps: event.altKey ? -direction.sign : direction.sign, side: direction.sign };
}

/** Elements whose own keys win: text fields, selects, menus, dialogs, buttons' own menus. */
const KEEP_KEYS = 'input, select, textarea, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"], .sgl-menu, .sgl-popover';

/** True when the key event's target keeps its own keys (the room keys must not fire there). */
export function keepsOwnKeys(target: unknown): boolean {
  const el = target as { closest?: (selector: string) => unknown; isContentEditable?: boolean } | null;
  if (!el || typeof el.closest !== 'function') return false;
  return el.isContentEditable === true || el.closest(KEEP_KEYS) !== null;
}

/** Tooltip / help line listing the keys. */
export const ROOM_KEYS_HELP_3D = 'Arrows move the room one cell (relative to the camera) · PageUp/PageDown one storey · Shift+Arrow grows, Shift+Alt+Arrow shrinks';
export const ROOM_KEYS_HELP_PLAN = 'Arrows move the room one cell · Shift+Arrow grows, Shift+Alt+Arrow shrinks';
/** Short form appended to a 3D view's navigation hint while the gizmo shows (the full list is its tooltip). */
export const ROOM_KEYS_SHORT = 'Arrow keys: nudge the room';
