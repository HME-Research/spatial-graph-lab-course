import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { domFocusScope, handleDialogKeyDown } from './dialogKeys';
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-lead`;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (typeof el.showModal === 'function' && !el.open) el.showModal();
    else el.setAttribute('open', '');
    close.current?.focus();
    // A NATIVE listener on the dialog element: it stops every key before it can bubble to the
    // window-level shortcuts (React's own listener sits higher up, on the portal container).
    const onKeyDown = (event: KeyboardEvent) => handleDialogKeyDown(event, () => domFocusScope(el), () => onCloseRef.current());
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('keydown', onKeyDown);
      if (el.open && typeof el.close === 'function') el.close();
    };
  }, []);

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
