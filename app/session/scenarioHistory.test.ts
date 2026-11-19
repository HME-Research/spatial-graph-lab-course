import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { applyScenarioCommand, type ScenarioContent } from '@app/spatial';
import { canUndo, undoLabel } from './history';
import {
  applyDesignCommandToSession,
  commitDocument,
  currentDocument,
  openDocument,
  undoDocument,
  type DocumentSession,
} from './documentSession';

/** a=1, b=2 touch (direct); c=3 and d=4 are on far storeys, so ac=1 and ad=2 are unresolved. */
const doc = (): DesignDocumentV2 =>
  expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 't' },
      nodes: [
        { id: 1, position: [0, 0, 0], size: [1, 3, 1], function: 'room' },
        { id: 2, position: [1, 0, 0], size: [1, 3, 1], function: 'room' },
        { id: 3, position: [5, 5, 3], function: 'room' },
        { id: 4, position: [9, 9, 6], function: 'room' },
      ],
      edges: [
        { id: 1, source: 1, target: 3, relationship: 'access' },
        { id: 2, source: 1, target: 4, relationship: 'access' },
      ],
    }),
  );

describe('remove-edges history', () => {
  it('is one labelled step, and one undo restores every removed edge', () => {
    const start = openDocument(doc(), 'test', null);
    const r = applyDesignCommandToSession(start, { type: 'remove-edges', edgeIds: [1, 2] });
    if (!r.ok) throw new Error(r.issues.map((i) => i.message).join('; '));
    expect(currentDocument(r.session).edges).toEqual([]);
    expect(undoLabel(r.session.history)).toBe('Remove 2 invalid connections');
    const undone = undoDocument(r.session);
    expect(currentDocument(undone)).toEqual(doc());
    expect(canUndo(undone.history)).toBe(false);
  });

  it('a refused removal records nothing', () => {
    const start = openDocument(doc(), 'test', null);
    expect(applyDesignCommandToSession(start, { type: 'remove-edges', edgeIds: [1, 1] }).ok).toBe(false);
    expect(canUndo(start.history)).toBe(false);
  });
});

describe('scenario content history', () => {
  it('add-edge-at-face is one undo step for the edge and its preference', () => {
    let session: DocumentSession<ScenarioContent> = openDocument<ScenarioContent>({ design: doc(), facePreferences: {} }, 'test', null);
    const next = expectOk(
      applyScenarioCommand(currentDocument(session), {
        type: 'add-edge-at-face',
        edge: { source: 1, target: 2 },
        preference: { nodeId: 1, offset: [0, 2, 0], direction: '+x' },
      }),
    );
    session = commitDocument(session, next, 'Add connection');
    expect(currentDocument(session).design.edges.map((e) => e.id)).toContain(3) // the new edge gets nextEdgeId;
    expect(currentDocument(session).facePreferences).toHaveProperty('3');
    const undone = undoDocument(session);
    expect(currentDocument(undone)).toEqual({ design: doc(), facePreferences: {} });
    expect(canUndo(undone.history)).toBe(false);
  });
});
