import { describe, expect, it } from 'vitest';
import exampleJson from '../document/examples/two-storey-example.json?raw';
import { expectIssue, expectOk } from '../document/test-fixtures';
import { readDesignJson, serializeDesignV2, validateDocumentV2, type DesignDocumentV2 } from '../document/v2';
import { v2Raw } from '../document/v2/test-fixtures';
import {
  applyDesignCommand,
  buildOccupancy,
  commitSpatialEdit,
  proposeSpatialEdit,
  resolveRelationships,
  type EdgeResolution,
  type RelationshipResolver,
} from './index';

const doc = (): DesignDocumentV2 => expectOk(validateDocumentV2(v2Raw()));

describe('resolveRelationships (direct, different-level, straight routing)', () => {
  it('resolves every migrated v1 edge as direct, with the v1 contact orientation', () => {
    const example = expectOk(readDesignJson(exampleJson)).doc;
    const r = resolveRelationships(example);
    expect(r.edges.map((e) => e.status)).toEqual(example.edges.map(() => 'direct'));
    const contact = Object.fromEntries(r.edges.map((e) => [e.edgeId, e.status === 'direct' ? e.contact : null]));
    expect(contact['entry-to-studio']).toBe('horizontal');
    expect(contact['entry-up']).toBe('vertical');
  });

  it('keeps a non-touching relationship valid and routes it with a straight connector', () => {
    // (Gate 0 asserted the `routing-unavailable` stub here; 02 replaced it with real routing.)
    const r = resolveRelationships(doc());
    const ab = r.byEdge.get('ab')!;
    expect(ab.status).toBe('routed');
    expect(ab.status === 'routed' && ab.route.cells).toEqual([
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
    ]);
    expect(r.edges.some((e) => e.status === 'unresolved' && e.reason === 'routing-unavailable')).toBe(false);
  });

  it('reports separated rooms on different storeys as different-level', () => {
    const raw = v2Raw();
    raw.nodes[1]!.grid = [5, 0, 2];
    const ab = resolveRelationships(expectOk(validateDocumentV2(raw))).byEdge.get('ab')!;
    expect(ab.status === 'unresolved' && ab.reason).toBe('different-level');
  });

  it('is deterministic and independent of the input objects', () => {
    const d = doc();
    const before = serializeDesignV2(d);
    expect(resolveRelationships(d).edges).toEqual(resolveRelationships(doc()).edges);
    expect(serializeDesignV2(d)).toBe(before);
  });
});

/**
 * A stand-in for 02's router: every edge gets a straight connector through x = 2..4, y = 0,
 * unless a room now stands there (then unresolved, blocked-by-room).
 */
const fakeRouter: RelationshipResolver = (d) => {
  const rooms = buildOccupancy(d);
  const cells: [number, number, number][] = [
    [2, 0, 0],
    [3, 0, 0],
    [4, 0, 0],
  ];
  const edges: EdgeResolution[] = d.edges.map((e) =>
    cells.some((c) => rooms.at(c))
      ? { edgeId: e.id, kind: e.kind, status: 'unresolved', reason: 'blocked-by-room', message: 'blocked' }
      : {
          edgeId: e.id,
          kind: e.kind,
          status: 'routed',
          route: {
            edgeId: e.id,
            axis: 'x',
            level: 0,
            cells,
            from: { nodeId: e.source, cell: [1, 0, 0], direction: '+x' },
            to: { nodeId: e.target, cell: [5, 0, 0], direction: '-x' },
            style: 'enclosed',
          },
        },
  );
  return { edges, byEdge: new Map(edges.map((r) => [r.edgeId, r])), occupancy: buildOccupancy(d, edges) };
};

describe('occupancy', () => {
  it('holds room cells and route reservations in one map', () => {
    const occ = fakeRouter(doc()).occupancy;
    expect(occ.at([1, 2, 0])).toEqual({ kind: 'room', nodeId: 'a' });
    expect(occ.at([3, 0, 0])).toEqual({ kind: 'route', edgeId: 'ab' });
    expect(occ.at([3, 5, 0])).toBeUndefined();
    expect(occ.cells.size).toBe(6 + 1 + 3);
  });
});

describe('spatial edits (proposal → commit)', () => {
  it('rejects a room–room overlap and names the room', () => {
    const p = proposeSpatialEdit(doc(), { nodeId: 'b', grid: [1, 1, 0] });
    expect(p.status).toBe('rejected');
    expect(p.status === 'rejected' && p.collidingRooms).toEqual(['a']);
    expectIssue(commitSpatialEdit(p), 'room-overlap');
  });

  it('resizes anchored at the minimum corner', () => {
    const p = proposeSpatialEdit(doc(), { nodeId: 'b', size: [2, 2, 1] });
    const next = expectOk(commitSpatialEdit(p));
    expect(next.nodes[1]).toMatchObject({ grid: [5, 0, 0], size: [2, 2, 1] });
  });

  it('asks for confirmation before taking connector cells; Cancel leaves the document unchanged', () => {
    const d = doc();
    const p = proposeSpatialEdit(d, { nodeId: 'b', grid: [3, 3, 0], size: [1, 1, 1] }, { resolve: fakeRouter });
    expect(p.status).toBe('ok'); // (3,3) is not on the route
    const q = proposeSpatialEdit(d, { nodeId: 'b', grid: [3, 0, 0] }, { resolve: fakeRouter });
    expect(q.status).toBe('needs-confirmation');
    expect(q.status === 'needs-confirmation' && q.displacedRoutes).toEqual(['ab']);
    expect(q.status === 'needs-confirmation' && q.impacted).toEqual([{ edgeId: 'ab', before: 'routed', after: 'unresolved' }]);
    expectIssue(commitSpatialEdit(q), 'route-displacement');
    const moved = expectOk(commitSpatialEdit(q, { confirmRouteDisplacement: true }));
    expect(moved.nodes[1]!.grid).toEqual([3, 0, 0]);
    expect(moved.edges).toEqual(d.edges); // the relationship is kept
    expect(d.nodes[1]!.grid).toEqual([5, 0, 0]);
  });
});

describe('applyDesignCommand (frozen v2 command shapes)', () => {
  it('adds a non-adjacent relationship, defaulting to access', () => {
    const d = expectOk(applyDesignCommand(doc(), { type: 'remove-edge', edgeId: 'ab' }));
    const next = expectOk(applyDesignCommand(d, { type: 'add-edge', edge: { id: 'e1', source: 'b', target: 'a' } }));
    expect(next.edges).toEqual([{ id: 'e1', source: 'b', target: 'a', kind: 'access', attributes: {} }]);
  });

  it('changes kind and connector style; null restores the default', () => {
    let d = expectOk(applyDesignCommand(doc(), { type: 'change-edge-kind', edgeId: 'ab', kind: 'open' }));
    d = expectOk(applyDesignCommand(d, { type: 'set-connector-style', edgeId: 'ab', style: 'covered' }));
    expect(d.edges[0]).toMatchObject({ kind: 'open', connectorStyle: 'covered' });
    d = expectOk(applyDesignCommand(d, { type: 'set-connector-style', edgeId: 'ab', style: null }));
    expect('connectorStyle' in d.edges[0]!).toBe(false);
  });

  it('patches and resets per-type appearance overrides', () => {
    let d = expectOk(applyDesignCommand(doc(), { type: 'set-type-appearance', typeId: 'gallery', patch: { windowFraction: 0.4 } }));
    d = expectOk(applyDesignCommand(d, { type: 'set-type-appearance', typeId: 'gallery', patch: { roof: 'none' } }));
    expect(d.settings.typeAppearance).toEqual({ gallery: { windowFraction: 0.4, roof: 'none' } });
    d = expectOk(applyDesignCommand(d, { type: 'set-type-appearance', typeId: 'gallery', patch: { windowFraction: null, roof: null } }));
    expect(d.settings.typeAppearance).toEqual({});
    expectIssue(
      applyDesignCommand(d, { type: 'set-type-appearance', typeId: 'gallery', patch: { windowFraction: 2 } }),
      'schema',
    );
  });

  it('adds a room with the next display id and default size; removal drops its edges and position', () => {
    const d = expectOk(applyDesignCommand(doc(), { type: 'add-node', node: { id: 'c', grid: [0, 5, 0], typeId: 'storage' } }));
    expect(d.nodes[2]).toMatchObject({ id: 'c', displayId: '03', size: [1, 1, 1] });
    const r = expectOk(applyDesignCommand(d, { type: 'remove-node', nodeId: 'a' }));
    expect(r.edges).toEqual([]);
    expect(Object.keys(r.diagram.positions)).toEqual(['b']);
    expect(r.nodes.map((n) => n.displayId)).toEqual(['02', '03']); // never renumbered
  });

  it('routes geometry through the spatial edit rules', () => {
    expectIssue(applyDesignCommand(doc(), { type: 'set-node-geometry', nodeId: 'b', grid: [1, 0, 0] }), 'room-overlap');
    expectIssue(
      applyDesignCommand(doc(), { type: 'set-node-geometry', nodeId: 'b', grid: [3, 0, 0] }, { resolve: fakeRouter }),
      'route-displacement',
    );
    const ok = applyDesignCommand(
      doc(),
      { type: 'set-node-geometry', nodeId: 'b', grid: [3, 0, 0], confirmRouteDisplacement: true },
      { resolve: fakeRouter },
    );
    expect(expectOk(ok).nodes[1]!.grid).toEqual([3, 0, 0]);
  });

  it('sets and clears a display id; rejects duplicates; never mutates the input', () => {
    const d = doc();
    const before = serializeDesignV2(d);
    expectIssue(applyDesignCommand(d, { type: 'set-display-id', nodeId: 'b', displayId: '01' }), 'duplicate-display-id');
    const cleared = expectOk(applyDesignCommand(d, { type: 'set-display-id', nodeId: 'b', displayId: null }));
    expect('displayId' in cleared.nodes[1]!).toBe(false);
    expectIssue(applyDesignCommand(d, { type: 'remove-edge', edgeId: 'zz' }), 'not-found');
    expect(serializeDesignV2(d)).toBe(before);
  });
});
