import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { FOCUSABLE_SELECTOR, trappedFocusIndex } from '../navigation';
import { ConceptDiagram } from './ConceptDiagrams';
import { CONCEPTS, type Concept, type ConceptId } from './concepts';
import '../ui.css';

/**
 * The content of a concept dialog: title, one-sentence lead, a diagram and two short contrasting
 * parts. Separate from the dialog shell so it can be rendered (and tested) on its own.
 */
export function ConceptContent({ concept, titleId, descriptionId }: { readonly concept: Concept; readonly titleId: string; readonly descriptionId: string }) {
  return (
    <div className="sgl-concept" data-concept={concept.id}>
      <h2 id={titleId} className="sgl-concept-title">
        {concept.title}
      </h2>
      <p id={descriptionId} className="sgl-concept-lead">
        {concept.lead}
      </p>
      <ConceptDiagram id={concept.id} label={concept.diagramLabel} />
      <div className="sgl-concept-parts">
        {concept.parts.map((p) => (
          <div key={p.heading} className="sgl-concept-part">
            <h3>{p.heading}</h3>
            <p>{p.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Modal concept dialog (native `<dialog>` opened with `showModal()`, so the page behind is inert):
 * labelled by its title and described by its lead; focus moves to Close on open, Tab / Shift+Tab
 * stay inside (`trappedFocusIndex`), Escape or a click on the backdrop closes it, and the caller
 * returns focus to the button that opened it. Rendered into `document.body` (portal), so it can be
 * opened from inside headings, legends and scrolling panels.
 */
export function ConceptDialog({ concept, onClose }: { readonly concept: Concept; readonly onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-lead`;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (typeof el.showModal === 'function' && !el.open) el.showModal();
    else el.setAttribute('open', '');
    close.current?.focus();
    return () => {
      if (el.open && typeof el.close === 'function') el.close();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
    const next = trappedFocusIndex(focusable.indexOf(document.activeElement as HTMLElement), focusable.length, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    focusable[next]?.focus();
  };

  // A click on the backdrop targets the <dialog> element itself (its content is in the inner box).
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialog.current) onClose();
  };

  return createPortal(
    <dialog
      ref={dialog}
      className="sgl-concept-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      onKeyDown={onKeyDown}
      onClick={onClick}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="sgl-concept-box">
        <ConceptContent concept={concept} titleId={titleId} descriptionId={descriptionId} />
        <div className="sgl-concept-actions">
          <button ref={close} type="button" className="sgl-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

/**
 * Small `i` button that opens the concept dialog. Use sparingly: only next to a genuine concept
 * (Access/Open, Project/Scenario, Calculated values, Repeat/Stretch), never on every field.
 */
export function InfoButton({ concept: conceptId }: { readonly concept: ConceptId }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  /** Set on close; focus returns once the modal dialog is gone (a modal makes the page inert until then). */
  const returnFocus = useRef(false);
  const concept = CONCEPTS[conceptId];
  useEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    trigger.current?.focus();
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="sgl-info-button"
        aria-haspopup="dialog"
        aria-label={`About ${concept.title}`}
        title={`About ${concept.title}`}
        data-concept={conceptId}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <ConceptDialog
          concept={concept}
          onClose={() => {
            returnFocus.current = true;
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
