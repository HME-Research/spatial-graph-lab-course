/**
 * Side-pane state of the workspace (Gate F, F-A). Pure helpers: clamping, keyboard resizing and
 * remembered choices in a key-value storage. Every storage access is wrapped in try/catch: a
 * browser that refuses storage (private mode, quota, disabled) simply forgets, it never throws.
 */

export const LEFT_WIDTH_DEFAULT = 300;
export const LEFT_WIDTH_MIN = 240;
export const LEFT_WIDTH_MAX = 560;
/** Arrow-key step of the left pane's resize handle. */
export const LEFT_WIDTH_STEP = 16;
/** Window width below which the left content starts collapsed when the user never chose. */
export const LEFT_AUTO_COLLAPSE_BELOW = 1600;

export const PANE_STORAGE_KEYS = {
  leftWidth: 'sgl:ui:left-width',
  leftCollapsed: 'sgl:ui:left-collapsed',
  rightCollapsed: 'sgl:ui:right-collapsed',
  rightWidth: 'sgl:ui:right-width',
} as const;

/** Properties pane width limits (owner 2026-11-20: resizable like the left pane). */
export const RIGHT_WIDTH_MIN = 240;
export const RIGHT_WIDTH_MAX = 640;

/** The part of `Storage` the panes use. */
export interface PaneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `window.localStorage`, or null when there is no window or the browser refuses access. */
export function browserPaneStorage(): PaneStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Width clamped to [MIN, MAX] and rounded; anything not finite becomes the default. */
export function clampLeftWidth(width: number): number {
  if (!Number.isFinite(width)) return LEFT_WIDTH_DEFAULT;
  return Math.min(LEFT_WIDTH_MAX, Math.max(LEFT_WIDTH_MIN, Math.round(width)));
}

/** New width for a key on the resize handle, or null for keys it does not handle. */
export function keyboardResize(width: number, key: string): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampLeftWidth(width - LEFT_WIDTH_STEP);
    case 'ArrowRight':
      return clampLeftWidth(width + LEFT_WIDTH_STEP);
    case 'Home':
      return LEFT_WIDTH_MIN;
    case 'End':
      return LEFT_WIDTH_MAX;
    default:
      return null;
  }
}

function safeGet(storage: PaneStorage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: PaneStorage | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Not remembered; the pane still works for this session.
  }
}

/** The remembered left width (clamped), or the default when none or unreadable. */
export function readLeftWidth(storage: PaneStorage | null): number {
  const raw = safeGet(storage, PANE_STORAGE_KEYS.leftWidth);
  if (raw === null || raw.trim() === '') return LEFT_WIDTH_DEFAULT;
  return clampLeftWidth(Number(raw));
}

export function writeLeftWidth(storage: PaneStorage | null, width: number): void {
  safeSet(storage, PANE_STORAGE_KEYS.leftWidth, String(clampLeftWidth(width)));
}

/** Properties pane width clamped to [MIN, MAX] and rounded (not finite: the minimum). */
export function clampRightWidth(width: number): number {
  if (!Number.isFinite(width)) return RIGHT_WIDTH_MIN;
  return Math.min(RIGHT_WIDTH_MAX, Math.max(RIGHT_WIDTH_MIN, Math.round(width)));
}

/**
 * New Properties width for a key on its handle (on the pane's LEFT edge, so ArrowLeft widens it), or
 * null for keys it does not handle.
 */
export function keyboardRightResize(width: number, key: string): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampRightWidth(width + LEFT_WIDTH_STEP);
    case 'ArrowRight':
      return clampRightWidth(width - LEFT_WIDTH_STEP);
    case 'Home':
      return RIGHT_WIDTH_MIN;
    case 'End':
      return RIGHT_WIDTH_MAX;
    default:
      return null;
  }
}

/** The remembered Properties width (clamped), or null when never set: the stylesheet's default applies. */
export function readRightWidth(storage: PaneStorage | null): number | null {
  const raw = safeGet(storage, PANE_STORAGE_KEYS.rightWidth);
  if (raw === null || raw.trim() === '' || !Number.isFinite(Number(raw))) return null;
  return clampRightWidth(Number(raw));
}

export function writeRightWidth(storage: PaneStorage | null, width: number): void {
  safeSet(storage, PANE_STORAGE_KEYS.rightWidth, String(clampRightWidth(width)));
}

/** A remembered explicit choice: true / false, or null when never chosen (or unreadable). */
export function readFlag(storage: PaneStorage | null, key: string): boolean | null {
  const raw = safeGet(storage, key);
  return raw === 'true' ? true : raw === 'false' ? false : null;
}

export function writeFlag(storage: PaneStorage | null, key: string, value: boolean): void {
  safeSet(storage, key, String(value));
}

/** Initial left collapse: the user's explicit choice, else the narrow-window auto-collapse. */
export function initialLeftCollapsed(stored: boolean | null, windowWidth: number | null): boolean {
  if (stored !== null) return stored;
  return windowWidth === null || windowWidth < LEFT_AUTO_COLLAPSE_BELOW;
}

/**
 * Right (Properties) pane. `deliberate` = the user collapsed it themselves (remembered); a
 * collapse that is not deliberate is undone by the next selection.
 */
export interface RightPaneState {
  readonly collapsed: boolean;
  readonly deliberate: boolean;
}

export const initialRightPane = (stored: boolean | null): RightPaneState =>
  stored === true ? { collapsed: true, deliberate: true } : { collapsed: false, deliberate: false };

/** The user toggled the pane: collapsing is deliberate, opening clears the deliberate choice. */
export const userSetRightCollapsed = (collapsed: boolean): RightPaneState => ({ collapsed, deliberate: collapsed });

/** A node or edge was selected: open the pane unless the user deliberately collapsed it. */
export function rightPaneOnSelection(state: RightPaneState, hasSelection: boolean): RightPaneState {
  if (!hasSelection || !state.collapsed || state.deliberate) return state;
  return { collapsed: false, deliberate: false };
}
