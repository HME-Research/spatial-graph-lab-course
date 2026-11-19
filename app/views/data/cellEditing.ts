import { createContext, type ComponentType, type ReactNode } from 'react';
import type { DesignPort } from '@app/spatial';
import type { ProjectViewContext } from '../project';

/**
 * Slot for editing one cell of the Data view's table (Programme P4, worktree G).
 *
 * The view owns the grid: which cell is being edited, focus, keyboard navigation and where a
 * message is shown. It never builds or sends a command itself. The editor is provided by the shell
 * (`app/inspector/TableCellEditor.tsx`, wired in `Workspace`) so the table reuses the SAME models
 * and command paths as Properties (attribute commands, the geometry preview → `set-node-geometry`,
 * readable refusal messages), which the views layer may not import. Without a provider the table
 * is read-only. The JSON text never edits.
 */

/** Where keyboard focus goes when editing ends: the edited cell, the next / previous editable cell, or nowhere (a click elsewhere). */
export type CellMove = 'stay' | 'next' | 'previous' | 'none';

export interface CellEditorProps {
  readonly design: DesignPort;
  readonly project: ProjectViewContext | undefined;
  readonly collection: 'nodes' | 'edges';
  readonly itemId: number;
  /** A column id of `dataModel.ts`: `function`, `relationship`, `position-x` … `floors`, `custom:<fieldId>`. */
  readonly columnId: string;
  /** Column label, for the control's accessible name. */
  readonly label: string;
  /** A character typed on the focused cell: editing starts with it (replacing the value). */
  readonly initialText?: string;
  /**
   * Editing ended (committed, refused or cancelled); the cell shows the stored value again.
   * Called exactly once.
   */
  readonly onClose: (move: CellMove) => void;
  /** Show a message about the edit (why it was refused, or a corridor confirmation); null clears it. */
  readonly onFeedback: (feedback: ReactNode | null) => void;
}

export const DataCellEditorContext = createContext<ComponentType<CellEditorProps> | null>(null);
