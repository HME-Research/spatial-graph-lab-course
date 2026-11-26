// Spatial Graph Lab — Student API for an uploaded transform.
// This is the exact subset of '@student-api' an uploaded transform may use. Nothing else exists.

declare module '@student-api' {
  // ── Values and parameters ───────────────────────────────────────────────────

  /** A custom value: text, number, true/false, or null ("no value"). */
  export type AttributeValue = string | number | boolean | null;

  /**
   * One parameter the student sets in Transform before the run. `label` is shown instead of the key,
   * `description` under it. The app checks every value (and applies `default`) before `run`.
   */
  export type ParameterSpec = (
    | { readonly kind: 'number'; readonly default?: number; readonly min?: number; readonly max?: number }
    | { readonly kind: 'text'; readonly default?: string }
    | { readonly kind: 'boolean'; readonly default?: boolean }
    | { readonly kind: 'enum'; readonly values: readonly [string, ...string[]]; readonly default?: string }
  ) & { readonly label?: string; readonly description?: string };

  export type ParameterSpecs = { readonly [key: string]: ParameterSpec };

  /** The value type of one parameter. */
  export type ValueOf<S extends ParameterSpec> = S extends { readonly kind: 'number' }
    ? number
    : S extends { readonly kind: 'text' }
      ? string
      : S extends { readonly kind: 'boolean' }
        ? boolean
        : S extends { readonly kind: 'enum'; readonly values: readonly (infer V)[] }
          ? V
          : never;

  /** `ctx.params`: each parameter's value, already checked, with its default applied (absent without one). */
  export type AttributesOf<P extends ParameterSpecs> = { readonly [K in keyof P]?: ValueOf<P[K]> };

  // ── The graph ───────────────────────────────────────────────────────────────

  export interface NodeRecord {
    readonly id: number;
  }

  /** No direction: source/target order carries no meaning (except for boundary shifts). */
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
  /** A requested boundary shift: move the shared wall 1.5 m into the source or the target room. */
  export type BoundaryShift = 'none' | 'toward-source' | 'toward-target';
  /** How a generated corridor looks (only when the rooms do not touch). */
  export interface CorridorLook {
    readonly walls?: 'enclosed' | 'open';
    readonly roof?: 'flat' | 'pergola' | 'none';
    /** Metres, more than 0 and at most 3. */
    readonly width?: number;
  }

  /** A room. */
  export interface SpatialNode extends NodeRecord {
    /** Its Function id, e.g. "kitchen". */
    readonly function: string;
    /** Its minimum corner cell. */
    readonly position: GridCoord;
    readonly size: RoomSize;
    /** The custom values set on this node itself (no defaults): read `ctx.nodeCustom(id)` instead. */
    readonly custom: { readonly [key: string]: AttributeValue };
  }

  /** A relationship between two rooms. */
  export interface SpatialEdge extends EdgeRecord {
    readonly relationship: RelationshipKind;
    readonly corridor?: CorridorLook;
    /** Absent = 'none'. */
    readonly boundaryShift?: BoundaryShift;
    /** The custom values set on this edge itself (no defaults): read `ctx.edgeCustom(id)` instead. */
    readonly custom: { readonly [key: string]: AttributeValue };
  }

  /** One custom field of the project (the same fields for every node, and for every edge). */
  export interface CustomFieldInfo {
    /** The key in `ctx.nodeCustom(id)` and in `set-node-custom-attribute`. */
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

  // ── The transform ───────────────────────────────────────────────────────────

  export interface SpatialAlgorithmContext<P extends ParameterSpecs = ParameterSpecs> {
    /** A fresh copy of the rooms and relationships as they were when the run started. */
    readonly design: Graph<SpatialNode, SpatialEdge>;
    /** The parameter values, checked, with defaults applied. */
    readonly params: AttributesOf<P>;
    /** The room at a cell, or undefined if the cell is free. */
    nodeAt(cell: GridCoord): number | undefined;
    /** Whether two rooms share a wall or a floor. False for unknown ids or the same room. */
    touches(aNodeId: number, bNodeId: number): boolean;
    /** Whether an edge between two rooms may be added: both exist, are different and have no edge yet. They need NOT touch. */
    canRelate(aNodeId: number, bNodeId: number): boolean;
    /** The project's custom fields: one list for every node, one for every edge. */
    readonly customFields: { readonly nodes: readonly CustomFieldInfo[]; readonly edges: readonly CustomFieldInfo[] };
    /** Every custom field's value for a node: its own value, else its Function's default, else the field default. Unknown ids stop the run. */
    nodeCustom(nodeId: number): { readonly [key: string]: AttributeValue };
    /** The same for an edge. */
    edgeCustom(edgeId: number): { readonly [key: string]: AttributeValue };
    /** The app's calculated values (as at the start of the run), e.g. ctx.metrics.value('area', room.id). */
    readonly metrics: MetricReader;
  }

  /**
   * A node or edge in an operation: the id (a number) of one that exists, or the `ref` (a text you
   * choose, e.g. "new-room") of one an EARLIER operation of the same run adds. Never choose ids.
   */
  export type ItemRef = number | string;

  /** One change. Operations are applied in order, all together: if one is invalid, nothing changes. */
  export type SpatialOperation =
    | {
        /** Add a room. The box must not overlap another room. Gets the next free id. */
        readonly op: 'add-node';
        readonly ref?: string;
        readonly position: GridCoord;
        /** Omitted: [1, 1, 1]. */
        readonly size?: RoomSize;
        /** A Function id of the project (one found in the design, or listed in PROJECT.md). */
        readonly function: string;
        /** Only custom node fields of the project, with valid values. */
        readonly custom?: { readonly [key: string]: AttributeValue };
      }
    | {
        /** Add an edge between two different rooms that have no edge yet (they need not touch). */
        readonly op: 'add-edge';
        readonly ref?: string;
        readonly source: ItemRef;
        readonly target: ItemRef;
        readonly relationship: RelationshipKind;
        readonly corridor?: CorridorLook;
        readonly boundaryShift?: BoundaryShift;
      }
    | {
        /** Set one custom node field (a valid value, or null for "no value"). */
        readonly op: 'set-node-custom-attribute';
        readonly nodeId: ItemRef;
        readonly key: string;
        readonly value: AttributeValue;
      }
    | {
        /** Set one custom edge field. */
        readonly op: 'set-edge-custom-attribute';
        readonly edgeId: ItemRef;
        readonly key: string;
        readonly value: AttributeValue;
      }
    | {
        /** Request (or remove, with 'none') a boundary shift on an edge. */
        readonly op: 'set-edge-boundary-shift';
        readonly edgeId: ItemRef;
        readonly boundaryShift: BoundaryShift;
      }
    | {
        /** Move and/or resize a room (minimum corner + size; omitted parts stay). Must not overlap a room or a generated corridor. */
        readonly op: 'set-node-geometry';
        readonly nodeId: ItemRef;
        readonly position?: GridCoord;
        /** Whole numbers from 1 to 32. */
        readonly size?: RoomSize;
      };

  /** What `run` returns. `summary` (optional, ≤ 2000 characters) is shown above the preview. */
  export interface TransformationResult {
    readonly kind: 'transformation';
    readonly summary?: string;
    readonly operations: readonly SpatialOperation[];
  }

  export interface SpatialAlgorithmDefinition<P extends ParameterSpecs = ParameterSpecs> {
    /** Lowercase letters, digits and "-", starting with a letter. */
    readonly id: string;
    /** Short button text. */
    readonly label: string;
    /** Optional: what the student sets before the run. */
    readonly parameters?: P;
    run(ctx: SpatialAlgorithmContext<P>): TransformationResult;
  }

  export function defineSpatialAlgorithm<const P extends ParameterSpecs = Record<never, never>>(algorithm: SpatialAlgorithmDefinition<P>): SpatialAlgorithmDefinition<P>;
}
