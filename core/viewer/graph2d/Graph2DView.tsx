import type { ViewProps } from '../contracts';
import { PlaceholderView } from '../PlaceholderView';

/** Workstream A replaces this placeholder. Keep the export name and props (docs/VIEWER-CONTRACTS.md). */
export function Graph2DView(props: ViewProps) {
  return <PlaceholderView {...props} title="Graph 2D" workstream="A" />;
}
