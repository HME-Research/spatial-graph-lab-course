import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { keepsOwnKeys } from './roomKeys';
import type { RoomEditing } from './useRoomEditing';
import './editing.css';

/**
 * The keyboard scope of a 3D view with the room gizmo (Voxels, Building): a focusable box around
 * its SceneCanvas. While focus is inside the view (a click on the scene focuses it) and the gizmo
 * shows, the arrow keys, Shift(+Alt)+arrows and PageUp/PageDown nudge the selected room one cell
 * (`roomKeys.ts`), relative to the camera. Keys in text fields, selects, menus and dialogs are
 * left alone, and nothing outside this view is affected.
 */
export function RoomKeyScope({ editing, children }: { readonly editing: RoomEditing; readonly children: ReactNode }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || !editing.active || keepsOwnKeys(event.target)) return;
    const frame = editing.cameraFrame.current?.();
    if (!frame) return;
    if (editing.handleKey(event, frame, true)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  // A press on the scene itself (the canvas is not focusable) puts the keyboard focus in the view.
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).tagName === 'CANVAS') event.currentTarget.focus({ preventScroll: true });
  };
  return (
    <div className="room-key-scope" tabIndex={-1} data-room-keys="" onKeyDown={onKeyDown} onPointerDownCapture={onPointerDownCapture}>
      {children}
    </div>
  );
}
