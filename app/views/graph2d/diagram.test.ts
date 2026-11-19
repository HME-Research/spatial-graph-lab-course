import { describe, expect, it } from 'vitest';
import { applyDesignCommand } from '@app/spatial';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
import exampleDesign from '../../document/test-designs/two-storey.json';
import { idSchema } from '@app/document';
import { expectOk, threeRooms, threeRoomsRaw } from '@app/document/test-fixtures';
import {
  nextFreeId,
  rectBorderPoint,
  resolveDiagramPositions,
  suggestDiagramPosition,
} from './diagram';

const example = (): DesignDocumentV2 => expectOk(validateDocumentV2(exampleDesign));

function withoutPositions(ids: readonly string[]): DesignDocumentV2 {
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
    const doc = withoutPositions(['b', 'c']);
    const snapshot = JSON.stringify(doc);
    const first = resolveDiagramPositions(doc);
    const second = resolveDiagramPositions(expectOk(validateDocumentV2(JSON.parse(snapshot))));
    expect(first.get('b')).toEqual(second.get('b'));
    expect(first.get('c')).toEqual(second.get('c'));
    expect(first.get('b')).not.toEqual(first.get('c'));
    expect(first.get('b')![1]).toBeGreaterThan(80); // below the stored node a at y = 80
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it('fallbacks do not depend on grid cells (moving a node in space does not move it in the diagram)', () => {
    const doc = withoutPositions(['b']);
    const moved = expectOk(applyDesignCommand(doc, { type: 'remove-edge', edgeId: 'ab' }));
    const relocated = expectOk(applyDesignCommand(moved, { type: 'set-node-geometry', nodeId: 'b', grid: [5, 5, 3] }));
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
    const next = expectOk(applyDesignCommand(doc, { type: 'set-diagram-position', nodeId: 'b', position: [400, -20] }));
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
