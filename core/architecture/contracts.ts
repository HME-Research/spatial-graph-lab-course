import type { DesignDocument, EdgeKind, GridCoord } from '@app/document';

/**
 * Architectural face-resolution contract (workstream C). Pure data in GRID space; no React or
 * Three.js. Geometry is built from ResolvedFace values afterwards, using spatialToThree.
 * See docs/VIEWER-CONTRACTS.md §C.
 */

/** The six cardinal neighbour slots of a cell, in grid axes (z is up). */
export const FACE_DIRECTIONS = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
export type FaceDirection = (typeof FACE_DIRECTIONS)[number];

export const FACE_DIRECTION_OFFSETS: Readonly<Record<FaceDirection, GridCoord>> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

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
