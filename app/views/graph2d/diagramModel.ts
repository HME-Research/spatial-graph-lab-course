import type { Attributes, DiagramPosition, GridCoord } from '@app/document';
import { nodeLabel, type DesignDocumentV2, type RelationshipKind, type RoomSize } from '@app/document/v2';
import type { DesignCommand, EdgeResolution, SpatialResolution } from '@app/spatial';
import { EMPTY_ATTRIBUTE_SCHEMA, viewAttributes, type ProjectAttributeSchema } from '@app/extensions';
import { formatGrid, nextFreeId, suggestDiagramPosition, suggestFreeCellV2, type DiagramSource } from './diagram';

/**
 * What the Graph 2D view draws, read from the design port (`ViewProps.design`). Pure; the model
 * is rebuilt from the document on every change and never stored in view state.
 */

export interface DiagramNode {
  /** Permanent node id (selection, commands). Never renumbered. */
  readonly id: string;
  /** Short label shown in the circle: the stored `displayId`, else the permanent id. */
  readonly label: string;
  readonly typeId: string;
  /** Minimum-corner cell. */
  readonly grid: GridCoord;
  /** Room size in cells. */
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
  readonly kind: RelationshipKind;
  /** The derived spatial status from the host's resolver. */
  readonly resolution?: EdgeResolution;
}

export interface DiagramModel {
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
  readonly byNode: ReadonlyMap<string, DiagramNode>;
  readonly diagram: DiagramSource['diagram'];
  readonly doc: DesignDocumentV2;
  readonly spatial: SpatialResolution;
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
  return { doc, spatial, nodes, edges, byNode: new Map(nodes.map((n) => [n.id, n])), diagram: doc.diagram };
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

/** A command the view sends through `design.onCommand`. */
export type ModelCommand = DesignCommand;

export type ConnectRequest =
  | { readonly status: 'command'; readonly edgeId: string; readonly command: ModelCommand }
  | { readonly status: 'existing'; readonly edgeId: string }
  | { readonly status: 'refused'; readonly message: string };

/**
 * The command that connects `source` to `target`, created immediately without a kind dialog.
 * `add-edge` WITHOUT `kind`, so the contract default (`access`) applies. The rooms need not
 * touch: an unresolved relationship is valid graph data and is shown as such.
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
  return { status: 'command', edgeId, command: { type: 'add-edge', edge: { id: edgeId, source: sourceId, target: targetId } } };
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
  // displayId omitted: the command assigns `nextDisplayId(doc)`.
  const grid = suggestFreeCellV2(model.doc, model.spatial.occupancy, near?.id);
  return { nodeId, command: { type: 'add-node', node: { id: nodeId, grid, typeId, attributes: {} }, diagramPosition } };
}

export const removeNodeCommand = (_model: DiagramModel, nodeId: string): ModelCommand => ({ type: 'remove-node', nodeId });

export const removeEdgeCommand = (_model: DiagramModel, edgeId: string): ModelCommand => ({ type: 'remove-edge', edgeId });

/** Diagram drag: changes only `diagram.positions`, never the room's cell. */
export const diagramPositionCommand = (_model: DiagramModel, nodeId: string, position: DiagramPosition): ModelCommand => ({
  type: 'set-diagram-position',
  nodeId,
  position,
});

/** Relationship intent change (Access ↔ Open). */
export const changeRelationshipKindCommand = (edgeId: string, kind: RelationshipKind): ModelCommand => ({ type: 'change-edge-kind', edgeId, kind });
