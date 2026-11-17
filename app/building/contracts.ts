import type { FaceDirection } from '@core/spatial';
import type { DesignDocument, EdgeKind, GridCoord } from '@app/document';

/**
 * Architectural face-resolution contract (workstream C). Pure data in GRID space; no React or
 * Three.js. Geometry is built from ResolvedFace values afterwards, using spatialToThree.
 * See docs/VIEWER-CONTRACTS.md §C.
 */

/** The six cardinal neighbour slots of a cell (z is up) are reusable grid maths in core/spatial. */
export { FACE_DIRECTION_OFFSETS, FACE_DIRECTIONS, type FaceDirection } from '@core/spatial';

/** x/y faces are walls; z faces are floor/ceiling slabs. */
export type FaceOrientation = 'wall' | 'slab';

/**
 * Boundary condition of a face.
 * - `exterior`: no occupied neighbour; façade is chosen by the owner's typeId.
 * - `solid`: occupied neighbour but no edge → internal wall (or solid slab).
 * - an EdgeKind: occupied neighbour connected by that edge (`door`, `open`, `atrium`, `vertical-access`).
 */
export type FaceCondition = 'exterior' | 'solid' | EdgeKind;

export interface ResolvedFace {
  /** Deterministic: `${ownerNodeId}:${direction}` (IDs cannot contain ':'). */
  readonly id: string;
  /**
   * Node that authors this face. Exterior: the only node. Shared: the node whose ID sorts first
   * by JavaScript string comparison (`a < b`), so each shared face is produced exactly once.
   */
  readonly ownerNodeId: string;
  readonly ownerTypeId: string;
  /** Owner's grid cell. Face centre in grid space = cell + offset(direction) / 2. */
  readonly cell: GridCoord;
  /** Outward from the owner cell. */
  readonly direction: FaceDirection;
  readonly orientation: FaceOrientation;
  readonly neighbourNodeId: string | null;
  readonly edgeId: string | null;
  readonly condition: FaceCondition;
  /**
   * Set only on the endpoint face of an open-air (`deck` / `covered`) connector: the face is
   * outside, so its wall keeps the owner's façade colour and a door is a closed glass door.
   */
  readonly outside?: true;
}

/**
 * Pure resolver: every face of every occupied cell exactly once, sorted by ownerNodeId then
 * FACE_DIRECTIONS order. Independent of node/edge array order. Expects a validated document.
 */
export type FaceResolver = (doc: DesignDocument) => readonly ResolvedFace[];

/**
 * Provisional exterior façade parameters per node type, replaced by the validated student type
 * definitions in Phase 6. 0 = closed wall, 1 = fully glazed.
 */
export interface FacadeSpec {
  readonly windowFraction: number;
}

export type FacadeProvider = (typeId: string) => FacadeSpec;
