import { describe, expect, it } from 'vitest';
import { validateDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { duplicateRoomRequest } from '@app/spatial';
import { applyDesignCommandToSession, currentDocument, openDocument, redoDocument, undoDocument } from './documentSession';
import { redoLabel, undoLabel } from './history';

const doc = expectOk(
  validateDocumentV2({
    schemaVersion: 2,
    metadata: { name: 'dup' },
    nextNodeId: 5,
    nextEdgeId: 4,
    nodes: [
      { id: 1, position: [0, 0, 0], size: [2, 1, 1], function: 'gallery', custom: { public: true } },
      { id: 4, position: [2, 0, 0], function: 'studio', custom: {} },
    ],
    edges: [{ id: 3, source: 1, target: 4, relationship: 'access', custom: {} }],
    diagram: { positions: { 1: [0, 0], 4: [200, 0] } },
  }),
);

describe('Duplicate room in the history', () => {
  it('is one undo step labelled "Duplicate room 1 as room 5"; redo restores the copy', () => {
    const r = duplicateRoomRequest(doc, 1);
    if (r.status !== 'command') throw new Error(r.message);
    const outcome = applyDesignCommandToSession(openDocument(doc, 'test', null), r.command);
    if (!outcome.ok) throw new Error(outcome.issues.map((i) => i.message).join('; '));
    expect(outcome.session.history.past).toHaveLength(1);
    expect(undoLabel(outcome.session.history)).toBe('Duplicate room 1 as room 5');
    const undone = undoDocument(outcome.session);
    expect(currentDocument(undone)).toEqual(doc);
    expect(redoLabel(undone.history)).toBe('Duplicate room 1 as room 5');
    const redone = currentDocument(redoDocument(undone));
    expect(redone.nodes.map((n) => n.id)).toEqual([1, 4, 5]);
    expect(redone.edges).toEqual(doc.edges);
  });
});
