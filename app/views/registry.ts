import { ArchitectureView } from './architecture/ArchitectureView';
import type { ViewComponent, ViewMode } from './contracts';
import { Graph2DView } from './graph2d/Graph2DView';
import { Graph3DView } from './graph3d/Graph3DView';
import { VoxelView } from './voxels/VoxelView';

/** Mode → component. Workstreams replace the component files, not this map. */
export const VIEW_COMPONENTS: Readonly<Record<ViewMode, ViewComponent>> = {
  graph2d: Graph2DView,
  graph3d: Graph3DView,
  voxels: VoxelView,
  architecture: ArchitectureView,
};
