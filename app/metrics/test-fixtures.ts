/** Shared metric test fixtures (imported by *.test.ts only). Values are computed by hand in the tests. */
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
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
      { id: 'hall', displayId: '01', grid: [0, 0, 0], size: [2, 2, 2], typeId: 'gallery', attributes: {} },
      { id: 'shop', displayId: '02', grid: [2, 0, 0], typeId: 'studio', attributes: {} },
      { id: 'cafe', displayId: '03', grid: [5, 0, 0], typeId: 'studio', attributes: {} },
      { id: 'kiosk', displayId: '04', grid: [3, 1, 0], typeId: 'studio', attributes: {} },
      { id: 'loft', displayId: '05', grid: [0, 5, 3], typeId: 'gallery', attributes: {} },
    ],
    edges: [
      { id: 'e1', source: 'hall', target: 'shop', kind: 'access', attributes: {} },
      { id: 'e2', source: 'shop', target: 'cafe', kind: 'access', connectorStyle: 'enclosed', attributes: {} },
      { id: 'e3', source: 'hall', target: 'loft', kind: 'open', attributes: {} },
      { id: 'e4', source: 'cafe', target: 'loft', kind: 'access', attributes: {} },
      { id: 'e5', source: 'hall', target: 'cafe', kind: 'access', attributes: {} },
    ],
  });
}

/** A plus shape on storey 0: `c` is enclosed on all four sides by n, s, e, w (no edges). */
export function enclosedDoc(): DesignDocumentV2 {
  return valid({
    schemaVersion: 2,
    metadata: { name: 'Enclosed' },
    nodes: [
      { id: 'c', grid: [1, 1, 0], typeId: 'room', attributes: {} },
      { id: 'n', grid: [1, 2, 0], typeId: 'room', attributes: {} },
      { id: 's', grid: [1, 0, 0], typeId: 'room', attributes: {} },
      { id: 'e', grid: [2, 1, 0], typeId: 'room', attributes: {} },
      { id: 'w', grid: [0, 1, 0], typeId: 'room', attributes: {} },
    ],
    edges: [],
  });
}

export const metricCtx = (doc: DesignDocumentV2): MetricContext => ({ doc, spatial: resolveRelationships(doc) });
