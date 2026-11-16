import { createContext, useContext } from 'react';
import type { CameraBus } from '@core/viewer/three/camera';

/**
 * Which viewport a view is rendered in, and the workspace camera bus (Gate F, F-D). Provided per
 * viewport by the workspace; lives in the views layer because views may not import the shell.
 *
 * A 3D view spreads `useViewportCamera()` into its `SceneCanvas`, which then registers its camera on
 * the bus under the viewport id. Without a provider (tests, other hosts) the result is empty and
 * nothing is registered, exactly as before.
 */
export interface ViewportCamera {
  readonly viewportId: string;
  readonly cameraBus: CameraBus;
}

export const ViewportCameraContext = createContext<ViewportCamera | null>(null);

/** `SceneCanvas` props for the hosting viewport: `{ viewportId, cameraBus }`, or `{}` outside one. */
export function useViewportCamera(): Partial<ViewportCamera> {
  return useContext(ViewportCameraContext) ?? {};
}
