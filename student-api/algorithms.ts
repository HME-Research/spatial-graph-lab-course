import type { EdgeRecord, Graph, NodeRecord } from './graph';
import type { AttributeSpecs, AttributeValue, AttributesOf } from './attributes';
import type { GridCoord, RelationshipKind, RoomSize, SpatialEdge, SpatialNode } from './spatial';
import type { NodeTypeDefinition } from './types';

/**
 * Algorithm contracts. An algorithm never changes application state: it returns a result that
 * the application validates (shape, references, operation permissions and semantics, final
 * document validity and conformance) before anything is shown or applied.
 *
 * - Graph algorithms are generic analyses (the Analyse tab): they see ids and endpoints only and
 *   declare the inputs the student picks (P4).
 * - Spatial algorithms (the Transform tab) transform the spatial design document through operations.
 */

interface AlgorithmDefinitionBase<P extends AttributeSpecs> {
  /** Unique within the project: lowercase letters, digits and "-", starting with a letter. */
  readonly id: string;
  readonly label: string;
  /** Typed parameters; values are validated and defaults applied before `run`. */
  readonly parameters?: P;
}

// ── Generic graph analysis ──────────────────────────────────────────────────────────────────

/**
 * One input an analysis needs, in order. Nodes and edges are picked by the student in any view;
 * numbers are typed. The app places the analysis from this list alone: no inputs → Analyse ›
 * Network; one node → Node; one edge → Edge (both run on the current selection); anything else →
 * Queries (the student picks each input in turn). Same shape as the app's `AnalysisInput`
 * (mirrored here: the Student API never imports app code).
 */
export type AnalysisInput =
  | { readonly kind: 'node'; readonly label: string }
  | { readonly kind: 'edge'; readonly label: string }
  | { readonly kind: 'number'; readonly label: string; readonly min?: number; readonly max?: number; readonly default?: number };

export interface GraphAlgorithmContext {
  /** A fresh copy for this run: ids, endpoints and the graph policy only. */
  readonly graph: Graph<NodeRecord, EdgeRecord>;
  /**
   * The picked inputs, in the order of `inputs`: a node id, an edge id or a number each. Example:
   * `inputs: [{ kind: 'node', label: 'From' }, { kind: 'node', label: 'To' }]` →
   * `const [from, to] = ctx.inputs;`. The app checks them before `run` (existing ids, numbers
   * within min/max). Empty for a Network analysis.
   */
  readonly inputs: readonly number[];
}

/**
 * What an analysis shows. Give at least one field. The app shows `value` (else `text`) as the big
 * answer, and `text` as a small line under a value; it highlights `highlightNodes` and
 * `highlightEdges` in every view and colours the nodes by `nodeValues`. Every id must exist.
 */
export interface AnalysisResult {
  readonly kind: 'analysis';
  /** The answer as a number, e.g. a count or a number of steps. */
  readonly value?: number;
  /** A short answer or explanation (one line), e.g. "No path between 3 and 9". */
  readonly text?: string;
  /** Node ids to highlight. */
  readonly highlightNodes?: readonly number[];
  /** Edge ids to highlight. */
  readonly highlightEdges?: readonly number[];
  /** One value per node id, shown as colours (every key must be an existing node id: `nodeValues[node.id] = …`). */
  readonly nodeValues?: { readonly [nodeId: number]: AttributeValue };
}

/** A graph analysis. It has no `parameters`: numbers it needs are `{ kind: 'number' }` inputs. */
export interface GraphAlgorithmDefinition {
  /** Unique within the project: lowercase letters, digits and "-", starting with a letter. */
  readonly id: string;
  readonly label: string;
  /** REQUIRED: the exact, ordered inputs the student picks (`[]` = the whole network). */
  readonly inputs: readonly AnalysisInput[];
  run(ctx: GraphAlgorithmContext): AnalysisResult;
}

export interface GraphAlgorithm extends GraphAlgorithmDefinition {
  readonly scope: 'graph';
}

// ── Spatial transformation ──────────────────────────────────────────────────────────────────

export interface SpatialAlgorithmContext<P extends AttributeSpecs = AttributeSpecs> {
  /** A fresh copy of the document's nodes and edges for this run. */
  readonly design: Graph<SpatialNode, SpatialEdge>;
  readonly params: AttributesOf<P>;
  /** Id of the room whose footprint contains `cell`, or undefined if no room occupies it. */
  nodeAt(cell: GridCoord): number | undefined;
  /**
   * Whether rooms `aNodeId` and `bNodeId` share at least one face (wall or floor/ceiling), i.e.
   * a relationship between them would be built directly, without a connector. False for unknown
   * ids or the same room.
   */
  touches(aNodeId: number, bNodeId: number): boolean;
  /**
   * Whether a relationship between `aNodeId` and `bNodeId` may be created: both rooms exist,
   * they are different, and they are not related yet. The rooms need NOT touch.
   */
  canRelate(aNodeId: number, bNodeId: number): boolean;
  /**
   * Effective typed attributes of `node` for its type definition `type` (imported from the
   * project's `types/` folder): only the attributes that type declares. Values come from the
   * project's fields (the same values the app shows): the stored value, else the type default,
   * else the field default. A value explicitly set to "no value" (null), or one that does not fit the
   * type's own declaration, reads as the type's declared default (or `undefined` without one). The run
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
  nodeAttributes(nodeId: number): { readonly [key: string]: AttributeValue };
  /** Effective values of every project edge field for the edge `edgeId` (as `nodeAttributes`). */
  edgeAttributes(edgeId: number): { readonly [key: string]: AttributeValue };
  /**
   * The app's calculated values (read-only): the same values Properties and colour-by show, for
   * the design as it was when the run started. Your operations do not change them during the run.
   */
  readonly metrics: MetricReader;
}

/** A calculated value the app offers (e.g. `area`, `volume`, `exposed-facade-length`). */
export interface MetricInfo {
  readonly id: string;
  readonly label: string;
  /** Whether the value belongs to rooms (`nodes`) or relationships (`edges`). */
  readonly collection: 'nodes' | 'edges';
  readonly valueKind: 'number' | 'boolean' | 'text';
  /** e.g. `m²`, `m³`, `m`; absent for counts and text. */
  readonly unit?: string;
  /** What exactly is counted or measured. */
  readonly definition: string;
}

/** Read-only access to calculated values. Values are never stored in the design. */
export interface MetricReader {
  /** Every calculated value on offer, in a fixed order (room values first). */
  list(): readonly MetricInfo[];
  /**
   * Value of metric `metricId` for the node or edge `itemId` (of the metric's collection), or
   * `null` when it has no value (e.g. `route-length` of an unresolved relationship). The run
   * fails with a diagnostic for an unknown metric id or an id that is not in that collection.
   */
  value(metricId: string, itemId: number): number | boolean | string | null;
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
 * A reference to a node or edge in an operation: the id (a number) of one that exists, or the
 * `ref` (a text you choose, e.g. "new-kitchen") of one an EARLIER operation of the same run adds.
 * You never choose ids: the app gives every new node and edge the next free number, in operation
 * order, and never reuses an id. The preview and the applied design show the ids it gave.
 */
export type ItemRef = number | string;

/**
 * Atomic changes. A transformation's operations are applied in order to a private draft and the
 * result replaces the document only if every operation and the final document are valid.
 */
export type SpatialOperation =
  | {
      readonly op: 'add-node';
      /** Optional local name for later operations of this run to refer to the new node. */
      readonly ref?: string;
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
      /** Optional local name for later operations of this run to refer to the new edge. */
      readonly ref?: string;
      readonly source: ItemRef;
      readonly target: ItemRef;
      /** `access` or `open`. */
      readonly kind: RelationshipKind;
    }
  | {
      readonly op: 'set-node-attribute';
      readonly nodeId: ItemRef;
      /** A project node field (every node has the same fields, whatever its type). */
      readonly key: string;
      /** Valid for the field, or null for "no value". */
      readonly value: AttributeValue;
    }
  | {
      readonly op: 'set-edge-attribute';
      readonly edgeId: ItemRef;
      /** A project edge field (Access and Open edges have the same fields). */
      readonly key: string;
      /** Valid for the field, or null for "no value". */
      readonly value: AttributeValue;
    }
  | {
      /** Move and/or resize a room (its box: minimum corner `grid` + `size`); omitted parts stay. */
      readonly op: 'set-node-geometry';
      readonly nodeId: ItemRef;
      readonly grid?: GridCoord;
      /** Positive whole numbers. The box must not overlap another room or take generated connector cells. */
      readonly size?: RoomSize;
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

export const defineGraphAlgorithm = (algorithm: GraphAlgorithmDefinition): GraphAlgorithm => ({ ...algorithm, scope: 'graph' });

export const defineSpatialAlgorithm = <const P extends AttributeSpecs = Record<never, never>>(
  algorithm: SpatialAlgorithmDefinition<P>,
): SpatialAlgorithm<P> => ({ ...algorithm, scope: 'spatial' });
