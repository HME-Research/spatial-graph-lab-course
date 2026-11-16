import { lazy } from 'react';
import type { ViewComponent, ViewMode } from './contracts';
import { Graph2DView } from './graph2d/Graph2DView';
// Plan with the shared-wall interaction (wave 2, D): workstream C's PlanView + its onWallTarget hook.
import { PlanWallView } from './three/wallInteraction/PlanWallView';

/*
 * The three 3D views are lazy-loaded (wave 1, workstream E): Three.js, React Three Fiber and drei
 * move out of the main chunk into one chunk fetched when the first 3D viewport mounts. The
 * workspace renders views inside <Suspense>.
 */
const ArchitectureView = lazy(() => import('./architecture/ArchitectureView').then((m) => ({ default: m.ArchitectureView })));
const Graph3DView = lazy(() => import('./graph3d/Graph3DView').then((m) => ({ default: m.Graph3DView })));
const VoxelView = lazy(() => import('./voxels/VoxelView').then((m) => ({ default: m.VoxelView })));

/** Mode → component. Workstreams replace the component files, not this map. */
export const VIEW_COMPONENTS: Readonly<Record<ViewMode, ViewComponent>> = {
  graph2d: Graph2DView,
  graph3d: Graph3DView,
  voxels: VoxelView,
  architecture: ArchitectureView,
  plan: PlanWallView,
};
