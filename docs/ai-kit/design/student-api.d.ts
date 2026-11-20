// Spatial Graph Lab — Student API for an uploaded design analysis.
// This is the exact subset of '@student-api' an uploaded analysis may use. Nothing else exists.

declare module '@student-api' {
  // ── Values ──────────────────────────────────────────────────────────────────

  /** A custom value: text, number, true/false, or null ("no value"). */
  export type AttributeValue = string | number | boolean | null;

  // ── The graph ───────────────────────────────────────────────────────────────

  export interface NodeRecord {
    readonly id: number;
  }

  /** No direction: source/target order carries no meaning. */
  export interface EdgeRecord {
    readonly id: number;
    readonly source: number;
    readonly target: number;
  }

  export interface Graph<N extends NodeRecord = NodeRecord, E extends EdgeRecord = EdgeRecord> {
    readonly nodes: readonly N[];
    readonly edges: readonly E[];
  }

  // ── Rooms and relationships ─────────────────────────────────────────────────

  /** A cell [x, y, z]; z is the level (0 = ground). One cell is 3 × 3 m and one level 3 m high. */
  export type GridCoord = readonly [x: number, y: number, z: number];
  /** A room's size in cells [sx, sy, sz] (sz = number of floors). */
  export type RoomSize = readonly [sx: number, sy: number, sz: number];
  /** `access`: people can pass (a door). `open`: no wall between the rooms. */
  export type RelationshipKind = 'access' | 'open';
  export type FaceDirection = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

  /** A room. */
  export interface SpatialNode extends NodeRecord {
    /** Its Function id, e.g. "kitchen". */
    readonly function: string;
    /** Its minimum corner cell. */
    readonly position: GridCoord;
    readonly size: RoomSize;
    /** ONLY the custom fields listed in `uses.nodeFields` (defaults applied). */
    readonly custom: { readonly [key: string]: AttributeValue };
  }

  /** A relationship between two rooms. */
  export interface SpatialEdge extends EdgeRecord {
    readonly relationship: RelationshipKind;
    /** How a generated corridor looks (only when the rooms do not touch); usually absent. */
    readonly corridor?: { readonly walls?: 'enclosed' | 'open'; readonly roof?: 'flat' | 'pergola' | 'none'; readonly width?: number };
    /** ONLY the custom fields listed in `uses.edgeFields` (defaults applied). */
    readonly custom: { readonly [key: string]: AttributeValue };
  }

  /** One Function of the project. */
  export interface FunctionInfo {
    readonly id: string;
    readonly label: string;
  }

  /** One custom field listed in `uses`. */
  export interface CustomFieldInfo {
    readonly key: string;
    readonly label: string;
    readonly kind: 'text' | 'number' | 'boolean' | 'enum';
    readonly values?: readonly string[];
    readonly min?: number;
    readonly max?: number;
    readonly default?: string | number | boolean;
    readonly description?: string;
  }

  /** A calculated value the app offers, e.g. `area` (m²) of a room. */
  export interface MetricInfo {
    readonly id: string;
    readonly label: string;
    readonly collection: 'nodes' | 'edges';
    readonly valueKind: 'number' | 'boolean' | 'text';
    readonly unit?: string;
    readonly definition: string;
  }

  export interface MetricReader {
    /** Every calculated value on offer. */
    list(): readonly MetricInfo[];
    /** The value for one room (or relationship), or null when it has none. Unknown ids stop the run with a message. */
    value(metricId: string, itemId: number): number | boolean | string | null;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Ids joined to `nodeId` by any edge, without duplicates. Works on `ctx.design`. */
  export function neighbours(graph: Graph, nodeId: number): number[];
  /** Every edge touching `nodeId`. */
  export function incidentEdges<E extends EdgeRecord>(graph: Graph<NodeRecord, E>, nodeId: number): E[];
  /** Edges joining `a` and `b` (either order). */
  export function edgesBetween<E extends EdgeRecord>(graph: Graph<NodeRecord, E>, a: number, b: number): E[];
  /** The node with this id, or undefined. */
  export function getNode<N extends NodeRecord>(graph: Graph<N>, id: number): N | undefined;
  /** The edge with this id, or undefined. */
  export function getEdge<E extends EdgeRecord>(graph: Graph<NodeRecord, E>, id: number): E | undefined;
  /** The end of `edge` that is not `nodeId`. */
  export function opposite(edge: EdgeRecord, nodeId: number): number;
  /** Every cell of a room. */
  export function roomCells(room: { readonly position: GridCoord; readonly size: RoomSize }): GridCoord[];
  /** The cell next to `cell` in `direction`. */
  export function neighbourCell(cell: GridCoord, direction: FaceDirection): GridCoord;
  /** The six directions: '+x', '-x', '+y', '-y' (sideways), '+z' (up), '-z' (down). */
  export const FACE_DIRECTIONS: readonly FaceDirection[];

  // ── The analysis ────────────────────────────────────────────────────────────

  /** One input the student picks, in order. [] → Network; one node → Node; one edge → Edge; anything else → Queries. */
  export type AnalysisInput =
    | { readonly kind: 'node'; readonly label: string }
    | { readonly kind: 'edge'; readonly label: string }
    | { readonly kind: 'number'; readonly label: string; readonly min?: number; readonly max?: number; readonly default?: number };

  /**
   * What the analysis needs from the project. Leave it out when it uses only what every project has
   * (Function as a label, position, size, relationship kind, calculated values). List every Function id
   * the code names and every custom field it reads.
   */
  export interface AnalysisUses {
    readonly functions?: readonly string[];
    readonly nodeFields?: readonly string[];
    readonly edgeFields?: readonly string[];
  }

  export interface DesignAnalysisContext {
    /** A fresh copy of the rooms and relationships. */
    readonly design: Graph<SpatialNode, SpatialEdge>;
    /** The picked values, in the order of `inputs`: node ids, edge ids or numbers (already checked). */
    readonly inputs: readonly number[];
    /** The project's Functions. */
    readonly functions: readonly FunctionInfo[];
    /** The custom fields listed in `uses`. */
    readonly customFields: { readonly nodes: readonly CustomFieldInfo[]; readonly edges: readonly CustomFieldInfo[] };
    /** The room at a cell, or undefined. */
    nodeAt(cell: GridCoord): number | undefined;
    /** Whether two rooms share a wall or a floor. */
    touches(aNodeId: number, bNodeId: number): boolean;
    /** The app's calculated values, e.g. ctx.metrics.value('area', room.id). */
    readonly metrics: MetricReader;
  }

  /** Give at least one field. Every id must exist. */
  export interface AnalysisResult {
    readonly kind: 'analysis';
    /** Shown big: a count, an area… */
    readonly value?: number;
    /** One short line (≤ 300 characters). */
    readonly text?: string;
    readonly highlightNodes?: readonly number[];
    readonly highlightEdges?: readonly number[];
    /** One value per node id, shown as colours. */
    readonly nodeValues?: { readonly [nodeId: number]: number | string | boolean | null };
  }

  export interface DesignAnalysisDefinition {
    /** Lowercase letters, digits and "-", starting with a letter. */
    readonly id: string;
    /** Short button text. */
    readonly label: string;
    /** Optional: one or two plain sentences, shown by the ⓘ. */
    readonly description?: string;
    /** REQUIRED: what the student picks, in order (at most 8). */
    readonly inputs: readonly AnalysisInput[];
    /** Optional: the project's Functions and custom fields it uses. */
    readonly uses?: AnalysisUses;
    run(ctx: DesignAnalysisContext): AnalysisResult;
  }

  export function defineDesignAnalysis(analysis: DesignAnalysisDefinition): DesignAnalysisDefinition;

  // A graph analysis (ids and relationships only) is also allowed.
  export interface GraphAlgorithmDefinition {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
    readonly inputs: readonly AnalysisInput[];
    run(ctx: { readonly graph: Graph; readonly inputs: readonly number[] }): AnalysisResult;
  }

  export function defineGraphAlgorithm(algorithm: GraphAlgorithmDefinition): GraphAlgorithmDefinition;
}
