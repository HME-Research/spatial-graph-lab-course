import { describe, expect, it } from 'vitest';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import type { FaceCondition, FaceDirection, ResolvedFace } from './contracts';
import { DEFAULT_WALL_THICKNESS, OPENING_PROPORTIONS, faceCentre, faceRectBox, layoutFace, layoutFaces, type FaceRect } from './faceLayout';
import { buildArchitecture } from './geometry';
import { directionOrientation } from './resolve';

const face = (direction: FaceDirection, condition: FaceCondition, typeId = 'gallery', edgeId: string | null = null): ResolvedFace => ({
  id: `n:${direction}`,
  ownerNodeId: 'n',
  ownerTypeId: typeId,
  cell: [1, 2, 0],
  direction,
  orientation: directionOrientation(direction),
  neighbourNodeId: condition === 'exterior' ? null : 'm',
  edgeId,
  condition,
});

const area = (r: FaceRect) => (r.u1 - r.u0) * (r.v1 - r.v0);
const W = DEFAULT_CELL_SIZE.horizontal;
const H = DEFAULT_CELL_SIZE.vertical;

describe('layoutFaces', () => {
  it('frames: origin at the face centre, u along the face, v up for walls, outward normal', () => {
    const px = layoutFace(face('+x', 'solid')).frame;
    expect(px.origin).toEqual(faceCentre([1, 2, 0], '+x'));
    expect(px).toMatchObject({ u: [0, 0, 1], v: [0, 1, 0], normal: [1, 0, 0], width: W + DEFAULT_WALL_THICKNESS, height: H });
    expect(layoutFace(face('+y', 'solid')).frame).toMatchObject({ u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, -1], width: W, height: H });
    expect(layoutFace(face('-z', 'solid')).frame).toMatchObject({ u: [1, 0, 0], v: [0, 0, 1], normal: [0, -1, 0], width: W, height: W });
  });

  it('solids plus openings cover the whole panel for every opening kind', () => {
    const cases: [ResolvedFace, string[]][] = [
      [face('+y', 'exterior', 'gallery'), ['window']],
      [face('+y', 'exterior', 'nothing-known'), ['window']],
      [face('+y', 'door', 'gallery', 'e'), ['door']],
      [face('+z', 'atrium', 'gallery', 'e'), ['slab-void']],
      [face('+z', 'vertical-access', 'gallery', 'e'), ['slab-opening', 'access-marker']],
    ];
    for (const [f, kinds] of cases) {
      const l = layoutFace(f);
      expect(l.openings.map((o) => o.kind)).toEqual(kinds);
      const hole = l.openings[0]!.rect;
      const total = l.solids.reduce((s, r) => s + area(r), 0) + area(hole);
      expect(total).toBeCloseTo(l.frame.width * l.frame.height, 9);
    }
  });

  it('openings carry their edge; a window carries none; an open wall has no solid part', () => {
    expect(layoutFace(face('+y', 'door', 'gallery', 'e1')).openings[0]!.edgeId).toBe('e1');
    expect(layoutFace(face('+y', 'exterior')).openings[0]!.edgeId).toBeNull();
    const open = layoutFace(face('+x', 'open', 'gallery', 'e2'));
    expect(open.solids).toEqual([]);
    expect(open.openings).toEqual([{ kind: 'open', rect: { u0: -open.frame.width / 2, u1: open.frame.width / 2, v0: -H / 2, v1: H / 2 }, edgeId: 'e2' }]);
  });

  it('window layout: Stretch is ONE window per façade that follows its outline with an even frame', () => {
    const opts = { facade: () => ({ windowFraction: 0.25 }), windowLayout: () => 'stretch' as const };
    const bay = (cellAt: [number, number, number], direction: FaceDirection, owner = 'n'): ResolvedFace => ({
      ...face(direction, 'exterior', 'g'),
      id: `${owner}:${cellAt.join(',')}:${direction}`,
      ownerNodeId: owner,
      cell: cellAt,
    });
    const glassOf = (faces: ResolvedFace[], o: object = opts) =>
      layoutFaces(faces, o).map((l) => l.openings.filter((x) => x.kind === 'window').map((x) => x.rect));
    const total = (rects: FaceRect[][]) => rects.flat().reduce((sum, r) => sum + area(r), 0);
    const inside = (rects: FaceRect[], u: number, v: number) => rects.some((r) => u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1);
    const covered = (l: { solids: readonly FaceRect[]; openings: readonly { rect: FaceRect }[] }) =>
      l.solids.reduce((sum, r) => sum + area(r), 0) + l.openings.reduce((sum, o) => sum + area(o.rect), 0);

    // One bay: the façade is the bay, so Stretch gives the Repeat window.
    const repeat = layoutFace(face('+y', 'exterior', 'g'), { facade: () => ({ windowFraction: 0.25 }) }).openings[0]!.rect;
    const [single] = glassOf([bay([1, 2, 0], '+y')]);
    expect(single).toHaveLength(1);
    for (const k of ['u0', 'u1', 'v0', 'v1'] as const) expect(single![0]![k]).toBeCloseTo(repeat[k]);

    // Two bays side by side: one window, same frame on every outer edge, no wall at the seam.
    const two = glassOf([bay([1, 2, 0], '+y'), bay([2, 2, 0], '+y')]);
    expect(total(two)).toBeCloseTo(0.25 * 2 * W * H);
    const [a1, b1] = [two[0]![0]!, two[1]![0]!];
    expect(a1.u1).toBeCloseTo(W / 2);
    expect(b1.u0).toBeCloseTo(-W / 2);
    expect(a1.u0 + W / 2).toBeCloseTo(W / 2 - b1.u1); // equal frame left and right
    expect(a1.v0).toBeCloseTo(b1.v0);

    // L-shaped façade (a neighbour covers the upper-right bay): an L-shaped window with a frame
    // at the inner corner, never a rectangle across the covered bay.
    const lFaces = [bay([1, 2, 0], '+y'), bay([2, 2, 0], '+y'), bay([1, 2, 1], '+y')];
    const L = glassOf(lFaces);
    expect(total(L)).toBeCloseTo(0.25 * 3 * W * H);
    const corner = L[0]!; // bay (0,0): touches the inner corner at its top-right
    expect(inside(corner, W / 2 - 0.01, H / 2 - 0.01)).toBe(false); // inner corner keeps its frame
    expect(inside(corner, W / 2 - 0.01, 0)).toBe(true); // continues right into bay (1,0)
    expect(inside(corner, 0, H / 2 - 0.01)).toBe(true); // continues up into bay (0,1)
    // Every bay is fully covered by wall + glass, with nothing left open.
    for (const l of layoutFaces(lFaces, opts)) expect(covered(l)).toBeCloseTo(l.frame.width * l.frame.height);

    // ±x walls overlap by the wall thickness: at a seam the glass reaches the panel edge.
    const x = glassOf([bay([1, 2, 0], '+x'), bay([1, 3, 0], '+x')]).flat();
    expect(x.map((r) => Math.max(Math.abs(r.u0), Math.abs(r.u1)))).toContainEqual(expect.closeTo((W + DEFAULT_WALL_THICKNESS) / 2));

    // Different rooms are different façades; other types keep Repeat; 0 % has no glass.
    const [p] = glassOf([bay([1, 2, 0], '+y', 'n'), bay([2, 2, 0], '+y', 'm')]);
    expect(p![0]!.u0).toBeCloseTo(repeat.u0);
    const mixed = layoutFaces([face('+y', 'exterior', 'h')], { ...opts, windowLayout: (t: string) => (t === 'g' ? 'stretch' : 'repeat') });
    expect(mixed[0]!.openings[0]!.rect).toEqual(repeat);
    expect(glassOf([bay([1, 2, 0], '+y')], { ...opts, facade: () => ({ windowFraction: 0 }) })[0]).toHaveLength(0);
  });

  it('a closed façade, solid partitions and exterior slabs are one solid panel with no openings', () => {
    const closed = layoutFace(face('+y', 'exterior', 'x'), { facade: () => ({ windowFraction: 0 }) });
    expect(closed.solids).toHaveLength(1);
    expect(closed.openings).toEqual([]);
    expect(layoutFace(face('-x', 'solid')).openings).toEqual([]);
    expect(layoutFace(face('+z', 'exterior')).solids).toHaveLength(1);
  });

  it('the door sits on the floor with the abstract proportions', () => {
    const door = layoutFace(face('+y', 'door', 'g', 'e')).openings[0]!.rect;
    expect(door.v0).toBe(-H / 2);
    expect(door.v1 - door.v0).toBeCloseTo(Math.min(OPENING_PROPORTIONS.doorHeight, H * OPENING_PROPORTIONS.doorHeightMaxFraction));
  });

  it('buildArchitecture boxes are the layout rectangles mapped by faceRectBox', () => {
    const faces = [face('+y', 'exterior'), face('-x', 'door', 'gallery', 'e')];
    const layouts = layoutFaces(faces);
    const els = buildArchitecture(faces);
    const walls = els.filter((e) => e.part === 'wall');
    const expected = layouts.flatMap((l) => l.solids.map((r) => faceRectBox(l.frame, r, DEFAULT_WALL_THICKNESS)));
    expect(walls.map((w) => ({ position: w.position, size: w.size }))).toEqual(expected);
  });
});
