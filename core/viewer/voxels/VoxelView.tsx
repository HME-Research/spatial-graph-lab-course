import type { ViewProps } from '../contracts';
import { PlaceholderView } from '../PlaceholderView';

/** Workstream B replaces this placeholder. Keep the export name and props (docs/VIEWER-CONTRACTS.md). */
export function VoxelView(props: ViewProps) {
  return <PlaceholderView {...props} title="Voxels" workstream="B" />;
}
