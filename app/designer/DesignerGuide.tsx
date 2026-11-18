import { useEffect, useRef, useState } from 'react';
import { CONCEPTS, ConceptDiagram, ModalDialog } from '@app/ui';

/**
 * The content of the Building Designer guide: what the panel decides, then one numbered section
 * per control in the order they appear on each function card (Walls, Windows, Layout, Roof), then where
 * the values come from. Separate from the button so it can be rendered (and tested) on its own.
 */
export function DesignerGuideContent({ titleId, descriptionId }: { readonly titleId: string; readonly descriptionId: string }) {
  const repeatStretch = CONCEPTS['repeat-stretch'];
  return (
    <div className="sgl-concept sgl-designer-guide" data-guide="designer">
      <h2 id={titleId} className="sgl-concept-title">
        Building Designer
      </h2>
      <p id={descriptionId} className="sgl-concept-lead">
        How the rooms are built in this scenario. Choose what the rooms are styled by (their Function), then give each card a look.
        Default is the look of every room without a card of its own; add a card for a function to give its rooms their own look. There
        are no settings for single rooms.
      </p>

      <section className="sgl-designer-guide-step">
        <h3>
          <span className="sgl-designer-guide-num">1</span> Façade geometry: Open, Automatic or Import
        </h3>
        <p>
          Automatic gives exterior walls with the windows set below. Open has none: combine with the roof for a pavilion (Flat), a pergola
          (Pergola) or an open terrace (None). Import replaces the exterior walls with a façade module drawn in Rhino (.3dm, one 3 m bay ×
          one storey, Front view outside): choose which side faces out, Repeat or Stretch, and Materials… for solid, glass and colours.
          Optionally import a Door bay and an Open bay module for where an open-air connector meets the room; without them those bays stay automatic.
          Walls shared with another room always stay.
        </p>
      </section>

      <section className="sgl-designer-guide-step">
        <h3>
          <span className="sgl-designer-guide-num">2</span> Windows
        </h3>
        <p>How much of each exterior wall is glass: 0 % is a closed wall, 100 % is fully glazed. Walls between rooms are not affected.</p>
      </section>

      <section className="sgl-designer-guide-step">
        <h3>
          <span className="sgl-designer-guide-num">3</span> Layout: Repeat or Stretch
        </h3>
        <p>{repeatStretch.lead}</p>
        <ConceptDiagram id="repeat-stretch" label={repeatStretch.diagramLabel} />
        <div className="sgl-concept-parts">
          {repeatStretch.parts.map((p) => (
            <div key={p.heading} className="sgl-concept-part">
              <h4>{p.heading}</h4>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sgl-designer-guide-step">
        <h3>
          <span className="sgl-designer-guide-num">4</span> Roof
        </h3>
        <p>
          Flat puts a roof only on room tops that are open to the sky, never between stacked storeys. Pergola is a roof of open slats. None
          leaves the tops open.
        </p>
      </section>

      <section className="sgl-designer-guide-step sgl-designer-guide-note">
        <h3>Defaults and reset</h3>
        <p>
          A card only changes what you set on it; everything else comes from Default, and Default starts from the project’s defaults.
          A change applies to this scenario only and is one undo step. “Clear this card” removes what the card sets; “Remove card” sends its
          rooms back to Default; “Reset Default” empties Default. The eye button lights up a card’s rooms in the Building and the Plan.
        </p>
      </section>
    </div>
  );
}

/** "How it works" button that opens the Building Designer guide as a modal pop-up. */
export function DesignerGuideButton() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
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
        className="sgl-link sgl-designer-guide-button"
        aria-haspopup="dialog"
        title="How the Building Designer works"
        onClick={() => setOpen(true)}
      >
        How it works
      </button>
      {open && (
        <ModalDialog
          className="sgl-designer-guide-dialog"
          onClose={() => {
            returnFocus.current = true;
            setOpen(false);
          }}
        >
          {(titleId, descriptionId) => <DesignerGuideContent titleId={titleId} descriptionId={descriptionId} />}
        </ModalDialog>
      )}
    </>
  );
}
