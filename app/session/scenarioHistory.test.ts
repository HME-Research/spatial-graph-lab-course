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

/** a–b touch (direct); c and d are on far storeys, so ac and ad are unresolved. */
const doc = (): DesignDocumentV2 =>
  expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 't' },
      nodes: [
        { id: 'a', grid: [0, 0, 0], size: [1, 3, 1], typeId: 'room' },
        { id: 'b', grid: [1, 0, 0], size: [1, 3, 1], typeId: 'room' },
        { id: 'c', grid: [5, 5, 3], typeId: 'room' },
        { id: 'd', grid: [9, 9, 6], typeId: 'room' },
      ],
      edges: [
        { id: 'ac', source: 'a', target: 'c', kind: 'access' },
        { id: 'ad', source: 'a', target: 'd', kind: 'access' },
      ],
    }),
  );

describe('remove-edges history', () => {
  it('is one labelled step, and one undo restores every removed edge', () => {
    const start = openDocument(doc(), 'test', null);
    const r = applyDesignCommandToSession(start, { type: 'remove-edges', edgeIds: ['ac', 'ad'] });
    if (!r.ok) throw new Error(r.issues.map((i) => i.message).join('; '));
    expect(currentDocument(r.session).edges).toEqual([]);
    expect(undoLabel(r.session.history)).toBe('Remove 2 invalid connections');
    const undone = undoDocument(r.session);
    expect(currentDocument(undone)).toEqual(doc());
    expect(canUndo(undone.history)).toBe(false);
  });

  it('a refused removal records nothing', () => {
    const start = openDocument(doc(), 'test', null);
    expect(applyDesignCommandToSession(start, { type: 'remove-edges', edgeIds: ['ac', 'ac'] }).ok).toBe(false);
    expect(canUndo(start.history)).toBe(false);
  });
});

describe('scenario content history', () => {
  it('add-edge-at-face is one undo step for the edge and its preference', () => {
    let session: DocumentSession<ScenarioContent> = openDocument<ScenarioContent>({ design: doc(), facePreferences: {} }, 'test', null);
    const next = expectOk(
      applyScenarioCommand(currentDocument(session), {
        type: 'add-edge-at-face',
        edge: { id: 'ab', source: 'a', target: 'b' },
        preference: { nodeId: 'a', offset: [0, 2, 0], direction: '+x' },
      }),
    );
    session = commitDocument(session, next, 'Add connection');
    expect(currentDocument(session).design.edges.map((e) => e.id)).toContain('ab');
    expect(currentDocument(session).facePreferences).toHaveProperty('ab');
    const undone = undoDocument(session);
    expect(currentDocument(undone)).toEqual({ design: doc(), facePreferences: {} });
    expect(canUndo(undone.history)).toBe(false);
  });
});
