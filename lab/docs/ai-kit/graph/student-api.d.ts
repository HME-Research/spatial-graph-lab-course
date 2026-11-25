// Spatial Graph Lab — Student API for an uploaded graph analysis.
// This is the exact subset of '@student-api' an uploaded analysis may use. Nothing else exists.

declare module '@student-api' {
  // ── The graph ───────────────────────────────────────────────────────────────

  /** A node (a room): a whole-number id. Nothing else is visible. */
  export interface NodeRecord {
    readonly id: number;
  }

  /** An edge (a relationship between two rooms). No direction: source/target order carries no meaning. */
  export interface EdgeRecord {
    readonly id: number;
    readonly source: number;
    readonly target: number;
  }

  export interface Graph {
    readonly nodes: readonly NodeRecord[];
    readonly edges: readonly EdgeRecord[];
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Ids joined to `nodeId` by any edge, without duplicates. */
  export function neighbours(graph: Graph, nodeId: number): number[];
  /** Every edge touching `nodeId`. */
  export function incidentEdges(graph: Graph, nodeId: number): EdgeRecord[];
  /** Edges joining `a` and `b` (either order). */
  export function edgesBetween(graph: Graph, a: number, b: number): EdgeRecord[];
  /** The node with this id, or undefined. */
  export function getNode(graph: Graph, id: number): NodeRecord | undefined;
  /** The edge with this id, or undefined. */
  export function getEdge(graph: Graph, id: number): EdgeRecord | undefined;
  /** The end of `edge` that is not `nodeId`. */
  export function opposite(edge: EdgeRecord, nodeId: number): number;

  // ── The analysis ────────────────────────────────────────────────────────────

  /**
   * One input the student picks, in order. The list decides the section:
   * [] → Network; one node → Node; one edge → Edge; anything else → Queries.
   */
  export type AnalysisInput =
    | { readonly kind: 'node'; readonly label: string }
    | { readonly kind: 'edge'; readonly label: string }
    | { readonly kind: 'number'; readonly label: string; readonly min?: number; readonly max?: number; readonly default?: number };

  export interface GraphAlgorithmContext {
    /** A fresh copy for this run. */
    readonly graph: Graph;
    /** The picked values, in the order of `inputs`: node ids, edge ids or numbers (already checked). */
    readonly inputs: readonly number[];
  }

  /** Give at least one field. Every id must exist in the graph. */
  export interface AnalysisResult {
    readonly kind: 'analysis';
    /** Shown big: a count, a number of steps… */
    readonly value?: number;
    /** One short line (≤ 300 characters). */
    readonly text?: string;
    readonly highlightNodes?: readonly number[];
    readonly highlightEdges?: readonly number[];
    /** One value per node id, shown as colours. */
    readonly nodeValues?: { readonly [nodeId: number]: number | string | boolean | null };
  }

  export interface GraphAlgorithmDefinition {
    /** Lowercase letters, digits and "-", starting with a letter. */
    readonly id: string;
    /** Short button text. */
    readonly label: string;
    /** Optional: one or two plain sentences, shown by the ⓘ. */
    readonly description?: string;
    /** REQUIRED: what the student picks, in order (at most 8). */
    readonly inputs: readonly AnalysisInput[];
    run(ctx: GraphAlgorithmContext): AnalysisResult;
  }

  export function defineGraphAlgorithm(algorithm: GraphAlgorithmDefinition): GraphAlgorithmDefinition;
}
