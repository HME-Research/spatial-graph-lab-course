import type { ViewMode } from '@app/views/contracts';

/**
 * Viewport layout of the centre of the workspace (Gate F, F-A). Pure: no React, no DOM.
 *
 * - Four viewports with stable ids; a layout shows the first 1, 2 or 4 of them (default 2).
 * - Viewports outside the layout are unmounted (their camera survives in the workspace's
 *   per-viewport PanelMemory, as the single/split layout did before).
 * - Any visible viewport can be maximised: then only it is visible, and the other viewports of the
 *   layout stay MOUNTED but hidden (`hidden` attribute), so their cameras and drafts persist.
 */
export const VIEWPORT_IDS = ['viewport-1', 'viewport-2', 'viewport-3', 'viewport-4'] as const;
export type ViewportId = (typeof VIEWPORT_IDS)[number];
/** 0-based position in `VIEWPORT_IDS`. */
export type ViewportIndex = 0 | 1 | 2 | 3;
export const VIEWPORT_INDICES: readonly ViewportIndex[] = [0, 1, 2, 3];

export type ViewportLayout = 1 | 2 | 4;
export const VIEWPORT_LAYOUTS: readonly ViewportLayout[] = [1, 2, 4];
export const DEFAULT_VIEWPORT_LAYOUT: ViewportLayout = 2;

export type ViewportModes = readonly [ViewMode, ViewMode, ViewMode, ViewMode];
export const DEFAULT_VIEWPORT_MODES: ViewportModes = ['graph2d', 'architecture', 'graph3d', 'plan'];

/** View modes drawn by a 3D scene (camera-capable). */
export const THREE_D_MODES: ReadonlySet<ViewMode> = new Set<ViewMode>(['graph3d', 'voxels', 'architecture']);

/** View modes that show the room editor (snapped gizmo + edit panel). */
export const EDITING_MODES: ReadonlySet<ViewMode> = new Set<ViewMode>(['voxels', 'architecture']);

export interface ViewportState {
  readonly layout: ViewportLayout;
  readonly modes: ViewportModes;
  /** The maximised viewport, or null. Always a viewport inside the layout. */
  readonly maximised: ViewportIndex | null;
}

export const DEFAULT_VIEWPORT_STATE: ViewportState = {
  layout: DEFAULT_VIEWPORT_LAYOUT,
  modes: DEFAULT_VIEWPORT_MODES,
  maximised: null,
};

/** Shared description of one viewport (WorkspaceServices, Camera panel, later the camera bus). */
export interface ViewportInfo {
  readonly id: ViewportId;
  readonly index: ViewportIndex;
  readonly mode: ViewMode;
  /** Shown on screen now (inside the layout and not hidden by another viewport's maximise). */
  readonly visible: boolean;
  readonly is3D: boolean;
}

/** The viewport is rendered (visible or hidden by a maximise); false = unmounted. */
export const isMounted = (state: ViewportState, index: ViewportIndex): boolean => index < state.layout;

export const isVisible = (state: ViewportState, index: ViewportIndex): boolean =>
  isMounted(state, index) && (state.maximised === null || state.maximised === index);

/** The four viewports in order, with their derived visibility. */
export function deriveViewports(state: ViewportState): readonly ViewportInfo[] {
  return VIEWPORT_INDICES.map((index) => {
    const mode = state.modes[index];
    return { id: VIEWPORT_IDS[index], index, mode, visible: isVisible(state, index), is3D: THREE_D_MODES.has(mode) };
  });
}

/** Change the layout; a maximise outside the new layout is cleared. Modes are kept for every viewport. */
export function setViewportLayout(state: ViewportState, layout: ViewportLayout): ViewportState {
  if (state.layout === layout) return state;
  const maximised = state.maximised !== null && state.maximised < layout ? state.maximised : null;
  return { ...state, layout, maximised };
}

export function setViewportMode(state: ViewportState, index: ViewportIndex, mode: ViewMode): ViewportState {
  if (state.modes[index] === mode) return state;
  const modes = [...state.modes] as [ViewMode, ViewMode, ViewMode, ViewMode];
  modes[index] = mode;
  return { ...state, modes };
}

/** Maximise a mounted viewport, or restore when it is already maximised. Unmounted viewports are ignored. */
export function toggleMaximise(state: ViewportState, index: ViewportIndex): ViewportState {
  if (!isMounted(state, index)) return state;
  return { ...state, maximised: state.maximised === index ? null : index };
}

/** Maximise/Restore is offered only when the layout has more than one viewport. */
export const canMaximise = (state: ViewportState): boolean => state.layout > 1;

/**
 * Which viewport shows the room editor when SEVERAL visible viewports can edit rooms (Voxels /
 * Building): only one, so identical editors never contradict each other. That is the viewport last
 * interacted with when it is one of them, otherwise the last of them. null = fewer than two
 * editing viewports are visible, so every editor may show (hidden viewports are not visible anyway).
 */
export function editPanelOwner(viewports: readonly ViewportInfo[], lastInteracted: ViewportIndex): ViewportIndex | null {
  const editing = viewports.filter((v) => v.visible && EDITING_MODES.has(v.mode)).map((v) => v.index);
  if (editing.length < 2) return null;
  return editing.includes(lastInteracted) ? lastInteracted : editing[editing.length - 1]!;
}
