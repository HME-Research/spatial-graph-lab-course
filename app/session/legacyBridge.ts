import type { DesignDocument, EdgeKind, GraphCommand, GraphEdge } from '@app/document';
import { relationshipKindForV1, roomContact, v1KindFor, type DesignDocumentV2, type RelationshipEdge } from '@app/document/v2';
import type { DesignCommand } from '@app/spatial';

/**
 * Integration bridge between the stored schema-v2 document and the v1-typed parts of the frozen
 * view contract (`ViewProps.doc`, `ViewProps.onCommand`). Pure.
 *
 * After Gate 1 the app stores, edits, undoes and exports ONLY a `DesignDocumentV2`. Views receive
 * it through `ViewProps.design` (the `DesignPort`). `ViewProps.doc` is still required by the
 * frozen contract, so it receives a READ-ONLY v1-shaped projection of the same document:
 *
 * - ids, cells (minimum corner), types, attributes, metadata and diagram positions are the v2 values;
 * - `size` and `displayId` are dropped (v2-aware code reads `design.doc`);
 * - each relationship gets the v1 kind with the same direct-contact meaning (`v1KindFor`), or, for
 *   rooms that do not touch, `door` (Access) / `open` (Open).
 *
 * The projection is NOT a valid v1 document in general (multicell rooms, separated relationships)
 * and is never validated, stored, exported or written: it only feeds identity-based helpers
 * (selection reconciliation, project conformance) and code paths that have not been converted.
 * It is cached per v2 document object, so views memoised on `doc` stay stable between renders.
 */

const projections = new WeakMap<DesignDocumentV2, DesignDocument>();

function legacyKind(doc: DesignDocumentV2, edge: RelationshipEdge): EdgeKind {
  const a = doc.nodes.find((n) => n.id === edge.source);
  const b = doc.nodes.find((n) => n.id === edge.target);
  const direct = a && b ? v1KindFor(edge.kind, roomContact(a, b)) : null;
  return direct ?? (edge.kind === 'open' ? 'open' : 'door');
}

/** Read-only v1-shaped view of a v2 document (see the module comment). */
export function legacyProjection(doc: DesignDocumentV2): DesignDocument {
  let projected = projections.get(doc);
  if (!projected) {
    projected = {
      schemaVersion: 1,
      metadata: doc.metadata,
      nodes: doc.nodes.map((n) => ({ id: n.id, grid: n.grid, typeId: n.typeId, attributes: n.attributes })),
      edges: doc.edges.map(
        (e): GraphEdge => ({ id: e.id, source: e.source, target: e.target, kind: legacyKind(doc, e), attributes: e.attributes }),
      ),
      diagram: doc.diagram,
    };
    projections.set(doc, projected);
  }
  return projected;
}

/**
 * The v2 command for a v1 view command, so that a view that has not been converted still edits the
 * stored v2 document through the same validated path (one command = one history step).
 * `move-node` becomes `set-node-geometry` (grid only); v1 edge kinds map with `V1_KIND_TO_RELATIONSHIP`.
 */
export function designCommandFromLegacy(command: GraphCommand): DesignCommand {
  switch (command.type) {
    case 'add-node':
      return {
        type: 'add-node',
        node: { id: command.node.id, grid: command.node.grid, typeId: command.node.typeId, attributes: { ...command.node.attributes } },
        ...(command.diagramPosition && { diagramPosition: command.diagramPosition }),
      };
    case 'move-node':
      return { type: 'set-node-geometry', nodeId: command.nodeId, grid: command.grid };
    case 'add-edge':
      return {
        type: 'add-edge',
        edge: {
          id: command.edge.id,
          source: command.edge.source,
          target: command.edge.target,
          kind: relationshipKindForV1(command.edge.kind),
          attributes: { ...command.edge.attributes },
        },
      };
    case 'change-edge-kind':
      return { type: 'change-edge-kind', edgeId: command.edgeId, kind: relationshipKindForV1(command.kind) };
    case 'remove-node':
    case 'set-node-type':
    case 'set-node-attributes':
    case 'set-diagram-position':
    case 'remove-edge':
      return command;
    default: {
      const unreachable: never = command;
      throw new Error(`unknown graph command ${JSON.stringify(unreachable)}`);
    }
  }
}
