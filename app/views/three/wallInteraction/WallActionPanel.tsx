import { useEffect, useRef, useState } from 'react';
import type { BuildingFace } from '@app/building';
import type { GraphIssue } from '@app/document';
import type { RelationshipKind } from '@app/document/v2';
import type { DesignPort } from '@app/spatial';
import { selectEdge, type SelectionHandler } from '@core/viewer/selection';
import {
  addRelationshipCommand,
  changeKindCommand,
  moveDoorHereCommand,
  removeRelationshipCommand,
  selectionAfterRemove,
  wallPanelModel,
  type WallCommand,
  type WallPanel,
} from './wallPanelModel';
import './wallPanel.css';

/**
 * The shared-wall panel (wave 2, D), used by the Building and Plan views. It is recomputed from the
 * CURRENT design on every render, so it always describes the wall as it is now (after an undo, a
 * move or an edit elsewhere). Every button sends exactly one command through the design port (one
 * undo step); the panel itself stores nothing but whether the Add choices are expanded.
 */
export function WallActionPanel({
  design,
  faceId,
  faces,
  onSelect,
  onClose,
  className,
}: {
  readonly design: DesignPort;
  readonly faceId: string;
  /** Faces of the current design (`resolveBuildingFaces` / `BuildingModelV2.faces`), by id. */
  readonly faces: ReadonlyMap<string, BuildingFace>;
  readonly onSelect: SelectionHandler;
  readonly onClose: () => void;
  readonly className?: string;
}) {
  const panel = wallPanelModel(faceId, faces, design.doc, design.spatial);
  const [choosing, setChoosing] = useState(false);
  const [issues, setIssues] = useState<readonly GraphIssue[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A different wall: collapse the choices and forget old messages; focus the panel for keyboard users.
    setChoosing(false);
    setIssues([]);
    ref.current?.focus({ preventScroll: true });
  }, [faceId]);

  const send = (c: WallCommand): boolean => {
    const outcome =
      c.port === 'design'
        ? design.onCommand(c.command)
        : design.onScenarioCommand
          ? design.onScenarioCommand(c.command)
          : { ok: false as const, issues: [{ path: [], code: 'schema' as const, message: 'This host cannot store the chosen wall.' }] };
    setIssues(outcome.ok ? [] : outcome.issues);
    return outcome.ok;
  };
  const add = (kind: RelationshipKind) => {
    if (panel.kind !== 'add') return;
    const { edgeId, command } = addRelationshipCommand(panel, kind, design.doc);
    if (send(command)) {
      setChoosing(false);
      onSelect(selectEdge(edgeId));
    }
  };
  const canPlaceDoor = design.onScenarioCommand !== undefined;
  const title = panel.kind === 'unavailable' ? 'Wall' : `Wall between ${panel.rooms[0].label} and ${panel.rooms[1].label}`;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={`sgl-wall-panel${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-label={title}
      data-wall-face={faceId}
      data-wall-state={panel.kind}
      data-wall-edge={panel.kind === 'existing' ? panel.edgeId : undefined}
      data-wall-opening={panel.kind === 'existing' ? panel.opening : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="sgl-wall-head">
        <strong>{title}</strong>
        <button type="button" className="sgl-wall-close" onClick={onClose} aria-label="Close the wall panel" title="Close (Esc)">
          ×
        </button>
      </div>

      {panel.kind === 'unavailable' && <p>{panel.message}</p>}

      {panel.kind === 'add' && (
        <>
          <p>
            {panel.rooms[0].label} ({panel.rooms[0].typeId}) and {panel.rooms[1].label} ({panel.rooms[1].typeId}) have no relationship:
            a solid wall separates them.
          </p>
          {!choosing ? (
            <button type="button" className="sgl-wall-primary" onClick={() => setChoosing(true)} aria-expanded={false}>
              Add relationship…
            </button>
          ) : (
            <div className="sgl-wall-choices" role="group" aria-label="Add relationship">
              <button
                type="button"
                onClick={() => add('access')}
                disabled={!canPlaceDoor}
                title={canPlaceDoor ? 'People can pass: a door on THIS wall' : 'This host cannot store the chosen wall'}
              >
                Access <span className="sgl-wall-hint">door on this wall</span>
              </button>
              <button type="button" onClick={() => add('open')} title="The rooms flow into each other: the shared wall is removed">
                Open <span className="sgl-wall-hint">no wall</span>
              </button>
              <button type="button" className="sgl-wall-link" onClick={() => setChoosing(false)}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      {panel.kind === 'existing' && <ExistingBody panel={panel} send={send} canPlaceDoor={canPlaceDoor} onSelect={onSelect} />}

      {issues.length > 0 && (
        <ul className="sgl-wall-issues" role="alert">
          {issues.map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExistingBody({
  panel,
  send,
  canPlaceDoor,
  onSelect,
}: {
  readonly panel: Extract<WallPanel, { kind: 'existing' }>;
  readonly send: (c: WallCommand) => boolean;
  readonly canPlaceDoor: boolean;
  readonly onSelect: SelectionHandler;
}) {
  const kind = panel.relationshipKind === 'access' ? 'Access' : 'Open';
  const other: RelationshipKind = panel.relationshipKind === 'access' ? 'open' : 'access';
  const where =
    panel.opening === 'here'
      ? panel.relationshipKind === 'access'
        ? 'The door is on this wall.'
        : 'This wall is open.'
      : panel.opening === 'elsewhere'
        ? 'The door is on another wall these rooms share.'
        : 'Nothing is built for it.';
  const moveDoor = moveDoorHereCommand(panel);
  return (
    <>
      <p>
        <button type="button" className="sgl-wall-link" onClick={() => onSelect(selectEdge(panel.edgeId))} title="Select this relationship (Properties)">
          {kind} relationship
        </button>{' '}
        · <span className={`sgl-wall-status ${panel.status}`}>{panel.statusLabel}</span>. {where}
      </p>
      {panel.reasonText && <p className="sgl-wall-reason">{panel.reasonText}</p>}
      <div className="sgl-wall-choices">
        {moveDoor && (
          <button type="button" className="sgl-wall-primary" onClick={() => send(moveDoor)} disabled={!canPlaceDoor}>
            Put the door on this wall
          </button>
        )}
        <button type="button" onClick={() => send(changeKindCommand(panel, other))} title={`Change this relationship to ${other === 'open' ? 'Open' : 'Access'}`}>
          Change to {other === 'open' ? 'Open' : 'Access'}
        </button>
        <button
          type="button"
          className="sgl-wall-danger"
          onClick={() => {
            // The removed edge must not stay selected (I2): select the owner room, as a click on this now-free wall would.
            if (send(removeRelationshipCommand(panel))) onSelect(selectionAfterRemove(panel));
          }}
          title="Remove this relationship (Ctrl/⌘+Z undoes it)"
        >
          Remove relationship
        </button>
      </div>
    </>
  );
}
