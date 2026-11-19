import { describe, expect, it } from 'vitest';
import { applyDesignCommand } from '@app/spatial';
import { type DesignDocumentV2, validateDocumentV2 } from '@app/document';
import exampleDesign from '../../document/test-designs/two-storey.json';
import { expectOk, threeRooms, threeRoomsRaw } from '@app/document/test-fixtures';
import {
  rectBorderPoint,
  resolveDiagramPositions,
  suggestDiagramPosition,
} from './diagram';

const example = (): DesignDocumentV2 => expectOk(validateDocumentV2(exampleDesign));

function withoutPositions(ids: readonly number[]): DesignDocumentV2 {
  const raw = threeRoomsRaw();
  for (const id of ids) delete raw.diagram.positions[id];
  return expectOk(validateDocumentV2(raw));
}

describe('resolveDiagramPositions', () => {
  it('uses stored diagram positions unchanged for every node', () => {
    const doc = example();
    const positions = resolveDiagramPositions(doc);
    expect(positions.size).toBe(doc.nodes.length);
    for (const node of doc.nodes) expect(positions.get(node.id)).toEqual(doc.diagram.positions[node.id]);
  });

  it('gives missing nodes deterministic, distinct fallbacks below the stored layout, without writing the document', () => {
    const doc = withoutPositions([2, 3]);
    const snapshot = JSON.stringify(doc);
    const first = resolveDiagramPositions(doc);
    const second = resolveDiagramPositions(expectOk(validateDocumentV2(JSON.parse(snapshot))));
    expect(first.get(2)).toEqual(second.get(2));
    expect(first.get(3)).toEqual(second.get(3));
    expect(first.get(2)).not.toEqual(first.get(3));
    expect(first.get(2)![1]).toBeGreaterThan(80); // below the stored node 1 at y = 80
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it('fallbacks do not depend on grid cells (moving a node in space does not move it in the diagram)', () => {
    const doc = withoutPositions([2]);
    const moved = expectOk(applyDesignCommand(doc, { type: 'remove-edge', edgeId: 1 }));
    const relocated = expectOk(applyDesignCommand(moved, { type: 'set-node-geometry', nodeId: 2, position: [5, 5, 3] }));
    expect(resolveDiagramPositions(relocated).get(2)).toEqual(resolveDiagramPositions(doc).get(2));
  });

  it('lays out a document with no stored positions from the origin', () => {
    const positions = resolveDiagramPositions(withoutPositions([1, 2, 3]));
    expect(positions.get(1)).toEqual([0, 0]);
    expect(new Set([...positions.values()].map((p) => p.join(','))).size).toBe(3);
  });
});

describe('diagram drag command', () => {
  it('set-diagram-position changes only the diagram, never the spatial cell (acceptance B)', () => {
    const doc = threeRooms();
    const next = expectOk(applyDesignCommand(doc, { type: 'set-diagram-position', nodeId: 2, position: [400, -20] }));
    expect(next.diagram.positions[2]).toEqual([400, -20]);
    expect(next.nodes).toEqual(doc.nodes);
    expect(next.edges).toEqual(doc.edges);
  });
});

describe('new node and edge ids', () => {
  it('come from the document counters and are never reused after a delete', () => {
    const doc = threeRooms();
    expect(doc.nextNodeId).toBe(4);
    expect(doc.nextEdgeId).toBe(3);
    const added = expectOk(
      applyDesignCommand(doc, { type: 'add-node', node: { position: [3, 0, 0], function: 'studio' }, diagramPosition: [300, 80] }),
    );
    expect(added.nodes.map((n) => n.id)).toEqual([1, 2, 3, 4]);
    expect(added.diagram.positions[4]).toEqual([300, 80]);
    expect(added.nextNodeId).toBe(5);
    const removed = expectOk(applyDesignCommand(added, { type: 'remove-node', nodeId: 4 }));
    const again = expectOk(applyDesignCommand(removed, { type: 'add-node', node: { position: [3, 0, 0], function: 'studio' } }));
    expect(again.nodes.map((n) => n.id)).toEqual([1, 2, 3, 5]);
    const edge = expectOk(applyDesignCommand(again, { type: 'add-edge', edge: { source: 2, target: 3 } }));
    expect(edge.edges.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(edge.nextEdgeId).toBe(4);
  });
});

describe('suggestDiagramPosition', () => {
  it('does not overlap existing nodes', () => {
    const doc = example();
    const taken = [...resolveDiagramPositions(doc).values()];
    for (const near of [undefined, 1, 4]) {
      const p = suggestDiagramPosition(doc, near);
      expect(taken.some((q) => Math.abs(q[0] - p[0]) < 150 && Math.abs(q[1] - p[1]) < 64)).toBe(false);
    }
  });
});

describe('rectBorderPoint', () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 };
  it('hits the right, bottom and corner borders', () => {
    expect(rectBorderPoint(rect, [300, 25])).toEqual([100, 25]);
    expect(rectBorderPoint(rect, [50, 200])).toEqual([50, 50]);
    expect(rectBorderPoint(rect, [150, 75])).toEqual([100, 50]);
  });
  it('returns the centre when the target is the centre', () => {
    expect(rectBorderPoint(rect, [50, 25])).toEqual([50, 25]);
  });
});
