import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { proposeSpatialEdit, resolveRelationships, type DesignPort } from '@app/spatial';
import { beginDrag, endDrag, updateDraft } from '@app/views/three/editing/roomEditSession';
import { planDraft, type PlanHandle } from '@app/views/plan/planRoomEdit';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { applyDesignCommandToSession, currentDocument, openDocument, undoDocument, type DocumentSession } from './documentSession';

const H = DEFAULT_CELL_SIZE.horizontal;

const doc = expectOk(
  validateDocumentV2({
    schemaVersion: 2,
    metadata: { name: 'plan-edit-undo' },
    nodes: [
      { id: 1, position: [0, 0, 0], size: [2, 1, 1], function: 'gallery' },
      { id: 2, position: [3, 0, 0], size: [1, 1, 1], function: 'studio' },
    ],
    edges: [],
    settings: { styleBy: 'function', styles: {} },
  }),
);

/** The app's DesignPort over a real document session (one history step per command). */
function sessionHost() {
  let session: DocumentSession<DesignDocumentV2> = openDocument(doc, 'test', null);
  const port = (): DesignPort => {
    const current = currentDocument(session);
    return {
      doc: current,
      spatial: resolveRelationships(current),
      proposeEdit: (request) => proposeSpatialEdit(current, request),
      onCommand: (command) => {
        const r = applyDesignCommandToSession(session, command);
        if (!r.ok) return { ok: false, issues: r.issues };
        session = r.session;
        return { ok: true };
      },
    };
  };
  const drag = (nodeId: number, handle: PlanHandle, dx: number, dy: number) => {
    const node = currentDocument(session).nodes.find((n) => n.id === nodeId)!;
    const started = beginDrag(port(), nodeId, handle === 'move' ? 'move' : 'resize', 'x', 1);
    return endDrag(port(), updateDraft(port(), started, planDraft({ position: node.position, size: node.size }, handle, dx, dy)));
  };
  return { drag, get session() { return session; }, undo: () => void (session = undoDocument(session)) };
}

describe('Plan room edits are one undo step each, labelled like the 3D gizmo', () => {
  it('move, resize and move-and-resize each record one labelled step; Undo restores the room', () => {
    const host = sessionHost();
    host.drag(2, 'move', 1 * H, -2 * H);
    expect(host.session.history.past.at(-1)?.label).toBe('Move node 2 to [4, 2, 0]');
    host.drag(2, 'e', 1 * H, 0);
    expect(host.session.history.past.at(-1)?.label).toBe('Resize node 2 to 2×1×1');
    host.drag(2, 'sw', -1 * H, 1 * H);
    expect(host.session.history.past.at(-1)?.label).toBe('Move and resize node 2');
    expect(host.session.history.past).toHaveLength(3);

    host.undo();
    host.undo();
    host.undo();
    expect(currentDocument(host.session).nodes.find((n) => n.id === 2)).toMatchObject({ position: [3, 0, 0], size: [1, 1, 1] });
  });

  it('an invalid drop records nothing', () => {
    const host = sessionHost();
    host.drag(2, 'move', -2 * H, 0); // onto room 1
    expect(host.session.history.past).toHaveLength(0);
  });
});
