/**
 * Undo/redo keyboard shortcuts, as pure functions of the key event's fields (testable without a
 * DOM). Ctrl+Z / Cmd+Z undo; Ctrl+Shift+Z / Cmd+Shift+Z and Ctrl+Y redo. Shortcuts inside text
 * fields are left to the browser, so native text undo keeps working there.
 */

export type HistoryShortcut = 'undo' | 'redo';

/** The fields of a KeyboardEvent this module reads. */
export interface ShortcutKey {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly isComposing?: boolean;
  readonly defaultPrevented?: boolean;
}

/** The fields of an event target this module reads (an Element, or anything else). */
export interface ShortcutTarget {
  readonly tagName?: string;
  readonly type?: string;
  readonly isContentEditable?: boolean;
}

/** Input types that do not hold editable text, so the app's shortcuts may apply while focused. */
const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

/** True when the target has its own text undo: text inputs, textareas and contenteditable elements. */
export function isEditableTarget(target: ShortcutTarget | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tag = target.tagName?.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((target.type ?? 'text').toLowerCase());
  return false;
}

/** The history action a key event asks for, or null (including inside editable targets). */
export function historyShortcut(event: ShortcutKey, target: ShortcutTarget | null | undefined): HistoryShortcut | null {
  if (event.defaultPrevented || event.isComposing || event.altKey) return null;
  if (isEditableTarget(target)) return null;
  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  if (!command) return null;
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) return 'redo';
  return null;
}

/** True on Apple platforms, where the shortcuts use ⌘ instead of Ctrl. */
export const isApplePlatform = (platform: string): boolean => /Mac|iPhone|iPad|iPod/i.test(platform);

/** The shortcut text shown in the Undo/Redo tooltips. */
export function shortcutText(action: HistoryShortcut, apple: boolean): string {
  if (apple) return action === 'undo' ? '⌘Z' : '⇧⌘Z';
  return action === 'undo' ? 'Ctrl+Z' : 'Ctrl+Y or Ctrl+Shift+Z';
}

/** Tooltip and accessible label of an Undo/Redo button: what it would do, or why it is disabled. */
export function historyButtonTitle(action: HistoryShortcut, available: boolean, label: string | null, apple: boolean): string {
  const verb = action === 'undo' ? 'Undo' : 'Redo';
  if (!available) return `${verb}: nothing to ${action}`;
  return `${verb}${label ? `: ${label}` : ''} (${shortcutText(action, apple)})`;
}
