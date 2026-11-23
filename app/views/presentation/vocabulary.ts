import { ROOF_STYLES, WALL_STYLES, type EffectiveCorridorLook, type RelationshipKind, type RoofStyle } from '@app/document';
import type { ResolutionStatus, UnresolvedReason } from '@app/spatial';
import { SELECTION_COLOR } from '@core/viewer/appearance';

/**
 * One teaching vocabulary for every view (pure data; Stage 07).
 *
 * A graph relationship has two independent properties:
 *  - its KIND (what the designer intends): Access or Open;
 *  - its spatial STATUS (derived, never saved): Direct, Connected via route, or Unresolved.
 *
 * Line encoding (adopted by every view and legend at Gate 1; see `relationshipLine` below):
 *  - Direct = solid neutral; Routed = long-dashed neutral; Unresolved = short-dashed muted red.
 *  - Kind is encoded independently by line WEIGHT (Access thin, Open heavy).
 *  - Selection keeps its own pink (SELECTION_COLOR) and always wins over every other colour.
 *  - Document / import / type errors use the ERROR tone, never the unresolved line colour.
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
/**
 * Analysis highlight (P4, Analyse tab): nodes and edges a result points at (a path, bridges, the
 * edges of a node…). A teal, distinct from the selection pink and the storey/unresolved colours.
 */
export const ANALYSIS_HIGHLIGHT = '#0e9f8f';

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
    summary: 'The edge is kept in the graph, but nothing can be built for it yet.',
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

/** What a corridor's legend entry depends on: its walls and roof (its width is not a separate look). */
export type CorridorLookKind = Pick<EffectiveCorridorLook, 'walls' | 'roof'>;

export interface ConnectorPresentation {
  readonly look: CorridorLookKind;
  readonly label: string;
  readonly summary: string;
}

/** Every corridor look (walls × roof) in legend order: Enclosed first; Flat, Pergola, None. */
export const CONNECTOR_ORDER: readonly CorridorLookKind[] = WALL_STYLES.flatMap((walls) => ROOF_STYLES.map((roof) => ({ walls, roof })));

/** Stable key of a corridor look, e.g. `open-flat`. */
export const corridorLookKey = (look: CorridorLookKind): string => `${look.walls}-${look.roof}`;

const CORRIDOR_ROOF_WORDS: Readonly<Record<RoofStyle, string>> = { flat: 'flat roof', pergola: 'pergola roof', none: 'no roof' };
const CORRIDOR_SUMMARY: Readonly<Record<string, string>> = {
  'enclosed-flat': 'Side walls and a flat roof.',
  'enclosed-pergola': 'Side walls under open pergola slats.',
  'enclosed-none': 'Side walls, open to the sky.',
  'open-flat': 'A flat roof on slim posts, open sides (default).',
  'open-pergola': 'Pergola slats on slim posts, open sides.',
  'open-none': 'Floor only, no roof or walls.',
};

/** Label and one-line summary of a corridor look (the Corridors card's Walls + Roof). */
export function connectorPresentation(look: CorridorLookKind): ConnectorPresentation {
  return {
    look,
    label: `${look.walls === 'enclosed' ? 'Enclosed' : 'Open'} corridor, ${CORRIDOR_ROOF_WORDS[look.roof]}`,
    summary: CORRIDOR_SUMMARY[corridorLookKey(look)] ?? '',
  };
}

/** Short reason text for each unresolved reason (the engine's `message` stays available as detail). */
export const UNRESOLVED_REASON_TEXT: Readonly<Record<UnresolvedReason, string>> = {
  'different-level': 'The rooms are on different storeys and do not touch; separated stairs are not built yet.',
  'not-aligned': 'No straight connector fits: the rooms do not face each other along x or y.',
  'blocked-by-room': 'A straight connector would pass through another room.',
  'blocked-by-route': 'The straight path is already used by another connector.',
  'endpoint-clearance': 'There is not enough clear space at a room face to start a connector.',
  'routing-unavailable': 'Connector routing is not available in this build yet.',
  'preferred-face-unavailable': 'The wall chosen for this edge is no longer shared by the two rooms.',
};

/** Reason text for any string, including reasons added after this file was written. */
export function unresolvedReasonText(reason: string): string {
  return Object.hasOwn(UNRESOLVED_REASON_TEXT, reason)
    ? UNRESOLVED_REASON_TEXT[reason as UnresolvedReason]
    : 'The edge cannot be built in the current design.';
}

// ── The one relationship line scheme (Gate 1 decision, all views and legends) ──────────────────
//
// Integration resolved the Stage 01 / Stage 07 mismatch as follows (docs/TEACHING-FEEDBACK.md §1):
//  - STATUS is encoded by dash pattern and colour:
//      Direct     → solid, neutral;
//      Routed     → LONG dashes, neutral;
//      Unresolved → SHORT dashes, muted red.
//  - KIND is encoded independently by line WEIGHT (Access thin, Open heavy), for every status.
//  - Storey contact is no longer a line colour (it is stated in tooltips and Properties); the 3D
//    v1 colours remain only for schema-v1 rendering paths.
//  - Selection keeps its own pink and always wins.

/** Neutral line colour for Direct and Routed relationships (≥ 4.5:1 on white). */
export const RELATIONSHIP_NEUTRAL_COLOR = '#3a4756';

const WIDTH_2D: Readonly<Record<RelationshipKind, number>> = { access: 2, open: 4.5 };
const RADIUS_3D: Readonly<Record<RelationshipKind, number>> = { access: 0.07, open: 0.12 };
/** Unresolved lines are thinner than built ones, but still weighted by kind. */
const UNRESOLVED_WIDTH_2D: Readonly<Record<RelationshipKind, number>> = { access: 1.5, open: 3 };
const UNRESOLVED_RADIUS_3D: Readonly<Record<RelationshipKind, number>> = { access: 0.045, open: 0.08 };

/** SVG dash patterns (px). Long = routed, short = unresolved. */
export const ROUTED_DASH_2D = '12 5';
export const UNRESOLVED_DASH_2D = '4 4';
/** 3D dash patterns `[dash, gap]` in metres. */
export const ROUTED_DASH_3D: readonly [number, number] = [0.75, 0.3];
export const UNRESOLVED_DASH_3D: readonly [number, number] = [0.22, 0.2];

/** The unresolved Access line (the thinnest unresolved line; Open is heavier). */
export const UNRESOLVED_LINE: LineToken = Object.freeze({
  color: UNRESOLVED_COLOR,
  width2d: UNRESOLVED_WIDTH_2D.access,
  radius3d: UNRESOLVED_RADIUS_3D.access,
  dash2d: UNRESOLVED_DASH_2D,
  dash3d: UNRESOLVED_DASH_3D,
  marker: 'none',
});

/**
 * Line token for a relationship (kind × derived status). `contact` is accepted for compatibility
 * and does not change the line: storey contact is not a line colour in the unified scheme.
 */
export function relationshipLine(
  kind: RelationshipKind,
  status: ResolutionStatus,
  _contact: 'horizontal' | 'vertical' = 'horizontal',
): LineToken {
  if (status === 'unresolved') {
    return kind === 'access'
      ? UNRESOLVED_LINE
      : { ...UNRESOLVED_LINE, width2d: UNRESOLVED_WIDTH_2D[kind], radius3d: UNRESOLVED_RADIUS_3D[kind] };
  }
  const routed = status === 'routed';
  return {
    color: RELATIONSHIP_NEUTRAL_COLOR,
    width2d: WIDTH_2D[kind],
    radius3d: RADIUS_3D[kind],
    dash2d: routed ? ROUTED_DASH_2D : null,
    dash3d: routed ? ROUTED_DASH_3D : null,
    marker: 'none',
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
