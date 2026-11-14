/**
 * Click-vs-drag rules for 3D picking (pure). docs/VIEWER-CONTRACTS.md §4: an orbit or pan drag
 * must not change the selection; only a primary-button click with negligible movement does.
 *
 * R3F reports `delta` = pixel distance between pointer-down and click. It already suppresses
 * background "misses" beyond 2 px, but object `onClick` fires for any distance, and right-click
 * (`contextmenu`, used for panning) also counts as a miss. These predicates close both gaps.
 */

/** Maximum pointer travel, in CSS pixels, for a press to count as a click. */
export const CLICK_TOLERANCE_PX = 3;

export interface ClickLike {
  readonly type: string;
  readonly button: number;
}

/** Click on a pickable object (node marker, edge, voxel). */
export function isDeliberateObjectClick(delta: number, native: ClickLike): boolean {
  return native.type === 'click' && native.button === 0 && delta <= CLICK_TOLERANCE_PX;
}

/** Click on empty background, as reported by R3F `onPointerMissed` (already movement-filtered). */
export function isBackgroundClick(native: ClickLike): boolean {
  return native.type === 'click' && native.button === 0;
}
