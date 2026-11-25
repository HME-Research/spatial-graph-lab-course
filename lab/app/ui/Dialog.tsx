import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { domFocusScope, handleDialogKeyDown } from './concepts/dialogKeys';
import './ui.css';

export interface DialogProps {
  /** Visible title (the dialog is labelled by it). */
  readonly title: ReactNode;
  /** Optional one-line lead under the title (the dialog is described by it). */
  readonly lead?: ReactNode;
  readonly children: ReactNode;
  /** Buttons row at the bottom (right-aligned). */
  readonly footer?: ReactNode;
  /** Escape, the × button and (optionally) a backdrop click call this. */
  readonly onClose: () => void;
  /** Close on a click on the dimmed backdrop (default false, so a draft is never lost by a stray click). */
  readonly closeOnBackdrop?: boolean;
  readonly className?: string;
  /** Stable hook for tests and the smoke harness. */
  readonly dialogId?: string;
}

/**
 * Compact modal dialog for forms and confirmations (native `<dialog>` with `showModal()`, so the
 * page behind is inert and dimmed). Rendered into `document.body`, so it works from inside
 * scrolling side panels.
 *
 * Keyboard: focus moves to the first element marked `data-autofocus` (else the first focusable
 * control) on open; Tab / Shift+Tab stay inside; Escape closes. Keys never reach the window-level
 * application shortcuts (e.g. design Undo) while the dialog is open. Focus returns to the element
 * that had it before the dialog opened.
 */
export function Dialog({ title, lead, children, footer, onClose, closeOnBackdrop = false, className, dialogId }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const id = useId();
  const titleId = `${id}-title`;
  const leadId = `${id}-lead`;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const previous = el.ownerDocument.activeElement as HTMLElement | null;
    if (typeof el.showModal === 'function' && !el.open) el.showModal();
    else el.setAttribute('open', '');
    const within = (selector: string) => {
      const part = el.querySelector<HTMLElement>(selector);
      return part ? domFocusScope(part).focusable[0] : undefined;
    };
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? within('.sgl-dialog-body') ?? within('.sgl-dialog-footer') ?? domFocusScope(el).focusable[0];
    first?.focus();
    return () => {
      if (el.open && typeof el.close === 'function') el.close();
      // The page is no longer inert once the modal is closed: give focus back to the opener.
      if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.defaultPrevented && event.key === 'Escape') return; // an inner control handled it
    handleDialogKeyDown(
      {
        key: event.key,
        shiftKey: event.shiftKey,
        preventDefault: () => event.preventDefault(),
        // Stop the NATIVE event too: React dispatches from the portal container (body), so this
        // keeps keys away from the window-level shortcuts of the workspace behind the modal.
        stopPropagation: () => {
          event.stopPropagation();
          event.nativeEvent.stopPropagation();
        },
      },
      () => domFocusScope(event.currentTarget),
      () => onCloseRef.current(),
    );
  };

  const element = (
    <dialog
      ref={dialog}
      className={`sgl-dialog${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      aria-describedby={lead !== undefined ? leadId : undefined}
      aria-modal="true"
      data-dialog={dialogId}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === dialog.current) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="sgl-dialog-box">
        <header className="sgl-dialog-head">
          <h2 id={titleId} className="sgl-dialog-title">
            {title}
          </h2>
          <button type="button" className="sgl-dialog-close" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        {lead !== undefined && (
          <p id={leadId} className="sgl-dialog-lead">
            {lead}
          </p>
        )}
        <div className="sgl-dialog-body">{children}</div>
        {footer !== undefined && <div className="sgl-dialog-footer">{footer}</div>}
      </div>
    </dialog>
  );
  // Static rendering (tests, no DOM) has no portal target: render in place.
  return typeof document === 'undefined' ? element : createPortal(element, document.body);
}
