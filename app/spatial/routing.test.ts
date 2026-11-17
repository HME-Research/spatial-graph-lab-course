import { describe, expect, it } from 'vitest';
import { expectIssue, expectOk } from '../document/test-fixtures';
import { footprintCells, validateDocumentV2, type DesignDocumentV2 } from '../document/v2';
import {
  applyDesignCommand,
  buildOccupancy,
  commitSpatialEdit,
  proposeSpatialEdit,
  resolveRelationships,
  straightCandidates,
  type EdgeResolution,
} from './index';

type N = { id: string; grid: [number, number, number]; size?: [number, number, number]; typeId?: string };
type E = { id: string; source: string; target: string; kind?: 'access' | 'open'; connectorStyle?: string };

const make = (nodes: N[], edges: E[]): DesignDocumentV2 =>
  expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 't' },
      nodes: nodes.map((n) => ({ typeId: 'room', ...n })),
      edges: edges.map((e) => ({ kind: 'access', ...e })),
    }),
  );

const status = (r: EdgeResolution) => (r.status === 'unresolved' ? `unresolved:${r.reason}` : r.status);

describe('footprints and occupancy', () => {
  it('a 2×3×1 room occupies 6 cells and a vertical 1×1×2 room occupies 2', () => {
    const d = make([
      { id: 'a', grid: [0, 0, 0], size: [2, 3, 1] },
      { id: 'b', grid: [5, 5, 0], size: [1, 1, 2] },
    ], []);
    const occ = resolveRelationships(d).occupancy;
    expect(occ.cells.size).toBe(8);
    expect(occ.at([1, 2, 0])).toEqual({ kind: 'room', nodeId: 'a' });
    expect(occ.at([5, 5, 1])).toEqual({ kind: 'room', nodeId: 'b' });
    expect(occ.at([2, 0, 0])).toBeUndefined();
  });

  it('rejects positive-integer violations and overlaps as validation issues', () => {
    const raw = (size: unknown) => ({
      schemaVersion: 2,
      metadata: { name: 't' },
      nodes: [{ id: 'a', grid: [0, 0, 0], size, typeId: 'room' }],
      edges: [],
    });
    expectIssue(validateDocumentV2(raw([0, 1, 1])), 'schema');
    expectIssue(validateDocumentV2(raw([1.5, 1, 1])), 'schema');
    expectIssue(
      validateDocumentV2({
        schemaVersion: 2,
        metadata: { name: 't' },
        nodes: [
          { id: 'a', grid: [0, 0, 0], size: [2, 3, 1], typeId: 'room' },
          { id: 'b', grid: [1, 2, 0], typeId: 'room' },
        ],
        edges: [],
      }),
      'room-overlap',
    );
  });

  it('occupancy is independent of node and edge order', () => {
    const nodes: N[] = [
      { id: 'a', grid: [0, 0, 0], size: [2, 2, 1] },
      { id: 'b', grid: [6, 0, 0] },
      { id: 'c', grid: [0, 6, 0] },
    ];
    const edges: E[] = [
      { id: 'e2', source: 'a', target: 'c' },
      { id: 'e1', source: 'a', target: 'b' },
    ];
    const r1 = resolveRelationships(make(nodes, edges));
    const r2 = resolveRelationships(make([...nodes].reverse(), [...edges].reverse()));
    const sorted = (m: ReadonlyMap<string, unknown>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    expect(sorted(r1.occupancy.cells)).toEqual(sorted(r2.occupancy.cells));
    expect(r1.byEdge.get('e1')).toEqual(r2.byEdge.get('e1'));
    expect(r1.byEdge.get('e2')).toEqual(r2.byEdge.get('e2'));
    // The single occupancy API agrees with the resolver's reservations.
    expect(sorted(buildOccupancy(make(nodes, edges), r1.edges).cells)).toEqual(sorted(r1.occupancy.cells));
  });
});

describe('direct relationships between multi-cell rooms', () => {
  it('lists every shared unit face of two touching multi-cell rooms (horizontal)', () => {
    const d = make([
      { id: 'a', grid: [0, 0, 0], size: [2, 3, 1] },
      { id: 'b', grid: [2, 1, 0], size: [2, 3, 1] },
    ], [{ id: 'ab', source: 'a', target: 'b', kind: 'open' }]);
    const r = resolveRelationships(d).byEdge.get('ab')!;
    expect(r.status === 'direct' && r.contact).toBe('horizontal');
    expect(r.status === 'direct' && r.faces).toEqual([
      { cell: [1, 1, 0], direction: '+x' },
      { cell: [1, 2, 0], direction: '+x' },
    ]);
    expect(r.kind).toBe('open');
  });

  it('a stacked pair is a vertical direct contact; tall rooms touch rooms above their top storey', () => {
    const d = make([
      { id: 'tall', grid: [0, 0, 0], size: [1, 1, 2] },
      { id: 'top', grid: [0, 0, 2], size: [2, 1, 1] },
    ], [{ id: 'up', source: 'tall', target: 'top' }]);
    const r = resolveRelationships(d).byEdge.get('up')!;
    expect(r.status === 'direct' && r.contact).toBe('vertical');
    expect(r.status === 'direct' && r.faces).toEqual([{ cell: [0, 0, 1], direction: '+z' }]);
  });
});

describe('straight connector routing', () => {
  const pair = (b: N, extra: N[] = [], edge: Partial<E> = {}) =>
    make([{ id: 'a', grid: [0, 0, 0] }, b, ...extra], [{ id: 'ab', source: 'a', target: 'b', ...edge }]);

  it('routes two separated collinear rooms on the same storey through the empty cells between them', () => {
    const r = resolveRelationships(pair({ id: 'b', grid: [4, 0, 0] })).byEdge.get('ab')!;
    expect(r.status).toBe('routed');
    if (r.status !== 'routed') return;
    expect(r.route).toEqual({
      edgeId: 'ab',
      axis: 'x',
      level: 0,
      cells: [
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ],
      from: { nodeId: 'a', cell: [0, 0, 0], direction: '+x' },
      to: { nodeId: 'b', cell: [4, 0, 0], direction: '-x' },
      style: 'deck',
    });
  });

  it('orders cells from the source face even when the target lies in the negative direction (y axis)', () => {
    const r = resolveRelationships(pair({ id: 'b', grid: [0, -3, 0] })).byEdge.get('ab')!;
    expect(r.status === 'routed' && r.route).toMatchObject({
      axis: 'y',
      cells: [
        [0, -1, 0],
        [0, -2, 0],
      ],
      from: { cell: [0, 0, 0], direction: '-y' },
      to: { cell: [0, -3, 0], direction: '+y' },
    });
  });

  it('a room in the way gives blocked-by-room', () => {
    const r = resolveRelationships(pair({ id: 'b', grid: [4, 0, 0] }, [{ id: 'x', grid: [2, 0, 0] }])).byEdge.get('ab')!;
    expect(status(r)).toBe('unresolved:blocked-by-room');
    expect(r.status === 'unresolved' && r.message).toMatch(/another room/);
  });

  it('diagonal rooms are not-aligned; separated rooms on different storeys are different-level', () => {
    expect(status(resolveRelationships(pair({ id: 'b', grid: [3, 3, 0] })).byEdge.get('ab')!)).toBe('unresolved:not-aligned');
    expect(status(resolveRelationships(pair({ id: 'b', grid: [3, 0, 1] })).byEdge.get('ab')!)).toBe(
      'unresolved:different-level',
    );
    // Diagonal neighbours (touching only along an edge) are also not aligned.
    expect(status(resolveRelationships(pair({ id: 'b', grid: [1, 1, 0] })).byEdge.get('ab')!)).toBe('unresolved:not-aligned');
  });

  it('routes on the shared storey of rooms with different heights (lowest shared storey first)', () => {
    const d = make(
      [
        { id: 'a', grid: [0, 0, 0], size: [1, 1, 3] },
        { id: 'b', grid: [3, 0, 1], size: [1, 1, 2] },
      ],
      [{ id: 'ab', source: 'a', target: 'b' }],
    );
    const r = resolveRelationships(d).byEdge.get('ab')!;
    expect(r.status === 'routed' && r.route.level).toBe(1);
  });

  it('tie-break: lowest storey, then lowest perpendicular coordinate; a blocked line falls through to the next', () => {
    const wide = (extra: N[] = []) =>
      make([{ id: 'a', grid: [0, 0, 0], size: [1, 3, 2] }, { id: 'b', grid: [3, 1, 0], size: [1, 3, 2] }, ...extra], [
        { id: 'ab', source: 'a', target: 'b' },
      ]);
    const first = resolveRelationships(wide()).byEdge.get('ab')!;
    expect(first.status === 'routed' && [first.route.level, first.route.cells[0]]).toEqual([0, [1, 1, 0]]);
    const next = resolveRelationships(wide([{ id: 'x', grid: [2, 1, 0] }])).byEdge.get('ab')!;
    expect(next.status === 'routed' && next.route.cells[0]).toEqual([1, 2, 0]);
    expect(straightCandidates(wide().nodes[0]!, wide().nodes[1]!).map((c) => [c.level, c.perpendicular])).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
      [1, 2],
    ]);
  });

  it('earlier edge ids reserve first; a crossing or shared line gives blocked-by-route', () => {
    // e1: a→b along x through y=0; e2: c→d along y through x=2 would cross (2,0,0).
    const d = make(
      [
        { id: 'a', grid: [0, 0, 0] },
        { id: 'b', grid: [4, 0, 0] },
        { id: 'c', grid: [2, -2, 0] },
        { id: 'd', grid: [2, 2, 0] },
      ],
      [
        { id: 'e2', source: 'c', target: 'd' },
        { id: 'e1', source: 'a', target: 'b' },
      ],
    );
    const r = resolveRelationships(d);
    expect(r.edges.map((e) => e.edgeId)).toEqual(['e2', 'e1']); // document order kept
    expect(status(r.byEdge.get('e1')!)).toBe('routed');
    expect(status(r.byEdge.get('e2')!)).toBe('unresolved:blocked-by-route');
    expect(r.occupancy.at([2, 0, 0])).toEqual({ kind: 'route', edgeId: 'e1' });
  });

  it('keeps each relationship kind and connector style; routes open relationships too', () => {
    for (const style of ['enclosed', 'covered', 'deck'] as const) {
      const r = resolveRelationships(pair({ id: 'b', grid: [3, 0, 0] }, [], { connectorStyle: style, kind: 'open' })).byEdge.get('ab')!;
      expect(r.status === 'routed' && [r.kind, r.route.style]).toEqual(['open', style]);
    }
    const dflt = resolveRelationships(pair({ id: 'b', grid: [3, 0, 0] })).byEdge.get('ab')!;
    expect(dflt.status === 'routed' && dflt.route.style).toBe('deck');
  });

  it('an unresolved relationship is still a valid document (warning, not a validation failure)', () => {
    const d = pair({ id: 'b', grid: [4, 0, 0] }, [{ id: 'x', grid: [2, 0, 0] }]);
    expect(validateDocumentV2(d).ok).toBe(true);
    expect(d.edges).toHaveLength(1);
  });

  it('is deterministic', () => {
    const d = pair({ id: 'b', grid: [4, 0, 0] });
    expect(resolveRelationships(d).edges).toEqual(resolveRelationships(structuredClone(d)).edges);
  });
});

describe('connector reservations and spatial edits', () => {
  const base = () =>
    make(
      [
        { id: 'a', grid: [0, 0, 0] },
        { id: 'b', grid: [4, 0, 0] },
      ],
      [{ id: 'ab', source: 'a', target: 'b' }],
    );

  it('a new room is never silently placed on connector cells', () => {
    expectIssue(
      applyDesignCommand(base(), { type: 'add-node', node: { id: 'c', grid: [2, 0, 0], typeId: 'room' } }),
      'route-displacement',
    );
    expect(expectOk(applyDesignCommand(base(), { type: 'add-node', node: { id: 'c', grid: [2, 1, 0], typeId: 'room' } })).nodes).toHaveLength(3);
    // Phase 07 (A11): confirmed, it is added like a confirmed move; the relationship is kept.
    const added = expectOk(applyDesignCommand(base(), { type: 'add-node', node: { id: 'c', grid: [2, 0, 0], typeId: 'room' }, confirmRouteDisplacement: true }));
    expect(added.edges).toEqual(base().edges);
    expect(status(resolveRelationships(added).byEdge.get('ab')!)).toBe('unresolved:blocked-by-room');
    expectIssue(applyDesignCommand(base(), { type: 'add-node', node: { id: 'c', grid: [0, 0, 0], typeId: 'room' }, confirmRouteDisplacement: true }), 'room-overlap');
  });

  it('moving onto a connector needs confirmation; Cancel keeps the document; confirm recalculates atomically', () => {
    const d = base();
    const extra = expectOk(applyDesignCommand(d, { type: 'add-node', node: { id: 'c', grid: [2, 3, 0], typeId: 'room' } }));
    const p = proposeSpatialEdit(extra, { nodeId: 'c', grid: [2, 0, 0] });
    expect(p.status).toBe('needs-confirmation');
    if (p.status !== 'needs-confirmation') return;
    expect(p.displacedRoutes).toEqual(['ab']);
    expect(p.impacted).toEqual([{ edgeId: 'ab', before: 'routed', after: 'unresolved' }]);
    // Cancel = nothing committed; the input is unchanged.
    expectIssue(commitSpatialEdit(p), 'route-displacement');
    expect(extra.nodes[2]!.grid).toEqual([2, 3, 0]);
    // Move anyway and recalculate.
    const moved = expectOk(commitSpatialEdit(p, { confirmRouteDisplacement: true }));
    expect(moved.edges).toEqual(extra.edges);
    expect(status(resolveRelationships(moved).byEdge.get('ab')!)).toBe('unresolved:blocked-by-room');
  });

  it('moving a room along its OWN corridor (still buildable) needs no confirmation and re-routes (A11)', () => {
    // (2,0,0) is on ab's own connector; ab stays routed (shorter), so no confirmation is needed.
    const p = proposeSpatialEdit(base(), { nodeId: 'b', grid: [2, 0, 0] });
    expect(p.status).toBe('ok');
    const grown = expectOk(applyDesignCommand(base(), { type: 'set-node-geometry', nodeId: 'a', size: [4, 1, 1] }));
    expect(resolveRelationships(grown).byEdge.get('ab')!.status).toBe('direct');
    const moved = expectOk(applyDesignCommand(base(), { type: 'set-node-geometry', nodeId: 'b', grid: [2, 0, 0] }));
    const r = resolveRelationships(moved).byEdge.get('ab')!;
    expect(r.status === 'routed' && r.route.cells).toEqual([[1, 0, 0]]);
  });

  it('taking ANOTHER relationship\'s corridor always asks for confirmation (A11)', () => {
    const d = make(
      [
        { id: 'a', grid: [0, 0, 0] },
        { id: 'b', grid: [4, 0, 0] },
        { id: 'c', grid: [2, 3, 0] },
        { id: 'd', grid: [2, 6, 0] },
      ],
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'cd', source: 'c', target: 'd' },
      ],
    );
    const p = proposeSpatialEdit(d, { nodeId: 'c', grid: [2, 0, 0] });
    expect(p.status).toBe('needs-confirmation');
    expect(p.status === 'needs-confirmation' && p.displacedRoutes).toEqual(['ab']);
  });

  it('an overlap with a room is always refused', () => {
    const p = proposeSpatialEdit(base(), { nodeId: 'b', grid: [0, 0, 0] });
    expect(p.status === 'rejected' && p.collidingRooms).toEqual(['a']);
  });

  it('route cells and room cells never coincide', () => {
    const r = resolveRelationships(base());
    const roomKeys = new Set(base().nodes.flatMap((n) => footprintCells(n).map((c) => c.join(','))));
    for (const e of r.edges) if (e.status === 'routed') for (const c of e.route.cells) expect(roomKeys.has(c.join(','))).toBe(false);
  });
});
