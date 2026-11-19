import { functionLooks } from '@app/document';
import { describe, expect, it } from 'vitest';
import exampleJson from '../document/test-designs/two-storey.json?raw';
import { expectIssue, expectOk } from '../document/test-fixtures';
import { readDesignJson, serializeDesignV2, validateDocumentV2, type DesignDocumentV2 } from '../document';
import { v2Raw } from '../document/test-fixtures';
import {
  applyDesignCommand,
  buildOccupancy,
  commitSpatialEdit,
  proposeSpatialEdit,
  resolveRelationships,
  type EdgeResolution,
  type RelationshipResolver,
} from './index';

/** v2Raw: rooms a = 1, b = 2; edge ab = 1 (access). */
const doc = (): DesignDocumentV2 => expectOk(validateDocumentV2(v2Raw()));

describe('resolveRelationships (direct, different-level, straight routing)', () => {
  it('resolves every migrated v1 edge as direct, with the v1 contact orientation', () => {
    const example = expectOk(readDesignJson(exampleJson)).doc;
    const r = resolveRelationships(example);
    expect(r.edges.map((e) => e.status)).toEqual(example.edges.map(() => 'direct'));
    const contact = Object.fromEntries(r.edges.map((e) => [e.edgeId, e.status === 'direct' ? e.contact : null]));
    expect(contact[1]).toBe('horizontal'); // entry-to-studio
    expect(contact[4]).toBe('vertical'); // entry-up
  });

  it('keeps a non-touching relationship valid and routes it with a straight connector', () => {
    // (Gate 0 asserted the `routing-unavailable` stub here; 02 replaced it with real routing.)
    const r = resolveRelationships(doc());
    const ab = r.byEdge.get(1)!;
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
    const ab = resolveRelationships(expectOk(validateDocumentV2(raw))).byEdge.get(1)!;
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
            look: { walls: 'enclosed', roof: 'flat' },
          },
        },
  );
  return { edges, byEdge: new Map(edges.map((r) => [r.edgeId, r])), occupancy: buildOccupancy(d, edges) };
};

describe('occupancy', () => {
  it('holds room cells and route reservations in one map', () => {
    const occ = fakeRouter(doc()).occupancy;
    expect(occ.at([1, 2, 0])).toEqual({ kind: 'room', nodeId: 1 });
    expect(occ.at([3, 0, 0])).toEqual({ kind: 'route', edgeId: 1 });
    expect(occ.at([3, 5, 0])).toBeUndefined();
    expect(occ.cells.size).toBe(6 + 1 + 3);
  });
});

describe('spatial edits (proposal → commit)', () => {
  it('rejects a room–room overlap and names the room', () => {
    const p = proposeSpatialEdit(doc(), { nodeId: 2, grid: [1, 1, 0] });
    expect(p.status).toBe('rejected');
    expect(p.status === 'rejected' && p.collidingRooms).toEqual([1]);
    expectIssue(commitSpatialEdit(p), 'room-overlap');
  });

  it('resizes anchored at the minimum corner', () => {
    const p = proposeSpatialEdit(doc(), { nodeId: 2, size: [2, 2, 1] });
    const next = expectOk(commitSpatialEdit(p));
    expect(next.nodes[1]).toMatchObject({ grid: [5, 0, 0], size: [2, 2, 1] });
  });

  it('asks for confirmation before taking connector cells; Cancel leaves the document unchanged', () => {
    const d = doc();
    const p = proposeSpatialEdit(d, { nodeId: 2, grid: [3, 3, 0], size: [1, 1, 1] }, { resolve: fakeRouter });
    expect(p.status).toBe('ok'); // (3,3) is not on the route
    const q = proposeSpatialEdit(d, { nodeId: 2, grid: [3, 0, 0] }, { resolve: fakeRouter });
    expect(q.status).toBe('needs-confirmation');
    expect(q.status === 'needs-confirmation' && q.displacedRoutes).toEqual([1]);
    expect(q.status === 'needs-confirmation' && q.impacted).toEqual([{ edgeId: 1, before: 'routed', after: 'unresolved' }]);
    expectIssue(commitSpatialEdit(q), 'route-displacement');
    const moved = expectOk(commitSpatialEdit(q, { confirmRouteDisplacement: true }));
    expect(moved.nodes[1]!.grid).toEqual([3, 0, 0]);
    expect(moved.edges).toEqual(d.edges); // the relationship is kept
    expect(d.nodes[1]!.grid).toEqual([5, 0, 0]);
  });
});

describe('applyDesignCommand (frozen v2 command shapes)', () => {
  it('adds a non-adjacent relationship, defaulting to access', () => {
    const d = expectOk(applyDesignCommand(doc(), { type: 'remove-edge', edgeId: 1 }));
    const next = expectOk(applyDesignCommand(d, { type: 'add-edge', edge: { source: 2, target: 1 } }));
    // The new edge takes the counter (2): the removed edge's id 1 is never reused.
    expect(next.edges).toEqual([{ id: 2, source: 2, target: 1, kind: 'access', attributes: {} }]);
    expect(next.nextEdgeId).toBe(3);
  });

  it('changes kind and the relationship’s own corridor fields; null clears a field, none left removes `corridor`', () => {
    let d = expectOk(applyDesignCommand(doc(), { type: 'change-edge-kind', edgeId: 1, kind: 'open' }));
    d = expectOk(applyDesignCommand(d, { type: 'set-edge-corridor', edgeId: 1, patch: { walls: 'enclosed' } }));
    expect(d.edges[0]).toMatchObject({ kind: 'open', corridor: { walls: 'enclosed' } });
    d = expectOk(applyDesignCommand(d, { type: 'set-edge-corridor', edgeId: 1, patch: { roof: 'pergola' } }));
    expect(d.edges[0]!.corridor).toEqual({ walls: 'enclosed', roof: 'pergola' });
    d = expectOk(applyDesignCommand(d, { type: 'set-edge-corridor', edgeId: 1, patch: { walls: null } }));
    expect(d.edges[0]!.corridor).toEqual({ roof: 'pergola' });
    d = expectOk(applyDesignCommand(d, { type: 'set-edge-corridor', edgeId: 1, patch: { roof: null } }));
    expect('corridor' in d.edges[0]!).toBe(false);
    // Runtime validation: an unknown value from an untyped caller is refused.
    expect(applyDesignCommand(d, { type: 'set-edge-corridor', edgeId: 1, patch: { roof: 'pitched' } } as never).ok).toBe(false);
  });

  it('add-edge keeps a given corridor look (validated)', () => {
    const d = expectOk(applyDesignCommand(doc(), { type: 'remove-edge', edgeId: 1 }));
    const n = expectOk(applyDesignCommand(d, { type: 'add-edge', edge: { source: 2, target: 1, corridor: { roof: 'none' } } }));
    expect(n.edges.at(-1)!.corridor).toEqual({ roof: 'none' });
    const plain = expectOk(applyDesignCommand(d, { type: 'add-edge', edge: { source: 2, target: 1, corridor: {} } }));
    expect('corridor' in plain.edges.at(-1)!).toBe(false);
  });

  it('patches and resets per-type appearance overrides', () => {
    let d = expectOk(applyDesignCommand(doc(), { type: 'set-look', by: 'function', group: { kind: 'value', value: 'gallery' }, patch: { windowFraction: 0.4 } }));
    d = expectOk(applyDesignCommand(d, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'gallery' }, patch: { roof: 'none' } }));
    expect(functionLooks(d.settings)).toEqual({ gallery: { windowFraction: 0.4, roof: 'none' } });
    d = expectOk(applyDesignCommand(d, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'gallery' }, patch: { windowFraction: null, roof: null } }));
    // An emptied value card is kept (its rooms look like Default); remove-style-group removes it.
    expect(functionLooks(d.settings)).toEqual({ gallery: {} });
    d = expectOk(applyDesignCommand(d, { type: 'remove-style-group', by: 'function', value: 'gallery' }));
    expect(d.settings).toEqual({ styleBy: 'function', styles: {} });
    expectIssue(
      applyDesignCommand(d, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'gallery' }, patch: { windowFraction: 2 } }),
      'schema',
    );
  });

  it('adds a room with the next id and default size; removal drops its edges and position; ids are never reused', () => {
    const d = expectOk(applyDesignCommand(doc(), { type: 'add-node', node: { grid: [0, 5, 0], typeId: 'storage' } }));
    expect(d.nodes[2]).toMatchObject({ id: 3, size: [1, 1, 1] });
    expect(d.nextNodeId).toBe(4);
    const r = expectOk(applyDesignCommand(d, { type: 'remove-node', nodeId: 3 }));
    expect(r.nextNodeId).toBe(4); // the counter does not go back
    const again = expectOk(applyDesignCommand(r, { type: 'add-node', node: { grid: [0, 5, 0], typeId: 'storage' } }));
    expect(again.nodes.map((n) => n.id)).toEqual([1, 2, 4]);
    const s = expectOk(applyDesignCommand(again, { type: 'remove-node', nodeId: 1 }));
    expect(s.edges).toEqual([]);
    expect(Object.keys(s.diagram.positions)).toEqual(['2']);
    expect(s.nodes.map((n) => n.id)).toEqual([2, 4]); // never renumbered
  });

  it('routes geometry through the spatial edit rules', () => {
    expectIssue(applyDesignCommand(doc(), { type: 'set-node-geometry', nodeId: 2, grid: [1, 0, 0] }), 'room-overlap');
    expectIssue(
      applyDesignCommand(doc(), { type: 'set-node-geometry', nodeId: 2, grid: [3, 0, 0] }, { resolve: fakeRouter }),
      'route-displacement',
    );
    const ok = applyDesignCommand(
      doc(),
      { type: 'set-node-geometry', nodeId: 2, grid: [3, 0, 0], confirmRouteDisplacement: true },
      { resolve: fakeRouter },
    );
    expect(expectOk(ok).nodes[1]!.grid).toEqual([3, 0, 0]);
  });

  it('refuses unknown ids by number; never mutates the input', () => {
    const d = doc();
    const before = serializeDesignV2(d);
    const missing = expectIssue(applyDesignCommand(d, { type: 'remove-edge', edgeId: 99 }), 'not-found');
    expect(missing.message).toBe('edge 99 does not exist');
    expect(expectIssue(applyDesignCommand(d, { type: 'remove-node', nodeId: 7 }), 'not-found').message).toBe('node 7 does not exist');
    expectOk(applyDesignCommand(d, { type: 'add-node', node: { grid: [0, 5, 0], typeId: 'storage' } }));
    expect(serializeDesignV2(d)).toBe(before);
  });
});
