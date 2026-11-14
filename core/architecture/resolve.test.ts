import { describe, expect, it } from 'vitest';
import exampleJson from '../../student/designs/two-storey-example.json';
import { addEdge, changeEdgeKind, removeNode, validateDocument, type DesignDocument, type EdgeKind } from '../spatial';
import { expectOk, threeRooms } from '../spatial/test-fixtures';
import { FACE_DIRECTIONS, type ResolvedFace } from './contracts';
import { buildCellIndex, neighbourSlots, resolveFaces } from './resolve';

type N = [id: string, grid: [number, number, number], typeId?: string];
type E = [id: string, source: string, target: string, kind: EdgeKind];

function doc(nodes: N[], edges: E[] = []): DesignDocument {
  return expectOk(
    validateDocument({
      schemaVersion: 1,
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

describe('neighbour slots', () => {
  it('identifies occupied and unoccupied neighbouring cells in FACE_DIRECTIONS order', () => {
    const d = doc([
      ['a', [0, 0, 0]],
      ['b', [1, 0, 0]],
      ['c', [0, 0, 1]],
    ]);
    const slots = neighbourSlots(buildCellIndex(d), d.nodes[0]!);
    expect(slots.map((s) => s.direction)).toEqual([...FACE_DIRECTIONS]);
    expect(slots.map((s) => s.node?.id ?? null)).toEqual(['b', null, null, null, 'c', null]);
    expect(slots[1]!.cell).toEqual([-1, 0, 0]);
  });
});

describe('resolveFaces', () => {
  it('an isolated cell has six exterior faces: four walls and two slabs', () => {
    const faces = resolveFaces(doc([['a', [0, 0, 0], 'storage']]));
    expect(faces.map((f) => f.id)).toEqual(FACE_DIRECTIONS.map((d) => `a:${d}`));
    expect(faces.every((f) => f.condition === 'exterior' && f.neighbourNodeId === null && f.edgeId === null)).toBe(true);
    expect(faces.every((f) => f.ownerTypeId === 'storage')).toBe(true);
    expect(faces.map((f) => f.orientation)).toEqual(['wall', 'wall', 'wall', 'wall', 'slab', 'slab']);
  });

  it('C: two neighbours without an edge share ONE solid wall', () => {
    const faces = resolveFaces(doc([['a', [0, 0, 0]], ['b', [1, 0, 0]]]));
    expect(faces).toHaveLength(11);
    expect(shared(faces)).toEqual([
      {
        id: 'a:+x',
        ownerNodeId: 'a',
        ownerTypeId: 'gallery',
        cell: [0, 0, 0],
        direction: '+x',
        orientation: 'wall',
        neighbourNodeId: 'b',
        edgeId: null,
        condition: 'solid',
      },
    ]);
    expect(faces.some((f) => f.id === 'b:-x')).toBe(false);
  });

  it('D: a door changes only that shared wall; changing to open removes the partition condition', () => {
    const base = doc([['a', [0, 0, 0]], ['b', [1, 0, 0]], ['c', [0, 1, 0]]]);
    const before = resolveFaces(base);
    const withDoor = expectOk(addEdge(base, { id: 'ab', source: 'a', target: 'b', kind: 'door' }));
    const doorFaces = resolveFaces(withDoor);
    expect(face(doorFaces, 'a:+x')).toMatchObject({ condition: 'door', edgeId: 'ab', neighbourNodeId: 'b' });
    // Every other face is unchanged.
    expect(doorFaces.filter((f) => f.id !== 'a:+x')).toEqual(before.filter((f) => f.id !== 'a:+x'));
    expect(face(doorFaces, 'a:+y').condition).toBe('solid');

    const open = resolveFaces(expectOk(changeEdgeKind(withDoor, 'ab', 'open')));
    expect(face(open, 'a:+x')).toMatchObject({ condition: 'open', edgeId: 'ab' });
  });

  it('E: removing a neighbour turns the survivor boundary into a type-specific exterior face', () => {
    const base = doc([['a', [0, 0, 0], 'storage'], ['b', [1, 0, 0], 'studio']], [['ab', 'a', 'b', 'door']]);
    const faces = resolveFaces(expectOk(removeNode(base, 'a')));
    expect(faces).toHaveLength(6);
    expect(face(faces, 'b:-x')).toMatchObject({ condition: 'exterior', ownerTypeId: 'studio', edgeId: null, neighbourNodeId: null });
  });

  it('a shared face is owned by the ID that sorts first, even in the negative direction', () => {
    const faces = resolveFaces(doc([['b', [0, 0, 0]], ['a', [1, 0, 0]]]));
    expect(shared(faces).map((f) => f.id)).toEqual(['a:-x']);
    expect(face(faces, 'a:-x').cell).toEqual([1, 0, 0]);
  });

  it('uses JavaScript string order for ownership ("node-10" < "node-2")', () => {
    const faces = resolveFaces(doc([['node-2', [0, 0, 0]], ['node-10', [0, 1, 0]]]));
    expect(shared(faces).map((f) => f.id)).toEqual(['node-10:-y']);
    expect(faces.slice(0, 6).every((f) => f.ownerNodeId === 'node-10')).toBe(true);
    expect(faces.slice(6).every((f) => f.ownerNodeId === 'node-2')).toBe(true);
  });

  it('vertical contact: no edge → solid slab; atrium and vertical-access → their kinds', () => {
    const plain = resolveFaces(doc([['a', [0, 0, 0]], ['c', [0, 0, 1]]]));
    expect(face(plain, 'a:+z')).toMatchObject({ orientation: 'slab', condition: 'solid', neighbourNodeId: 'c' });
    expect(plain.some((f) => f.id === 'c:-z')).toBe(false);

    const atrium = resolveFaces(threeRooms());
    expect(face(atrium, 'a:+z')).toMatchObject({ condition: 'atrium', edgeId: 'ac' });
    expect(face(atrium, 'a:+x')).toMatchObject({ condition: 'door', edgeId: 'ab' });

    const access = resolveFaces(doc([['up', [0, 0, 1]], ['low', [0, 0, 0]]], [['v', 'low', 'up', 'vertical-access']]));
    // 'low' < 'up', so the lower cell authors its ceiling.
    expect(face(access, 'low:+z')).toMatchObject({ condition: 'vertical-access', edgeId: 'v', neighbourNodeId: 'up' });
    expect(face(access, 'up:+z').condition).toBe('exterior');
    expect(face(access, 'low:-z').condition).toBe('exterior');
  });

  it('emits each shared face exactly once: 6N − shared pairs, all IDs unique', () => {
    const nodes: N[] = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 2; z++) nodes.push([`n${x}${y}${z}`, [x, y, z]]);
    const faces = resolveFaces(doc(nodes));
    // 3×3×2 block: pairs along x = 2·3·2, y = 3·2·2, z = 3·3·1.
    const pairs = 12 + 12 + 9;
    expect(faces).toHaveLength(6 * nodes.length - pairs);
    expect(shared(faces)).toHaveLength(pairs);
    expect(new Set(faces.map((f) => f.id)).size).toBe(faces.length);
  });

  it('F: disconnected clusters resolve independently with no shared faces between them', () => {
    const faces = resolveFaces(doc([['a', [0, 0, 0]], ['b', [1, 0, 0]], ['far', [10, 10, 3]]], [['ab', 'a', 'b', 'open']]));
    expect(faces.filter((f) => f.ownerNodeId === 'far').every((f) => f.condition === 'exterior')).toBe(true);
    expect(shared(faces).map((f) => f.id)).toEqual(['a:+x']);
  });

  it('J: output is independent of node and edge array order, and sorted by owner then direction', () => {
    const d = expectOk(validateDocument(exampleJson));
    const shuffled: DesignDocument = { ...d, nodes: [...d.nodes].reverse(), edges: [...d.edges].reverse() };
    const a = resolveFaces(d);
    expect(resolveFaces(shuffled)).toEqual(a);
    const order = a.map((f) => [f.ownerNodeId, FACE_DIRECTIONS.indexOf(f.direction)] as const);
    const sorted = [...order].sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] - q[1]));
    expect(order).toEqual(sorted);
  });

  it('resolves the two-storey example design', () => {
    const faces = resolveFaces(expectOk(validateDocument(exampleJson)));
    const between = (x: string, y: string) =>
      faces.find((f) => (f.ownerNodeId === x && f.neighbourNodeId === y) || (f.ownerNodeId === y && f.neighbourNodeId === x));
    expect(between('reading-gallery', 'store')).toMatchObject({ condition: 'solid', edgeId: null });
    expect(between('entry-gallery', 'studio-ground')).toMatchObject({ condition: 'door', edgeId: 'entry-to-studio' });
    expect(between('entry-gallery', 'reading-gallery')).toMatchObject({ condition: 'open', edgeId: 'entry-to-reading' });
    expect(between('entry-gallery', 'studio-upper')).toMatchObject({ condition: 'vertical-access', orientation: 'slab' });
    expect(between('studio-ground', 'gallery-upper')).toMatchObject({ condition: 'atrium', orientation: 'slab' });
    // 6 nodes × 6 faces − 7 touching pairs (4 ground walls + 1 upper wall + 2 slabs).
    expect(faces).toHaveLength(36 - 7);
  });
});
