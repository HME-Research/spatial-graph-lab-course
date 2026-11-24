import type { RelationshipKind } from '@app/document';
import type { ResolutionStatus, UnresolvedReason } from '@app/spatial';
import {
  relationshipLine,
  RELATIONSHIP_NEUTRAL_COLOR,
  STATUS_PRESENTATION,
  UNRESOLVED_COLOR,
  UNRESOLVED_REASON_TEXT as SHARED_REASON_TEXT,
} from '../presentation/vocabulary';
import type { DiagramEdge, DiagramModel } from './diagramModel';

/**
 * How a relationship looks in the 2D diagram. Pure. Local to Graph 2D (the shared
 * `app/views/edgeStyles` is not changed).
 *
 * Schema v2 encodes two independent things:
 * - intent (`access` | `open`): line WEIGHT — open is a heavier line;
 * - derived spatial status: direct = solid neutral, routed = long-dashed neutral, unresolved =
 *   thin muted red dashed. Unresolved is a valid relationship that cannot be built yet, never a
 *   graph error.
 * Selection is drawn separately (a pink halo under the stroke), so a selected unresolved edge
 * still reads as unresolved.
 */

// Gate 1: one scheme for every view — tokens come from the shared teaching vocabulary.
export const NEUTRAL_STROKE = RELATIONSHIP_NEUTRAL_COLOR;
export const ROUTED_STROKE = RELATIONSHIP_NEUTRAL_COLOR;
export const UNRESOLVED_STROKE = UNRESOLVED_COLOR;

export const RELATIONSHIP_KIND_LABELS: Readonly<Record<RelationshipKind, string>> = {
  access: 'Access',
  open: 'Open',
};

export const RELATIONSHIP_KIND_HINTS: Readonly<Record<RelationshipKind, string>> = {
  access: 'people can pass between the rooms (a door, or an opening between storeys)',
  open: 'the rooms flow into each other (no wall, or a void between storeys)',
};

export const STATUS_LABELS: Readonly<Record<ResolutionStatus, string>> = {
  direct: STATUS_PRESENTATION.direct.label,
  routed: STATUS_PRESENTATION.routed.label,
  unresolved: STATUS_PRESENTATION.unresolved.label,
};

export const STATUS_HINTS: Readonly<Record<ResolutionStatus, string>> = {
  direct: 'the rooms share a wall or floor',
  routed: 'joined by a generated straight connector',
  unresolved: 'kept as an edge, but nothing can be built for it yet',
};

/** Short beginner explanations of why a relationship cannot be built: the shared teaching text. */
export const UNRESOLVED_REASON_TEXT: Readonly<Record<UnresolvedReason, string>> = SHARED_REASON_TEXT;

export type EdgeStatus = ResolutionStatus | 'legacy';

export interface EdgePresentation {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeDasharray: string | undefined;
  readonly status: EdgeStatus;
  /** Short label (shown only when the edge is selected, to keep the canvas quiet). */
  readonly label: string;
  /** Display labels of the source and target nodes (orientation, 2026-11-24). */
  readonly source: string;
  readonly target: string;
  /** One- or two-line tooltip: intent, status and, when unresolved, why. */
  readonly title: string;
}

/** Stroke for a v2 relationship (intent × status), from the shared `relationshipLine` tokens. */
export function relationshipStroke(
  kind: RelationshipKind,
  status: ResolutionStatus,
): Pick<EdgePresentation, 'stroke' | 'strokeWidth' | 'strokeDasharray'> {
  const line = relationshipLine(kind, status);
  return { stroke: line.color, strokeWidth: line.width2d, strokeDasharray: line.dash2d ?? undefined };
}

/** Presentation of one edge of the model; endpoints are named by their short display labels. */
export function presentEdge(model: DiagramModel, edge: DiagramEdge): EdgePresentation {
  const a = model.byNode.get(edge.source)?.label ?? edge.source;
  const b = model.byNode.get(edge.target)?.label ?? edge.target;
  const pair = `${a} ↔ ${b}`;
  const kind = edge.relationship;
  const resolution = edge.resolution;
  // A missing resolution means the host has not resolved this edge; show it plainly, never as an error.
  const status: ResolutionStatus = resolution?.status ?? 'direct';
  const why = resolution?.status === 'unresolved' ? `\n${UNRESOLVED_REASON_TEXT[resolution.reason]}` : '';
  return {
    ...relationshipStroke(kind, status),
    status: resolution ? status : 'legacy',
    label: `${RELATIONSHIP_KIND_LABELS[kind]}${resolution ? ` · ${STATUS_LABELS[status]}` : ''}`,
    title: `${pair}: ${RELATIONSHIP_KIND_LABELS[kind]}${resolution ? ` — ${STATUS_LABELS[status].toLowerCase()}` : ''}${why}\nSource ${a} → target ${b}`,
    source: String(a),
    target: String(b),
  };
}

export interface LegendRow {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly stroke: Pick<EdgePresentation, 'stroke' | 'strokeWidth' | 'strokeDasharray'>;
}

/** Legend rows for a v2 diagram: the two intents, then the three spatial statuses. */
export function relationshipLegend(): readonly LegendRow[] {
  return [
    { key: 'access', label: RELATIONSHIP_KIND_LABELS.access, hint: RELATIONSHIP_KIND_HINTS.access, stroke: relationshipStroke('access', 'direct') },
    { key: 'open', label: RELATIONSHIP_KIND_LABELS.open, hint: RELATIONSHIP_KIND_HINTS.open, stroke: relationshipStroke('open', 'direct') },
    { key: 'routed', label: STATUS_LABELS.routed, hint: STATUS_HINTS.routed, stroke: relationshipStroke('access', 'routed') },
    { key: 'unresolved', label: STATUS_LABELS.unresolved, hint: STATUS_HINTS.unresolved, stroke: relationshipStroke('access', 'unresolved') },
  ];
}
