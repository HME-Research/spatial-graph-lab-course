/** Shared helpers for Properties tests (imported by *.test.ts only). */
import type { GridCoord } from '@core/spatial';
import { expectOk } from '@app/document/test-fixtures';
import { footprintsOverlap, validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
import {
  applyDesignCommand,
  buildOccupancy,
  proposeSpatialEdit,
  resolveRelationships,
  type DesignCommand,
  type DesignPort,
  type EdgeResolution,
  type RelationshipResolver,
} from '@app/spatial';

/**
 * Rooms a (01, 2×3×1 at the origin) and b (02, 1×1×1 at x=5), related by `ab` (access); room
 * c (03) sits away from them at y=6. Real straight routing is still a Gate 0 stub (02 owns it).
 */
export function corridorRaw() {
  return {
    schemaVersion: 2,
    metadata: { name: 'corridor' },
    nodes: [
      { id: 'a', displayId: '01', grid: [0, 0, 0], size: [2, 3, 1], typeId: 'gallery', attributes: {} },
      { id: 'b', displayId: '02', grid: [5, 0, 0], size: [1, 1, 1], typeId: 'studio', attributes: {} },
      { id: 'c', displayId: '03', grid: [0, 6, 0], size: [1, 1, 1], typeId: 'studio', attributes: {} },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b', kind: 'access', attributes: {} }],
    diagram: { positions: {} },
    settings: { styleBy: 'function', styles: {} },
  };
}

const CORRIDOR: readonly GridCoord[] = [
  [2, 0, 0],
  [3, 0, 0],
  [4, 0, 0],
];

/**
 * Test stand-in for 02's router: edge `ab` is routed through the fixed cells x=2..4, y=0, z=0
 * while they are free of rooms, otherwise `blocked-by-room`. Every other edge: real resolver.
 */
export const fixedCorridorResolver: RelationshipResolver = (doc) => {
  const real = resolveRelationships(doc);
  const free = !doc.nodes.some((n) => CORRIDOR.some((cell) => footprintsOverlap(n, { grid: cell, size: [1, 1, 1] })));
  const edges = real.edges.map((r): EdgeResolution => {
    if (r.edgeId !== 'ab' || r.status === 'direct') return r;
    if (!free) return { edgeId: r.edgeId, kind: r.kind, status: 'unresolved', reason: 'blocked-by-room', message: 'blocked' };
    return {
      edgeId: r.edgeId,
      kind: r.kind,
      status: 'routed',
      route: {
        edgeId: 'ab',
        axis: 'x',
        level: 0,
        cells: CORRIDOR,
        from: { nodeId: 'a', cell: [1, 0, 0], direction: '+x' },
        to: { nodeId: 'b', cell: [5, 0, 0], direction: '-x' },
        style: doc.edges.find((e) => e.id === 'ab')?.connectorStyle ?? 'enclosed',
      },
    };
  });
  return { edges, byEdge: new Map(edges.map((e) => [e.edgeId, e])), occupancy: buildOccupancy(doc, edges) };
};

export interface FakePort extends DesignPort {
  /** Every command received, accepted or not. */
  readonly sent: DesignCommand[];
  /** The document after the accepted commands (the port's `doc` stays the one it was built with). */
  latest(): DesignDocumentV2;
}

/** A DesignPort as the integration owner will build it, over a fixed starting document. */
export function fakePort(raw: unknown = corridorRaw(), resolve: RelationshipResolver = fixedCorridorResolver): FakePort {
  const doc = expectOk(validateDocumentV2(raw));
  const sent: DesignCommand[] = [];
  let latest = doc;
  return {
    doc,
    spatial: resolve(doc),
    sent,
    latest: () => latest,
    onCommand: (command) => {
      sent.push(command);
      const result = applyDesignCommand(latest, command, { resolve });
      if (!result.ok) return { ok: false, issues: result.issues };
      latest = result.value;
      return { ok: true };
    },
    proposeEdit: (request) => proposeSpatialEdit(doc, request, { resolve }),
  };
}
