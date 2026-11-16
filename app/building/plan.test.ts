import { describe, expect, it } from 'vitest';
import exampleJson from '../document/examples/two-storey-example.json';
import { expectOk } from '@app/document/test-fixtures';
import { readDesign, validateDocumentV2, type ConnectorStyle, type DesignDocumentV2, type RelationshipKind } from '@app/document/v2';
import { resolveRelationships } from '@app/spatial';
import type { GridCoord } from '@core/spatial';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { buildBuildingV2 } from './buildingV2';
import { DEFAULT_WALL_THICKNESS, doorRect } from './faceLayout';
import { wallAction } from './faceInteraction';
import { DEFAULT_CUT_HEIGHT, buildPlan, planBoundsAllLevels, planLevels, planSourceV2, type PlanModel, type PlanRect } from './plan';

type N = { id: string; grid: GridCoord; size?: [number, number, number]; typeId?: string; displayId?: string };
type E = { id: string; source: string; target: string; kind?: RelationshipKind; connectorStyle?: ConnectorStyle };

function v2(nodes: N[], edges: E[] = [], typeAppearance: Record<string, unknown> = {}): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'plan' },
      nodes: nodes.map((n) => ({
        id: n.id,
        grid: n.grid,
        size: n.size ?? [1, 1, 1],
        typeId: n.typeId ?? 'gallery',
        ...(n.displayId !== undefined ? { displayId: n.displayId } : {}),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        kind: e.kind ?? 'access',
        ...(e.connectorStyle ? { connectorStyle: e.connectorStyle } : {}),
      })),
      settings: { typeAppearance },
    }),
  );
}

const example = expectOk(readDesign(exampleJson)).doc;

/** The same designs as the Building golden fixtures (golden.test.ts). */
const FIXTURES: Readonly<Record<string, DesignDocumentV2>> = {
  'two-storey-example': example,
  'multi-cell-rooms': v2(
    [
      { id: 'm', grid: [0, 0, 0], size: [2, 3, 1] },
      { id: 'n', grid: [2, 0, 0], size: [1, 1, 2], typeId: 'studio' },
      { id: 'o', grid: [0, 0, 1], size: [2, 2, 1], typeId: 'storage' },
      { id: 'p', grid: [0, 2, 1], typeId: 'studio' },
      { id: 'q', grid: [3, 0, 0], size: [1, 1, 2] },
      { id: 'r', grid: [1, 2, 1], size: [1, 1, 2], typeId: 'lab' },
    ],
    [
      { id: 'mn', source: 'm', target: 'n', kind: 'access' },
      { id: 'mo', source: 'm', target: 'o', kind: 'open' },
      { id: 'mp', source: 'p', target: 'm', kind: 'access' },
      { id: 'nq', source: 'n', target: 'q', kind: 'open' },
      { id: 'pr', source: 'p', target: 'r', kind: 'access' },
    ],
  ),
  'vertical-access-and-open': v2(
    [
      { id: 'g0', grid: [0, 0, 0], size: [2, 2, 1] },
      { id: 'g1', grid: [0, 0, 1], size: [2, 1, 1], typeId: 'studio' },
      { id: 'g2', grid: [0, 1, 1], size: [2, 1, 1], typeId: 'storage' },
      { id: 'g3', grid: [0, 0, 2], size: [2, 2, 1] },
    ],
    [
      { id: 'v-access', source: 'g0', target: 'g1', kind: 'access' },
      { id: 'v-open', source: 'g2', target: 'g0', kind: 'open' },
      { id: 'v-up', source: 'g1', target: 'g3', kind: 'open' },
      { id: 'h-access', source: 'g1', target: 'g2', kind: 'access' },
    ],
  ),
  'routed-connectors': v2(
    [
      { id: 'a', grid: [0, 0, 0] },
      { id: 'b', grid: [4, 0, 0], typeId: 'studio' },
      { id: 'c', grid: [0, 2, 0], size: [1, 1, 2] },
      { id: 'd', grid: [4, 2, 0], typeId: 'storage' },
      { id: 'e', grid: [0, 4, 0], size: [2, 1, 1] },
      { id: 'f', grid: [5, 4, 0] },
      { id: 'g', grid: [0, 6, 0] },
      { id: 'h', grid: [4, 6, 0] },
      { id: 'i', grid: [0, 7, 0], typeId: 'studio' },
      { id: 'j', grid: [4, 7, 0], typeId: 'studio' },
      { id: 'k', grid: [2, 6, 1], typeId: 'storage' },
      { id: 'l', grid: [10, 10, 3] },
      { id: 's', grid: [2, 9, 0] },
      { id: 't', grid: [2, 12, 0], size: [1, 2, 1] },
    ],
    [
      { id: 'ab', source: 'a', target: 'b', kind: 'access' },
      { id: 'cd', source: 'c', target: 'd', kind: 'open', connectorStyle: 'covered' },
      { id: 'ef', source: 'f', target: 'e', kind: 'access', connectorStyle: 'deck' },
      { id: 'gh', source: 'g', target: 'h', kind: 'access', connectorStyle: 'enclosed' },
      { id: 'ij', source: 'i', target: 'j', kind: 'open', connectorStyle: 'covered' },
      { id: 'al', source: 'a', target: 'l', kind: 'access' },
      { id: 'st', source: 's', target: 't', kind: 'access' },
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
            if (x.edgeId !== null) expect(unresolved.has(x.edgeId), x.edgeId).toBe(false);
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
          const expected = doc.nodes.filter((n) => n.grid[2] <= level && level < n.grid[2] + n.size[2]).map((n) => n.id);
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
    expect(on(0)).toEqual(['m', 'n', 'q']);
    expect(on(1)).toEqual(['n', 'o', 'p', 'q', 'r']);
    expect(on(2)).toEqual(['r']);
    const n0 = plans.get(0)!.rooms.find((r) => r.nodeId === 'n')!;
    const n1 = plans.get(1)!.rooms.find((r) => r.nodeId === 'n')!;
    expect(n0.rect).toEqual(n1.rect);
    expect(n0.levels).toEqual([0, 1]);
    // 2 × 3 cells: no partitions inside the room — no wall lies strictly inside its footprint.
    const m = plans.get(0)!.rooms.find((r) => r.nodeId === 'm')!;
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

  it('labels rooms with displayId, else id', () => {
    const doc = v2([
      { id: 'room-a', grid: [0, 0, 0], displayId: '7' },
      { id: 'room-b', grid: [1, 0, 0] },
    ]);
    const { plans } = setup(doc);
    expect(plans.get(0)!.rooms.map((r) => r.label)).toEqual(['7', 'room-b']);
  });

  it('vertical access: slab opening + marker in the upper floor, shown as "above" on the storey below', () => {
    const { plans } = setup(FIXTURES['vertical-access-and-open']!);
    const kinds = (z: number, pos: 'floor' | 'ceiling') =>
      plans.get(z)!.slabs.filter((s) => s.position === pos && s.edgeId === 'v-access').map((s) => s.kind);
    expect(kinds(1, 'floor')).toEqual(['slab-opening', 'access-marker']);
    expect(kinds(0, 'ceiling')).toEqual(['slab-opening', 'access-marker']);
    expect(plans.get(1)!.slabs.some((s) => s.position === 'floor' && s.kind === 'slab-void' && s.edgeId === 'v-open')).toBe(true);
  });
});

describe('buildPlan — cut height', () => {
  const doc = v2([{ id: 'a', grid: [0, 0, 0] }, { id: 'b', grid: [1, 0, 0] }], [{ id: 'ab', source: 'a', target: 'b', kind: 'access' }]);

  it('the default cut (1.2 m) goes through doors; a cut above the door head shows solid wall', () => {
    const { source } = setup(doc);
    const low = buildPlan(source, 0);
    expect(low.cutHeight).toBe(DEFAULT_CUT_HEIGHT);
    const door = low.openings.find((o) => o.kind === 'door')!;
    expect(door.edgeId).toBe('ab');
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
    const { source } = setup(v2([{ id: 'a', grid: [0, 0, 0] }], [], { gallery: { windowFraction: 0.5 } }));
    const plan = buildPlan(source, 0);
    const windows = plan.openings.filter((o) => o.kind === 'window');
    expect(windows).toHaveLength(4);
    for (const w of windows) expect(w.edgeId).toBeNull();
    // A closed façade: no window anywhere.
    const closed = buildPlan(setup(v2([{ id: 'a', grid: [0, 0, 0] }], [], { gallery: { windowFraction: 0 } })).source, 0);
    expect(closed.openings).toEqual([]);
    expect(closed.walls).toHaveLength(4);
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
