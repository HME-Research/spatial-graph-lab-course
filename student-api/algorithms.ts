import type { EdgeRecord, Graph, NodeRecord } from '@core/graph';
import type { AttributeSpecs, AttributeValue, AttributesOf } from './attributes';
import type { GridCoord, RelationshipKind, RoomSize, SpatialEdge, SpatialEdgeKind, SpatialNode } from './spatial';
import type { NodeTypeDefinition } from './types';

/**
 * Algorithm contracts. An algorithm never changes application state: it returns a result that
 * the application validates (shape, references, operation permissions and semantics, final
 * document validity and conformance) before anything is shown or applied.
 *
 * - Graph algorithms are generic analyses: they see ids and endpoints only.
 * - Spatial algorithms transform the spatial design document through operations.
 */

interface AlgorithmDefinitionBase<P extends AttributeSpecs> {
  /** Unique within the project: lowercase letters, digits and "-", starting with a letter. */
  readonly id: string;
  readonly label: string;
  /** Typed parameters; values are validated and defaults applied before `run`. */
  readonly parameters?: P;
}

// ── Generic graph analysis ──────────────────────────────────────────────────────────────────

export interface GraphAlgorithmContext<P extends AttributeSpecs = AttributeSpecs> {
  /** A fresh copy for this run: ids, endpoints and the graph policy only. */
  readonly graph: Graph<NodeRecord, EdgeRecord>;
  readonly params: AttributesOf<P>;
}

export interface AnalysisResult {
  readonly kind: 'analysis';
  readonly summary?: string;
  /** One value per node id (every key must be an existing node id). */
  readonly nodeValues: { readonly [nodeId: string]: AttributeValue };
}

export interface GraphAlgorithmDefinition<P extends AttributeSpecs = AttributeSpecs> extends AlgorithmDefinitionBase<P> {
  run(ctx: GraphAlgorithmContext<P>): AnalysisResult;
}

export interface GraphAlgorithm<P extends AttributeSpecs = AttributeSpecs> extends GraphAlgorithmDefinition<P> {
  readonly scope: 'graph';
}

// ── Spatial transformation ──────────────────────────────────────────────────────────────────

export interface SpatialAlgorithmContext<P extends AttributeSpecs = AttributeSpecs> {
  /** A fresh copy of the document's nodes and edges for this run. */
  readonly design: Graph<SpatialNode, SpatialEdge>;
  readonly params: AttributesOf<P>;
  /** Id of the room whose footprint contains `cell`, or undefined if no room occupies it. */
  nodeAt(cell: GridCoord): string | undefined;
  /**
   * Whether rooms `aNodeId` and `bNodeId` share at least one face (wall or floor/ceiling), i.e.
   * a relationship between them would be built directly, without a connector. False for unknown
   * ids or the same room.
   */
  touches(aNodeId: string, bNodeId: string): boolean;
  /**
   * Whether a relationship between `aNodeId` and `bNodeId` may be created: both rooms exist,
   * they are different, and they are not related yet. The rooms need NOT touch.
   */
  canRelate(aNodeId: string, bNodeId: string): boolean;
  /**
   * @deprecated Schema-v1 rule kept for existing algorithms: whether the CELLS `a` and `b` are
   * face-adjacent in the way the v1 `kind` required (door/open: same storey; atrium/
   * vertical-access: stacked). Use `touches` (direct contact) or `canRelate` (may create) instead.
   */
  canConnect(kind: SpatialEdgeKind, a: GridCoord, b: GridCoord): boolean;
  /**
   * Effective typed attributes of `node` for its type definition `type` (imported from the
   * project's `types/` folder): only the attributes that type declares. Values come from the
   * project's fields (the same values the app shows): the stored value, else the type default,
   * else the field default. A value explicitly cleared to "no value" reads as `undefined`. The run
   * fails with a diagnostic if `type` is not a valid, registered definition of this project or is
   * not the node's type. Prefer `nodeAttributes` for project-wide fields.
   */
  attributesOf<A extends AttributeSpecs>(node: SpatialNode, type: NodeTypeDefinition<A>): AttributesOf<A>;
  /** The project's custom fields: the same list for every node, and one list for every edge. */
  readonly attributeFields: { readonly nodes: readonly AttributeFieldInfo[]; readonly edges: readonly AttributeFieldInfo[] };
  /**
   * Effective values of every project node field for the node `nodeId`: the stored value, else
   * the node type's default, else the field default. Fields without any value are absent; `null`
   * means the value was explicitly set to "no value". The run fails for an unknown id.
   */
  nodeAttributes(nodeId: string): { readonly [key: string]: AttributeValue };
  /** Effective values of every project edge field for the edge `edgeId` (as `nodeAttributes`). */
  edgeAttributes(edgeId: string): { readonly [key: string]: AttributeValue };
}

/** One project-wide custom field, as algorithms see it. */
export interface AttributeFieldInfo {
  /** The attribute name in `attributes` and in `set-node-attribute` / `set-edge-attribute`. */
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'number' | 'boolean' | 'enum';
  /** Choices of an `enum` field. */
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  /** The field default (node types may have their own defaults; `nodeAttributes` applies them). */
  readonly default?: string | number | boolean;
  readonly description?: string;
}

/**
 * Atomic changes. A transformation's operations are applied in order to a private draft and the
 * result replaces the document only if every operation and the final document are valid.
 */
export type SpatialOperation =
  | {
      readonly op: 'add-node';
      readonly id: string;
      /** Minimum corner cell of the new room. */
      readonly grid: GridCoord;
      /** Extent in cells; omitted: `[1, 1, 1]`. The room must not overlap another room. */
      readonly size?: RoomSize;
      /** Must be a valid node type of the active project. */
      readonly typeId: string;
      /** Only project node fields, with valid values (or null). Defaults are not written. */
      readonly attributes?: { readonly [key: string]: AttributeValue };
    }
  | {
      readonly op: 'add-edge';
      readonly id: string;
      readonly source: string;
      readonly target: string;
      /**
       * `access` or `open`. The legacy v1 kinds are still accepted and mapped
       * (door/vertical-access → access, open/atrium → open).
       */
      readonly kind: RelationshipKind | SpatialEdgeKind;
    }
  | {
      readonly op: 'set-node-attribute';
      readonly nodeId: string;
      /** A project node field (every node has the same fields, whatever its type). */
      readonly key: string;
      /** Valid for the field, or null for "no value". */
      readonly value: AttributeValue;
    }
  | {
      readonly op: 'set-edge-attribute';
      readonly edgeId: string;
      /** A project edge field (Access and Open edges have the same fields). */
      readonly key: string;
      /** Valid for the field, or null for "no value". */
      readonly value: AttributeValue;
    };

export interface TransformationResult {
  readonly kind: 'transformation';
  readonly summary?: string;
  readonly operations: readonly SpatialOperation[];
}

export interface SpatialAlgorithmDefinition<P extends AttributeSpecs = AttributeSpecs> extends AlgorithmDefinitionBase<P> {
  run(ctx: SpatialAlgorithmContext<P>): TransformationResult;
}

export interface SpatialAlgorithm<P extends AttributeSpecs = AttributeSpecs> extends SpatialAlgorithmDefinition<P> {
  readonly scope: 'spatial';
}

// ── Registration helpers (the default export of each `algorithms/<file>.ts`) ────────────────

export const defineGraphAlgorithm = <const P extends AttributeSpecs = Record<never, never>>(
  algorithm: GraphAlgorithmDefinition<P>,
): GraphAlgorithm<P> => ({ ...algorithm, scope: 'graph' });

export const defineSpatialAlgorithm = <const P extends AttributeSpecs = Record<never, never>>(
  algorithm: SpatialAlgorithmDefinition<P>,
): SpatialAlgorithm<P> => ({ ...algorithm, scope: 'spatial' });
