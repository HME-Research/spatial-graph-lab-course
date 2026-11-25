import {
  type CorridorLook,
  type DesignDocumentV2,
  functionStyleSettings,
  type Look,
  readDesign,
  type RelationshipKind,
  validateDocumentV2,
} from '@app/document';
import { describe, expect, it } from 'vitest';
import exampleJson from '../document/test-designs/two-storey.json';
import { expectOk } from '@app/document/test-fixtures';
import { resolveRelationships } from '@app/spatial';
import type { GridCoord } from '@core/spatial';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { buildBuildingV2 } from './buildingV2';
import { DEFAULT_WALL_THICKNESS, doorRect } from './faceLayout';
import { wallAction } from './faceInteraction';
import { DEFAULT_CUT_HEIGHT, buildPlan, planBoundsAllLevels, planLevels, planSourceV2, type PlanModel, type PlanRect } from './plan';

type N = { id: number; position: GridCoord; size?: [number, number, number]; function?: string };
type E = { id: number; source: number; target: number; relationship?: RelationshipKind; corridor?: CorridorLook };

function v2(nodes: N[], edges: E[] = [], typeAppearance: Record<string, unknown> = {}): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'plan' },
      nodes: nodes.map((n) => ({
        id: n.id,
        position: n.position,
        size: n.size ?? [1, 1, 1],
        function: n.function ?? 'gallery',
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        relationship: e.relationship ?? 'access',
        ...(e.corridor ? { corridor: e.corridor } : {}),
      })),
      settings: functionStyleSettings(typeAppearance as Record<string, Look>),
    }),
  );
}

const example = expectOk(readDesign(exampleJson)).doc;

/** The same designs as the Building golden fixtures (golden.test.ts). */
/**
 * Ids are numbered in the alphabetical order of the letters they replaced (m..r = 1..6, g0..g3 = 1..4,
 * a..l, s, t = 1..14; edges likewise: h-access, v-access, v-open, v-up = 1..4; ab, al, cd, ef, gh, ij,
 * st = 1..7), so ownership and routing order are unchanged by the move to numeric ids.
 */
const FIXTURES: Readonly<Record<string, DesignDocumentV2>> = {
  'two-storey-example': example,
  'multi-cell-rooms': v2(
    [
      { id: 1, position: [0, 0, 0], size: [2, 3, 1] }, // m
      { id: 2, position: [2, 0, 0], size: [1, 1, 2], function: 'studio' }, // n
      { id: 3, position: [0, 0, 1], size: [2, 2, 1], function: 'storage' }, // o
      { id: 4, position: [0, 2, 1], function: 'studio' }, // p
      { id: 5, position: [3, 0, 0], size: [1, 1, 2] }, // q
      { id: 6, position: [1, 2, 1], size: [1, 1, 2], function: 'lab' }, // r
    ],
    [
      { id: 1, source: 1, target: 2, relationship: 'access' }, // mn
      { id: 2, source: 1, target: 3, relationship: 'open' }, // mo
      { id: 3, source: 4, target: 1, relationship: 'access' }, // mp
      { id: 4, source: 2, target: 5, relationship: 'open' }, // nq
      { id: 5, source: 4, target: 6, relationship: 'access' }, // pr
    ],
  ),
  'vertical-access-and-open': v2(
    [
      { id: 1, position: [0, 0, 0], size: [2, 2, 1] }, // g0
      { id: 2, position: [0, 0, 1], size: [2, 1, 1], function: 'studio' }, // g1
      { id: 3, position: [0, 1, 1], size: [2, 1, 1], function: 'storage' }, // g2
      { id: 4, position: [0, 0, 2], size: [2, 2, 1] }, // g3
    ],
    [
      { id: 2, source: 1, target: 2, relationship: 'access' }, // v-access
      { id: 3, source: 3, target: 1, relationship: 'open' }, // v-open
      { id: 4, source: 2, target: 4, relationship: 'open' }, // v-up
      { id: 1, source: 2, target: 3, relationship: 'access' }, // h-access
    ],
  ),
  'routed-connectors': v2(
    [
      { id: 1, position: [0, 0, 0] }, // a
      { id: 2, position: [4, 0, 0], function: 'studio' }, // b
      { id: 3, position: [0, 2, 0], size: [1, 1, 2] }, // c
      { id: 4, position: [4, 2, 0], function: 'storage' }, // d
      { id: 5, position: [0, 4, 0], size: [2, 1, 1] }, // e
      { id: 6, position: [5, 4, 0] }, // f
      { id: 7, position: [0, 6, 0] }, // g
      { id: 8, position: [4, 6, 0] }, // h
      { id: 9, position: [0, 7, 0], function: 'studio' }, // i
      { id: 10, position: [4, 7, 0], function: 'studio' }, // j
      { id: 11, position: [2, 6, 1], function: 'storage' }, // k
      { id: 12, position: [10, 10, 3] }, // l
      { id: 13, position: [2, 9, 0] }, // s
      { id: 14, position: [2, 12, 0], size: [1, 2, 1] }, // t
    ],
    [
      { id: 1, source: 1, target: 2, relationship: 'access' }, // ab
      { id: 3, source: 3, target: 4, relationship: 'open', corridor: { walls: 'open', roof: 'flat' } }, // cd
      { id: 4, source: 6, target: 5, relationship: 'access', corridor: { walls: 'open', roof: 'none' } }, // ef
      { id: 5, source: 7, target: 8, relationship: 'access', corridor: { walls: 'enclosed' } }, // gh
      { id: 6, source: 9, target: 10, relationship: 'open', corridor: { walls: 'open', roof: 'flat' } }, // ij
      { id: 2, source: 1, target: 12, relationship: 'access' }, // al
      { id: 7, source: 13, target: 14, relationship: 'access' }, // st
    ],
  ),
};

function setup(doc: DesignDocumentV2) {
  const spatial = resolveRelationships(doc);
  const source = planSourceV2(doc, spatial);
  const building = buildBuildingV2(doc, { spatial });
  const plans = new Map<number, PlanModel>(planLevels(source).map((z) => [z, buildPlan(source, z)]));
  return { spatial, source, building, plans };
}

const W = DEFAULT_CELL_SIZE.horizontal;
const T = DEFAULT_WALL_THICKNESS;

describe('buildPlan — consistency with the Building (same FaceLayout)', () => {
  for (const [name, doc] of Object.entries(FIXTURES)) {
    describe(name, () => {
      const { source, building, plans, spatial } = setup(doc);
      const faceIds = new Set(building.faces.map((f) => f.id));

      it('lays out exactly the faces buildBuildingV2 builds, in the same order', () => {
        expect(source.layouts.map((l) => l.faceId)).toEqual(building.faces.map((f) => f.id));
      });

      it('every plan faceId exists in buildBuildingV2().faces', () => {
        for (const plan of plans.values()) {
          const ids = [...plan.walls, ...plan.openings, ...plan.slabs, ...plan.wallTargets].map((x) => x.faceId);
          for (const id of ids) expect(faceIds.has(id), id).toBe(true);
        }
      });

      it('every plan wall is the horizontal footprint of the 3D wall box with the same id', () => {
        const byId = new Map(building.elements.map((e) => [e.id, e]));
        for (const plan of plans.values()) {
          for (const wall of plan.walls) {
            const el = byId.get(wall.id);
            expect(el, wall.id).toBeDefined();
            expect(el!.part).toBe('wall');
            expect(wall.rect.x0).toBeCloseTo(el!.position[0] - el!.size[0] / 2, 9);
            expect(wall.rect.x1).toBeCloseTo(el!.position[0] + el!.size[0] / 2, 9);
            expect(wall.rect.y0).toBeCloseTo(el!.position[2] - el!.size[2] / 2, 9);
            expect(wall.rect.y1).toBeCloseTo(el!.position[2] + el!.size[2] / 2, 9);
          }
        }
      });

      it('opening kinds, widths and edges match the FaceLayout openings', () => {
        const layoutById = new Map(source.layouts.map((l) => [l.faceId, l]));
        for (const plan of plans.values()) {
          for (const o of plan.openings) {
            const layout = layoutById.get(o.faceId)!;
            const match = layout.openings.find((lo) => lo.kind === o.kind && Math.abs(lo.rect.u1 - lo.rect.u0 - o.width) < 1e-9);
            expect(match, o.id).toBeDefined();
            expect(o.edgeId).toBe(match!.edgeId);
            const span = o.along === 'x' ? o.rect.x1 - o.rect.x0 : o.rect.y1 - o.rect.y0;
            expect(span).toBeCloseTo(o.width, 9);
          }
          for (const s of plan.slabs) {
            const layout = layoutById.get(s.faceId)!;
            expect(layout.openings.some((lo) => lo.kind === s.kind && lo.edgeId === s.edgeId)).toBe(true);
          }
        }
      });

      it('every door / open wall of a storey and every slab opening of its floor is drawn on that storey', () => {
        for (const [level, plan] of plans) {
          const expectedWall = source.layouts.flatMap((l) =>
            l.face.orientation === 'wall' && l.face.cell[2] === level
              ? l.openings.filter((o) => o.kind === 'door' || o.kind === 'open').map((o) => `${l.faceId}:${o.kind}`)
              : [],
          );
          expect(plan.openings.filter((o) => o.kind !== 'window').map((o) => `${o.faceId}:${o.kind}`)).toEqual(expectedWall);
          const expectedFloor = source.layouts.flatMap((l) => {
            const floorOf = l.face.direction === '+z' ? l.face.cell[2] + 1 : l.face.direction === '-z' ? l.face.cell[2] : null;
            return floorOf === level ? l.openings.map((o) => `${l.faceId}:${o.kind}`) : [];
          });
          expect(plan.slabs.filter((s) => s.position === 'floor').map((s) => `${s.faceId}:${s.kind}`)).toEqual(expectedFloor);
        }
      });

      it('unresolved relationships draw no opening, slab mark or connector cell', () => {
        const unresolved = new Set(spatial.edges.filter((r) => r.status === 'unresolved').map((r) => r.edgeId));
        for (const plan of plans.values()) {
          for (const x of [...plan.openings, ...plan.slabs, ...plan.routeCells, ...plan.walls]) {
            if (x.edgeId !== null) expect(unresolved.has(x.edgeId), String(x.edgeId)).toBe(false);
          }
        }
      });

      it('wall targets are exactly the faces wallAction treats as eligible', () => {
        const model = { faces: building.faces };
        for (const [level, plan] of plans) {
          const eligible = building.faces
            .filter((f) => f.orientation === 'wall' && f.cell[2] === level)
            .filter((f) => wallAction(f.id, model, doc, spatial).kind !== 'not-eligible')
            .map((f) => f.id);
          expect(plan.wallTargets.map((t) => t.faceId)).toEqual(eligible);
        }
      });

      it('rooms are drawn only on the storeys they span, with their footprint', () => {
        for (const [level, plan] of plans) {
          const expected = doc.nodes.filter((n) => n.position[2] <= level && level < n.position[2] + n.size[2]).map((n) => n.id);
          expect(plan.rooms.map((r) => r.nodeId)).toEqual(expected);
          for (const r of plan.rooms) {
            const node = doc.nodes.find((n) => n.id === r.nodeId)!;
            expect(r.rect.x1 - r.rect.x0).toBeCloseTo(node.size[0] * W, 9);
            expect(r.rect.y1 - r.rect.y0).toBeCloseTo(node.size[1] * W, 9);
          }
        }
      });
    });
  }
});

describe('buildPlan — storeys', () => {
  it('lists only storeys that exist (rooms or connector cells)', () => {
    const { source } = setup(FIXTURES['routed-connectors']!);
    expect(planLevels(source)).toEqual([0, 1, 3]);
    expect(planLevels({ rooms: [] })).toEqual([]);
  });

  it('multi-storey and multi-cell rooms appear on every storey they span', () => {
    const doc = FIXTURES['multi-cell-rooms']!;
    const { plans } = setup(doc);
    const on = (z: number) => plans.get(z)!.rooms.map((r) => r.nodeId);
    // m = 1, n = 2, o = 3, p = 4, q = 5, r = 6
    expect(on(0)).toEqual([1, 2, 5]);
    expect(on(1)).toEqual([2, 3, 4, 5, 6]);
    expect(on(2)).toEqual([6]);
    const n0 = plans.get(0)!.rooms.find((r) => r.nodeId === 2)!;
    const n1 = plans.get(1)!.rooms.find((r) => r.nodeId === 2)!;
    expect(n0.rect).toEqual(n1.rect);
    expect(n0.levels).toEqual([0, 1]);
    // 2 × 3 cells: no partitions inside the room — no wall lies strictly inside its footprint.
    const m = plans.get(0)!.rooms.find((r) => r.nodeId === 1)!;
    const inside = (r: PlanRect) => r.x0 > m.rect.x0 + T && r.x1 < m.rect.x1 - T && r.y0 > m.rect.y0 + T && r.y1 < m.rect.y1 - T;
    expect(plans.get(0)!.walls.filter((w) => inside(w.rect))).toEqual([]);
    expect(m.rect.x1 - m.rect.x0).toBeCloseTo(2 * W, 9);
    expect(m.rect.y1 - m.rect.y0).toBeCloseTo(3 * W, 9);
  });

  it('an empty storey (or empty design) is an empty plan with no bounds', () => {
    const { source } = setup(FIXTURES['routed-connectors']!);
    const empty = buildPlan(source, 2);
    expect(empty).toMatchObject({ level: 2, rooms: [], walls: [], openings: [], routeCells: [], wallTargets: [], bounds: null });
    const none = buildPlan({ layouts: [], rooms: [] }, 0);
    expect(none.bounds).toBeNull();
    expect(planBoundsAllLevels({ layouts: [], rooms: [] })).toBeNull();
  });

  it('changing the level changes walls and rooms; nothing of another storey leaks in', () => {
    const { source, plans } = setup(example);
    const levels = planLevels(source);
    expect(levels.length).toBeGreaterThan(1);
    const layoutById = new Map(source.layouts.map((l) => [l.faceId, l]));
    for (const [level, plan] of plans) {
      for (const w of plan.walls) expect(layoutById.get(w.faceId)!.face.cell[2]).toBe(level);
      for (const o of plan.openings) expect(layoutById.get(o.faceId)!.face.cell[2]).toBe(level);
    }
    expect(plans.get(levels[0]!)!.walls).not.toEqual(plans.get(levels[1]!)!.walls);
  });

  it('labels rooms with their id', () => {
    const doc = v2([
      { id: 7, position: [0, 0, 0] },
      { id: 12, position: [1, 0, 0] },
    ]);
    const { plans } = setup(doc);
    expect(plans.get(0)!.rooms.map((r) => r.label)).toEqual(['7', '12']);
  });

  it('vertical access: slab opening + marker in the upper floor, shown as "above" on the storey below', () => {
    const { plans } = setup(FIXTURES['vertical-access-and-open']!);
    const kinds = (z: number, pos: 'floor' | 'ceiling') =>
      plans.get(z)!.slabs.filter((s) => s.position === pos && s.edgeId === 2 /* v-access */).map((s) => s.kind);
    expect(kinds(1, 'floor')).toEqual(['slab-opening', 'access-marker']);
    expect(kinds(0, 'ceiling')).toEqual(['slab-opening', 'access-marker']);
    expect(plans.get(1)!.slabs.some((s) => s.position === 'floor' && s.kind === 'slab-void' && s.edgeId === 3 /* v-open */)).toBe(true);
  });
});

describe('buildPlan — cut height', () => {
  const doc = v2([{ id: 1, position: [0, 0, 0] }, { id: 2, position: [1, 0, 0] }], [{ id: 1, source: 1, target: 2, relationship: 'access' }]);

  it('the default cut (1.2 m) goes through doors; a cut above the door head shows solid wall', () => {
    const { source } = setup(doc);
    const low = buildPlan(source, 0);
    expect(low.cutHeight).toBe(DEFAULT_CUT_HEIGHT);
    const door = low.openings.find((o) => o.kind === 'door')!;
    expect(door.edgeId).toBe(1);
    const d = doorRect(DEFAULT_CELL_SIZE);
    expect(door.width).toBeCloseTo(d.u1 - d.u0, 9);
    const high = buildPlan(source, 0, DEFAULT_CELL_SIZE.vertical - 0.2);
    expect(high.openings.some((o) => o.kind === 'door')).toBe(false);
    // Above the door head the cut crosses the jambs and the lintel: three parts closing the wall.
    const parts = high.walls.filter((w) => w.faceId === door.faceId);
    expect(parts).toHaveLength(3);
    const span = (w: (typeof parts)[number]) => (door.along === 'x' ? w.rect.x1 - w.rect.x0 : w.rect.y1 - w.rect.y0);
    expect(parts.reduce((s, w) => s + span(w), 0)).toBeCloseTo(door.along === 'x' ? W : W + T, 9);
  });

  it('clamps a cut height outside the storey and ignores NaN', () => {
    const { source } = setup(doc);
    expect(buildPlan(source, 0, 99).cutHeight).toBeLessThan(DEFAULT_CELL_SIZE.vertical);
    expect(buildPlan(source, 0, -1).cutHeight).toBeGreaterThan(0);
    expect(buildPlan(source, 0, Number.NaN).cutHeight).toBe(DEFAULT_CUT_HEIGHT);
  });

  it('a cut through a window shows a window opening carrying no edge', () => {
    const { source } = setup(v2([{ id: 1, position: [0, 0, 0] }], [], { gallery: { windowFraction: 0.5 } }));
    const plan = buildPlan(source, 0);
    const windows = plan.openings.filter((o) => o.kind === 'window');
    expect(windows).toHaveLength(4);
    for (const w of windows) expect(w.edgeId).toBeNull();
    // A closed façade: no window anywhere.
    const closed = buildPlan(setup(v2([{ id: 1, position: [0, 0, 0] }], [], { gallery: { windowFraction: 0 } })).source, 0);
    expect(closed.openings).toEqual([]);
    expect(closed.walls).toHaveLength(4);
  });
});

describe('buildPlan — corridors at their width (2026-11-20)', () => {
  // Rooms 1 at x = 0 and 2 at x = 4 (route along x); 3 at y = 0 and 4 at y = 4 on x = 7 (route along y).
  const corridors = (own?: CorridorLook) =>
    v2(
      [
        { id: 1, position: [0, 0, 0] },
        { id: 2, position: [4, 0, 0] },
        { id: 3, position: [7, 0, 0] },
        { id: 4, position: [7, 4, 0] },
      ],
      [
        { id: 1, source: 1, target: 2, ...(own ? { corridor: own } : {}) },
        { id: 2, source: 3, target: 4 },
      ],
    );
  const withCard = (card: CorridorLook, own?: CorridorLook): DesignDocumentV2 => {
    const d = corridors(own);
    return { ...d, settings: { ...d.settings, corridors: card } };
  };
  const across = (r: PlanRect, axis: 'x' | 'y') => (axis === 'x' ? r.y1 - r.y0 : r.x1 - r.x0);
  const along = (r: PlanRect, axis: 'x' | 'y') => (axis === 'x' ? r.x1 - r.x0 : r.y1 - r.y0);
  const axisOf = (spatial: ReturnType<typeof resolveRelationships>, edgeId: number) => {
    const r = spatial.byEdge.get(edgeId)!;
    if (r.status !== 'routed') throw new Error(`edge ${edgeId} is not routed`);
    return r.route.axis;
  };

  it('built-in 1.5 m: each route cell keeps its reserved cell and draws the corridor 1.5 m wide, centred, full length', () => {
    const { plans, spatial } = setup(corridors());
    const cells = plans.get(0)!.routeCells;
    expect(cells.length).toBe(6);
    expect(new Set(cells.map((c) => axisOf(spatial, c.edgeId)))).toEqual(new Set(['x', 'y']));
    for (const c of cells) {
      const axis = axisOf(spatial, c.edgeId);
      expect(c.rect.x1 - c.rect.x0).toBeCloseTo(W, 9);
      expect(c.rect.y1 - c.rect.y0).toBeCloseTo(W, 9);
      expect(across(c.corridor, axis)).toBeCloseTo(1.5, 9);
      expect(along(c.corridor, axis)).toBeCloseTo(W, 9);
      expect((c.corridor.x0 + c.corridor.x1) / 2).toBeCloseTo((c.rect.x0 + c.rect.x1) / 2, 9);
      expect((c.corridor.y0 + c.corridor.y1) / 2).toBeCloseTo((c.rect.y0 + c.rect.y1) / 2, 9);
    }
  });

  it('same resolution as the Building: relationship → Corridors card → built-in', () => {
    const doc = withCard({ width: 2.4 }, { width: 0.9 });
    const { plans } = setup(doc);
    const widthOf = (edgeId: number, axis: 'x' | 'y') =>
      plans.get(0)!.routeCells.filter((c) => c.edgeId === edgeId).map((c) => +across(c.corridor, axis).toFixed(9));
    expect(widthOf(1, 'x')).toEqual([0.9, 0.9, 0.9]);
    expect(widthOf(2, 'y')).toEqual([2.4, 2.4, 2.4]);
    const building = buildBuildingV2(doc);
    expect(building.relationships.map((r) => [r.edgeId, r.corridor?.width])).toEqual([
      [1, 0.9],
      [2, 2.4],
    ]);
  });

  it('a full-cell corridor fills its cell; the reserved cells and bounds never change with the width', () => {
    const full = setup(withCard({ width: W })).plans.get(0)!;
    for (const c of full.routeCells) expect(c.corridor).toEqual(c.rect);
    const narrow = setup(withCard({ width: 0.5 })).plans.get(0)!;
    expect(narrow.routeCells.map((c) => c.rect)).toEqual(full.routeCells.map((c) => c.rect));
    expect(narrow.bounds).toEqual(full.bounds);
  });

  it('the façade strips beside a narrower corridor end are plan walls of the room face', () => {
    const plan = setup(corridors()).plans.get(0)!;
    // Two strips beside the 1.5 m corridor and the two door jambs within it (the cut is below the lintel).
    expect(plan.walls.filter((w) => w.faceId === '1:+x')).toHaveLength(4);
  });
});

describe('buildPlan — purity', () => {
  it('is deterministic and does not modify its input', () => {
    const { source } = setup(example);
    const before = JSON.stringify(source);
    expect(JSON.stringify(buildPlan(source, 0))).toBe(JSON.stringify(buildPlan(source, 0)));
    expect(JSON.stringify(source)).toBe(before);
  });
});
