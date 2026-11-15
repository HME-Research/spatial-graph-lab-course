import type { ConnectorStyle, RelationshipKind } from '@app/document/v2';
import type { ResolutionStatus, UnresolvedReason } from '@app/spatial';
import { SELECTION_COLOR } from '@core/viewer/appearance';

/**
 * One teaching vocabulary for every view (pure data; Stage 07).
 *
 * A graph relationship has two independent properties:
 *  - its KIND (what the designer intends): Access or Open;
 *  - its spatial STATUS (derived, never saved): Direct, Connected via route, or Unresolved.
 *
 * Line encoding (proposed for every view, see docs/TEACHING-FEEDBACK.md):
 *  - DASHES mean "Unresolved" and nothing else. Unresolved is always a thin, muted red dashed line.
 *  - Kind is encoded by line WIDTH (Access thin, Open thick), never by dashes.
 *  - Contact family keeps the existing colours: same storey blue-grey, between storeys orange.
 *  - A routed relationship is a solid line with a ring at its midpoint ("via route").
 *  - Selection keeps its own pink (SELECTION_COLOR) and always wins over every other colour.
 *  - Document / import / type errors use the ERROR tone, never the unresolved line colour.
 *
 * These are presentation helpers only. Existing views (graph2d, three/edgeStyle) are owned by
 * other branches; the integration owner adopts these tokens there.
 */

/** Same-storey (horizontal) relationship colour; equal to `HORIZONTAL_EDGE_COLOR` in three/edgeStyle. */
export const SAME_STOREY_COLOR = '#2f5878';
/** Between-storeys (vertical) relationship colour; equal to `VERTICAL_EDGE_COLOR` in three/edgeStyle. */
export const BETWEEN_STOREYS_COLOR = '#d0621b';
/**
 * Muted red for unresolved relationships. ≥ 4.5:1 against white and the app background, clearly
 * different from the selection pink and from the error tone (tested).
 */
export const UNRESOLVED_COLOR = '#a2453f';
/** Error tone for invalid JSON, import, validation and type errors (matches app.css `--error-*`). */
export const ERROR_TONE = { background: '#fdecec', border: '#d27373', text: '#7a1f1f', icon: '✕' } as const;
/** Warning tone for stale analysis results. */
export const WARNING_TONE = { background: '#fff6dc', border: '#d9b44a', text: '#5c4500', icon: '⚠' } as const;
/** Selection colour, re-exported so presentation code never invents its own. */
export const SELECTION = SELECTION_COLOR;

/** Line appearance shared by 2D (SVG, pixels) and 3D (metres) renderers. */
export interface LineToken {
  readonly color: string;
  /** Stroke width in CSS pixels for 2D diagrams. */
  readonly width2d: number;
  /** Tube radius in metres for 3D graph views. */
  readonly radius3d: number;
  /** SVG `stroke-dasharray`; null = solid. Only the unresolved status is dashed. */
  readonly dash2d: string | null;
  /** `[dash, gap]` in metres for 3D (`dashIntervals`); null = solid. */
  readonly dash3d: readonly [number, number] | null;
  /** Midpoint marker. */
  readonly marker: 'none' | 'route-ring';
}

export interface StatusPresentation {
  readonly status: ResolutionStatus;
  readonly label: string;
  /** One beginner-friendly sentence. */
  readonly summary: string;
  /** Tiny text glyph for lists and legends (also readable without colour). */
  readonly glyph: string;
}

export const STATUS_ORDER: readonly ResolutionStatus[] = ['direct', 'routed', 'unresolved'];

export const STATUS_PRESENTATION: Readonly<Record<ResolutionStatus, StatusPresentation>> = {
  direct: {
    status: 'direct',
    label: 'Direct',
    summary: 'The rooms touch, so they connect through their shared wall or floor.',
    glyph: '●',
  },
  routed: {
    status: 'routed',
    label: 'Connected via route',
    summary: 'The rooms do not touch; a generated straight connector joins them.',
    glyph: '◎',
  },
  unresolved: {
    status: 'unresolved',
    label: 'Unresolved',
    summary: 'The relationship is kept in the graph, but nothing can be built for it yet.',
    glyph: '⋯',
  },
};

export interface KindPresentation {
  readonly kind: RelationshipKind;
  readonly label: string;
  readonly summary: string;
  /** Physical meaning when the rooms touch on the same storey / between storeys. */
  readonly sameStorey: string;
  readonly betweenStoreys: string;
}

export const KIND_ORDER: readonly RelationshipKind[] = ['access', 'open'];

export const KIND_PRESENTATION: Readonly<Record<RelationshipKind, KindPresentation>> = {
  access: {
    kind: 'access',
    label: 'Access',
    summary: 'People can move between the two rooms, but they stay separate spaces.',
    sameStorey: 'door in the shared wall',
    betweenStoreys: 'floor opening with an access marker (a symbol, not a designed stair)',
  },
  open: {
    kind: 'open',
    label: 'Open',
    summary: 'The two rooms flow into one space with no separating wall or floor.',
    sameStorey: 'no wall between the rooms',
    betweenStoreys: 'open void through the floor',
  },
};

export interface ConnectorPresentation {
  readonly style: ConnectorStyle;
  readonly label: string;
  readonly summary: string;
}

export const CONNECTOR_ORDER: readonly ConnectorStyle[] = ['enclosed', 'covered', 'deck'];

export const CONNECTOR_PRESENTATION: Readonly<Record<ConnectorStyle, ConnectorPresentation>> = {
  enclosed: { style: 'enclosed', label: 'Enclosed corridor', summary: 'Roof and two side walls (default).' },
  covered: { style: 'covered', label: 'Covered walkway', summary: 'Roof, open sides.' },
  deck: { style: 'deck', label: 'Open deck', summary: 'Floor only, no roof or walls.' },
};

/** Short reason text for each unresolved reason (the engine's `message` stays available as detail). */
export const UNRESOLVED_REASON_TEXT: Readonly<Record<UnresolvedReason, string>> = {
  'different-level': 'The rooms are on different storeys and do not touch; separated stairs are not built yet.',
  'not-aligned': 'No straight connector fits: the rooms do not face each other along x or y.',
  'blocked-by-room': 'A straight connector would pass through another room.',
  'blocked-by-route': 'The straight path is already used by another connector.',
  'endpoint-clearance': 'There is not enough clear space at a room face to start a connector.',
  'routing-unavailable': 'Connector routing is not available in this build yet.',
};

/** Reason text for any string, including reasons added after this file was written. */
export function unresolvedReasonText(reason: string): string {
  return Object.hasOwn(UNRESOLVED_REASON_TEXT, reason)
    ? UNRESOLVED_REASON_TEXT[reason as UnresolvedReason]
    : 'The relationship cannot be built in the current design.';
}

const ACCESS_WIDTH = 2;
const OPEN_WIDTH = 4.5;
const ACCESS_RADIUS = 0.07;
const OPEN_RADIUS = 0.12;

/** The unresolved line: thin, muted red, dashed, identical for both kinds. */
export const UNRESOLVED_LINE: LineToken = Object.freeze({
  color: UNRESOLVED_COLOR,
  width2d: 1.5,
  radius3d: 0.045,
  dash2d: '6 4',
  dash3d: [0.26, 0.18] as const,
  marker: 'none',
});

/**
 * Line token for a relationship. `contact` is known for direct edges; routed edges are always on
 * one storey; for unknown contact (e.g. v1 views without resolution) pass 'horizontal'.
 */
export function relationshipLine(
  kind: RelationshipKind,
  status: ResolutionStatus,
  contact: 'horizontal' | 'vertical' = 'horizontal',
): LineToken {
  if (status === 'unresolved') return UNRESOLVED_LINE;
  const open = kind === 'open';
  return {
    color: status === 'direct' && contact === 'vertical' ? BETWEEN_STOREYS_COLOR : SAME_STOREY_COLOR,
    width2d: open ? OPEN_WIDTH : ACCESS_WIDTH,
    radius3d: open ? OPEN_RADIUS : ACCESS_RADIUS,
    dash2d: null,
    dash3d: null,
    marker: status === 'routed' ? 'route-ring' : 'none',
  };
}

// ── Colour contrast (WCAG 2.x), used by tests and for choosing legible text on fills ─────────

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white text, whichever reads better on `fill`. */
export function textColorOn(fill: string): '#1d1d1b' | '#ffffff' {
  return contrastRatio(fill, '#1d1d1b') >= contrastRatio(fill, '#ffffff') ? '#1d1d1b' : '#ffffff';
}
