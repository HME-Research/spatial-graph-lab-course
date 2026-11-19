import type { ComponentType } from 'react';
import type { GraphIssue } from '@app/document';
import type { DesignPort } from '@app/spatial';
import type { Selection, SelectionHandler } from '@core/viewer/selection';
import type { ProjectViewContext } from './project';

export type { SelectionHandler } from '@core/viewer/selection';

/**
 * Integration contract shared by every view (Graph 2D, Graph 3D, Voxels, Architecture) and the
 * inspector. See docs/VIEWER-CONTRACTS.md. Changing this file needs owner coordination.
 */

/** Result of asking the app to apply a command; `issues` are readable validation errors. */
export type CommandOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly GraphIssue[] };

/**
 * Props every view receives. The document is read-only input (`design.doc`); views never mutate or
 * copy it as state, and change it only through `design.onCommand` (P4: the design port is the only
 * source; there is no other document or command handler).
 */
export interface ViewProps {
  /** The live design port (docs/CONTRACTS-V2.md §6): document, resolution and the command path. */
  readonly design: DesignPort;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
  /**
   * Active-project information (node types, conformance, façades). Optional and read-only:
   * without it a view behaves exactly as before projects existed.
   */
  readonly project?: ProjectViewContext;
}

export type ViewComponent = ComponentType<ViewProps>;

/** The inspector uses the same props as a view. */
export type InspectorProps = ViewProps;

/**
 * Six view modes (Gate F; `data` added in P4). `plan` is the architectural floor plan of one storey
 * (workstream C, `app/views/plan`: an SVG drawn from the shared face layout,
 * `svg[data-view-surface="plan"]`). `data` shows the same graph as JSON text and as tables
 * (`app/views/data`, `[data-view-surface="data"]`): no picture, no camera, no display settings.
 * Graph 2D keeps its non-spatial diagram meaning.
 */
export const VIEW_MODES = ['graph2d', 'graph3d', 'voxels', 'architecture', 'plan', 'data'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const VIEW_MODE_LABELS: Readonly<Record<ViewMode, string>> = {
  graph2d: 'Graph 2D',
  graph3d: 'Graph 3D',
  voxels: 'Voxels',
  architecture: 'Building',
  plan: 'Plan',
  data: 'Data',
};
