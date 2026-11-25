import { describe, expect, it } from 'vitest';
import { neighbours } from '@core/graph';
import { expectOk } from '@app/document/test-fixtures';
import { readDesignJson, serializeDesignV2, SPATIAL_GRAPH_POLICY, validateDocumentV2, type BoundaryShift, type DesignDocumentV2 } from '@app/document';
import { applyDesignCommand, resolveRelationships, resolveWithPreferences } from '@app/spatial';
import {
  actualArea,
  applyBoundaryShifts,
  buildBuildingV2,
  buildPlan,
  layoutFaces,
  planSourceV2,
  realisedFootprint,
  resolveBoundaryShifts,
  resolveBuildingFaces,
  type BuildingFace,
} from '@app/building';
import houseExample from '@app/document/examples/house.json';

/**
 * Boundary shifts (2026-11-24): requests resolved in stored edge order, applied geometry, derived
 * values. Cells are 3 m; a shift moves a shared wall 1.5 m.
 */

type NodeSpec = { id: number; position: [number, number, number]; size?: [number, number, number]; function?: string };
type EdgeSpec = { id: number; source: number; target: number; relationship?: 'access' | 'open'; boundaryShift?: BoundaryShift };

function design(nodes: readonly NodeSpec[], edges: readonly EdgeSpec[]): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'shift' },
      nodes: nodes.map((n) => ({ function: 'room', size: [1, 1, 1], ...n })),
      edges: edges.map((e) => ({ relationship: 'access', ...e })),
    }),
  );
}

const resolve = (doc: DesignDocumentV2) => resolveBoundaryShifts(doc, resolveRelationships(doc));
const areas = (doc: DesignDocumentV2) => {
  const shifts = resolve(doc);
  return Object.fromEntries(doc.nodes.map((n) => [n.id, actualArea(n, doc, shifts, 3)]));
};

/** Bedroom 1 at x = 0 and bathroom 2 east of it (x = 1), one access edge 1 → 2. */
const pair = (shift?: BoundaryShift, extra: { nodes?: NodeSpec[]; edges?: EdgeSpec[] } = {}) =>
  design(
    [{ id: 1, position: [0, 0, 0], function: 'bedroom' }, { id: 2, position: [1, 0, 0], function: 'bathroom' }, ...(extra.nodes ?? [])],
    [{ id: 1, source: 1, target: 2, ...(shift ? { boundaryShift: shift } : {}) }, ...(extra.edges ?? [])],
  );

describe('requests and default', () => {
  it('no stored value means none: nothing applied, faces unchanged', () => {
    const doc = pair();
    const shifts = resolve(doc);
    expect(shifts.byEdge.get(1)).toMatchObject({ requested: 'none', status: 'no-request', applied: false });
    expect(shifts.applied).toEqual([]);
    const spatial = resolveRelationships(doc);
    const faces = resolveBuildingFaces(doc, spatial);
    expect(applyBoundaryShifts(faces, doc, spatial, shifts)).toEqual(faces);
    expect(areas(doc)).toEqual({ 1: 9, 2: 9 });
  });

  it('toward-target moves the wall into the target: 9 + 9 m² becomes 13.5 + 4.5 m²', () => {
    const doc = pair('toward-target');
    expect(resolve(doc).byEdge.get(1)).toMatchObject({ status: 'applied', applied: true, shrinking: 2, growing: 1 });
    expect(areas(doc)).toEqual({ 1: 13.5, 2: 4.5 });
  });

  it('toward-source moves the wall into the source', () => {
    const doc = pair('toward-source');
    expect(resolve(doc).byEdge.get(1)).toMatchObject({ status: 'applied', shrinking: 1, growing: 2 });
    expect(areas(doc)).toEqual({ 1: 4.5, 2: 13.5 });
  });

  it('nominal positions, sizes and the occupancy never change', () => {
    const doc = pair('toward-target');
    const spatial = resolveRelationships(doc);
    expect(spatial.occupancy.at([1, 0, 0])).toEqual({ kind: 'room', nodeId: 2 });
    expect(doc.nodes.map((n) => [n.position, n.size])).toEqual([
      [[0, 0, 0], [1, 1, 1]],
      [[1, 0, 0], [1, 1, 1]],
    ]);
  });
});

describe('reversing an edge', () => {
  it('swaps the endpoints, keeps the id and every value, and keeps the stored shift (the geometry flips)', () => {
    const doc = pair('toward-target');
    const reversed = expectOk(applyDesignCommand(doc, { type: 'reverse-edge', edgeId: 1 }));
    expect(reversed.edges).toEqual([{ id: 1, source: 2, target: 1, relationship: 'access', boundaryShift: 'toward-target', custom: {} }]);
    expect(reversed.nextEdgeId).toBe(doc.nextEdgeId);
    // Still toward the target, which is now room 1: room 1 shrinks.
    expect(resolve(reversed).byEdge.get(1)).toMatchObject({ status: 'applied', shrinking: 1, growing: 2 });
    expect(areas(reversed)).toEqual({ 1: 4.5, 2: 13.5 });
    // Twice = the original document.
    expect(expectOk(applyDesignCommand(reversed, { type: 'reverse-edge', edgeId: 1 }))).toEqual(doc);
    expect(applyDesignCommand(doc, { type: 'reverse-edge', edgeId: 9 }).ok).toBe(false);
  });

  it('connectivity stays undirected: the same neighbours either way', () => {
    const doc = pair(undefined, { nodes: [{ id: 3, position: [0, 1, 0] }], edges: [{ id: 2, source: 3, target: 1 }] });
    const reversed = expectOk(applyDesignCommand(doc, { type: 'reverse-edge', edgeId: 2 }));
    for (const id of [1, 2, 3]) expect(neighbours({ policy: SPATIAL_GRAPH_POLICY, nodes: reversed.nodes, edges: reversed.edges }, id).sort()).toEqual(neighbours({ policy: SPATIAL_GRAPH_POLICY, nodes: doc.nodes, edges: doc.edges }, id).sort());
    expect(resolveRelationships(reversed).byEdge.get(2)!.status).toBe('direct');
  });
});

describe('eligibility', () => {
  it('larger rooms: a 2×2 bedroom gains the strip of a 1×1 bathroom (stepped footprint)', () => {
    const doc = design(
      [
        { id: 1, position: [0, 0, 0], size: [2, 2, 1] },
        { id: 2, position: [2, 0, 0] },
      ],
      [{ id: 1, source: 1, target: 2, boundaryShift: 'toward-target' }],
    );
    const shifts = resolve(doc);
    expect(shifts.byEdge.get(1)!.status).toBe('applied');
    expect(areas(doc)).toEqual({ 1: 40.5, 2: 4.5 });
    expect(realisedFootprint(doc.nodes[0]!, doc, shifts)).toEqual([
      { x0: -0.5, x1: 1.5, y0: -0.5, y1: 1.5 },
      { x0: 1.5, x1: 2, y0: -0.5, y1: 0.5 },
    ]);
    expect(realisedFootprint(doc.nodes[1]!, doc, shifts)).toEqual([{ x0: 2, x1: 2.5, y0: -0.5, y1: 0.5 }]);
  });

  it('a whole shared wall of several 3 m segments moves; a wall shorter than the shrinking side is refused', () => {
    const wide = design(
      [
        { id: 1, position: [0, 0, 0], size: [1, 2, 1] },
        { id: 2, position: [1, 0, 0], size: [1, 2, 1] },
      ],
      [{ id: 1, source: 1, target: 2, boundaryShift: 'toward-source' }],
    );
    expect(resolve(wide).byEdge.get(1)!.status).toBe('applied');
    expect(areas(wide)).toEqual({ 1: 9, 2: 27 });

    const partial = design(
      [
        { id: 1, position: [0, 0, 0], size: [2, 2, 1] },
        { id: 2, position: [2, 0, 0] },
      ],
      [{ id: 1, source: 1, target: 2, boundaryShift: 'toward-source' }],
    );
    expect(resolve(partial).byEdge.get(1)).toMatchObject({ status: 'partial-wall', applied: false, requested: 'toward-source' });
    expect(areas(partial)).toEqual({ 1: 36, 2: 9 });
  });

  it('rooms that do not touch, stacked rooms and rooms on different storeys are never shifted', () => {
    const apart = design([{ id: 1, position: [0, 0, 0] }, { id: 2, position: [3, 0, 0] }], [{ id: 1, source: 1, target: 2, boundaryShift: 'toward-target' }]);
    expect(resolve(apart).byEdge.get(1)).toMatchObject({ status: 'not-touching', applied: false });
    expect(resolve(apart).byEdge.get(1)!.blocked).toBeUndefined();

    const stacked = design([{ id: 1, position: [0, 0, 0] }, { id: 2, position: [0, 0, 1] }], [{ id: 1, source: 1, target: 2, boundaryShift: 'toward-target' }]);
    expect(resolve(stacked).byEdge.get(1)).toMatchObject({ status: 'stacked-rooms', blocked: 'stacked-rooms' });

    const storeys = design([{ id: 1, position: [0, 0, 0], size: [1, 1, 2] }, { id: 2, position: [1, 0, 0] }], [{ id: 1, source: 1, target: 2 }]);
    // Blocked is reported without a request too (Properties disables the choices).
    expect(resolve(storeys).byEdge.get(1)).toMatchObject({ status: 'no-request', blocked: 'storey-mismatch' });
  });

  it('multi-storey rooms spanning the same storeys shift on every storey', () => {
    const doc = design(
      [
        { id: 1, position: [0, 0, 0], size: [1, 1, 2] },
        { id: 2, position: [1, 0, 0], size: [1, 1, 2] },
      ],
      [{ id: 1, source: 1, target: 2, boundaryShift: 'toward-target' }],
    );
    const shifts = resolve(doc);
    expect(shifts.applied[0]!.strip).toEqual([
      [1, 0, 0],
      [1, 0, 1],
    ]);
    expect(areas(doc)).toEqual({ 1: 13.5, 2: 4.5 });
    const plan1 = buildPlan(planSourceV2(doc, resolveRelationships(doc)), 1);
    expect(plan1.rooms.find((r) => r.nodeId === 2)!.footprint).toEqual([{ x0: 3, x1: 4.5, y0: -1.5, y1: 1.5 }]);
  });

  it('Open relationships and open-walled rooms are not refused for that', () => {
    const doc = design(
      [{ id: 1, position: [0, 0, 0], function: 'terrace' }, { id: 2, position: [1, 0, 0] }],
      [{ id: 1, source: 1, target: 2, relationship: 'open', boundaryShift: 'toward-target' }],
    );
    expect(resolve(doc).byEdge.get(1)!.status).toBe('applied');
  });
});

describe('one applied shift per room, in stored edge order', () => {
  // Rooms 1 | 2 | 3 in a row; edge 1–2 and edge 2–3 both shrink room 2.
  const row = (order: 'a-first' | 'b-first') => {
    const a: EdgeSpec = { id: 7, source: 1, target: 2, boundaryShift: 'toward-target' };
    const b: EdgeSpec = { id: 3, source: 2, target: 3, boundaryShift: 'toward-source' };
    return design(
      [{ id: 1, position: [0, 0, 0] }, { id: 2, position: [1, 0, 0] }, { id: 3, position: [2, 0, 0] }],
      order === 'a-first' ? [a, b] : [b, a],
    );
  };

  it('the first request in the edge ARRAY wins (not the lowest id); the other is kept and explained', () => {
    const first = resolve(row('a-first'));
    expect(first.byEdge.get(7)!.status).toBe('applied');
    expect(first.byEdge.get(3)).toMatchObject({ status: 'room-already-adjusted', applied: false, requested: 'toward-source' });
    expect(first.byEdge.get(3)!.message).toMatch(/edge 7/);
    const second = resolve(row('b-first'));
    expect(second.byEdge.get(3)!.status).toBe('applied');
    expect(second.byEdge.get(7)!.status).toBe('room-already-adjusted');
    // Deterministic: the same data gives the same result.
    expect(resolve(row('a-first'))).toEqual(first);
  });

  it('an invalid earlier request reserves nothing, so a later one applies', () => {
    // Edge 1 (1–2) asks to shrink the 2-cell-wide room 1 against a 1-cell wall: refused.
    const doc = design(
      [
        { id: 1, position: [0, 0, 0], size: [1, 2, 1] },
        { id: 2, position: [1, 0, 0] },
        { id: 3, position: [-1, 0, 0] },
      ],
      [
        { id: 1, source: 1, target: 2, boundaryShift: 'toward-source' },
        { id: 2, source: 3, target: 1, boundaryShift: 'toward-source' },
      ],
    );
    const shifts = resolve(doc);
    expect(shifts.byEdge.get(1)!.status).toBe('partial-wall');
    expect(shifts.byEdge.get(2)!.status).toBe('applied');
    expect([...shifts.byNode.keys()].sort()).toEqual([1, 3]);
  });

  it('a refused request stays stored, and is written to the file', () => {
    const doc = row('a-first');
    expect(doc.edges.find((e) => e.id === 3)!.boundaryShift).toBe('toward-source');
    expect(serializeDesignV2(doc)).toContain('"boundaryShift": "toward-source"');
    // Becomes applicable once the conflicting request is removed.
    const cleared = expectOk(applyDesignCommand(doc, { type: 'set-edges-boundary-shift', edgeIds: [7], boundaryShift: 'none' }));
    expect(cleared.edges.find((e) => e.id === 7)).not.toHaveProperty('boundaryShift');
    expect(resolve(cleared).byEdge.get(3)!.status).toBe('applied');
  });

  it('an applied shift becomes unapplied (but stays stored) when an edit breaks it', () => {
    const doc = pair('toward-target');
    const moved = expectOk(applyDesignCommand(doc, { type: 'set-node-geometry', nodeId: 2, position: [3, 0, 0] }));
    expect(moved.edges[0]!.boundaryShift).toBe('toward-target');
    expect(resolve(moved).byEdge.get(1)).toMatchObject({ status: 'not-touching', applied: false });
  });
});

describe('architecture: moved wall, split faces, doors', () => {
  /** Bedroom 1 | bathroom 2 (shrinks toward 1), hall 3 north of the bathroom with a door to it. */
  const withHall = (extra: { nodes?: NodeSpec[]; edges?: EdgeSpec[] } = {}) =>
    pair('toward-target', { nodes: [{ id: 3, position: [1, 1, 0] }, ...(extra.nodes ?? [])], edges: [{ id: 2, source: 2, target: 3 }, ...(extra.edges ?? [])] });

  const facesOf = (doc: DesignDocumentV2) => buildBuildingV2(doc).faces;
  const byId = (faces: readonly BuildingFace[], id: string) => faces.find((f) => f.id === id);

  it('the shared wall moves 1.5 m into the shrinking room, in the Building and the Plan alike', () => {
    const doc = pair('toward-target');
    const model = buildBuildingV2(doc);
    const shared = byId(model.faces, '1:+x')!;
    expect(shared.planeOffset).toBe(1.5); // owner 1 grows: along its outward normal
    const wall = model.elements.find((e) => e.faceId === '1:+x' && e.part === 'wall')!;
    expect(wall.position[0]).toBeCloseTo(3, 9); // grid boundary at 1.5 m, moved to 3 m
    const plan = buildPlan(planSourceV2(doc, resolveRelationships(doc)), 0);
    const planWall = plan.walls.find((w) => w.faceId === '1:+x')!;
    expect((planWall.rect.x0 + planWall.rect.x1) / 2).toBeCloseTo(3, 9);
    expect(plan.rooms.map((r) => r.footprint)).toEqual([
      [
        { x0: -1.5, x1: 1.5, y0: -1.5, y1: 1.5 },
        { x0: 1.5, x1: 3, y0: -1.5, y1: 1.5 },
      ],
      [{ x0: 3, x1: 4.5, y0: -1.5, y1: 1.5 }],
    ]);
    // The nominal box is kept for editing.
    expect(plan.rooms[1]!.rect).toEqual({ x0: 1.5, x1: 4.5, y0: -1.5, y1: 1.5 });
  });

  it('the side walls of the strip split in two: the half given to the growing room gets its own condition', () => {
    const faces = facesOf(pair('toward-target'));
    // Bathroom 2's north and south walls (exterior): the west half now belongs to the bedroom.
    expect(byId(faces, '2:+y')).toBeUndefined();
    expect(byId(faces, '2:+y#0')).toMatchObject({ ownerNodeId: 1, condition: 'exterior', split: { axis: 'u', side: -1, nominalFaceId: '2:+y', reassigned: true } });
    expect(byId(faces, '2:+y#1')).toMatchObject({ ownerNodeId: 2, condition: 'exterior', split: { side: 1, reassigned: false } });
    // The roof and floor of the strip too.
    expect(byId(faces, '2:+z#0')).toMatchObject({ ownerNodeId: 1, split: { axis: 'u', reassigned: true } });
    // Each half face is built once.
    const ids = faces.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a door on a shortened wall moves into the half that still joins its two rooms', () => {
    const doc = withHall();
    const faces = facesOf(doc);
    const door = faces.find((f) => f.edgeId === 2 && f.condition === 'door')!;
    expect(door).toMatchObject({ id: '2:+y#1', ownerNodeId: 2, neighbourNodeId: 3, split: { reassigned: false } });
    // The bedroom's new half toward the hall: a plain internal wall (no relationship 1–3).
    expect(byId(faces, '2:+y#0')).toMatchObject({ ownerNodeId: 1, neighbourNodeId: 3, condition: 'solid', edgeId: null });
    const layout = layoutFaces([door])[0]!;
    const hole = layout.openings.find((o) => o.kind === 'door')!.rect;
    expect(hole.u0).toBeGreaterThanOrEqual(0); // inside the east half (u ≥ 0)
    expect((hole.u0 + hole.u1) / 2).toBeCloseTo(0.75, 9);
    // The Plan draws the same door, inside the bathroom's remaining 1.5 m.
    const plan = buildPlan(planSourceV2(doc, resolveRelationships(doc)), 0);
    const planDoor = plan.openings.find((o) => o.kind === 'door' && o.edgeId === 2)!;
    expect(planDoor.rect.x0).toBeGreaterThanOrEqual(3);
    expect(planDoor.rect.x1).toBeLessThanOrEqual(4.5);
  });

  it('an Open relationship of the growing room across the strip opens its new half too', () => {
    const doc = withHall({ edges: [{ id: 3, source: 1, target: 3, relationship: 'open' }] });
    // 1–3 touch nowhere nominally (diagonal), so 1–3 is routed/unresolved and its half stays a wall.
    expect(resolveRelationships(doc).byEdge.get(3)!.status).not.toBe('direct');
    expect(byId(facesOf(doc), '2:+y#0')!.condition).toBe('solid');
  });

  it('refuses a shift that would split a corridor end or a floor opening (the request is kept)', () => {
    // A corridor from the bathroom north to room 4 ends on the wall the shift would split.
    const corridor = pair('toward-target', { nodes: [{ id: 4, position: [1, 3, 0] }], edges: [{ id: 2, source: 2, target: 4 }] });
    expect(resolveRelationships(corridor).byEdge.get(2)!.status).toBe('routed');
    expect(resolve(corridor).byEdge.get(1)).toMatchObject({ status: 'opening-conflict', requested: 'toward-target' });
    expect(resolve(corridor).byEdge.get(1)!.message).toMatch(/corridor of edge 2/);
    // A slab opening (vertical access) from the bathroom up to room 5.
    const stair = pair('toward-target', { nodes: [{ id: 5, position: [1, 0, 1] }], edges: [{ id: 2, source: 2, target: 5 }] });
    expect(resolve(stair).byEdge.get(1)!.status).toBe('opening-conflict');
    // Its opening is not in the strip when the opening sits in the other room: no conflict.
    const elsewhere = pair('toward-target', { nodes: [{ id: 5, position: [0, 0, 1] }], edges: [{ id: 2, source: 1, target: 5 }] });
    expect(resolve(elsewhere).byEdge.get(1)!.status).toBe('applied');
  });

  it('a chosen wall (face preference) is kept as the door wall after the shift', () => {
    const doc = withHall();
    const spatial = resolveWithPreferences(doc, { 2: { nodeId: 2, offset: [0, 0, 0], direction: '+y' } });
    const faces = buildBuildingV2(doc, { spatial }).faces;
    expect(faces.find((f) => f.edgeId === 2 && f.condition === 'door')!.id).toBe('2:+y#1');
  });
});

describe('files', () => {
  it('a file without boundaryShift reads and writes exactly as before; "none" is not written', () => {
    const doc = expectOk(validateDocumentV2(houseExample));
    expect(doc.edges.every((e) => e.boundaryShift === undefined)).toBe(true);
    const text = serializeDesignV2(doc);
    expect(text).not.toContain('boundaryShift');
    expect(serializeDesignV2(expectOk(readDesignJson(text)).doc)).toBe(text);
    const explicitNone = expectOk(validateDocumentV2({ ...JSON.parse(text), edges: doc.edges.map((e) => ({ ...e, boundaryShift: 'none' })) }));
    expect(serializeDesignV2(explicitNone)).toBe(text);
  });

  it('a requested shift round-trips; an unknown value is refused with a readable message', () => {
    const doc = pair('toward-source');
    const again = expectOk(readDesignJson(serializeDesignV2(doc))).doc;
    expect(again.edges[0]!.boundaryShift).toBe('toward-source');
    const bad = validateDocumentV2({ ...JSON.parse(serializeDesignV2(doc)), edges: [{ id: 1, source: 1, target: 2, relationship: 'access', boundaryShift: 'left' }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.map((i) => i.message).join(' ')).toMatch(/boundaryShift must be one of: none, toward-source, toward-target/);
  });
});
