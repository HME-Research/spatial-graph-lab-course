/**
 * Generic snapshot history (undo/redo). Pure and immutable: every function returns a new history
 * or the very same object when nothing changes, and never mutates its input, so it is safe to call
 * from React state updates (including StrictMode's double invocation).
 *
 * Snapshots are stored, not inverse commands: undo returns the exact earlier value.
 */

/** Previous entries kept; older ones are dropped. */
export const HISTORY_LIMIT = 100;

/** An earlier (or later) value and the label of the action that leads from it towards `present`. */
export interface HistoryStep<T> {
  readonly value: T;
  /** Human-readable action label, e.g. "Add node node-3", or null when none was given. */
  readonly label: string | null;
}

export interface History<T> {
  /** Oldest first; the last step is what Undo returns to. */
  readonly past: readonly HistoryStep<T>[];
  readonly present: T;
  /** Nearest first; the first step is what Redo returns to. */
  readonly future: readonly HistoryStep<T>[];
}

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/**
 * Record a successful modification. A no-op (`equals(present, next)`) returns the same history
 * object. Recording after an undo starts a new branch: the redo steps are discarded.
 */
export function record<T>(
  history: History<T>,
  next: T,
  label: string | null = null,
  equals: (a: T, b: T) => boolean = Object.is,
  limit: number = HISTORY_LIMIT,
): History<T> {
  if (equals(history.present, next)) return history;
  const past = [...history.past, { value: history.present, label }];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, present: next, future: [] };
}

/** Step back once; the same history when there is nothing to undo. */
export function undo<T>(history: History<T>): History<T> {
  const step = history.past[history.past.length - 1];
  if (!step) return history;
  return {
    past: history.past.slice(0, -1),
    present: step.value,
    future: [{ value: history.present, label: step.label }, ...history.future],
  };
}

/** Step forward once; the same history when there is nothing to redo. */
export function redo<T>(history: History<T>): History<T> {
  const step = history.future[0];
  if (!step) return history;
  return {
    past: [...history.past, { value: history.present, label: step.label }],
    present: step.value,
    future: history.future.slice(1),
  };
}

export const canUndo = (history: History<unknown>): boolean => history.past.length > 0;
export const canRedo = (history: History<unknown>): boolean => history.future.length > 0;

/** Label of the action Undo would revert. */
export const undoLabel = (history: History<unknown>): string | null => history.past[history.past.length - 1]?.label ?? null;
/** Label of the action Redo would repeat. */
export const redoLabel = (history: History<unknown>): string | null => history.future[0]?.label ?? null;
