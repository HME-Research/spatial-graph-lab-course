import type { ViewProps } from '../contracts';
import { PlaceholderView } from '../PlaceholderView';

/** Workstream C replaces this placeholder. Keep the export name and props (docs/VIEWER-CONTRACTS.md). */
export function ArchitectureView(props: ViewProps) {
  return <PlaceholderView {...props} title="Architecture" workstream="C" />;
}
