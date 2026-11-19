import { describe, expect, it } from 'vitest';
import exampleJson from '../document/test-designs/two-storey.json';
import { expectOk, threeRooms } from '@app/document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2, type RelationshipKind } from '@app/document';
import { applyDesignCommand, resolveRelationships, type DesignCommand } from '@app/spatial';
import { FACE_DIRECTIONS, type ResolvedFace } from './contracts';
import { resolveBuildingFaces, toResolvedFace } from './multicellFaces';
import { connectionCondition } from './resolve';

/**
 * Face resolution of one-cell rooms (acceptance tests C–F and J of docs/ARCHITECTURE.md), through
 * the room face resolver the Building and the Plan use.
 */
const resolveFaces = (d: DesignDocumentV2): ResolvedFace[] => resolveBuildingFaces(d, resolveRelationships(d)).map(toResolvedFace);
const apply = (d: DesignDocumentV2, command: DesignCommand) => expectOk(applyDesignCommand(d, command));

/** Rooms in these tests: a = 1, b = 2, c = 3 unless noted; edge ab = 1. */
type N = [id: number, grid: [number, number, number], typeId?: string];
type E = [id: number, source: number, target: number, kind: RelationshipKind];

function doc(nodes: N[], edges: E[] = []): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'test' },
      nodes: nodes.map(([id, grid, typeId]) => ({ id, grid, typeId: typeId ?? 'gallery' })),
      edges: edges.map(([id, source, target, kind]) => ({ id, source, target, kind })),
    }),
  );
}

const face = (faces: readonly ResolvedFace[], id: string) => {
  const f = faces.find((x) => x.id === id);
  if (!f) throw new Error(`no face ${id}; have ${faces.map((x) => x.id).join(', ')}`);
  return f;
};
const shared = (faces: readonly ResolvedFace[]) => faces.filter((f) => f.neighbourNodeId !== null);

describe('connectionCondition', () => {
  it('maps a relationship and the contact of its rooms to the built face condition', () => {
    expect(connectionCondition('access', 'horizontal')).toBe('door');
    expect(connectionCondition('open', 'horizontal')).toBe('open');
    expect(connectionCondition('access', 'vertical')).toBe('vertical-access');
    expect(connectionCondition('open', 'vertical')).toBe('atrium');
    expect(connectionCondition('access', null)).toBeNull();
  });
});

describe('resolveFaces', () => {
  it('an isolated cell has six exterior faces: four walls and two slabs', () => {
    const faces = resolveFaces(doc([[1, [0, 0, 0], 'storage']]));
    expect(faces.map((f) => f.id)).toEqual(FACE_DIRECTIONS.map((d) => `1:${d}`));
    expect(faces.every((f) => f.condition === 'exterior' && f.neighbourNodeId === null && f.edgeId === null)).toBe(true);
    expect(faces.every((f) => f.ownerTypeId === 'storage')).toBe(true);
    expect(faces.map((f) => f.orientation)).toEqual(['wall', 'wall', 'wall', 'wall', 'slab', 'slab']);
  });

  it('C: two neighbours without an edge share ONE solid wall', () => {
    const faces = resolveFaces(doc([[1, [0, 0, 0]], [2, [1, 0, 0]]]));
    expect(faces).toHaveLength(11);
    expect(shared(faces)).toEqual([
      {
        id: '1:+x',
        ownerNodeId: 1,
        ownerTypeId: 'gallery',
        cell: [0, 0, 0],
        direction: '+x',
        orientation: 'wall',
        neighbourNodeId: 2,
        edgeId: null,
        condition: 'solid',
      },
    ]);
    expect(faces.some((f) => f.id === '2:-x')).toBe(false);
  });

  it('D: a door changes only that shared wall; changing to open removes the partition condition', () => {
    const base = doc([[1, [0, 0, 0]], [2, [1, 0, 0]], [3, [0, 1, 0]]]);
    const before = resolveFaces(base);
    const withDoor = apply(base, { type: 'add-edge', edge: { source: 1, target: 2, kind: 'access' } });
    const doorFaces = resolveFaces(withDoor);
    expect(face(doorFaces, '1:+x')).toMatchObject({ condition: 'door', edgeId: 1, neighbourNodeId: 2 });
    // Every other face is unchanged.
    expect(doorFaces.filter((f) => f.id !== '1:+x')).toEqual(before.filter((f) => f.id !== '1:+x'));
    expect(face(doorFaces, '1:+y').condition).toBe('solid');

    const open = resolveFaces(apply(withDoor, { type: 'change-edge-kind', edgeId: 1, kind: 'open' }));
    expect(face(open, '1:+x')).toMatchObject({ condition: 'open', edgeId: 1 });
  });

  it('E: removing a neighbour turns the survivor boundary into a type-specific exterior face', () => {
    const base = doc([[1, [0, 0, 0], 'storage'], [2, [1, 0, 0], 'studio']], [[1, 1, 2, 'access']]);
    const faces = resolveFaces(apply(base, { type: 'remove-node', nodeId: 1 }));
    expect(faces).toHaveLength(6);
    expect(face(faces, '2:-x')).toMatchObject({ condition: 'exterior', ownerTypeId: 'studio', edgeId: null, neighbourNodeId: null });
  });

  it('a shared face is owned by the lower ID, even in the negative direction', () => {
    const faces = resolveFaces(doc([[2, [0, 0, 0]], [1, [1, 0, 0]]]));
    expect(shared(faces).map((f) => f.id)).toEqual(['1:-x']);
    expect(face(faces, '1:-x').cell).toEqual([1, 0, 0]);
  });

  it('uses numeric order for ownership (2 < 10, unlike text order)', () => {
    const faces = resolveFaces(doc([[10, [0, 0, 0]], [2, [0, 1, 0]]]));
    expect(shared(faces).map((f) => f.id)).toEqual(['2:-y']);
    expect(faces.slice(0, 6).every((f) => f.ownerNodeId === 2)).toBe(true);
    expect(faces.slice(6).every((f) => f.ownerNodeId === 10)).toBe(true);
  });

  it('vertical contact: no edge → solid slab; atrium and vertical-access → their kinds', () => {
    const plain = resolveFaces(doc([[1, [0, 0, 0]], [3, [0, 0, 1]]]));
    expect(face(plain, '1:+z')).toMatchObject({ orientation: 'slab', condition: 'solid', neighbourNodeId: 3 });
    expect(plain.some((f) => f.id === '3:-z')).toBe(false);

    const atrium = resolveFaces(threeRooms());
    expect(face(atrium, '1:+z')).toMatchObject({ condition: 'atrium', edgeId: 2 });
    expect(face(atrium, '1:+x')).toMatchObject({ condition: 'door', edgeId: 1 });

    const access = resolveFaces(doc([[2, [0, 0, 1]], [1, [0, 0, 0]]], [[1, 1, 2, 'access']]));
    // low = 1 < up = 2, so the lower cell authors its ceiling.
    expect(face(access, '1:+z')).toMatchObject({ condition: 'vertical-access', edgeId: 1, neighbourNodeId: 2 });
    expect(face(access, '2:+z').condition).toBe('exterior');
    expect(face(access, '1:-z').condition).toBe('exterior');
  });

  it('emits each shared face exactly once: 6N − shared pairs, all IDs unique', () => {
    const nodes: N[] = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 2; z++) nodes.push([nodes.length + 1, [x, y, z]]);
    const faces = resolveFaces(doc(nodes));
    // 3×3×2 block: pairs along x = 2·3·2, y = 3·2·2, z = 3·3·1.
    const pairs = 12 + 12 + 9;
    expect(faces).toHaveLength(6 * nodes.length - pairs);
    expect(shared(faces)).toHaveLength(pairs);
    expect(new Set(faces.map((f) => f.id)).size).toBe(faces.length);
  });

  it('F: disconnected clusters resolve independently with no shared faces between them', () => {
    const faces = resolveFaces(doc([[1, [0, 0, 0]], [2, [1, 0, 0]], [3, [10, 10, 3]]], [[1, 1, 2, 'open']]));
    expect(faces.filter((f) => f.ownerNodeId === 3 /* far */).every((f) => f.condition === 'exterior')).toBe(true);
    expect(shared(faces).map((f) => f.id)).toEqual(['1:+x']);
  });

  it('J: output is independent of node and edge array order, and sorted by owner then direction', () => {
    const d = expectOk(validateDocumentV2(exampleJson));
    const shuffled: DesignDocumentV2 = { ...d, nodes: [...d.nodes].reverse(), edges: [...d.edges].reverse() };
    const a = resolveFaces(d);
    expect(resolveFaces(shuffled)).toEqual(a);
    const order = a.map((f) => [f.ownerNodeId, FACE_DIRECTIONS.indexOf(f.direction)] as const);
    const sorted = [...order].sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] - q[1]));
    expect(order).toEqual(sorted);
  });

  it('resolves the two-storey example design', () => {
    const faces = resolveFaces(expectOk(validateDocumentV2(exampleJson)));
    // entry-gallery 1, studio-ground 2, reading-gallery 3, store 4, studio-upper 5, gallery-upper 6.
    const between = (x: number, y: number) =>
      faces.find((f) => (f.ownerNodeId === x && f.neighbourNodeId === y) || (f.ownerNodeId === y && f.neighbourNodeId === x));
    expect(between(3, 4)).toMatchObject({ condition: 'solid', edgeId: null });
    expect(between(1, 2)).toMatchObject({ condition: 'door', edgeId: 1 });
    expect(between(1, 3)).toMatchObject({ condition: 'open', edgeId: 2 });
    expect(between(1, 5)).toMatchObject({ condition: 'vertical-access', orientation: 'slab' });
    expect(between(2, 6)).toMatchObject({ condition: 'atrium', orientation: 'slab' });
    // 6 nodes × 6 faces − 7 touching pairs (4 ground walls + 1 upper wall + 2 slabs).
    expect(faces).toHaveLength(36 - 7);
  });
});
