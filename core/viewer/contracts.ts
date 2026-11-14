import type { ComponentType } from 'react';
import type { DesignDocument, GraphCommand, GraphIssue } from '../graph';
import type { Selection } from './selection';

/**
 * Integration contract shared by every view (Graph 2D, Graph 3D, Voxels, Architecture) and the
 * inspector. See docs/VIEWER-CONTRACTS.md. Changing this file needs owner coordination.
 */

/** Result of asking the app to apply a command; `issues` are readable validation errors. */
export type CommandOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly GraphIssue[] };

/**
 * Ask the app to change the document. Synchronous: the outcome reflects validation against the
 * latest document. On failure the document is unchanged. Read-only views never call it.
 */
export type GraphCommandHandler = (command: GraphCommand) => CommandOutcome;

/** Replace the shared selection. Pass NO_SELECTION to clear. */
export type SelectionHandler = (selection: Selection) => void;

/** Props every view receives. The document is read-only input; views never mutate or copy it as state. */
export interface ViewProps {
  readonly doc: DesignDocument;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
  readonly onCommand: GraphCommandHandler;
}

export type ViewComponent = ComponentType<ViewProps>;

/** The inspector uses the same props as a view. */
export type InspectorProps = ViewProps;

export const VIEW_MODES = ['graph2d', 'graph3d', 'voxels', 'architecture'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const VIEW_MODE_LABELS: Readonly<Record<ViewMode, string>> = {
  graph2d: 'Graph 2D',
  graph3d: 'Graph 3D',
  voxels: 'Voxels',
  architecture: 'Architecture',
};
