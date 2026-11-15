import type { EdgeKind } from '@app/document';
import type { RelationshipKind } from '@app/document/v2';
import type { ResolutionStatus, UnresolvedReason } from '@app/spatial';
import { EDGE_KIND_LABELS, EDGE_STYLES, orientationOf } from './diagram';
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

export const NEUTRAL_STROKE = '#3a4756';
export const ROUTED_STROKE = '#5b6774';
export const UNRESOLVED_STROKE = '#b55e63';

export const RELATIONSHIP_KIND_LABELS: Readonly<Record<RelationshipKind, string>> = {
  access: 'Access',
  open: 'Open',
};

export const RELATIONSHIP_KIND_HINTS: Readonly<Record<RelationshipKind, string>> = {
  access: 'people can pass between the rooms (a door, or an opening between storeys)',
  open: 'the rooms flow into each other (no wall, or a void between storeys)',
};

export const STATUS_LABELS: Readonly<Record<ResolutionStatus, string>> = {
  direct: 'Touching',
  routed: 'Via connector',
  unresolved: 'Not buildable yet',
};

export const STATUS_HINTS: Readonly<Record<ResolutionStatus, string>> = {
  direct: 'the rooms share a wall or floor',
  routed: 'joined by a generated straight connector',
  unresolved: 'kept as a relationship, but no physical connection can be made yet',
};

/** Short beginner explanations of why a relationship cannot be built (shown on hover / popover). */
export const UNRESOLVED_REASON_TEXT: Readonly<Record<UnresolvedReason, string>> = {
  'different-level': 'The rooms are on different storeys and do not touch. Stairs and ramps are not generated yet.',
  'not-aligned': 'No straight corridor can join facing sides of these rooms.',
  'blocked-by-room': 'Every straight corridor would pass through another room.',
  'blocked-by-route': 'Every straight corridor would cross another generated connector.',
  'endpoint-clearance': 'There is not enough clear space where a corridor would meet the rooms.',
  'routing-unavailable': 'Connectors between separated rooms are not generated yet.',
};

export type EdgeStatus = ResolutionStatus | 'legacy';

export interface EdgePresentation {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeDasharray: string | undefined;
  readonly status: EdgeStatus;
  /** Short label (shown only when the edge is selected, to keep the canvas quiet). */
  readonly label: string;
  /** One- or two-line tooltip: intent, status and, when unresolved, why. */
  readonly title: string;
}

const KIND_WIDTH: Readonly<Record<RelationshipKind, number>> = { access: 2, open: 4.5 };

const ROUTED_DASH = '10 4';
const UNRESOLVED_DASH = '5 4';

/** Stroke for a v2 relationship (intent × status). Exported for the legend and tests. */
export function relationshipStroke(
  kind: RelationshipKind,
  status: ResolutionStatus,
): Pick<EdgePresentation, 'stroke' | 'strokeWidth' | 'strokeDasharray'> {
  const width = KIND_WIDTH[kind];
  if (status === 'unresolved') return { stroke: UNRESOLVED_STROKE, strokeWidth: kind === 'open' ? 2.5 : 1.5, strokeDasharray: UNRESOLVED_DASH };
  if (status === 'routed') return { stroke: ROUTED_STROKE, strokeWidth: width, strokeDasharray: ROUTED_DASH };
  return { stroke: NEUTRAL_STROKE, strokeWidth: width, strokeDasharray: undefined };
}

/** Presentation of one edge of the model; endpoints are named by their short display labels. */
export function presentEdge(model: DiagramModel, edge: DiagramEdge): EdgePresentation {
  const a = model.byNode.get(edge.source)?.label ?? edge.source;
  const b = model.byNode.get(edge.target)?.label ?? edge.target;
  const pair = `${a} ↔ ${b}`;
  if (model.version === 1) {
    const kind = edge.kind as EdgeKind;
    const style = EDGE_STYLES[kind];
    return {
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeDasharray: style.strokeDasharray,
      status: 'legacy',
      label: `${style.symbol} ${kind}`,
      title: `${pair}: ${EDGE_KIND_LABELS[kind]} (${orientationOf(kind)})`,
    };
  }
  const kind = edge.kind as RelationshipKind;
  const resolution = edge.resolution;
  // A missing resolution means the host has not resolved this edge; show it plainly, never as an error.
  const status: ResolutionStatus = resolution?.status ?? 'direct';
  const why = resolution?.status === 'unresolved' ? `\n${UNRESOLVED_REASON_TEXT[resolution.reason]}` : '';
  return {
    ...relationshipStroke(kind, status),
    status: resolution ? status : 'legacy',
    label: `${RELATIONSHIP_KIND_LABELS[kind]}${resolution ? ` · ${STATUS_LABELS[status]}` : ''}`,
    title: `${pair}: ${RELATIONSHIP_KIND_LABELS[kind]}${resolution ? ` — ${STATUS_LABELS[status].toLowerCase()}` : ''}${why}`,
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
