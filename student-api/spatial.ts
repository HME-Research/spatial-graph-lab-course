import type { EdgeRecord, NodeRecord } from '@core/graph';
import { FACE_DIRECTIONS as CORE_FACE_DIRECTIONS, neighbourCell as coreNeighbourCell, type FaceDirection } from '@core/spatial';
import type { AttributeValue } from './attributes';

/**
 * The application's typed spatial representation: the schema-v1 document's own node and edge
 * records, read-only. Only spatial algorithms receive these.
 */

/** Integer cell address `[x, y, z]`; z is up (the storey axis). */
export type GridCoord = readonly [x: number, y: number, z: number];

/** The fixed schema-v1 relationship kinds. Students cannot add new kinds. */
export type SpatialEdgeKind = 'door' | 'open' | 'atrium' | 'vertical-access';

export type { FaceDirection } from '@core/spatial';

/** The six cardinal directions: '+x', '-x', '+y', '-y' (horizontal), '+z', '-z' (vertical). */
export const FACE_DIRECTIONS: readonly FaceDirection[] = CORE_FACE_DIRECTIONS;

/** The neighbouring cell of `cell` in `direction`. Pure grid arithmetic. */
export const neighbourCell = (cell: GridCoord, direction: FaceDirection): GridCoord =>
  coreNeighbourCell([cell[0], cell[1], cell[2]], direction);

export interface SpatialNode extends NodeRecord {
  readonly typeId: string;
  readonly grid: GridCoord;
  readonly attributes: { readonly [key: string]: AttributeValue };
}

export interface SpatialEdge extends EdgeRecord {
  readonly kind: SpatialEdgeKind;
  readonly attributes: { readonly [key: string]: AttributeValue };
}
