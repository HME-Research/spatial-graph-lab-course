import { currentDocument } from '@app/session/documentSession';
import { canRedo, canUndo } from '@app/session/history';
import { isExported, type OpenProject } from '@app/session/projectStore';
import type { ControllerState } from '@app/session/projectStoreController';

/** Pure view models for the Scenarios panel and the save indicator (workstream B). */

export interface ScenarioRow {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly rooms: number;
  readonly relationships: number;
  /** Edits that Undo can revert in this scenario (this session only). */
  readonly undoSteps: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export function scenarioRows(project: OpenProject): ScenarioRow[] {
  return project.scenarios.map((s) => {
    const { design } = currentDocument(s.session);
    return {
      id: s.id,
      name: s.name,
      active: s.id === project.activeScenarioId,
      rooms: design.nodes.length,
      relationships: design.edges.length,
      undoSteps: s.session.history.past.length,
      canUndo: canUndo(s.session.history),
      canRedo: canRedo(s.session.history),
    };
  });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const scenarioSummary = (row: ScenarioRow): string => `${plural(row.rooms, 'room')}, ${plural(row.relationships, 'connection')}`;

export type SaveAction = 'retry' | 'overwrite' | 'save-as';

export interface SaveStatusView {
  readonly tone: 'ok' | 'busy' | 'error';
  /** Short text for the indicator. */
  readonly text: string;
  /** Optional longer explanation (blocked reason, export state). */
  readonly detail: string | null;
  readonly actions: readonly SaveAction[];
}

/**
 * The local save indicator. Local saving and exporting are separate: "not exported" is a neutral
 * note, never a warning; a blocked save is an error and never reads as saved.
 */
export function saveStatusView(state: Pick<ControllerState, 'project' | 'save'>): SaveStatusView | null {
  const { project, save } = state;
  if (!project) return null;
  switch (save.local) {
    case 'saved':
      return {
        tone: 'ok',
        text: 'Saved in this browser',
        detail: isExported(project) ? 'The exported file is up to date.' : 'Use Export Project to keep a file copy.',
        actions: [],
      };
    case 'pending':
    case 'saving':
      return { tone: 'busy', text: 'Saving…', detail: null, actions: [] };
    case 'blocked': {
      const actions: SaveAction[] =
        save.reason === 'conflict' ? ['save-as', 'overwrite'] : save.reason === 'refused-unreadable' ? ['save-as'] : ['retry', 'save-as'];
      return { tone: 'error', text: 'Not saved', detail: save.message, actions };
    }
  }
}

export const SAVE_ACTION_LABELS: Readonly<Record<SaveAction, string>> = {
  retry: 'Try again',
  overwrite: 'Overwrite',
  'save-as': 'Save As New Project',
};
