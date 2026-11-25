import type { ReactNode } from 'react';

/** View-local HTML UI drawn over a 3D canvas. Pure presentation; state lives in the view. */

export function ControlBar({ children }: { readonly children: ReactNode }) {
  return <div className="viewer3d-panel viewer3d-controls">{children}</div>;
}

export function InfoPanel({ children }: { readonly children: ReactNode }) {
  return <div className="viewer3d-panel viewer3d-info">{children}</div>;
}

/** Describes the SceneCanvas orbit controls and background-click behaviour. */
export const NAVIGATION_HINT = 'Drag: orbit · Right-drag / Shift-drag: pan · Wheel: zoom · Click empty space: clear';
