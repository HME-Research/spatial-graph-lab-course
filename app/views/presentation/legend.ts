import type { EffectiveCorridorLook } from '@app/document';
import type { ResolutionStatus } from '@app/spatial';
import type { ViewMode } from '../contracts';
import {
  CONNECTOR_ORDER,
  connectorPresentation,
  corridorLookKey,
  KIND_ORDER,
  KIND_PRESENTATION,
  relationshipLine,
  SELECTION,
  STATUS_ORDER,
  STATUS_PRESENTATION,
  type LineToken,
} from './vocabulary';

/**
 * View legends built from ONE vocabulary (pure). Every view shows the same labels, glyphs and line
 * tokens for the same concept; views differ only in which sections they show and in the
 * "what you see here" sentence. Help topic ids point into `app/ui/help/topics.ts`.
 */

/** Colour of generated connector cells in Voxels / Architecture legends. */
export const CONNECTOR_CELL_COLOR = '#cfc6b3';

export type Swatch =
  | { readonly shape: 'line'; readonly line: LineToken }
  | { readonly shape: 'ring'; readonly color: string }
  | { readonly shape: 'cell'; readonly color: string; readonly pattern: EffectiveCorridorLook | 'room' };

export interface LegendItem {
  /** Stable id, e.g. `status:unresolved`; also used as `data-legend-item` in the DOM. */
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly glyph?: string;
  readonly swatch: Swatch;
  /** Help topic id for "More details". */
  readonly helpTopic?: string;
  readonly count?: number;
}

export interface LegendSection {
  readonly id: 'status' | 'kind' | 'connector' | 'selection';
  readonly title: string;
  readonly items: readonly LegendItem[];
}

export interface ViewLegend {
  readonly view: ViewMode;
  readonly title: string;
  readonly sections: readonly LegendSection[];
}

export interface RelationshipLegendOptions {
  /** Status counts; when given, statuses with 0 relationships are dropped (Unresolved always stays visible when > 0). */
  readonly statusCounts?: Readonly<Record<ResolutionStatus, number>>;
  /** Corridor looks (walls + roof) in use; when given, only these are listed. */
  readonly corridorLooks?: readonly EffectiveCorridorLook[];
  /** Laptop / narrow panels: hide the selection section and kind explanations. */
  readonly compact?: boolean;
}

const VIEW_TITLE: Readonly<Record<ViewMode, string>> = {
  graph2d: 'Relationships (diagram)',
  graph3d: 'Relationships (3D graph)',
  voxels: 'Rooms and connectors',
  architecture: 'What gets built',
  plan: 'Floor plan',
  data: 'Relationships',
};

/** Physical meaning per status in the building views. */
const BUILT_SUMMARY: Readonly<Record<ResolutionStatus, string>> = {
  direct: 'Built as a door, opening or void in the shared wall or floor. Solid line.',
  routed: 'Built as a straight connector between the rooms. Long-dashed line.',
  unresolved: 'Not built. Shown only as a short-dashed red line.',
};

function statusSection(view: ViewMode, opts: RelationshipLegendOptions): LegendSection {
  const building = view === 'voxels' || view === 'architecture';
  const statuses = STATUS_ORDER.filter((s) => !opts.statusCounts || opts.statusCounts[s] > 0);
  return {
    id: 'status',
    title: 'Spatial status',
    items: statuses.map((s) => ({
      id: `status:${s}`,
      label: STATUS_PRESENTATION[s].label,
      summary: building ? BUILT_SUMMARY[s] : STATUS_PRESENTATION[s].summary,
      glyph: STATUS_PRESENTATION[s].glyph,
      swatch: { shape: 'line', line: relationshipLine('access', s) },
      helpTopic: s === 'unresolved' ? 'unresolved' : 'relationship-status',
      ...(opts.statusCounts && { count: opts.statusCounts[s] }),
    })),
  };
}

function kindSection(view: ViewMode): LegendSection {
  const graph = view === 'graph2d' || view === 'graph3d';
  return {
    id: 'kind',
    title: 'Relationship kind',
    items: KIND_ORDER.map((k) => {
      const p = KIND_PRESENTATION[k];
      return {
        id: `kind:${k}`,
        label: p.label,
        summary: graph
          ? `${p.summary} ${k === 'open' ? 'Thick line.' : 'Thin line.'}`
          : `Same storey: ${p.sameStorey}. Between storeys: ${p.betweenStoreys}.`,
        swatch: { shape: 'line', line: relationshipLine(k, 'direct') },
        helpTopic: 'access-open',
      };
    }),
  };
}

function connectorSection(looks: readonly EffectiveCorridorLook[]): LegendSection {
  return {
    id: 'connector',
    title: 'Corridors',
    items: looks.map((look) => ({
      id: `connector:${corridorLookKey(look)}`,
      label: connectorPresentation(look).label,
      summary: connectorPresentation(look).summary,
      swatch: { shape: 'cell', color: CONNECTOR_CELL_COLOR, pattern: look },
      helpTopic: 'connector-style',
    })),
  };
}

const SELECTION_SECTION: LegendSection = {
  id: 'selection',
  title: 'Selection',
  items: [
    {
      id: 'selection',
      label: 'Selected',
      summary: 'Pink outline. Selection is always drawn on top of analysis colours.',
      swatch: { shape: 'ring', color: SELECTION },
    },
  ],
};

/**
 * Legend for one view. Graph views explain line styles (status + kind); building views explain
 * what is physically built (status + corridor looks; kind in full mode).
 */
export function relationshipLegend(view: ViewMode, opts: RelationshipLegendOptions = {}): ViewLegend {
  const building = view === 'voxels' || view === 'architecture';
  const sections: LegendSection[] = [statusSection(view, opts)];
  if (!building || !opts.compact) sections.push(kindSection(view));
  if (building) {
    const looks = opts.corridorLooks ?? CONNECTOR_ORDER;
    if (looks.length > 0) sections.push(connectorSection(looks));
  }
  if (!opts.compact) sections.push(SELECTION_SECTION);
  return { view, title: VIEW_TITLE[view], sections: sections.filter((s) => s.items.length > 0) };
}

/** Panel width (CSS px) below which legends should use `compact` (laptops in split view). */
export const COMPACT_LEGEND_WIDTH = 560;

export const isCompactPanel = (panelWidth: number): boolean => panelWidth < COMPACT_LEGEND_WIDTH;
