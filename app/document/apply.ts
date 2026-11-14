import {
  addEdge,
  addNode,
  changeEdgeKind,
  moveNode,
  removeEdge,
  removeNode,
  setDiagramPosition,
  setNodeAttributes,
  setNodeType,
  type NewEdge,
  type NewNode,
} from './commands';
import type { EdgeKind } from './constants';
import type { Result } from './errors';
import type { Attributes, DesignDocument, DiagramPosition, GridCoord } from './schema';
import type { ValidationOptions } from './validate';

/**
 * A serialisable request to change the document. Views emit these; only the app applies them
 * (via `applyGraphCommand`), so undo/redo and validation stay in one place.
 */
export type GraphCommand =
  | { readonly type: 'add-node'; readonly node: NewNode; readonly diagramPosition?: DiagramPosition }
  | { readonly type: 'remove-node'; readonly nodeId: string }
  | { readonly type: 'move-node'; readonly nodeId: string; readonly grid: GridCoord }
  | { readonly type: 'set-node-type'; readonly nodeId: string; readonly typeId: string }
  | { readonly type: 'set-node-attributes'; readonly nodeId: string; readonly attributes: Attributes }
  | { readonly type: 'set-diagram-position'; readonly nodeId: string; readonly position: DiagramPosition }
  | { readonly type: 'add-edge'; readonly edge: NewEdge }
  | { readonly type: 'remove-edge'; readonly edgeId: string }
  | { readonly type: 'change-edge-kind'; readonly edgeId: string; readonly kind: EdgeKind };

export type GraphCommandType = GraphCommand['type'];

/** Apply one command purely. Returns a new validated document or readable issues. */
export function applyGraphCommand(
  doc: DesignDocument,
  command: GraphCommand,
  options?: ValidationOptions,
): Result<DesignDocument> {
  switch (command.type) {
    case 'add-node':
      return addNode(doc, command.node, command.diagramPosition, options);
    case 'remove-node':
      return removeNode(doc, command.nodeId, options);
    case 'move-node':
      return moveNode(doc, command.nodeId, command.grid, options);
    case 'set-node-type':
      return setNodeType(doc, command.nodeId, command.typeId, options);
    case 'set-node-attributes':
      return setNodeAttributes(doc, command.nodeId, command.attributes, options);
    case 'set-diagram-position':
      return setDiagramPosition(doc, command.nodeId, command.position, options);
    case 'add-edge':
      return addEdge(doc, command.edge, options);
    case 'remove-edge':
      return removeEdge(doc, command.edgeId, options);
    case 'change-edge-kind':
      return changeEdgeKind(doc, command.edgeId, command.kind, options);
    default: {
      const unreachable: never = command;
      throw new Error(`unknown graph command ${JSON.stringify(unreachable)}`);
    }
  }
}
