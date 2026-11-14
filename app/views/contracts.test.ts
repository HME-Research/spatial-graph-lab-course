import { describe, expect, it } from 'vitest';
import { removeEdge, removeNode } from '@app/document';
import { expectOk, threeRooms } from '@app/document/test-fixtures';
import { NO_SELECTION, reconcileSelection, selectEdge, selectNode } from '@core/viewer/selection';

describe('selection against the design document', () => {
  it('reconcileSelection keeps valid selections by identity and drops removed ones', () => {
    const doc = threeRooms();
    const sel = selectNode('a');
    expect(reconcileSelection(sel, doc)).toBe(sel);
    expect(reconcileSelection(sel, expectOk(removeNode(doc, 'a')))).toBe(NO_SELECTION);
    const edge = selectEdge('ab');
    expect(reconcileSelection(edge, doc)).toBe(edge);
    expect(reconcileSelection(edge, expectOk(removeEdge(doc, 'ab')))).toBe(NO_SELECTION);
  });
});
