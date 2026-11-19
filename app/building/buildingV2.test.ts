import {
  type ConnectorStyle,
  connectorStyleOf,
  type DesignDocumentV2,
  functionStyleSettings,
  type Look,
  type RelationshipKind,
  validateDocumentV2,
} from '@app/document';
import { describe, expect, it } from 'vitest';
import exampleJson from '../document/test-designs/two-storey.json';
import { expectOk } from '@app/document/test-fixtures';
import {
  buildOccupancy,
  resolveRelationships,
  type ConnectorRoute,
  type EdgeResolution,
  type RoomFace,
  type SpatialResolution,
} from '@app/spatial';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { selectEdge, selectNode } from '@core/viewer/selection';
import type { GridCoord } from '@core/spatial';
import { buildBuildingV2 } from './buildingV2';
import { buildConnector, isConnectorHighlighted, type ConnectorElement } from './connectorGeometry';
import { EXAMPLE_FACADES } from './facade';
import { buildArchitecture, elementBounds, type ArchitecturalElement } from './geometry';
import { representativeFaceIndex, resolveBuildingFaces, toResolvedFace, unitFaceKey } from './multicellFaces';

// ── fixtures ────────────────────────────────────────────────────────────────────────────────

// Room ids: a = 1, b = 2, c = 3, up = 4, dn = 5 (and r = 1, s = 2, t = 1, g = 1, low = 1, obstacle x = 3);
// edges ab = 1, ac = 2. Face ids start with the owner room's id.
type N = { id: number; grid: GridCoord; size?: [number, number, number]; typeId?: string };
type E = { id: number; source: number; target: number; kind?: RelationshipKind; connectorStyle?: ConnectorStyle };

function v2(nodes: N[], edges: E[] = [], typeAppearance: Record<string, unknown> = {}): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'test' },
      nodes: nodes.map((n) => ({ id: n.id, grid: n.grid, size: n.size ?? [1, 1, 1], typeId: n.typeId ?? 'gallery' })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        kind: e.kind ?? 'access',
        ...(e.connectorStyle ? { connectorStyle: e.connectorStyle } : {}),
      })),
      settings: functionStyleSettings(typeAppearance as Record<string, Look>),
    }),
  );
}

/**
 * Contract-compatible stand-in for 02's straight router: replaces the resolver's result for one
 * edge with a `routed` resolution and rebuilds occupancy with the REAL `buildOccupancy`.
 * (Routing itself is 02-owned; geometry only consumes the result.)
 */
function withRoute(
  doc: DesignDocumentV2,
  spec: { edgeId: number; axis: 'x' | 'y'; cells: GridCoord[]; from: RoomFace; to: RoomFace },
  base: SpatialResolution = resolveRelationships(doc),
): SpatialResolution {
  const edge = doc.edges.find((e) => e.id === spec.edgeId)!;
  const route: ConnectorRoute = { ...spec, level: spec.cells[0]![2], style: connectorStyleOf(edge) };
  const edges: EdgeResolution[] = base.edges.map((r) =>
    r.edgeId === spec.edgeId ? { edgeId: r.edgeId, kind: r.kind, status: 'routed', route } : r,
  );
  return { edges, byEdge: new Map(edges.map((r) => [r.edgeId, r])), occupancy: buildOccupancy(doc, edges) };
}

const W = DEFAULT_CELL_SIZE.horizontal;
const H = DEFAULT_CELL_SIZE.vertical;
const count = <T extends { part: string }>(els: readonly T[], part: string) => els.filter((e) => e.part === part).length;
const facesOf = (els: readonly ArchitecturalElement[], faceId: string) => els.filter((e) => e.faceId === faceId);

/** Two rooms 3 cells apart on x, joined by `ab`, with the straight route between them. */
function corridorFixture(style?: ConnectorStyle, kind: RelationshipKind = 'access', extra: N[] = []) {
  const doc = v2(
    [{ id: 1, grid: [0, 0, 0] }, { id: 2, grid: [4, 0, 0], typeId: 'studio' }, ...extra],
    [{ id: 1, source: 1, target: 2, kind, ...(style ? { connectorStyle: style } : {}) }],
  );
  const spatial = withRoute(doc, {
    edgeId: 1,
    axis: 'x',
    cells: [
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ],
    from: { nodeId: 1, cell: [0, 0, 0], direction: '+x' },
    to: { nodeId: 2, cell: [4, 0, 0], direction: '-x' },
  });
  return { doc, spatial, model: buildBuildingV2(doc, { spatial }) };
}

// ── one-cell rooms ──────────────────────────────────────────────────────────────────────────

describe('one-cell rooms (the two-storey test design)', () => {
  const example = expectOk(validateDocumentV2(exampleJson));

  it('every face is built once from the room faces; touching relationships are direct openings', () => {
    const model = buildBuildingV2(example);
    expect(model.elements).toEqual(buildArchitecture(model.faces.map(toResolvedFace)));
    expect(model.connectors).toEqual([]);
    expect(model.relationships.every((r) => r.status === 'direct' && r.geometry === 'opening')).toBe(true);
  });

  it('flat roofs on exposed tops are part of the model; roof: none leaves them out', () => {
    const withRoofs = buildBuildingV2(example).elements;
    expect(withRoofs.filter((e) => e.part === 'roof').length).toBeGreaterThan(0);
    const types = [...new Set(example.nodes.map((n) => n.typeId))];
    const open = { ...example, settings: functionStyleSettings(Object.fromEntries(types.map((t) => [t, { roof: 'none' as const }]))) };
    expect(buildBuildingV2(open).elements).toEqual(withRoofs.filter((e) => e.part !== 'roof'));
  });
});

// ── multi-cell rooms ────────────────────────────────────────────────────────────────────────

describe('multi-cell rooms', () => {
  it.each([
    [2, 2],
    [2, 3],
  ])('a %ix%i room has no internal partitions, glazed exterior bays and a roof on every top cell', (sx, sy) => {
    const { faces, elements } = buildBuildingV2(v2([{ id: 1, grid: [0, 0, 0], size: [sx, sy, 1] }]));
    const perimeter = 2 * (sx + sy);
    expect(faces).toHaveLength(perimeter + 2 * sx * sy);
    expect(faces.every((f) => f.condition === 'exterior')).toBe(true);
    expect(elements.some((e) => e.condition === 'solid')).toBe(false);
    expect(count(elements, 'glazing')).toBe(perimeter);
    expect(count(elements, 'roof')).toBe(sx * sy);
    expect(count(elements, 'slab')).toBe(sx * sy); // ground floor only
    // Window area per bay follows the type's fraction.
    const glass = elements.find((e) => e.part === 'glazing' && e.faceId.endsWith(':+y'))!;
    expect(glass.size[0] * glass.size[1]).toBeCloseTo(EXAMPLE_FACADES.gallery!.windowFraction * W * H, 6);
  });

  it('multi-cell face ids carry the cell offset; single-cell ids keep the v1 format', () => {
    const { faces } = buildBuildingV2(v2([{ id: 1, grid: [5, 5, 0], size: [2, 1, 1] }, { id: 2, grid: [0, 0, 0] }]));
    expect(faces.map((f) => f.id)).toContain('1:1.0.0:+x');
    expect(faces.map((f) => f.id)).toContain('2:+x');
    expect(new Set(faces.map((f) => f.id)).size).toBe(faces.length);
  });

  it('a double-height room (size z = 2) has no intermediate slab and a roof on top only', () => {
    const { elements } = buildBuildingV2(v2([{ id: 1, grid: [0, 0, 0], size: [1, 1, 2] }]));
    expect(count(elements, 'roof')).toBe(1);
    expect(count(elements, 'slab')).toBe(1);
    expect(elements.find((e) => e.part === 'roof')!.position[1]).toBeCloseTo(2 * H, 9);
    expect(count(elements, 'glazing')).toBe(8);
  });

  it('stacked rooms: no roof between them; the lower room is roofed only where exposed', () => {
    const doc = v2([
      { id: 1, grid: [0, 0, 0], size: [2, 1, 1] },
      { id: 4, grid: [0, 0, 1] },
    ]);
    const { faces, elements } = buildBuildingV2(doc);
    const roofs = elements.filter((e) => e.part === 'roof');
    expect(roofs.map((e) => e.ownerNodeId).sort()).toEqual([1, 4]);
    expect(roofs.find((e) => e.ownerNodeId === 1)!.faceId).toBe('1:1.0.0:+z');
    expect(faces.find((f) => f.id === '1:0.0.0:+z')!.condition).toBe('solid');
  });

  it('every unit face is produced exactly once', () => {
    const doc = v2([
      { id: 1, grid: [0, 0, 0], size: [2, 2, 1] },
      { id: 2, grid: [2, -1, 0], size: [1, 3, 2] },
      { id: 3, grid: [0, 0, 1], size: [2, 1, 1] },
    ]);
    const keys = buildBuildingV2(doc).faces.map((f) => unitFaceKey(f.cell, f.direction));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ── façade / roof settings ──────────────────────────────────────────────────────────────────

describe('per-design type appearance', () => {
  const rooms: N[] = [
    { id: 1, grid: [0, 0, 0], typeId: 'gallery' },
    { id: 2, grid: [3, 0, 0], typeId: 'studio' },
  ];

  it('window fraction: design override → project facade → example provider', () => {
    const over = buildBuildingV2(v2(rooms, [], { gallery: { windowFraction: 0 } })).elements;
    expect(over.some((e) => e.ownerNodeId === 1 && e.part === 'glazing')).toBe(false);
    expect(over.filter((e) => e.ownerNodeId === 2 && e.part === 'glazing')).toHaveLength(4);

    const project = buildBuildingV2(v2(rooms), { facade: () => ({ windowFraction: 0 }) }).elements;
    expect(count(project, 'glazing')).toBe(0);

    const mixed = buildBuildingV2(v2(rooms, [], { studio: { windowFraction: 1 } }), { facade: () => ({ windowFraction: 0 }) }).elements;
    expect(mixed.filter((e) => e.part === 'glazing').map((e) => e.ownerNodeId)).toEqual([2, 2, 2, 2]);
  });

  it('roof: flat by default, none per type leaves only that type open', () => {
    expect(count(buildBuildingV2(v2(rooms)).elements, 'roof')).toBe(2);
    const els = buildBuildingV2(v2(rooms, [], { studio: { roof: 'none' } })).elements;
    expect(els.filter((e) => e.part === 'roof').map((e) => e.ownerNodeId)).toEqual([1]);
  });
});

// ── direct relationships ────────────────────────────────────────────────────────────────────

describe('direct openings between multi-cell rooms', () => {
  // a: 2×2 at x 0..1; b: 1×3 at x = 2, y −1..1 → they share two unit faces (y = 0, 1).
  const nodes: N[] = [
    { id: 1, grid: [0, 0, 0], size: [2, 2, 1] },
    { id: 2, grid: [2, -1, 0], size: [1, 3, 1], typeId: 'studio' },
  ];

  it('access: exactly one door on the shared wall, the rest solid, the non-shared part exterior', () => {
    const { faces, elements, relationships } = buildBuildingV2(v2(nodes, [{ id: 1, source: 1, target: 2 }]));
    const shared = faces.filter((f) => f.neighbourNodeId === 2);
    expect(shared.map((f) => f.id)).toEqual(['1:1.0.0:+x', '1:1.1.0:+x']);
    expect(shared.map((f) => f.condition)).toEqual(['door', 'solid']);
    const door = elements.filter((e) => e.condition === 'door');
    expect(door).toHaveLength(3); // jambs + lintel around one opening
    expect(door.every((e) => e.target.kind === 'edge' && e.target.id === 1)).toBe(true);
    expect(facesOf(elements, '1:1.1.0:+x').map((e) => e.part)).toEqual(['wall']);
    // b's −x bay at y = −1 is not shared: exterior with glazing.
    expect(faces.find((f) => f.id === '2:0.0.0:-x')!.condition).toBe('exterior');
    expect(relationships).toEqual([{ edgeId: 1, status: 'direct', geometry: 'opening', elementIds: door.map((e) => e.id) }]);
  });

  it('open: no wall on any shared unit face (thresholds only)', () => {
    const { elements } = buildBuildingV2(v2(nodes, [{ id: 1, source: 1, target: 2, kind: 'open' }]));
    const shared = elements.filter((e) => e.neighbourNodeId === 2);
    expect(shared.map((e) => e.part)).toEqual(['threshold', 'threshold']);
  });

  it('vertical access: one slab opening and no vertical marker (no stair, no shaft); vertical open voids every shared slab', () => {
    const stacked: N[] = [
      { id: 1, grid: [0, 0, 0], size: [2, 2, 1] },
      { id: 3, grid: [0, 0, 1], size: [2, 2, 1] },
    ];
    const access = buildBuildingV2(v2(stacked, [{ id: 2, source: 1, target: 3 }])).elements;
    expect(access.filter((e) => e.condition === 'vertical-access').every((e) => e.part === 'slab')).toBe(true);
    expect(new Set(access.filter((e) => e.condition === 'vertical-access').map((e) => e.faceId)).size).toBe(1);
    expect(access.filter((e) => e.neighbourNodeId === 3 && e.condition === 'solid')).toHaveLength(3);

    const open = buildBuildingV2(v2(stacked, [{ id: 2, source: 1, target: 3, kind: 'open' }])).elements;
    expect(new Set(open.filter((e) => e.condition === 'atrium').map((e) => e.faceId)).size).toBe(4);
  });

  it('the representative opening is on the lowest shared storey, middle bay', () => {
    const f = (x: number, z: number) => ({ cell: [x, 0, z] as GridCoord });
    expect(representativeFaceIndex([f(0, 1), f(0, 0), f(1, 0), f(2, 0)])).toBe(2);
    expect(representativeFaceIndex([])).toBe(-1);
  });
});

// ── unresolved ──────────────────────────────────────────────────────────────────────────────

describe('unresolved relationships', () => {
  it('build nothing physical and keep the reason for the UI', () => {
    // Real straight routing (02) is active after integration: use pairs no straight connector can join.
    const doc = v2([{ id: 1, grid: [0, 0, 0] }, { id: 2, grid: [4, 2, 0] }, { id: 3, grid: [8, 0, 3] }], [
      { id: 1, source: 1, target: 2 },
      { id: 2, source: 1, target: 3 },
    ]);
    const model = buildBuildingV2(doc);
    expect(model.connectors).toEqual([]);
    expect(model.faces.every((f) => f.condition === 'exterior')).toBe(true);
    expect(model.relationships.map((r) => [r.edgeId, r.geometry, r.reason])).toEqual([
      [1, 'not-built', 'not-aligned'],
      [2, 'not-built', 'different-level'],
    ]);
    expect(model.relationships.every((r) => r.elementIds.length === 0 && typeof r.message === 'string')).toBe(true);
  });
});

// ── straight connectors ─────────────────────────────────────────────────────────────────────

describe('straight connectors', () => {
  it.each<[ConnectorStyle | undefined, ConnectorStyle, Record<string, number>]>([
    [undefined, 'deck', { 'connector-floor': 3, 'connector-roof': 0, 'connector-wall': 0, 'connector-post': 0 }],
    ['enclosed', 'enclosed', { 'connector-floor': 3, 'connector-roof': 3, 'connector-wall': 6, 'connector-post': 0 }],
    ['covered', 'covered', { 'connector-floor': 3, 'connector-roof': 3, 'connector-wall': 0, 'connector-post': 8 }],
    ['deck', 'deck', { 'connector-floor': 3, 'connector-roof': 0, 'connector-wall': 0, 'connector-post': 0 }],
  ])('style %s → %s surface counts', (style, effective, expected) => {
    const { model } = corridorFixture(style);
    for (const [part, n] of Object.entries(expected)) expect(count(model.connectors, part)).toBe(n);
    expect(model.connectors.every((c) => c.style === effective)).toBe(true);
    expect(model.relationships[0]).toMatchObject({ status: 'routed', geometry: 'connector', connectorStyle: effective });
  });

  it('enclosed: side walls run along the route; both ends are open', () => {
    const { model } = corridorFixture('enclosed');
    const walls = model.connectors.filter((c) => c.part === 'connector-wall');
    // ±y side walls: normal along Three Z, at z = ∓W/2, x within the gap between the rooms.
    expect(walls.every((w) => Math.abs(Math.abs(w.position[2]) - W / 2) < 1e-9 && w.size[2] < W)).toBe(true);
    expect(walls.every((w) => w.position[0] > W / 2 && w.position[0] < 3.5 * W)).toBe(true);
    // No wall perpendicular to the route axis (ends open).
    expect(walls.some((w) => w.size[0] < w.size[2])).toBe(false);
    // Floor spans exactly the gap between the two endpoint faces.
    const floors = model.connectors.filter((c) => c.part === 'connector-floor');
    const b = elementBounds(floors)!;
    expect(b.min[0]).toBeCloseTo(0.5 * W, 9);
    expect(b.max[0]).toBeCloseTo(3.5 * W, 9);
    expect(floors.every((f) => f.position[1] === 0)).toBe(true);
    expect(model.connectors.filter((c) => c.part === 'connector-roof').every((r) => r.position[1] === H)).toBe(true);
  });

  it('endpoint faces of an enclosed route become a door (access) or full opening (open), never glazed', () => {
    const access = corridorFixture('enclosed').model;
    expect(access.faces.find((f) => f.id === '1:+x')).toMatchObject({ condition: 'door', edgeId: 1, via: 'route' });
    expect(access.faces.find((f) => f.id === '2:-x')).toMatchObject({ condition: 'door', edgeId: 1, via: 'route' });
    expect(facesOf(access.elements, '1:+x').map((e) => e.part)).toEqual(['wall', 'wall', 'wall']);

    const open = corridorFixture('enclosed', 'open').model;
    expect(facesOf(open.elements, '1:+x').map((e) => e.part)).toEqual(['threshold']);
    expect(facesOf(open.elements, '2:-x').map((e) => e.part)).toEqual(['threshold']);
  });

  it('a room beside the route keeps its own solid wall; the connector omits that side', () => {
    const { model } = corridorFixture('enclosed', 'access', [{ id: 3, grid: [2, 1, 0] }]);
    expect(count(model.connectors, 'connector-wall')).toBe(5);
    expect(model.faces.find((f) => f.id === '3:-y')).toMatchObject({ condition: 'solid', via: 'route', edgeId: null });
    expect(facesOf(model.elements, '3:-y').map((e) => e.part)).toEqual(['wall']);
  });

  it('the end wall of an open-air route is outside (façade colour) with a closed glass door; enclosed is not', () => {
    for (const style of ['deck', 'covered'] as const) {
      const { model } = corridorFixture(style);
      expect(model.faces.find((f) => f.id === '1:+x')).toMatchObject({ condition: 'door', outside: true, edgeId: 1 });
      const parts = facesOf(model.elements, '1:+x');
      expect(parts.map((e) => e.part)).toEqual(['wall', 'wall', 'wall', 'glazing']);
      expect(parts.every((e) => e.outside === true && e.edgeId === 1)).toBe(true);
      // The glass fills exactly the door hole.
      const glass = parts.find((e) => e.part === 'glazing')!;
      expect(glass.size[1]).toBeCloseTo(Math.min(2.2, H * 0.8), 9);
      // An `open` relationship has no end wall: still just a threshold.
      expect(facesOf(corridorFixture(style, 'open').model.elements, '1:+x').map((e) => e.part)).toEqual(['threshold']);
    }
    const enclosed = corridorFixture('enclosed').model;
    expect(enclosed.faces.find((f) => f.id === '1:+x')!.outside).toBeUndefined();
    expect(facesOf(enclosed.elements, '1:+x').map((e) => e.part)).toEqual(['wall', 'wall', 'wall']);
  });

  it.each(['deck', 'covered'] as const)('a room beside a %s route keeps its façade wall (exterior, glazed)', (style) => {
    const { model } = corridorFixture(style, 'access', [{ id: 3, grid: [2, 1, 0] }]);
    expect(model.faces.find((f) => f.id === '3:-y')).toMatchObject({ condition: 'exterior', via: 'route', edgeId: null });
    expect(facesOf(model.elements, '3:-y').some((e) => e.part === 'glazing')).toBe(true);
    // Only walls keep the façade: a room above the route still has a plain solid underside.
    const above = corridorFixture(style, 'access', [{ id: 4, grid: [2, 0, 1] }]).model;
    expect(above.faces.find((f) => f.id === '4:-z')!.condition).toBe('solid');
  });

  it('a room above the route has no roof doubling; a room below the route loses its roof there', () => {
    const above = corridorFixture('enclosed', 'access', [{ id: 4, grid: [2, 0, 1] }]).model;
    expect(count(above.connectors, 'connector-roof')).toBe(2);
    expect(above.faces.find((f) => f.id === '4:-z')!.condition).toBe('solid');

    const below = corridorFixture('enclosed', 'access', [{ id: 5, grid: [2, 0, -1] }]).model;
    expect(count(below.connectors, 'connector-floor')).toBe(2);
    expect(below.faces.find((f) => f.id === '5:+z')!.condition).toBe('solid');
    expect(below.elements.some((e) => e.ownerNodeId === 5 && e.part === 'roof')).toBe(false);
  });

  it('connectors are pickable as their relationship and never reference a node', () => {
    const { model } = corridorFixture('covered');
    expect(model.connectors.every((c) => c.target.kind === 'edge' && c.target.id === 1)).toBe(true);
    expect(isConnectorHighlighted(model.connectors[0]!, selectEdge(1))).toBe(true);
    expect(isConnectorHighlighted(model.connectors[0]!, selectNode(1))).toBe(false);
    const ids = [...model.elements, ...model.connectors].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic and reserves nothing: every connector cell is the resolver’s route cell', () => {
    const a = corridorFixture();
    expect(buildBuildingV2(a.doc, { spatial: a.spatial })).toEqual(a.model);
    const routeCells = new Set(
      [...a.spatial.occupancy.cells.entries()].filter(([, o]) => o.kind === 'route').map(([k]) => k),
    );
    expect(a.model.connectors.every((c: ConnectorElement) => routeCells.has(c.cell.join(',')))).toBe(true);
    expect(a.spatial.occupancy.cells.size).toBe(2 + 3);
  });

  it('refuses a route whose cells are not reserved for it (no geometry through rooms)', () => {
    const { doc, spatial } = corridorFixture();
    const routed = spatial.byEdge.get(1)!;
    if (routed.status !== 'routed') throw new Error('fixture');
    const throughRoom = { ...routed.route, cells: [[0, 0, 0] as GridCoord] };
    expect(buildConnector(throughRoom, spatial.occupancy)).toBeNull();

    const edges: EdgeResolution[] = [{ ...routed, route: throughRoom }];
    const forged: SpatialResolution = { ...spatial, edges, byEdge: new Map([[1, edges[0]!]]) };
    const model = buildBuildingV2(doc, { spatial: forged });
    expect(model.connectors).toEqual([]);
    expect(model.relationships[0]).toMatchObject({ geometry: 'route-rejected', elementIds: [] });
  });

  it('a y-axis covered connector places posts at every cell boundary on both sides', () => {
    const doc = v2([{ id: 1, grid: [0, 0, 0] }, { id: 2, grid: [0, 3, 0] }], [{ id: 1, source: 1, target: 2, connectorStyle: 'covered' }]);
    const spatial = withRoute(doc, {
      edgeId: 1,
      axis: 'y',
      cells: [
        [0, 1, 0],
        [0, 2, 0],
      ],
      from: { nodeId: 1, cell: [0, 0, 0], direction: '+y' },
      to: { nodeId: 2, cell: [0, 3, 0], direction: '-y' },
    });
    const posts = buildBuildingV2(doc, { spatial }).connectors.filter((c) => c.part === 'connector-post');
    expect(posts).toHaveLength(6);
    const zs = [...new Set(posts.map((p) => +p.position[2].toFixed(6)))].sort((x, y) => x - y);
    expect(zs).toEqual([-2.5 * W, -1.5 * W, -0.5 * W]);
    expect(new Set(posts.map((p) => p.position[0]))).toEqual(new Set([-W / 2, W / 2]));
  });
});

describe('resolveBuildingFaces', () => {
  it('reads occupancy from the spatial resolution only (consistent with resolveRelationships)', () => {
    const doc = v2([{ id: 1, grid: [0, 0, 0], size: [2, 1, 1] }]);
    expect(resolveBuildingFaces(doc, resolveRelationships(doc))).toEqual(buildBuildingV2(doc).faces);
  });
});

// ── integration: the real resolver (02) drives the building (03) ─────────────────────────────

describe('integration: real straight routing', () => {
  it('a collinear separated pair is routed by the real resolver and matches the hand-built route', () => {
    const { doc, model: handBuilt } = corridorFixture();
    const real = buildBuildingV2(doc); // no injected spatial → resolveRelationships(doc)
    const r = resolveRelationships(doc).byEdge.get(1)!;
    expect(r.status).toBe('routed');
    expect(real.relationships.map((x) => [x.edgeId, x.geometry, x.connectorStyle])).toEqual([[1, 'connector', 'deck']]);
    expect(real.connectors).toEqual(handBuilt.connectors);
  });

  it.each<[ConnectorStyle, string, number]>([
    ['enclosed', 'connector-wall', 6],
    ['covered', 'connector-post', 8],
    ['deck', 'connector-roof', 0],
  ])('real route honours connector style %s', (style, part, n) => {
    const { doc } = corridorFixture(style);
    expect(count(buildBuildingV2(doc).connectors, part)).toBe(n);
  });

  it('a room in the corridor path makes the relationship unresolved and builds no connector', () => {
    const doc = v2([{ id: 1, grid: [0, 0, 0] }, { id: 2, grid: [4, 0, 0] }, { id: 3, grid: [2, 0, 0] }], [
      { id: 1, source: 1, target: 2 },
    ]);
    const model = buildBuildingV2(doc);
    expect(model.connectors).toEqual([]);
    expect(model.relationships[0]).toMatchObject({ edgeId: 1, geometry: 'not-built', reason: 'blocked-by-room' });
  });

  it('a separated cross-storey pair stays unresolved (different-level)', () => {
    const doc = v2([{ id: 1, grid: [0, 0, 0] }, { id: 2, grid: [4, 0, 1] }], [{ id: 1, source: 1, target: 2 }]);
    expect(buildBuildingV2(doc).relationships[0]).toMatchObject({ geometry: 'not-built', reason: 'different-level' });
  });

  it('a direct pair builds an opening, not a connector', () => {
    const doc = v2([{ id: 1, grid: [0, 0, 0] }, { id: 2, grid: [1, 0, 0] }], [{ id: 1, source: 1, target: 2 }]);
    const model = buildBuildingV2(doc);
    expect(model.connectors).toEqual([]);
    expect(model.relationships[0]).toMatchObject({ status: 'direct', geometry: 'opening' });
  });
});
