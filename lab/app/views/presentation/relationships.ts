import type { RelationshipKind } from '@app/document';
import type { EdgeResolution, ResolutionStatus, SpatialResolution } from '@app/spatial';
import {
  CONNECTOR_ORDER,
  connectorPresentation,
  corridorLookKey,
  type CorridorLookKind,
  KIND_PRESENTATION,
  relationshipLine,
  STATUS_ORDER,
  STATUS_PRESENTATION,
  unresolvedReasonText,
  type LineToken,
} from './vocabulary';

/**
 * Per-relationship presentation from a derived `EdgeResolution` (pure, read-only).
 * Views render `line`, show `statusLabel` + `reason` in tooltips/popovers, and never re-derive the
 * spatial status themselves.
 */
export interface RelationshipPresentation {
  readonly edgeId: number;
  readonly kind: RelationshipKind;
  readonly status: ResolutionStatus;
  readonly kindLabel: string;
  readonly statusLabel: string;
  readonly line: LineToken;
  /** What gets built, in plain words ("door in the shared wall", "Open corridor, flat roof (4 cells)"). */
  readonly built: string;
  /** Short reason for unresolved relationships, otherwise null. */
  readonly reason: string | null;
  /** The engine's own message (unresolved only), for "More details". */
  readonly detail: string | null;
  /** One line for a tooltip / aria-label: "Access · Unresolved — <reason>". */
  readonly tooltip: string;
}

export function presentRelationship(resolution: EdgeResolution): RelationshipPresentation {
  const kindInfo = KIND_PRESENTATION[resolution.relationship];
  const statusInfo = STATUS_PRESENTATION[resolution.status];
  const base = {
    edgeId: resolution.edgeId,
    kind: resolution.relationship,
    status: resolution.status,
    kindLabel: kindInfo.label,
    statusLabel: statusInfo.label,
  };
  switch (resolution.status) {
    case 'direct': {
      const built = resolution.contact === 'vertical' ? kindInfo.betweenStoreys : kindInfo.sameStorey;
      return {
        ...base,
        line: relationshipLine(resolution.relationship, 'direct', resolution.contact),
        built,
        reason: null,
        detail: null,
        tooltip: `${kindInfo.label} · ${statusInfo.label} — ${built}`,
      };
    }
    case 'routed': {
      const connector = connectorPresentation(resolution.route.look);
      const cells = resolution.route.cells.length;
      const built = `${connector.label} (${cells} ${cells === 1 ? 'cell' : 'cells'})`;
      return {
        ...base,
        line: relationshipLine(resolution.relationship, 'routed'),
        built,
        reason: null,
        detail: null,
        tooltip: `${kindInfo.label} · ${statusInfo.label} — ${built}`,
      };
    }
    case 'unresolved': {
      const reason = unresolvedReasonText(resolution.reason);
      return {
        ...base,
        line: relationshipLine(resolution.relationship, 'unresolved'),
        built: 'nothing is built',
        reason,
        detail: resolution.message || null,
        tooltip: `${kindInfo.label} · ${statusInfo.label} — ${reason}`,
      };
    }
  }
}

/**
 * Presentation for an edge id. Unknown ids (stale selection, edge removed since the resolution was
 * computed) return null instead of throwing.
 */
export function presentEdgeById(spatial: SpatialResolution, edgeId: number): RelationshipPresentation | null {
  const r = spatial.byEdge.get(edgeId);
  return r ? presentRelationship(r) : null;
}

export interface RelationshipSummary {
  readonly total: number;
  readonly counts: Readonly<Record<ResolutionStatus, number>>;
  /** Unresolved edge ids in document order (for a "show problems" list). */
  readonly unresolvedIds: readonly number[];
  /** One short sentence, e.g. "5 relationships: 3 direct, 1 via route, 1 unresolved." */
  readonly sentence: string;
}

export function summarizeRelationships(spatial: SpatialResolution): RelationshipSummary {
  const counts: Record<ResolutionStatus, number> = { direct: 0, routed: 0, unresolved: 0 };
  const unresolvedIds: number[] = [];
  for (const r of spatial.edges) {
    counts[r.status]++;
    if (r.status === 'unresolved') unresolvedIds.push(r.edgeId);
  }
  const total = spatial.edges.length;
  const words: Record<ResolutionStatus, string> = { direct: 'direct', routed: 'via route', unresolved: 'unresolved' };
  const parts = STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${words[s]}`);
  const sentence =
    total === 0 ? 'No edges yet.' : `${total} ${total === 1 ? 'edge' : 'edges'}: ${parts.join(', ')}.`;
  return { total, counts, unresolvedIds, sentence };
}

/** Corridor looks (walls + roof) actually used by routed relationships (legend filtering), in legend order. */
export function corridorLooksInUse(spatial: SpatialResolution): CorridorLookKind[] {
  const used = new Set<string>();
  for (const r of spatial.edges) if (r.status === 'routed') used.add(corridorLookKey(r.route.look));
  return CONNECTOR_ORDER.filter((look) => used.has(corridorLookKey(look)));
}
