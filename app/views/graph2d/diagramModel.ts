import type { Attributes, DesignDocument, DiagramPosition, EdgeKind, GraphCommand, GridCoord } from '@app/document';
import { nodeLabel, type DesignDocumentV2, type RelationshipKind, type RoomSize } from '@app/document/v2';
import type { DesignCommand, EdgeResolution, SpatialResolution } from '@app/spatial';
import { EMPTY_ATTRIBUTE_SCHEMA, viewAttributes, type ProjectAttributeSchema } from '@app/extensions';
import {
  defaultV1ConnectionKind,
  formatGrid,
  nextFreeId,
  suggestDiagramPosition,
  suggestFreeCell,
  suggestFreeCellV2,
  type DiagramSource,
} from './diagram';

/**
 * What the Graph 2D view draws, read from EITHER the schema-v1 document (`ViewProps.doc`, the
 * running app today) OR the schema-v2 port (`ViewProps.design`, supplied by integration). The
 * feature gate is the port's presence (docs/CONTRACTS-V2.md §6). Pure; the model is rebuilt from
 * the document on every change and never stored in view state.
 */

export interface DiagramNode {
  /** Permanent node id (selection, commands). Never renumbered. */
  readonly id: string;
  /** Short label shown in the circle: the stored v2 `displayId`, else the permanent id. */
  readonly label: string;
  readonly typeId: string;
  /** Minimum-corner cell. */
  readonly grid: GridCoord;
  /** Room size in cells; v1 rooms are always one cell. */
  readonly size: RoomSize;
  /**
   * What the circle and popover show: EFFECTIVE values of the project's node fields (shared
   * resolver: stored value, type default, field default), then stored values outside the schema.
   * Display data only; commands never write it back.
   */
  readonly attributes: Attributes;
}

export interface DiagramEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /** v1 `EdgeKind` or v2 `RelationshipKind`, according to the model's `version`. */
  readonly kind: EdgeKind | RelationshipKind;
  /** v2 only: the derived spatial status from the host's resolver. */
  readonly resolution?: EdgeResolution;
}

interface ModelBase {
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
  readonly byNode: ReadonlyMap<string, DiagramNode>;
  readonly diagram: DiagramSource['diagram'];
}

export type DiagramModel =
  | (ModelBase & { readonly version: 1; readonly doc: DesignDocument })
  | (ModelBase & { readonly version: 2; readonly doc: DesignDocumentV2; readonly spatial: SpatialResolution });

const ONE_CELL: RoomSize = [1, 1, 1];

export function modelFromV1(doc: DesignDocument): DiagramModel {
  const nodes = doc.nodes.map<DiagramNode>((n) => ({
    id: n.id,
    label: nodeLabel(n),
    typeId: n.typeId,
    grid: n.grid,
    size: ONE_CELL,
    attributes: n.attributes,
  }));
  const edges = doc.edges.map<DiagramEdge>((e) => ({ id: e.id, source: e.source, target: e.target, kind: e.kind }));
  return { version: 1, doc, nodes, edges, byNode: new Map(nodes.map((n) => [n.id, n])), diagram: doc.diagram };
}

export function modelFromV2(doc: DesignDocumentV2, spatial: SpatialResolution, schema: ProjectAttributeSchema = EMPTY_ATTRIBUTE_SCHEMA): DiagramModel {
  const nodes = doc.nodes.map<DiagramNode>((n) => ({
    id: n.id,
    label: nodeLabel(n),
    typeId: n.typeId,
    grid: n.grid,
    size: n.size,
    attributes: viewAttributes(schema, 'nodes', n),
  }));
  const edges = doc.edges.map<DiagramEdge>((e) => {
    const resolution = spatial.byEdge.get(e.id);
    return { id: e.id, source: e.source, target: e.target, kind: e.kind, ...(resolution ? { resolution } : {}) };
  });
  return { version: 2, doc, spatial, nodes, edges, byNode: new Map(nodes.map((n) => [n.id, n])), diagram: doc.diagram };
}

/** The relationship already joining `a` and `b` in either direction (one per pair is allowed). */
export function edgeBetween(model: DiagramModel, a: string, b: string): DiagramEdge | undefined {
  return model.edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
}

/** Beginner wording for where a room sits: minimum cell, size (when larger than one cell) and storey(s). */
export function describePlacement(node: DiagramNode): string {
  const big = node.size.some((s) => s !== 1);
  const storeys = node.size[2] > 1 ? `storeys ${node.grid[2]}–${node.grid[2] + node.size[2] - 1}` : `storey ${node.grid[2]}`;
  return `cell ${formatGrid(node.grid)}${big ? ` · ${node.size.join('×')} cells` : ''} · ${storeys}`;
}

// ── Commands ──────────────────────────────────────────────────────────────────────────────────

/** A command for whichever document the model reads. The view sends it to the matching handler. */
export type ModelCommand =
  | { readonly version: 1; readonly command: GraphCommand }
  | { readonly version: 2; readonly command: DesignCommand };

const v1 = (command: GraphCommand): ModelCommand => ({ version: 1, command });
const v2 = (command: DesignCommand): ModelCommand => ({ version: 2, command });

export type ConnectRequest =
  | { readonly status: 'command'; readonly edgeId: string; readonly command: ModelCommand }
  | { readonly status: 'existing'; readonly edgeId: string }
  | { readonly status: 'refused'; readonly message: string };

/**
 * The command that connects `source` to `target`, created immediately without a kind dialog.
 * - v2: `add-edge` WITHOUT `kind`, so the contract default (`access`) applies. The rooms need not
 *   touch: an unresolved relationship is valid graph data and is shown as such.
 * - v1: `door` (side by side) or `vertical-access` (stacked); refused, with a reason, when the
 *   cells do not share a face because a v1 document cannot store that relationship.
 * A pair that is already connected is reported (`existing`) instead of duplicated.
 */
export function connectRequest(model: DiagramModel, sourceId: string, targetId: string): ConnectRequest {
  const source = model.byNode.get(sourceId);
  const target = model.byNode.get(targetId);
  if (!source || !target) return { status: 'refused', message: 'That node no longer exists.' };
  if (sourceId === targetId) return { status: 'refused', message: 'A node cannot be connected to itself.' };
  const existing = edgeBetween(model, sourceId, targetId);
  if (existing) return { status: 'existing', edgeId: existing.id };
  const edgeId = nextFreeId('edge', model.edges.map((e) => e.id));
  if (model.version === 2) {
    return { status: 'command', edgeId, command: v2({ type: 'add-edge', edge: { id: edgeId, source: sourceId, target: targetId } }) };
  }
  const kind = defaultV1ConnectionKind(source.grid, target.grid);
  if (!kind) {
    return {
      status: 'refused',
      message:
        `${source.label} ${formatGrid(source.grid)} and ${target.label} ${formatGrid(target.grid)} do not share a face. ` +
        'This (schema v1) design can only connect rooms that touch.',
    };
  }
  return { status: 'command', edgeId, command: v1({ type: 'add-edge', edge: { id: edgeId, source: sourceId, target: targetId, kind } }) };
}

/** Add a node beside `nearNodeId` (if given), at an explicit diagram position or a suggested one. */
export function addNodeRequest(
  model: DiagramModel,
  nearNodeId?: string,
  at?: DiagramPosition,
): { readonly nodeId: string; readonly command: ModelCommand } {
  const near = nearNodeId === undefined ? undefined : model.byNode.get(nearNodeId);
  const nodeId = nextFreeId('node', model.nodes.map((n) => n.id));
  const typeId = near?.typeId ?? 'room';
  const diagramPosition = at ?? suggestDiagramPosition(model, near?.id);
  if (model.version === 2) {
    // displayId omitted: the command assigns `nextDisplayId(doc)`.
    const grid = suggestFreeCellV2(model.doc, model.spatial.occupancy, near?.id);
    return { nodeId, command: v2({ type: 'add-node', node: { id: nodeId, grid, typeId, attributes: {} }, diagramPosition }) };
  }
  const grid = suggestFreeCell(model.doc, near?.id);
  return { nodeId, command: v1({ type: 'add-node', node: { id: nodeId, grid, typeId, attributes: {} }, diagramPosition }) };
}

export const removeNodeCommand = (model: DiagramModel, nodeId: string): ModelCommand =>
  model.version === 2 ? v2({ type: 'remove-node', nodeId }) : v1({ type: 'remove-node', nodeId });

export const removeEdgeCommand = (model: DiagramModel, edgeId: string): ModelCommand =>
  model.version === 2 ? v2({ type: 'remove-edge', edgeId }) : v1({ type: 'remove-edge', edgeId });

/** Diagram drag: changes only `diagram.positions`, never the room's cell. */
export const diagramPositionCommand = (model: DiagramModel, nodeId: string, position: DiagramPosition): ModelCommand =>
  model.version === 2
    ? v2({ type: 'set-diagram-position', nodeId, position })
    : v1({ type: 'set-diagram-position', nodeId, position });

/** v2 relationship intent change (Access ↔ Open). */
export const changeRelationshipKindCommand = (edgeId: string, kind: RelationshipKind): ModelCommand =>
  v2({ type: 'change-edge-kind', edgeId, kind });

/** v1 edge kind change (geometry-checked by the v1 validator). */
export const changeV1EdgeKindCommand = (edgeId: string, kind: EdgeKind): ModelCommand =>
  v1({ type: 'change-edge-kind', edgeId, kind });
