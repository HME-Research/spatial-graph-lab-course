/** Shared metric test fixtures (imported by *.test.ts only). Values are computed by hand in the tests. */
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { resolveRelationships } from '@app/spatial';
import type { MetricContext } from './contracts';

function valid(raw: unknown): DesignDocumentV2 {
  const r = validateDocumentV2(raw);
  if (!r.ok) throw new Error(`invalid fixture: ${JSON.stringify(r.issues)}`);
  return r.value;
}

/**
 * Plan of storey 0 (x →, y ↓ in this sketch; `=` are connector cells of e2):
 *
 *   y=0   hall hall shop  =    =   cafe
 *   y=1   hall hall  .   kiosk
 *
 * - hall: 2×2×2 (storeys 0–1), the only multi-storey room.
 * - shop touches hall (+x of hall cell [1,0,0]); e1 hall–shop access → direct.
 * - e2 shop–cafe access, enclosed connector → routed through [3,0,0], [4,0,0] (2 cells = 6 m).
 * - kiosk [3,1,0] has no relationship; its −y wall runs alongside the enclosed connector (solid, not exterior).
 * - loft [0,5,3] stands alone on storey 3; e3 hall–loft (open) and e4 cafe–loft → unresolved (different level).
 * - e5 hall–cafe → unresolved (the straight line on storey 0 passes through shop).
 */
export function metricsLabDoc(): DesignDocumentV2 {
  return valid({
    schemaVersion: 2,
    metadata: { name: 'Metrics lab' },
    nodes: [
      { id: 1, position: [0, 0, 0], size: [2, 2, 2], function: 'gallery', custom: {} },
      { id: 2, position: [2, 0, 0], function: 'studio', custom: {} },
      { id: 3, position: [5, 0, 0], function: 'studio', custom: {} },
      { id: 4, position: [3, 1, 0], function: 'studio', custom: {} },
      { id: 5, position: [0, 5, 3], function: 'gallery', custom: {} },
    ],
    edges: [
      { id: 1, source: 1, target: 2, relationship: 'access', custom: {} },
      { id: 2, source: 2, target: 3, relationship: 'access', corridor: { walls: 'enclosed' }, custom: {} },
      { id: 3, source: 1, target: 5, relationship: 'open', custom: {} },
      { id: 4, source: 3, target: 5, relationship: 'access', custom: {} },
      { id: 5, source: 1, target: 3, relationship: 'access', custom: {} },
    ],
  });
}

/** A plus shape on storey 0: `c` is enclosed on all four sides by n, s, e, w (no edges). */
export function enclosedDoc(): DesignDocumentV2 {
  return valid({
    schemaVersion: 2,
    metadata: { name: 'Enclosed' },
    nodes: [
      { id: 1, position: [1, 1, 0], function: 'room', custom: {} },
      { id: 2, position: [1, 2, 0], function: 'room', custom: {} },
      { id: 3, position: [1, 0, 0], function: 'room', custom: {} },
      { id: 4, position: [2, 1, 0], function: 'room', custom: {} },
      { id: 5, position: [0, 1, 0], function: 'room', custom: {} },
    ],
    edges: [],
  });
}

export const metricCtx = (doc: DesignDocumentV2): MetricContext => ({ doc, spatial: resolveRelationships(doc) });
