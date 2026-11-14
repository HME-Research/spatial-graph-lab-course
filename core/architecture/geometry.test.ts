import { describe, expect, it } from 'vitest';
import exampleJson from '../../student/designs/two-storey-example.json';
import { validateDocument, type DesignDocument, type EdgeKind } from '../spatial';
import { expectOk } from '../spatial/test-fixtures';
import { DEFAULT_CELL_SIZE } from '../viewer/coordinates';
import { NO_SELECTION, selectEdge, selectNode } from '../viewer/selection';
import { DEFAULT_FACADE, EXAMPLE_FACADES, clampWindowFraction, exampleFacadeProvider } from './facade';
import {
  DEFAULT_SLAB_THICKNESS,
  DEFAULT_WALL_THICKNESS,
  buildArchitecture,
  elementBounds,
  faceCentre,
  isElementHighlighted,
  openingArea,
  rectsAroundHole,
  type ArchitecturalElement,
} from './geometry';
import { resolveFaces } from './resolve';

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

const build = (d: DesignDocument) => buildArchitecture(resolveFaces(d));
const ofFace = (els: readonly ArchitecturalElement[], faceId: string) => els.filter((e) => e.faceId === faceId);
const parts = (els: readonly ArchitecturalElement[]) => els.map((e) => e.part);
/** Area of a box projected on the plane perpendicular to world axis `n`. */
const areaAcross = (e: ArchitecturalElement, n: 0 | 1 | 2) => {
  const [a, b] = [0, 1, 2].filter((i) => i !== n) as [number, number];
  return e.size[a]! * e.size[b]!;
};
const W = DEFAULT_CELL_SIZE.horizontal;
const H = DEFAULT_CELL_SIZE.vertical;

describe('façade examples', () => {
  it('gallery glazes most, studio less, storage is mostly solid; unknown types use the default', () => {
    expect(EXAMPLE_FACADES.gallery!.windowFraction).toBeGreaterThan(EXAMPLE_FACADES.studio!.windowFraction);
    expect(EXAMPLE_FACADES.studio!.windowFraction).toBeGreaterThan(EXAMPLE_FACADES.storage!.windowFraction);
    expect(EXAMPLE_FACADES.storage!.windowFraction).toBeLessThan(0.1);
    expect(exampleFacadeProvider('gallery')).toBe(EXAMPLE_FACADES.gallery);
    expect(exampleFacadeProvider('lab')).toBe(DEFAULT_FACADE);
    expect(exampleFacadeProvider('toString')).toBe(DEFAULT_FACADE);
    expect([clampWindowFraction(-1), clampWindowFraction(2), clampWindowFraction(Number.NaN)]).toEqual([0, 1, 0]);
  });

  it('exterior walls get glazing whose area matches the owner type window fraction', () => {
    for (const typeId of ['gallery', 'studio', 'storage']) {
      const els = ofFace(build(doc([['a', [0, 0, 0], typeId]])), 'a:+y');
      const glass = els.filter((e) => e.part === 'glazing');
      expect(glass).toHaveLength(1);
      // +y wall: normal along Three Z.
      expect(areaAcross(glass[0]!, 2)).toBeCloseTo(EXAMPLE_FACADES[typeId]!.windowFraction * W * H, 6);
      const opaque = els.filter((e) => e.part === 'wall').reduce((s, e) => s + areaAcross(e, 2), 0);
      expect(opaque + areaAcross(glass[0]!, 2)).toBeCloseTo(W * H, 6);
    }
  });

  it('a closed façade (windowFraction 0) is one solid wall; a custom provider is honoured', () => {
    const els = buildArchitecture(resolveFaces(doc([['a', [0, 0, 0]]])), { facade: () => ({ windowFraction: 0 }) });
    expect(parts(ofFace(els, 'a:+x'))).toEqual(['wall']);
  });
});

describe('buildArchitecture', () => {
  it('places faces with spatialToThree: face centre = cell + offset/2', () => {
    expect(faceCentre([0, 0, 0], '+x')).toEqual([1.5, 1.5, 0]);
    expect(faceCentre([0, 0, 0], '+y')).toEqual([0, 1.5, -1.5]);
    expect(faceCentre([0, 0, 0], '-z')).toEqual([0, 0, 0]);
    expect(faceCentre([0, 0, 1], '+z')).toEqual([0, 6, 0]);
  });

  it('a solid internal wall is a single full panel on the shared face', () => {
    const [wall, ...rest] = ofFace(build(doc([['a', [0, 0, 0]], ['b', [1, 0, 0]]])), 'a:+x');
    expect(rest).toEqual([]);
    expect(wall).toMatchObject({ part: 'wall', condition: 'solid', target: selectNode('a') });
    expect(wall!.position).toEqual([1.5, 1.5, 0]);
    expect(wall!.size).toEqual([DEFAULT_WALL_THICKNESS, H, W + DEFAULT_WALL_THICKNESS]);
  });

  it('a door wall leaves a floor-level opening and selects its edge', () => {
    const els = ofFace(build(doc([['a', [0, 0, 0]], ['b', [0, 1, 0]]], [['ab', 'a', 'b', 'door']])), 'a:+y');
    expect(els.length).toBe(3); // two jambs and a lintel
    expect(els.every((e) => e.part === 'wall' && e.edgeId === 'ab')).toBe(true);
    expect(els.every((e) => e.target.kind === 'edge' && e.target.id === 'ab')).toBe(true);
    const solidArea = els.reduce((s, e) => s + areaAcross(e, 2), 0);
    expect(W * H - solidArea).toBeCloseTo(openingArea('door', 'wall'), 6);
    // Opening reaches the floor: nothing occupies the lowest strip at the face centre.
    const blocks = els.some((e) => Math.abs(e.position[0]) < e.size[0] / 2 && e.position[1] - e.size[1] / 2 < 0.5);
    expect(blocks).toBe(false);
  });

  it('an open edge emits no wall, only a pickable threshold marker', () => {
    const els = ofFace(build(doc([['a', [0, 0, 0]], ['b', [1, 0, 0]]], [['ab', 'a', 'b', 'open']])), 'a:+x');
    expect(parts(els)).toEqual(['threshold']);
    expect(els[0]!.target).toEqual(selectEdge('ab'));
    expect(els[0]!.size[1]).toBeLessThan(0.05);
  });

  it('exterior top faces are roofs; bottom faces and solid storey separations are slabs', () => {
    const els = build(doc([['a', [0, 0, 0]], ['c', [0, 0, 1]]]));
    expect(parts(ofFace(els, 'a:-z'))).toEqual(['slab']);
    expect(parts(ofFace(els, 'a:+z'))).toEqual(['slab']);
    expect(parts(ofFace(els, 'c:+z'))).toEqual(['roof']);
    const slab = ofFace(els, 'a:+z')[0]!;
    expect(slab.position).toEqual([0, 3, 0]);
    expect(slab.size).toEqual([W, DEFAULT_SLAB_THICKNESS, W]);
  });

  it('atrium and vertical-access both open the slab but are geometrically distinct', () => {
    const atrium = ofFace(build(doc([['a', [0, 0, 0]], ['c', [0, 0, 1]]], [['ac', 'a', 'c', 'atrium']])), 'a:+z');
    const access = ofFace(build(doc([['a', [0, 0, 0]], ['c', [0, 0, 1]]], [['ac', 'a', 'c', 'vertical-access']])), 'a:+z');

    const slabArea = (els: ArchitecturalElement[]) => els.filter((e) => e.part === 'slab').reduce((s, e) => s + areaAcross(e, 1), 0);
    expect(W * W - slabArea(atrium)).toBeCloseTo(openingArea('atrium', 'slab'), 6);
    expect(W * W - slabArea(access)).toBeCloseTo(openingArea('vertical-access', 'slab'), 6);
    expect(openingArea('atrium', 'slab')).toBeGreaterThan(openingArea('vertical-access', 'slab'));

    expect(atrium.some((e) => e.part === 'circulation-marker')).toBe(false);
    const markers = access.filter((e) => e.part === 'circulation-marker');
    expect(markers).toHaveLength(1);
    // Symbolic marker spans half a storey either side of the slab, inside the opening, off-centre.
    expect(markers[0]!.size[1]).toBe(H);
    expect(markers[0]!.position[1]).toBe(3);
    expect(markers[0]!.position[0]).toBeGreaterThan(0);
    expect(access.every((e) => e.target.kind === 'edge')).toBe(true);
  });

  it('vertical-access geometry does not depend on which storey authors the slab', () => {
    const low = build(doc([['a', [0, 0, 0]], ['b', [0, 0, 1]]], [['e', 'a', 'b', 'vertical-access']]));
    const high = build(doc([['b', [0, 0, 0]], ['a', [0, 0, 1]]], [['e', 'a', 'b', 'vertical-access']]));
    const geo = (els: ArchitecturalElement[], faceId: string) => ofFace(els, faceId).map((e) => [e.part, e.position, e.size]);
    expect(geo(high, 'a:-z')).toEqual(geo(low, 'a:+z'));
  });

  it('element IDs are unique and output is deterministic for the example design', () => {
    const d = expectOk(validateDocument(exampleJson));
    const a = build(d);
    expect(new Set(a.map((e) => e.id)).size).toBe(a.length);
    expect(build({ ...d, nodes: [...d.nodes].reverse(), edges: [...d.edges].reverse() })).toEqual(a);
    expect(a.every((e) => e.size.every((s) => s > 0))).toBe(true);
  });

  it('multi-storey and disconnected structures produce bounds covering every cell', () => {
    const b = elementBounds(build(doc([['a', [0, 0, 0]], ['b', [5, -2, 2]]])))!;
    expect(b.min[1]).toBeCloseTo(-DEFAULT_SLAB_THICKNESS / 2);
    expect(b.max[1]).toBeCloseTo(3 * H + DEFAULT_SLAB_THICKNESS / 2);
    expect(b.max[0]).toBeGreaterThan(5 * W);
    expect(b.max[2]).toBeGreaterThan(2 * W); // grid y = −2 → Three Z = +6
    expect(elementBounds([])).toBeNull();
  });
});

describe('selection', () => {
  const els = build(doc([['a', [0, 0, 0]], ['b', [1, 0, 0]], ['c', [0, 1, 0]]], [['ab', 'a', 'b', 'door']]));

  it('faces with an edge target the edge; other faces target their owner node', () => {
    for (const e of els) expect(e.target).toEqual(e.edgeId ? selectEdge(e.edgeId) : selectNode(e.ownerNodeId));
  });

  it('highlights edge faces for an edge, and every face bounding a node (either side) for a node', () => {
    const lit = (sel: Parameters<typeof isElementHighlighted>[1]) =>
      [...new Set(els.filter((e) => isElementHighlighted(e, sel)).map((e) => e.faceId))];
    expect(lit(NO_SELECTION)).toEqual([]);
    expect(lit(selectEdge('ab'))).toEqual(['a:+x']);
    // b authors 5 faces; the shared door face is authored by a.
    expect(lit(selectNode('b')).sort()).toEqual(['a:+x', 'b:+x', 'b:+y', 'b:+z', 'b:-y', 'b:-z'].sort());
    expect(lit(selectNode('c'))).toContain('a:+y');
  });
});

describe('rectsAroundHole', () => {
  it('returns the panel when the hole misses it and drops zero-size strips', () => {
    const panel = { u0: -1, u1: 1, v0: -1, v1: 1 };
    expect(rectsAroundHole(panel, { u0: 2, u1: 3, v0: 0, v1: 1 })).toEqual([panel]);
    expect(rectsAroundHole(panel, { u0: -1, u1: 1, v0: -1, v1: 0 })).toEqual([{ u0: -1, u1: 1, v0: 0, v1: 1 }]);
  });
});
