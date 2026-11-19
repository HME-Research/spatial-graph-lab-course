import { describe, expect, it } from 'vitest';
import { applyDesignCommand } from '@app/spatial';
import { expectOk, threeRooms } from '@app/document/test-fixtures';
import { NO_SELECTION, reconcileSelection, selectEdge, selectNode } from '@core/viewer/selection';

describe('selection against the design document', () => {
  it('reconcileSelection keeps valid selections by identity and drops removed ones', () => {
    const doc = threeRooms();
    const sel = selectNode(1);
    expect(reconcileSelection(sel, doc)).toBe(sel);
    expect(reconcileSelection(sel, expectOk(applyDesignCommand(doc, { type: 'remove-node', nodeId: 1 })))).toBe(NO_SELECTION);
    const edge = selectEdge(1);
    expect(reconcileSelection(edge, doc)).toBe(edge);
    expect(reconcileSelection(edge, expectOk(applyDesignCommand(doc, { type: 'remove-edge', edgeId: 1 })))).toBe(NO_SELECTION);
  });
});
