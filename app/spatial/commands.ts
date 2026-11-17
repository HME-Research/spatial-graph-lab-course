import { removeNode as graphRemoveNode } from '@core/graph';
import type { GridCoord } from '@core/spatial';
import { fail, issue, SPATIAL_GRAPH_POLICY, type Attributes, type DiagramPosition, type Result } from '@app/document';
import {
  canonicalFacadeModule,
  DEFAULT_RELATIONSHIP_KIND,
  footprintCells,
  nextDisplayId,
  validateDocumentV2,
  type ConnectorStyle,
  type DesignDocumentV2,
  type FacadeModule,
  type RelationshipKind,
  type RoofStyle,
  type RoomSize,
  type TypeAppearance,
  type ValidationOptionsV2,
  type WindowLayout,
  type WallStyle,
} from '@app/document/v2';
import { commitSpatialEdit, proposeSpatialEdit, type SpatialEditOptions } from './edit';
import { resolveRelationships } from './resolve';

/**
 * Schema-v2 document commands — FROZEN Gate 0 command shapes. Every command is pure, returns a
 * new VALIDATED document or readable issues, and never mutates its input. One successful command
 * that changes the content = one history step (the app's existing history records it).
 * Implementation owner: 02-spatial-engine (shapes are frozen; bodies may improve).
 */

export interface NewRoom {
  readonly id: string;
  /** Omitted: `nextDisplayId(doc)`. */
  readonly displayId?: string;
  readonly grid: GridCoord;
  /** Omitted: [1, 1, 1]. */
  readonly size?: RoomSize;
  readonly typeId: string;
  readonly attributes?: Attributes;
}

export interface NewRelationship {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /** Omitted: `access`. The rooms need NOT touch (unresolved is valid). */
  readonly kind?: RelationshipKind;
  readonly connectorStyle?: ConnectorStyle;
  readonly attributes?: Attributes;
}

/** Per-type override patch: a value sets the override, `null` removes it (inherit again). */
export interface TypeAppearancePatch {
  readonly windowFraction?: number | null;
  readonly windowLayout?: WindowLayout | null;
  readonly walls?: WallStyle | null;
  readonly roof?: RoofStyle | null;
  /** Imported façade: a module, `'none'` (opt out of the design default), or `null` (inherit again). */
  readonly facade?: FacadeModule | null;
}

export type DesignCommand =
  /** A new room taking connector cells needs `confirmRouteDisplacement`, like a move (phase 07, A11). */
  | { readonly type: 'add-node'; readonly node: NewRoom; readonly diagramPosition?: DiagramPosition; readonly confirmRouteDisplacement?: boolean }
  | { readonly type: 'remove-node'; readonly nodeId: string }
  /** Move and/or resize (min-corner anchored). Taking connector cells needs `confirmRouteDisplacement`. */
  | {
      readonly type: 'set-node-geometry';
      readonly nodeId: string;
      readonly grid?: GridCoord;
      readonly size?: RoomSize;
      readonly confirmRouteDisplacement?: boolean;
    }
  | { readonly type: 'set-node-type'; readonly nodeId: string; readonly typeId: string }
  | { readonly type: 'set-node-attributes'; readonly nodeId: string; readonly attributes: Attributes }
  /** `null` removes the display id (the label falls back to the permanent id). */
  | { readonly type: 'set-display-id'; readonly nodeId: string; readonly displayId: string | null }
  | { readonly type: 'set-diagram-position'; readonly nodeId: string; readonly position: DiagramPosition }
  | { readonly type: 'add-edge'; readonly edge: NewRelationship }
  | { readonly type: 'remove-edge'; readonly edgeId: string }
  /**
   * Remove several UNRESOLVED relationships in one step ("Remove N invalid connections", Gate F).
   * Refused, with no change, when the list is empty, repeats an id, names an unknown edge, or names
   * an edge that is not `unresolved` under `options.resolve ?? resolveRelationships`. Never automatic.
   */
  | { readonly type: 'remove-edges'; readonly edgeIds: readonly string[] }
  | { readonly type: 'change-edge-kind'; readonly edgeId: string; readonly kind: RelationshipKind }
  /** Replaces the edge's stored custom attributes (additive after Gate 0; see docs/PROJECT-ATTRIBUTES.md). */
  | { readonly type: 'set-edge-attributes'; readonly edgeId: string; readonly attributes: Attributes }
  /** `null` removes the explicit style (default `enclosed` applies). */
  | { readonly type: 'set-connector-style'; readonly edgeId: string; readonly style: ConnectorStyle | null }
  | { readonly type: 'set-type-appearance'; readonly typeId: string; readonly patch: TypeAppearancePatch };

export type DesignCommandType = DesignCommand['type'];

export interface DesignCommandOptions extends SpatialEditOptions {
  readonly validation?: ValidationOptionsV2;
}

const notFound = (what: 'node' | 'edge', id: string): Result<DesignDocumentV2> =>
  fail([issue([what === 'node' ? 'nodes' : 'edges'], 'not-found', `${what} "${id}" does not exist`)]);

function withoutKey<V>(record: Readonly<Record<string, V>>, key: string): Record<string, V> {
  const copy: Record<string, V> = {};
  for (const [k, v] of Object.entries(record)) if (k !== key) copy[k] = v;
  return copy;
}

/** Apply one v2 command purely. */
export function applyDesignCommand(
  doc: DesignDocumentV2,
  command: DesignCommand,
  options: DesignCommandOptions = {},
): Result<DesignDocumentV2> {
  const validate = (next: DesignDocumentV2) => validateDocumentV2(next, options.validation);
  const hasNode = (id: string) => doc.nodes.some((n) => n.id === id);
  const hasEdge = (id: string) => doc.edges.some((e) => e.id === id);
  const mapNode = (id: string, f: (n: DesignDocumentV2['nodes'][number]) => DesignDocumentV2['nodes'][number]) =>
    hasNode(id) ? validate({ ...doc, nodes: doc.nodes.map((n) => (n.id === id ? f(n) : n)) }) : notFound('node', id);
  const mapEdge = (id: string, f: (e: DesignDocumentV2['edges'][number]) => DesignDocumentV2['edges'][number]) =>
    hasEdge(id) ? validate({ ...doc, edges: doc.edges.map((e) => (e.id === id ? f(e) : e)) }) : notFound('edge', id);

  switch (command.type) {
    case 'add-node': {
      const n = command.node;
      const node = {
        id: n.id,
        displayId: n.displayId ?? nextDisplayId(doc),
        grid: [n.grid[0], n.grid[1], n.grid[2]] as GridCoord,
        size: (n.size ? [n.size[0], n.size[1], n.size[2]] : [1, 1, 1]) as RoomSize,
        typeId: n.typeId,
        attributes: { ...n.attributes },
      };
      const diagram = command.diagramPosition
        ? { positions: { ...doc.diagram.positions, [n.id]: [command.diagramPosition[0], command.diagramPosition[1]] as DiagramPosition } }
        : doc.diagram;
      const added = validate({ ...doc, nodes: [...doc.nodes, node], diagram });
      if (!added.ok) return added;
      // A new room never silently fills a generated connector: place it elsewhere and move it with
      // `set-node-geometry` + `confirmRouteDisplacement` ("Move anyway and recalculate").
      const occupancy = (options.resolve ?? resolveRelationships)(doc).occupancy;
      const displaced = new Set<string>();
      for (const cell of footprintCells(node)) {
        const o = occupancy.at(cell);
        if (o?.kind === 'route') displaced.add(o.edgeId);
      }
      if (displaced.size > 0 && !command.confirmRouteDisplacement) {
        return fail([
          issue(
            ['nodes'],
            'route-displacement',
            `room "${n.id}" would take cells of the connector(s) of ${[...displaced].sort().map((e) => `"${e}"`).join(', ')}; ` +
              'confirm to add it anyway and recalculate those connectors, or place it elsewhere',
          ),
        ]);
      }
      return added;
    }
    case 'remove-node': {
      const result = graphRemoveNode({ policy: SPATIAL_GRAPH_POLICY, nodes: doc.nodes, edges: doc.edges }, command.nodeId);
      if (!result.ok) return notFound('node', command.nodeId);
      return validate({
        ...doc,
        nodes: [...result.value.nodes],
        edges: [...result.value.edges],
        diagram: { positions: withoutKey(doc.diagram.positions, command.nodeId) },
      });
    }
    case 'set-node-geometry': {
      const request = {
        nodeId: command.nodeId,
        ...(command.grid ? { grid: command.grid } : {}),
        ...(command.size ? { size: command.size } : {}),
      };
      const proposal = proposeSpatialEdit(doc, request, options);
      return commitSpatialEdit(proposal, { confirmRouteDisplacement: command.confirmRouteDisplacement === true });
    }
    case 'set-node-type':
      return mapNode(command.nodeId, (n) => ({ ...n, typeId: command.typeId }));
    case 'set-node-attributes':
      return mapNode(command.nodeId, (n) => ({ ...n, attributes: { ...command.attributes } }));
    case 'set-display-id':
      return mapNode(command.nodeId, (n) => {
        const { displayId: _old, ...rest } = n;
        return command.displayId === null ? rest : { ...rest, displayId: command.displayId };
      });
    case 'set-diagram-position':
      if (!hasNode(command.nodeId)) return notFound('node', command.nodeId);
      return validate({
        ...doc,
        diagram: { positions: { ...doc.diagram.positions, [command.nodeId]: [command.position[0], command.position[1]] } },
      });
    case 'add-edge': {
      const e = command.edge;
      const edge = {
        id: e.id,
        source: e.source,
        target: e.target,
        kind: e.kind ?? DEFAULT_RELATIONSHIP_KIND,
        ...(e.connectorStyle === undefined ? {} : { connectorStyle: e.connectorStyle }),
        attributes: { ...e.attributes },
      };
      return validate({ ...doc, edges: [...doc.edges, edge] });
    }
    case 'remove-edge':
      if (!hasEdge(command.edgeId)) return notFound('edge', command.edgeId);
      return validate({ ...doc, edges: doc.edges.filter((e) => e.id !== command.edgeId) });
    case 'remove-edges': {
      const ids = command.edgeIds;
      if (ids.length === 0) return fail([issue(['edges'], 'schema', 'no connections were chosen to remove')]);
      const listed = new Set<string>();
      for (const id of ids) {
        if (listed.has(id)) return fail([issue(['edges'], 'duplicate-edge-id', `connection "${id}" is listed more than once`)]);
        listed.add(id);
        if (!hasEdge(id)) return notFound('edge', id);
      }
      const spatial = (options.resolve ?? resolveRelationships)(doc);
      const built = ids.filter((id) => spatial.byEdge.get(id)?.status !== 'unresolved');
      if (built.length > 0) {
        return fail([
          issue(
            ['edges'],
            'schema',
            `only unresolved connections can be removed together; ${built.map((id) => `"${id}"`).join(', ')} ` +
              `${built.length === 1 ? 'is' : 'are'} built`,
          ),
        ]);
      }
      return validate({ ...doc, edges: doc.edges.filter((e) => !listed.has(e.id)) });
    }
    case 'change-edge-kind':
      return mapEdge(command.edgeId, (e) => ({ ...e, kind: command.kind }));
    case 'set-edge-attributes':
      return mapEdge(command.edgeId, (e) => ({ ...e, attributes: { ...command.attributes } }));
    case 'set-connector-style':
      return mapEdge(command.edgeId, (e) => {
        const { connectorStyle: _old, ...rest } = e;
        return command.style === null ? rest : { ...rest, connectorStyle: command.style };
      });
    case 'set-type-appearance': {
      const current: TypeAppearance = Object.prototype.hasOwnProperty.call(doc.settings.typeAppearance, command.typeId)
        ? doc.settings.typeAppearance[command.typeId]!
        : {};
      const merged: { windowFraction?: number; windowLayout?: WindowLayout; walls?: WallStyle; roof?: RoofStyle; facade?: FacadeModule } = {};
      const wf = command.patch.windowFraction === undefined ? current.windowFraction : command.patch.windowFraction;
      const roof = command.patch.roof === undefined ? current.roof : command.patch.roof;
      if (wf !== null && wf !== undefined) merged.windowFraction = wf;
      const layout = command.patch.windowLayout === undefined ? current.windowLayout : command.patch.windowLayout;
      if (layout !== null && layout !== undefined) merged.windowLayout = layout;
      const walls = command.patch.walls === undefined ? current.walls : command.patch.walls;
      if (walls !== null && walls !== undefined) merged.walls = walls;
      if (roof !== null && roof !== undefined) merged.roof = roof;
      const facade = command.patch.facade === undefined ? current.facade : command.patch.facade;
      // The whole module, door / open bay variants included (they were dropped here before).
      if (facade !== null && facade !== undefined) merged.facade = canonicalFacadeModule(facade);
      const rest = withoutKey(doc.settings.typeAppearance, command.typeId);
      const typeAppearance = Object.keys(merged).length === 0 ? rest : { ...rest, [command.typeId]: merged };
      return validate({ ...doc, settings: { ...doc.settings, typeAppearance } });
    }
    default: {
      const unreachable: never = command;
      throw new Error(`unknown design command ${JSON.stringify(unreachable)}`);
    }
  }
}
