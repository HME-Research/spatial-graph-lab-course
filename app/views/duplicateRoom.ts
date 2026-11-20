import { type GraphIssue, issue } from '@app/document';
import { duplicateRoomRequest, type DesignPort } from '@app/spatial';
import { suggestDiagramPosition } from './graph2d/diagram';

/**
 * "Duplicate" for one room, shared by the Graph 2D menu, Ctrl+D (app-wide, App) and Properties: ONE `add-node`
 * command through the design port (one Undo step, "Duplicate room 3 as room 6"). The copy is placed
 * by `duplicateRoomRequest` (closest free place) and drawn in the diagram beside the original.
 * Nothing changes when there is no place or the command is refused.
 */
export type DuplicateOutcome =
  | { readonly ok: true; readonly nodeId: number; readonly message: string }
  | { readonly ok: false; readonly issues: readonly GraphIssue[] };

export function duplicateRoom(design: Pick<DesignPort, 'doc' | 'spatial' | 'onCommand'>, nodeId: number): DuplicateOutcome {
  const request = duplicateRoomRequest(design.doc, nodeId, {
    occupancy: design.spatial.occupancy,
    diagramPosition: suggestDiagramPosition(design.doc, nodeId),
  });
  if (request.status === 'refused') return { ok: false, issues: [issue(['nodes'], 'schema', request.message)] };
  const outcome = design.onCommand(request.command);
  if (!outcome.ok) return { ok: false, issues: outcome.issues };
  return {
    ok: true,
    nodeId: request.nodeId,
    message: `Duplicated room ${nodeId} as room ${request.nodeId} at [${request.position.join(', ')}]. Relationships are not copied.`,
  };
}
