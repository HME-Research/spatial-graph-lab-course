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
