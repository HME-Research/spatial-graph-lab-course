import type { EdgeKind } from '../constants';
import type { DesignDocument } from '../schema';
import { DEFAULT_ROOM_SIZE, SCHEMA_VERSION_V2, V1_KIND_TO_RELATIONSHIP, type RelationshipKind } from './constants';
import { formatDisplayId } from './display';
import type { RoomContact } from './footprint';
import type { DesignDocumentV2 } from './schema';

/**
 * v1 → v2 migration — FROZEN Gate 0 mapping. Pure and deterministic; never mutates its input.
 *
 * - Node `id`, `grid`, `typeId`, `attributes` and diagram positions are kept exactly.
 *   `size` = [1, 1, 1]. `displayId` = 1-based position in the v1 node array, zero-padded to two
 *   digits ("01", "02", …, "100"): assigned ONCE here and stored, never recomputed from order.
 * - Edge kinds: door → access, vertical-access → access, open → open, atrium → open.
 *   `connectorStyle` is not written (default applies). Edge ids and attributes are kept.
 * - No information is lost: every valid v1 edge joins face-adjacent cells, so the original kind
 *   is recovered from (relationship kind, contact) by `v1KindFor` — door/open are horizontal,
 *   vertical-access/atrium are vertical. The direct-contact building semantics are therefore
 *   unchanged (door → door wall, open → no wall, atrium → slab void, vertical-access → slab
 *   opening + access marker).
 * - `settings` is empty: every type inherits its project façade; roofs default to flat (the
 *   one visible difference from v1's open-top Architecture view).
 *
 * Expects a VALIDATED v1 document (use readDesign for raw input).
 */
export function migrateV1toV2(doc: DesignDocument): DesignDocumentV2 {
  return {
    schemaVersion: SCHEMA_VERSION_V2,
    metadata:
      doc.metadata.description === undefined
        ? { name: doc.metadata.name }
        : { name: doc.metadata.name, description: doc.metadata.description },
    nodes: doc.nodes.map((n, i) => ({
      id: n.id,
      displayId: formatDisplayId(i + 1),
      grid: [n.grid[0], n.grid[1], n.grid[2]],
      size: [...DEFAULT_ROOM_SIZE],
      typeId: n.typeId,
      attributes: { ...n.attributes },
    })),
    edges: doc.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: relationshipKindForV1(e.kind),
      attributes: { ...e.attributes },
    })),
    diagram: { positions: Object.fromEntries(Object.entries(doc.diagram.positions).map(([k, p]) => [k, [p[0], p[1]]])) },
    settings: { typeAppearance: {} },
  };
}

export const relationshipKindForV1 = (kind: EdgeKind): RelationshipKind => V1_KIND_TO_RELATIONSHIP[kind];

/**
 * The v1 edge kind with the same direct-contact meaning, or null when the rooms do not touch
 * (no v1 equivalent). Lets building code keep the v1 face conditions for direct relationships.
 */
export function v1KindFor(kind: RelationshipKind, contact: RoomContact): EdgeKind | null {
  if (contact === null) return null;
  if (kind === 'access') return contact === 'horizontal' ? 'door' : 'vertical-access';
  return contact === 'horizontal' ? 'open' : 'atrium';
}
