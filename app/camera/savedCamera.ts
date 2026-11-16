import { z } from 'zod';
import { savedCameraSchema, type SavedCamera } from '@core/viewer/three/camera';
import { VIEW_MODES, type ViewMode } from '@app/views/contracts';

/**
 * Application narrowing of the core `SavedCamera` (Gate F, F-D). The core contract keeps
 * `viewMode` a plain string; in this app a saved camera belongs to one of the 3D view modes.
 * Graph 2D (a diagram, not a 3D viewport) and Plan (an architectural floor plan) have no
 * saved cameras.
 */
export type CameraViewMode = Extract<ViewMode, 'graph3d' | 'voxels' | 'architecture'>;

const isCameraViewMode = (mode: ViewMode): mode is CameraViewMode => mode === 'graph3d' || mode === 'voxels' || mode === 'architecture';

/** The 3D view modes, in `VIEW_MODES` order. */
export const CAMERA_VIEW_MODES = VIEW_MODES.filter(isCameraViewMode) as readonly CameraViewMode[] as readonly [CameraViewMode, ...CameraViewMode[]];

export interface AppSavedCamera extends SavedCamera {
  readonly viewMode: CameraViewMode;
}

/** `savedCameraSchema` (strict) with `viewMode` restricted to `CAMERA_VIEW_MODES`. */
export const appSavedCameraSchema = savedCameraSchema.extend({
  viewMode: z.enum(CAMERA_VIEW_MODES, { error: `viewMode must be one of: ${CAMERA_VIEW_MODES.join(', ')}` }),
});
