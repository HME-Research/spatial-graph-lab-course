import { FOCUSABLE_SELECTOR, trappedFocusIndex } from '../navigation';

/** The parts of a native KeyboardEvent the dialog handler uses (a real event satisfies it). */
export interface DialogKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

/** The dialog's focusable elements, in DOM order, and which of them has focus (index, or -1). */
export interface DialogFocusScope {
  readonly focusable: readonly { focus(): void }[];
  readonly activeIndex: number;
}

/**
 * Native `keydown` handler of a modal concept dialog, attached to the `<dialog>` element itself.
 *
 * - EVERY key stops propagating at the dialog, so no application shortcut (e.g. the window-level
 *   Ctrl/Cmd+Z / Ctrl+Y undo listener in App) acts on the design behind an open modal.
 * - Escape closes (default prevented, so the browser's own `cancel` does not fire as well).
 * - Tab / Shift+Tab move focus among the dialog's focusable elements and wrap (focus trap).
 * Pure apart from the calls it makes on its arguments (tested with fakes; no DOM needed).
 */
export function handleDialogKeyDown(event: DialogKeyEvent, scope: () => DialogFocusScope, onClose: () => void): void {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;
  const { focusable, activeIndex } = scope();
  const next = trappedFocusIndex(activeIndex, focusable.length, event.shiftKey);
  event.preventDefault();
  if (next !== null) focusable[next]?.focus();
}

/** The focus scope of a real dialog element. */
export function domFocusScope(container: HTMLElement): DialogFocusScope {
  const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
  return { focusable, activeIndex: focusable.indexOf(container.ownerDocument.activeElement as HTMLElement) };
}
