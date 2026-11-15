import type { GraphIssue } from '@app/document';
import type { DesignDocumentV2 } from '@app/document/v2';
import type { DesignCommand } from './commands';
import type { SpatialEditProposal, SpatialEditRequest, SpatialResolution } from './contracts';

/**
 * Cross-layer v2 port — FROZEN Gate 0. Offered to views as the OPTIONAL `ViewProps.design`.
 * Absent (today's app): views keep their v1 behaviour and hide v2-only features. Present (after
 * integration): `doc` is the stored v2 document and `onCommand` is the ONLY way to change it.
 * Only the integration owner creates this object (App/Workspace); feature branches use test fakes.
 */
export type DesignCommandOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly GraphIssue[] };

export interface DesignPort {
  /** The current v2 document (read-only; never copy into state). */
  readonly doc: DesignDocumentV2;
  /** Derived resolution + occupancy for `doc` (computed once per document by the host). */
  readonly spatial: SpatialResolution;
  /** Synchronous; on success the host records exactly one history step. */
  readonly onCommand: (command: DesignCommand) => DesignCommandOutcome;
  /** Pure preview for move/resize UIs (gizmo, Properties); commit with a `set-node-geometry` command. */
  readonly proposeEdit: (request: SpatialEditRequest) => SpatialEditProposal;
}
