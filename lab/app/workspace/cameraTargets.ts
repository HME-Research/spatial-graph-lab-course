import { VIEW_LABELS } from '@app/ui';
import { VIEWPORT_IDS, type ViewportInfo } from './viewports';

/**
 * Camera target choice (Gate F, F-D). Pure: no React, no DOM.
 *
 * A camera action (capture, apply a saved camera) always names ONE viewport explicitly. Only
 * visible 3D viewports can be chosen. When the chosen viewport stops being one (hidden by a
 * maximise, outside the layout, or switched to a 2D view) the choice is kept and reported as not
 * available; it is never silently moved to another viewport.
 */

/** "Viewport 2 — Building". */
export const cameraTargetLabel = (viewport: ViewportInfo): string => `Viewport ${viewport.index + 1} — ${VIEW_LABELS[viewport.mode]}`;

/** The viewports a camera action may target now: visible and drawn by a 3D scene, in viewport order. */
export const cameraTargets = (viewports: readonly ViewportInfo[]): readonly ViewportInfo[] => viewports.filter((v) => v.visible && v.is3D);

export type CameraTargetStatus =
  /** Nothing chosen yet. */
  | { readonly kind: 'none' }
  /** A visible 3D viewport whose camera is registered on the bus. */
  | { readonly kind: 'ready'; readonly viewport: ViewportInfo; readonly message: string }
  /** A visible 3D viewport whose canvas has not registered yet (still starting). */
  | { readonly kind: 'waiting'; readonly viewport: ViewportInfo; readonly message: string }
  /** The chosen viewport is hidden, outside the layout or not a 3D view. */
  | { readonly kind: 'unavailable'; readonly id: string; readonly message: string };

/** 1-based viewport number of an id, for messages ("Viewport 3"); the raw id when unknown. */
const viewportName = (id: string): string => {
  const index = (VIEWPORT_IDS as readonly string[]).indexOf(id);
  return index < 0 ? id : `Viewport ${index + 1}`;
};

/**
 * Status of the chosen target. `registered` = ids currently registered on the camera bus
 * (`CameraBus.registered()`).
 */
export function cameraTargetStatus(
  viewports: readonly ViewportInfo[],
  chosen: string | null,
  registered: readonly string[],
): CameraTargetStatus {
  if (chosen === null) return { kind: 'none' };
  const viewport = cameraTargets(viewports).find((v) => v.id === chosen);
  if (!viewport) return { kind: 'unavailable', id: chosen, message: `${viewportName(chosen)} is not available` };
  const label = cameraTargetLabel(viewport);
  return registered.includes(chosen)
    ? { kind: 'ready', viewport, message: `${label} is ready` }
    : { kind: 'waiting', viewport, message: `${label} is starting` };
}
