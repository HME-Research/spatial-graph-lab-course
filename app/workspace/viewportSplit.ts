import type { PaneStorage } from './panes';

/**
 * Movable divisions between the viewports (owner 2026-11-20). With 2 viewports the vertical divider
 * sets how wide the left one is; with 4 the vertical and the horizontal divider set the column and
 * row sizes. Each is the fraction (of the space without the gap) taken by the first column / row,
 * kept within [SPLIT_MIN, SPLIT_MAX] so no viewport disappears. Remembered in the browser; pure
 * helpers, every storage access is wrapped (a refusing browser simply forgets).
 */

export interface ViewportSplit {
  /** Fraction of the width taken by the left column. */
  readonly x: number;
  /** Fraction of the height taken by the top row (layout 4). */
  readonly y: number;
}

export const SPLIT_MIN = 0.15;
export const SPLIT_MAX = 0.85;
/** Arrow-key step of a divider. */
export const SPLIT_KEY_STEP = 0.02;
export const DEFAULT_SPLIT: ViewportSplit = { x: 0.5, y: 0.5 };
export const SPLIT_STORAGE_KEY = 'sgl:ui:viewport-split';

/** A fraction clamped to [MIN, MAX] (3 decimals); anything not finite becomes 0.5. */
export function clampSplit(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0.5;
  return Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, fraction)) * 1000) / 1000;
}

/**
 * The fraction for a pointer at `pointer` (clientX or clientY) over a panels box starting at
 * `start` with size `size`: the divider's centre follows the pointer.
 */
export function splitFromPointer(pointer: number, start: number, size: number, gap: number): number {
  const usable = size - gap;
  if (usable <= 0) return 0.5;
  return clampSplit((pointer - start - gap / 2) / usable);
}

/**
 * The new fraction for a key on a divider (ArrowLeft/Right on the vertical one, ArrowUp/Down on the
 * horizontal one; Home resets to half), or null for other keys.
 */
export function keyboardSplit(fraction: number, key: string, axis: 'x' | 'y'): number | null {
  const [less, more] = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  if (key === less) return clampSplit(fraction - SPLIT_KEY_STEP);
  if (key === more) return clampSplit(fraction + SPLIT_KEY_STEP);
  if (key === 'Home') return 0.5;
  return null;
}

/** The CSS custom properties the panels grid and its dividers read. */
export function splitStyle(split: ViewportSplit): Readonly<Record<string, string>> {
  const x = clampSplit(split.x);
  const y = clampSplit(split.y);
  return {
    '--split-x': String(x),
    '--split-y': String(y),
    '--split-col-a': `${x}fr`,
    '--split-col-b': `${Math.round((1 - x) * 1000) / 1000}fr`,
    '--split-row-a': `${y}fr`,
    '--split-row-b': `${Math.round((1 - y) * 1000) / 1000}fr`,
  };
}

/** The remembered split, or the default when none or unreadable. */
export function readViewportSplit(storage: PaneStorage | null): ViewportSplit {
  try {
    const raw = storage?.getItem(SPLIT_STORAGE_KEY);
    if (!raw) return DEFAULT_SPLIT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SPLIT;
    const { x, y } = parsed as { x?: unknown; y?: unknown };
    return { x: typeof x === 'number' ? clampSplit(x) : 0.5, y: typeof y === 'number' ? clampSplit(y) : 0.5 };
  } catch {
    return DEFAULT_SPLIT;
  }
}

export function writeViewportSplit(storage: PaneStorage | null, split: ViewportSplit): void {
  try {
    storage?.setItem(SPLIT_STORAGE_KEY, JSON.stringify({ x: clampSplit(split.x), y: clampSplit(split.y) }));
  } catch {
    // Not remembered; the dividers still work for this session.
  }
}
