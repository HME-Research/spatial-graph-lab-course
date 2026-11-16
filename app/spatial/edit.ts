import { gridKey } from '@core/spatial';
import { fail, issue, ok, type Result } from '@app/document';
import {
  footprintCells,
  footprintsOverlap,
  validateDocumentV2,
  type DesignDocumentV2,
  type RoomNode,
  type ValidationOptionsV2,
} from '@app/document/v2';
import type { EdgeImpact, RelationshipResolver, SpatialEditProposal, SpatialEditRequest } from './contracts';
import { resolveRelationships } from './resolve';

export interface SpatialEditOptions {
  /** Defaults to `resolveRelationships`. */
  readonly resolve?: RelationshipResolver;
  readonly validation?: ValidationOptionsV2;
}

/**
 * Pure preview of moving and/or resizing one room (minimum-corner anchored). Nothing is applied.
 * - A room overlap is always rejected.
 * - Taking cells of ANOTHER room's relationship connector needs confirmation ("Move anyway and
 *   recalculate"): never a silent reroute of a relationship the student is not editing.
 * - Taking cells of the moved room's OWN relationship connector (moving or growing along its own
 *   corridor) needs confirmation only if one of its relationships would become unresolved;
 *   otherwise the corridor is simply recalculated (programme phase 07, A11).
 */
export function proposeSpatialEdit(
  doc: DesignDocumentV2,
  request: SpatialEditRequest,
  options: SpatialEditOptions = {},
): SpatialEditProposal {
  const resolve = options.resolve ?? resolveRelationships;
  const index = doc.nodes.findIndex((n) => n.id === request.nodeId);
  if (index < 0) {
    return {
      status: 'rejected',
      issues: [issue(['nodes'], 'not-found', `node "${request.nodeId}" does not exist`)],
      collidingRooms: [],
    };
  }
  const node = doc.nodes[index]!;
  const moved: RoomNode = {
    ...node,
    grid: request.grid ? [request.grid[0], request.grid[1], request.grid[2]] : node.grid,
    size: request.size ? [request.size[0], request.size[1], request.size[2]] : node.size,
  };
  const candidate: DesignDocumentV2 = { ...doc, nodes: doc.nodes.map((n, i) => (i === index ? moved : n)) };
  const validated = validateDocumentV2(candidate, options.validation);
  if (!validated.ok) {
    const collidingRooms = doc.nodes.filter((o) => o.id !== node.id && footprintsOverlap(o, moved)).map((o) => o.id);
    return { status: 'rejected', issues: validated.issues, collidingRooms };
  }
  const next = validated.value;
  const before = resolve(doc);
  const after = resolve(next);
  const displaced = new Set<string>();
  for (const cell of footprintCells(moved)) {
    const occupant = before.occupancy.cells.get(gridKey(cell));
    if (occupant?.kind === 'route') displaced.add(occupant.edgeId);
  }
  const impacted: EdgeImpact[] = after.edges.flatMap((r) => {
    const was = before.byEdge.get(r.edgeId)?.status;
    return was !== undefined && was !== r.status ? [{ edgeId: r.edgeId, before: was, after: r.status }] : [];
  });
  const own = new Set(doc.edges.filter((e) => e.source === node.id || e.target === node.id).map((e) => e.id));
  const ownBreaks = [...own].some((id) => after.byEdge.get(id)?.status === 'unresolved' && before.byEdge.get(id)?.status !== 'unresolved');
  const needsConfirmation = [...displaced].some((id) => !own.has(id)) || (ownBreaks && [...displaced].some((id) => own.has(id)));
  return needsConfirmation
    ? { status: 'needs-confirmation', next, displacedRoutes: [...displaced].sort(), impacted }
    : { status: 'ok', next, impacted };
}

/**
 * Turn a proposal into the document to store (one history step). A `needs-confirmation` proposal
 * commits only with `confirmRouteDisplacement: true` ("Move anyway and recalculate").
 */
export function commitSpatialEdit(
  proposal: SpatialEditProposal,
  options: { readonly confirmRouteDisplacement?: boolean } = {},
): Result<DesignDocumentV2> {
  switch (proposal.status) {
    case 'rejected':
      return fail(proposal.issues);
    case 'ok':
      return ok(proposal.next);
    case 'needs-confirmation':
      return options.confirmRouteDisplacement
        ? ok(proposal.next)
        : fail([
            issue(
              ['nodes'],
              'route-displacement',
              `this would take cells of the connector(s) of ${proposal.displacedRoutes.map((e) => `"${e}"`).join(', ')}; ` +
                'confirm "Move anyway and recalculate" to continue',
            ),
          ]);
  }
}
