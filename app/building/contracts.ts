import type { FaceDirection } from '@core/spatial';
import type { GridCoord } from '@app/document';

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
 * What a relationship makes of a face its rooms share (`connectionCondition`): a wall with a door
 * (`door`), no wall (`open`), a slab void (`atrium`) or a slab opening with an access marker
 * (`vertical-access`). Built-geometry vocabulary, not edge kinds: edges are `access` | `open`.
 */
export const CONNECTION_CONDITIONS = ['door', 'open', 'atrium', 'vertical-access'] as const;
export type ConnectionCondition = (typeof CONNECTION_CONDITIONS)[number];

/**
 * Boundary condition of a face.
 * - `exterior`: no occupied neighbour; façade is chosen by the owner's functionId.
 * - `solid`: occupied neighbour but no relationship → internal wall (or solid slab).
 * - a ConnectionCondition: the neighbour is related (see above).
 */
export type FaceCondition = 'exterior' | 'solid' | ConnectionCondition;

export interface ResolvedFace {
  /** Deterministic: `${ownerNodeId}:${direction}` (IDs cannot contain ':'). */
  readonly id: string;
  /**
   * Node that authors this face. Exterior: the only node. Shared: the node whose ID sorts first
   * by JavaScript string comparison (`a < b`), so each shared face is produced exactly once.
   */
  readonly ownerNodeId: number;
  readonly ownerFunction: string;
  /** Owner's grid cell. Face centre in grid space = cell + offset(direction) / 2. */
  readonly cell: GridCoord;
  /** Outward from the owner cell. */
  readonly direction: FaceDirection;
  readonly orientation: FaceOrientation;
  readonly neighbourNodeId: number | null;
  readonly edgeId: number | null;
  readonly condition: FaceCondition;
  /**
   * Set only on the endpoint face of an open-air (walls `open`) connector, and on the Access door
   * in the façade of an enclosed room toward an open-walled room (2026-11-20): the face is
   * outside, so its wall keeps the owner's façade colour and a door is a closed glass door.
   */
  readonly outside?: true;
  /**
   * Set only on the endpoint face of a generated corridor (2026-11-19): the corridor's built width
   * in metres. The face's opening (door or `open` hole) is no wider than this, centred; the wall
   * beside a narrower opening stays.
   */
  readonly corridorWidth?: number;
}

/**
 * Provisional exterior façade parameters per node type, replaced by the validated student type
 * definitions in Phase 6. 0 = closed wall, 1 = fully glazed.
 */
export interface FacadeSpec {
  readonly windowFraction: number;
}

export type FacadeProvider = (functionId: string) => FacadeSpec;
