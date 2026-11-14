import { describe, expect, it } from 'vitest';
import exampleDesign from '../../../student/designs/two-storey-example.json';
import { applyGraphCommand, idSchema, validateDocument, type DesignDocument } from '../../graph';
import { expectOk, threeRooms, threeRoomsRaw } from '../../graph/test-fixtures';
import {
  EDGE_STYLES,
  connectionOptions,
  neighbourConnections,
  nextFreeId,
  orientationOf,
  rectBorderPoint,
  resolveDiagramPositions,
  suggestDiagramPosition,
  suggestFreeCell,
} from './diagram';

const example = (): DesignDocument => expectOk(validateDocument(exampleDesign));

function withoutPositions(ids: readonly string[]): DesignDocument {
  const raw = threeRoomsRaw();
  for (const id of ids) delete raw.diagram.positions[id];
  return expectOk(validateDocument(raw));
}

describe('resolveDiagramPositions', () => {
  it('uses stored diagram positions unchanged for every node', () => {
    const doc = example();
    const positions = resolveDiagramPositions(doc);
    expect(positions.size).toBe(doc.nodes.length);
    for (const node of doc.nodes) expect(positions.get(node.id)).toEqual(doc.diagram.positions[node.id]);
  });

  it('gives missing nodes deterministic, distinct fallbacks below the stored layout, without writing the document', () => {
    const doc = withoutPositions(['b', 'c']);
    const snapshot = JSON.stringify(doc);
    const first = resolveDiagramPositions(doc);
    const second = resolveDiagramPositions(expectOk(validateDocument(JSON.parse(snapshot))));
    expect(first.get('b')).toEqual(second.get('b'));
    expect(first.get('c')).toEqual(second.get('c'));
    expect(first.get('b')).not.toEqual(first.get('c'));
    expect(first.get('b')![1]).toBeGreaterThan(80); // below the stored node a at y = 80
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it('fallbacks do not depend on grid cells (moving a node in space does not move it in the diagram)', () => {
    const doc = withoutPositions(['b']);
    const moved = expectOk(applyGraphCommand(doc, { type: 'remove-edge', edgeId: 'ab' }));
    const relocated = expectOk(applyGraphCommand(moved, { type: 'move-node', nodeId: 'b', grid: [5, 5, 3] }));
    expect(resolveDiagramPositions(relocated).get('b')).toEqual(resolveDiagramPositions(doc).get('b'));
  });

  it('lays out a document with no stored positions from the origin', () => {
    const positions = resolveDiagramPositions(withoutPositions(['a', 'b', 'c']));
    expect(positions.get('a')).toEqual([0, 0]);
    expect(new Set([...positions.values()].map((p) => p.join(','))).size).toBe(3);
  });
});

describe('diagram drag command', () => {
  it('set-diagram-position changes only the diagram, never the spatial cell (acceptance B)', () => {
    const doc = threeRooms();
    const next = expectOk(applyGraphCommand(doc, { type: 'set-diagram-position', nodeId: 'b', position: [400, -20] }));
    expect(next.diagram.positions.b).toEqual([400, -20]);
    expect(next.nodes).toEqual(doc.nodes);
    expect(next.edges).toEqual(doc.edges);
  });
});

describe('nextFreeId', () => {
  it('returns the smallest unused prefixed ID that satisfies the schema ID pattern', () => {
    expect(nextFreeId('node', [])).toBe('node-1');
    expect(nextFreeId('node', ['node-1', 'node-2', 'node-4'])).toBe('node-3');
    expect(nextFreeId('edge', ['a', 'b'])).toBe('edge-1');
    expect(idSchema.safeParse(nextFreeId('edge', ['edge-1'])).success).toBe(true);
  });
});

describe('suggestFreeCell', () => {
  it('prefers a free same-storey neighbour of the given node', () => {
    const doc = threeRooms(); // a [0,0,0], b [1,0,0], c [0,0,1]
    expect(suggestFreeCell(doc, 'a')).toEqual([0, 1, 0]);
    expect(suggestFreeCell(doc, 'b')).toEqual([2, 0, 0]);
  });

  it('falls back to the nearest free cell on storey 0, never an occupied one', () => {
    const doc = threeRooms();
    const cell = suggestFreeCell(doc);
    expect(cell[2]).toBe(0);
    expect(doc.nodes.some((n) => n.grid.join() === cell.join())).toBe(false);
    expect(suggestFreeCell(expectOk(validateDocument({ ...threeRoomsRaw(), nodes: [], edges: [], diagram: { positions: {} } })))).toEqual([0, 0, 0]);
  });

  it('produces an add-node command the app accepts, with no implicit edges', () => {
    const doc = example();
    for (const near of [undefined, ...doc.nodes.map((n) => n.id)]) {
      const id = nextFreeId('node', doc.nodes.map((n) => n.id));
      const next = expectOk(
        applyGraphCommand(doc, {
          type: 'add-node',
          node: { id, grid: suggestFreeCell(doc, near), typeId: 'room', attributes: {} },
          diagramPosition: suggestDiagramPosition(doc, near),
        }),
      );
      expect(next.nodes).toHaveLength(doc.nodes.length + 1);
      expect(next.edges).toEqual(doc.edges);
    }
  });
});

describe('suggestDiagramPosition', () => {
  it('does not overlap existing nodes', () => {
    const doc = example();
    const taken = [...resolveDiagramPositions(doc).values()];
    for (const near of [undefined, 'entry-gallery', 'store']) {
      const p = suggestDiagramPosition(doc, near);
      expect(taken.some((q) => Math.abs(q[0] - p[0]) < 150 && Math.abs(q[1] - p[1]) < 64)).toBe(false);
    }
  });
});

describe('connectionOptions', () => {
  it('allows only horizontal kinds for same-storey neighbours and vertical kinds for stacked cells', () => {
    const doc = expectOk(applyGraphCommand(threeRooms(), { type: 'remove-edge', edgeId: 'ab' }));
    const ab = connectionOptions(doc, 'a', 'b')!;
    expect(ab.kinds.filter((k) => k.valid).map((k) => k.kind)).toEqual(['door', 'open']);
    expect(ab.reason).toBeUndefined();

    const noAc = expectOk(applyGraphCommand(doc, { type: 'remove-edge', edgeId: 'ac' }));
    const ac = connectionOptions(noAc, 'c', 'a')!;
    expect(ac.kinds.filter((k) => k.valid).map((k) => k.kind)).toEqual(['atrium', 'vertical-access']);
  });

  it('explains non-adjacent pairs and offers nothing (acceptance G: diagonal vertical is rejected)', () => {
    const opts = connectionOptions(threeRooms(), 'b', 'c')!; // [1,0,0] and [0,0,1]
    expect(opts.kinds.every((k) => !k.valid)).toBe(true);
    expect(opts.reason).toMatch(/do not share a face/);
  });

  it('reports an existing relationship instead of allowing a duplicate', () => {
    const opts = connectionOptions(threeRooms(), 'b', 'a')!;
    expect(opts.existingEdge?.id).toBe('ab');
    expect(opts.kinds.every((k) => !k.valid)).toBe(true);
  });

  it('returns undefined for self-connections and missing nodes', () => {
    expect(connectionOptions(threeRooms(), 'a', 'a')).toBeUndefined();
    expect(connectionOptions(threeRooms(), 'a', 'zzz')).toBeUndefined();
  });

  it('every kind it marks valid is accepted by the app', () => {
    const doc = expectOk(applyGraphCommand(threeRooms(), { type: 'remove-edge', edgeId: 'ab' }));
    for (const { kind, valid } of connectionOptions(doc, 'a', 'b')!.kinds) {
      const result = applyGraphCommand(doc, { type: 'add-edge', edge: { id: 'edge-1', source: 'a', target: 'b', kind } });
      expect(result.ok).toBe(valid);
    }
  });
});

describe('neighbourConnections', () => {
  it('lists face-adjacent nodes sorted by ID, including the touching-but-unconnected pair', () => {
    const doc = example();
    const list = neighbourConnections(doc, 'reading-gallery'); // [0,1,0]
    expect(list.map((n) => n.target.id)).toEqual(['entry-gallery', 'store']);
    expect(list.find((n) => n.target.id === 'store')!.existingEdge).toBeUndefined();
    expect(list.find((n) => n.target.id === 'entry-gallery')!.existingEdge?.id).toBe('entry-to-reading');
  });
});

describe('edge styling', () => {
  it('distinguishes horizontal (solid) from vertical (dashed) kinds', () => {
    expect(orientationOf('door')).toBe('horizontal');
    expect(orientationOf('vertical-access')).toBe('vertical');
    expect(EDGE_STYLES.door.strokeDasharray).toBeUndefined();
    expect(EDGE_STYLES.open.strokeDasharray).toBeUndefined();
    expect(EDGE_STYLES.atrium.strokeDasharray).toBeDefined();
    expect(EDGE_STYLES['vertical-access'].strokeDasharray).toBeDefined();
    expect(EDGE_STYLES.door.stroke).not.toBe(EDGE_STYLES.atrium.stroke);
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
