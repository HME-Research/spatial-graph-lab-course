import type { DesignDocumentV2 } from '@app/document';
import type { SpatialResolution } from '@app/spatial';
import { resolveBuildingFaces } from '@app/building';
import type { MetricContext } from './contracts';

/**
 * Per-room counts of EXTERIOR unit WALL faces (x/y directions), from the same face resolution the
 * Building view draws (`resolveBuildingFaces`). A face is exterior only when its neighbour cell is
 * empty: faces shared with another room, and faces touching a generated connector cell, are not.
 * Slabs (floor, roof) are never counted. Memoised per (document, resolution) identity pair.
 */
const cache = new WeakMap<DesignDocumentV2, WeakMap<SpatialResolution, ReadonlyMap<number, number>>>();

export function exteriorWallFaceCounts({ doc, spatial }: MetricContext): ReadonlyMap<number, number> {
  let bySpatial = cache.get(doc);
  if (!bySpatial) cache.set(doc, (bySpatial = new WeakMap()));
  let counts = bySpatial.get(spatial);
  if (!counts) {
    const out = new Map<number, number>(doc.nodes.map((n) => [n.id, 0] as const));
    for (const face of resolveBuildingFaces(doc, spatial)) {
      if (face.orientation === 'wall' && face.condition === 'exterior') out.set(face.ownerNodeId, (out.get(face.ownerNodeId) ?? 0) + 1);
    }
    counts = out;
    bySpatial.set(spatial, counts);
  }
  return counts;
}
