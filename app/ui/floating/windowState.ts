/** Pure parts of the FloatingWindow: geometry clamping, size limits, remembered-state parsing. */

export interface Size {
  readonly width: number;
  readonly height: number;
}
export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface WindowState {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly minimised: boolean;
}

export const DEFAULT_WINDOW_SIZE: Size = { width: 420, height: 480 };
export const DEFAULT_MIN_SIZE: Size = { width: 260, height: 160 };
/** Height of a minimised window's bar. */
export const MINIMISED_HEIGHT = 36;
/** Pixels moved by one arrow-key nudge (Shift = 5 times as far). */
export const NUDGE = 16;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Size limited to [min, viewport]. The viewport wins over min when the viewport is smaller. */
export function clampSize(size: Size, min: Size, viewport: Size): Size {
  const w = Math.min(Math.max(size.width, min.width), viewport.width);
  const h = Math.min(Math.max(size.height, min.height), viewport.height);
  return { width: Math.round(w), height: Math.round(h) };
}

/** Position that keeps the whole window (of the given outer size) inside the viewport. */
export function clampPosition(pos: Point, outer: Size, viewport: Size): Point {
  return {
    x: Math.round(clamp(pos.x, 0, viewport.width - outer.width)),
    y: Math.round(clamp(pos.y, 0, viewport.height - outer.height)),
  };
}

/** Make a state fit the viewport (size limits first, then position). */
export function fitState(state: WindowState, min: Size, viewport: Size): WindowState {
  const size = clampSize(state, min, viewport);
  const outer = { width: size.width, height: state.minimised ? MINIMISED_HEIGHT : size.height };
  const pos = clampPosition(state, outer, viewport);
  return { ...pos, ...size, minimised: state.minimised };
}

/** Default state: centred in the viewport. */
export function defaultState(size: Size, min: Size, viewport: Size): WindowState {
  const s = clampSize(size, min, viewport);
  // Owner 2026-11-19: a window opens in the middle of the page (until the student moves it).
  const x = Math.round((viewport.width - s.width) / 2);
  const y = Math.round((viewport.height - s.height) / 2);
  return fitState({ x, y, ...s, minimised: false }, min, viewport);
}

export function storageKey(id: string): string {
  return `sgl.floating.${id}`;
}

/** Parse remembered state; anything malformed yields null (never throws). */
export function parseWindowState(raw: string | null | undefined): WindowState | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const nums = [o.x, o.y, o.width, o.height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (typeof o.minimised !== 'boolean') return null;
  return { x: o.x as number, y: o.y as number, width: o.width as number, height: o.height as number, minimised: o.minimised };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readWindowState(id: string, store: StorageLike | null = storage()): WindowState | null {
  try {
    return parseWindowState(store?.getItem(storageKey(id)));
  } catch {
    return null;
  }
}

export function writeWindowState(id: string, state: WindowState, store: StorageLike | null = storage()): void {
  try {
    store?.setItem(storageKey(id), JSON.stringify(state));
  } catch {
    /* storage unavailable or full: the window still works, it just is not remembered */
  }
}

/** Position change for an arrow key on the title bar, or null for other keys. */
export function nudgeFor(key: string, shift: boolean): Point | null {
  const d = shift ? NUDGE * 5 : NUDGE;
  switch (key) {
    case 'ArrowLeft':
      return { x: -d, y: 0 };
    case 'ArrowRight':
      return { x: d, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: -d };
    case 'ArrowDown':
      return { x: 0, y: d };
    default:
      return null;
  }
}

/** Window-level stacking: bring `id` to the top of the order. */
export function bringToFront(order: readonly string[], id: string): string[] {
  return [...order.filter((x) => x !== id), id];
}

/** Key handling at the window level: Esc closes unless an inner control already handled it. */
export function windowKeyAction(key: string, defaultPrevented: boolean): 'close' | null {
  return key === 'Escape' && !defaultPrevented ? 'close' : null;
}
