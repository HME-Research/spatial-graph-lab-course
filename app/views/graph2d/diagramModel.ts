import {
  type Attributes,
  type DesignDocumentV2,
  type DiagramPosition,
  type GridCoord,
  nodeLabel,
  type RelationshipKind,
  type RoomSize,
} from '@app/document';
import type { DesignCommand, EdgeResolution, SpatialResolution } from '@app/spatial';
import { EMPTY_ATTRIBUTE_SCHEMA, viewAttributes, type ProjectAttributeSchema } from '@app/extensions';
import { formatGrid, suggestDiagramPosition, suggestFreeCellV2, type DiagramSource } from './diagram';

/**
 * What the Graph 2D view draws, read from the design port (`ViewProps.design`). Pure; the model
 * is rebuilt from the document on every change and never stored in view state.
 */

export interface DiagramNode {
  /** Permanent node id (selection, commands). Never renumbered. */
  readonly id: number;
  /** Label shown in the circle: the room id. */
  readonly label: string;
  readonly function: string;
  /** Minimum-corner cell. */
  readonly position: GridCoord;
  /** Room size in cells. */
  readonly size: RoomSize;
  /**
   * What the circle and popover show: EFFECTIVE values of the project's node fields (shared
   * resolver: stored value, type default, field default), then stored values outside the schema.
   * Display data only; commands never write it back.
   */
  readonly custom: Attributes;
}

export interface DiagramEdge {
  readonly id: number;
  readonly source: number;
  readonly target: number;
  readonly relationship: RelationshipKind;
  /** The derived spatial status from the host's resolver. */
  readonly resolution?: EdgeResolution;
}

export interface DiagramModel {
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
  readonly byNode: ReadonlyMap<number, DiagramNode>;
  readonly diagram: DiagramSource['diagram'];
  readonly doc: DesignDocumentV2;
  readonly spatial: SpatialResolution;
}

export function modelFromV2(doc: DesignDocumentV2, spatial: SpatialResolution, schema: ProjectAttributeSchema = EMPTY_ATTRIBUTE_SCHEMA): DiagramModel {
  const nodes = doc.nodes.map<DiagramNode>((n) => ({
    id: n.id,
    label: nodeLabel(n),
    function: n.function,
    position: n.position,
    size: n.size,
    custom: viewAttributes(schema, 'nodes', n),
  }));
  const edges = doc.edges.map<DiagramEdge>((e) => {
    const resolution = spatial.byEdge.get(e.id);
    return { id: e.id, source: e.source, target: e.target, relationship: e.relationship, ...(resolution ? { resolution } : {}) };
  });
  return { doc, spatial, nodes, edges, byNode: new Map(nodes.map((n) => [n.id, n])), diagram: doc.diagram };
}

/** The relationship already joining `a` and `b` in either direction (one per pair is allowed). */
export function edgeBetween(model: DiagramModel, a: number, b: number): DiagramEdge | undefined {
  return model.edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
}

/** Beginner wording for where a room sits: minimum cell, size (when larger than one cell) and storey(s). */
export function describePlacement(node: DiagramNode): string {
  const big = node.size.some((s) => s !== 1);
  const storeys = node.size[2] > 1 ? `storeys ${node.position[2]}–${node.position[2] + node.size[2] - 1}` : `storey ${node.position[2]}`;
  return `cell ${formatGrid(node.position)}${big ? ` · ${node.size.join('×')} cells` : ''} · ${storeys}`;
}

// ── Commands ──────────────────────────────────────────────────────────────────────────────────

/** A command the view sends through `design.onCommand`. */
export type ModelCommand = DesignCommand;

export type ConnectRequest =
  | { readonly status: 'command'; readonly edgeId: number; readonly command: ModelCommand }
  | { readonly status: 'existing'; readonly edgeId: number }
  | { readonly status: 'refused'; readonly message: string };

/**
 * The command that connects `source` to `target`, created immediately without a kind dialog.
 * `add-edge` WITHOUT `kind`, so the contract default (`access`) applies. The rooms need not
 * touch: an unresolved relationship is valid graph data and is shown as such.
 * A pair that is already connected is reported (`existing`) instead of duplicated.
 */
export function connectRequest(model: DiagramModel, sourceId: number, targetId: number): ConnectRequest {
  const source = model.byNode.get(sourceId);
  const target = model.byNode.get(targetId);
  if (!source || !target) return { status: 'refused', message: 'That node no longer exists.' };
  if (sourceId === targetId) return { status: 'refused', message: 'A node cannot be connected to itself.' };
  const existing = edgeBetween(model, sourceId, targetId);
  if (existing) return { status: 'existing', edgeId: existing.id };
  // The command gives the new relationship the design's next edge id.
  const edgeId = model.doc.nextEdgeId;
  return { status: 'command', edgeId, command: { type: 'add-edge', edge: { source: sourceId, target: targetId } } };
}

/** Add a node beside `nearNodeId` (if given), at an explicit diagram position or a suggested one. */
export function addNodeRequest(
  model: DiagramModel,
  nearNodeId?: number,
  at?: DiagramPosition,
): { readonly nodeId: number; readonly command: ModelCommand } {
  const near = nearNodeId === undefined ? undefined : model.byNode.get(nearNodeId);
  // The command gives the new room the design's next node id.
  const nodeId = model.doc.nextNodeId;
  const functionId = near?.function ?? 'room';
  const diagramPosition = at ?? suggestDiagramPosition(model, near?.id);
  const grid = suggestFreeCellV2(model.doc, model.spatial.occupancy, near?.id);
  return { nodeId, command: { type: 'add-node', node: { position: grid, function: functionId, custom: {} }, diagramPosition } };
}

export const removeNodeCommand = (_model: DiagramModel, nodeId: number): ModelCommand => ({ type: 'remove-node', nodeId });

export const removeEdgeCommand = (_model: DiagramModel, edgeId: number): ModelCommand => ({ type: 'remove-edge', edgeId });

/** Diagram drag: changes only `diagram.positions`, never the room's cell. */
export const diagramPositionCommand = (_model: DiagramModel, nodeId: number, position: DiagramPosition): ModelCommand => ({
  type: 'set-diagram-position',
  nodeId,
  position,
});

/**
 * The command for the end of a diagram drag of one or more nodes (a multi-selection moves
 * together): positions rounded to whole units; nodes dropped where they are already stored are
 * left out; null when nothing moved. One node → `set-diagram-position`, several → ONE
 * `set-diagram-positions` (one Undo step).
 */
export function dragStopCommand(model: DiagramModel, moved: readonly { readonly id: number; readonly x: number; readonly y: number }[]): ModelCommand | null {
  const changed = moved
    .map((m) => ({ id: m.id, position: [Math.round(m.x), Math.round(m.y)] as DiagramPosition }))
    .filter(({ id, position }) => {
      const stored = model.diagram.positions[id];
      return !(stored && stored[0] === position[0] && stored[1] === position[1]);
    });
  if (changed.length === 0) return null;
  if (changed.length === 1) return diagramPositionCommand(model, changed[0]!.id, changed[0]!.position);
  return { type: 'set-diagram-positions', positions: Object.fromEntries(changed.map((c) => [c.id, c.position])) };
}

/** Relationship intent change (Access ↔ Open). */
export const changeRelationshipKindCommand = (edgeId: number, kind: RelationshipKind): ModelCommand => ({ type: 'change-edge-kind', edgeId, relationship: kind });
