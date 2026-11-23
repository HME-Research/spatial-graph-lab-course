import { describe, expect, it } from 'vitest';
import { applyDesignCommand, resolveRelationships } from '@app/spatial';
import { dragStopCommand, modelFromV2 } from './diagramModel';
import { type DesignDocumentV2, layoutAddedDiagramNodes, validateDocumentV2 } from '@app/document';
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

  /** A design whose 13 nodes have no stored diagram position (like an algorithm's output). */
  function unplaced(count = 13): DesignDocumentV2 {
    let doc = withoutPositions([1, 2, 3]);
    for (let i = 0; doc.nodes.length < count; i++) {
      doc = expectOk(applyDesignCommand(doc, { type: 'add-node', node: { position: [10 + i, 0, 0], function: 'studio' } }));
    }
    expect(Object.keys(doc.diagram.positions)).toEqual([]);
    return doc;
  }

  it('dragging one unplaced node never moves any other node (2026-11-23 regression)', () => {
    let doc = unplaced();
    // Several drags in a row: each moves only the dragged node.
    for (const [nodeId, position] of [[3, [400, -50]], [7, [-200, 900]], [1, [55, 55]]] as const) {
      const before = resolveDiagramPositions(doc);
      doc = expectOk(applyDesignCommand(doc, { type: 'set-diagram-position', nodeId, position: [position[0], position[1]] }));
      const after = resolveDiagramPositions(doc);
      for (const node of doc.nodes) {
        expect(after.get(node.id)).toEqual(node.id === nodeId ? position : before.get(node.id));
      }
    }
  });

  it('adding a node at a diagram position never moves the unplaced nodes', () => {
    const doc = unplaced();
    const before = resolveDiagramPositions(doc);
    const next = expectOk(
      applyDesignCommand(doc, { type: 'add-node', node: { position: [0, 9, 0], function: 'studio' }, diagramPosition: [-500, -500] }),
    );
    const after = resolveDiagramPositions(next);
    for (const node of doc.nodes) expect(after.get(node.id)).toEqual(before.get(node.id));
    expect(after.get(doc.nextNodeId)).toEqual([-500, -500]);
  });
});

describe('multi-selection commands (2026-11-23)', () => {
  it('remove-items deletes rooms with all their relationships, and relationships, in one step', () => {
    const doc = threeRooms();
    const next = expectOk(applyDesignCommand(doc, { type: 'remove-items', nodeIds: [2], edgeIds: [2] }));
    expect(next.nodes.map((n) => n.id)).toEqual([1, 3]);
    expect(next.edges).toEqual([]); // edge 1 went with room 2, edge 2 was selected
    expect(next.diagram.positions[2]).toBeUndefined();
  });

  it('remove-items and set-nodes-type refuse an empty or unknown selection without change', () => {
    const doc = threeRooms();
    expect(applyDesignCommand(doc, { type: 'remove-items', nodeIds: [], edgeIds: [] }).ok).toBe(false);
    expect(applyDesignCommand(doc, { type: 'remove-items', nodeIds: [1], edgeIds: [99] }).ok).toBe(false);
    expect(applyDesignCommand(doc, { type: 'set-nodes-type', nodeIds: [1, 42], function: 'studio' }).ok).toBe(false);
  });

  it('set-nodes-type gives every listed room the Function and nothing else', () => {
    const doc = threeRooms();
    const next = expectOk(applyDesignCommand(doc, { type: 'set-nodes-type', nodeIds: [1, 3], function: 'studio' }));
    expect(next.nodes.map((n) => n.function)).toEqual(['studio', doc.nodes[1]!.function, 'studio']);
    expect(next.nodes.map((n) => n.position)).toEqual(doc.nodes.map((n) => n.position));
  });

  it('dragging several nodes is one set-diagram-positions command; unplaced others stay put', () => {
    const doc = withoutPositions([1, 2, 3]);
    const before = resolveDiagramPositions(doc);
    const model = modelFromV2(doc, resolveRelationships(doc));
    const command = dragStopCommand(model, [
      { id: 1, x: 500.4, y: 10 },
      { id: 2, x: 700, y: 9.6 },
    ]);
    expect(command).toEqual({ type: 'set-diagram-positions', positions: { 1: [500, 10], 2: [700, 10] } });
    const next = expectOk(applyDesignCommand(doc, command!));
    expect(resolveDiagramPositions(next).get(3)).toEqual(before.get(3));
  });

  it('a drag that ends where nodes are stored sends nothing; one moved node sends set-diagram-position', () => {
    const doc = threeRooms();
    const model = modelFromV2(doc, resolveRelationships(doc));
    const at = (id: number) => doc.diagram.positions[id]!;
    expect(dragStopCommand(model, [{ id: 1, x: at(1)[0], y: at(1)[1] }])).toBeNull();
    expect(dragStopCommand(model, [{ id: 1, x: at(1)[0], y: at(1)[1] }, { id: 2, x: 3, y: 4 }])).toEqual({
      type: 'set-diagram-position',
      nodeId: 2,
      position: [3, 4],
    });
  });
});

describe('layoutAddedDiagramNodes', () => {
  it('lays a new chain out by relationship distance, branches below the spine, below what is shown', () => {
    // 1 — 2 — 3 — 4 spine; 5 hangs off 2, 6 off 3. Node 9 exists, shown at [0, 0].
    const edges = [
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 2, target: 5 },
      { source: 3, target: 6 },
    ];
    const at = layoutAddedDiagramNodes(edges, [1, 2, 3, 4, 5, 6], { 9: [0, 0] });
    const top = 110 + 64;
    expect(at[1]).toEqual([0, top]);
    expect(at[2]).toEqual([190, top]);
    expect(at[3]).toEqual([380, top]);
    expect(at[5]).toEqual([380, top + 110]);
    expect(at[4]).toEqual([570, top]);
    expect(at[6]).toEqual([570, top + 110]);
  });

  it('starts a group at the new nodes related to an existing node, and stacks unrelated groups', () => {
    const at = layoutAddedDiagramNodes([{ source: 9, target: 2 }, { source: 1, target: 2 }], [1, 2, 3], { 9: [100, 0] });
    expect(at[2]).toEqual([100, 174]); // related to existing node 9: column 0
    expect(at[1]).toEqual([290, 174]);
    expect(at[3]).toEqual([100, 284]); // its own group, the next block down
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
