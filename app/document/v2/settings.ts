import { DEFAULT_CONNECTOR_STYLE, DEFAULT_ROOF_STYLE, DEFAULT_WALL_STYLE, DEFAULT_WINDOW_LAYOUT, type ConnectorStyle, type RoofStyle, type WallStyle, type WindowLayout } from './constants';
import type { DesignDocumentV2, FacadeModule, RelationshipEdge } from './schema';

/**
 * Per-design appearance settings — FROZEN Gate 0 accessors. Defaults are resolved on READ and
 * never written into the document; removing an override restores inheritance.
 */

/** What the project says about a type (normally `FacadeProvider(typeId)` from app/building). */
export interface ProjectTypeDefaults {
  readonly windowFraction: number;
}

export interface EffectiveTypeAppearance {
  readonly windowFraction: number;
  readonly windowLayout: WindowLayout;
  readonly walls: WallStyle;
  readonly roof: RoofStyle;
  /**
   * Imported façade module (additive 2026-11-17): chosen per type (function); absent = none.
   * There is no design-wide default (owner 2026-11-17).
   */
  readonly facade: FacadeModule | null;
  /** Where each value came from, for "Reset to project default" and explanations. */
  readonly source: {
    readonly windowFraction: 'design' | 'project';
    readonly windowLayout: 'design' | 'default';
    readonly walls: 'design' | 'default';
    readonly roof: 'design' | 'default';
    /** `design` = this type has a façade module; `default` = none. */
    readonly facade: 'design' | 'default';
  };
}

/** Effective exterior appearance of `typeId` in `doc`: design override, else project default. */
export function effectiveTypeAppearance(
  doc: Pick<DesignDocumentV2, 'settings'>,
  typeId: string,
  project: ProjectTypeDefaults,
): EffectiveTypeAppearance {
  const own = Object.prototype.hasOwnProperty.call(doc.settings.typeAppearance, typeId)
    ? doc.settings.typeAppearance[typeId]
    : undefined;
  return {
    windowFraction: own?.windowFraction ?? project.windowFraction,
    windowLayout: own?.windowLayout ?? DEFAULT_WINDOW_LAYOUT,
    walls: own?.walls ?? DEFAULT_WALL_STYLE,
    roof: own?.roof ?? DEFAULT_ROOF_STYLE,
    facade: own?.facade ?? null,
    source: {
      windowFraction: own?.windowFraction === undefined ? 'project' : 'design',
      windowLayout: own?.windowLayout === undefined ? 'default' : 'design',
      walls: own?.walls === undefined ? 'default' : 'design',
      roof: own?.roof === undefined ? 'default' : 'design',
      facade: own?.facade === undefined ? 'default' : 'design',
    },
  };
}

/** Effective connector style of a relationship (`deck`, open to the sky, unless set; was `enclosed` before 2026-11-17). */
export const connectorStyleOf = (edge: Pick<RelationshipEdge, 'connectorStyle'>): ConnectorStyle =>
  edge.connectorStyle ?? DEFAULT_CONNECTOR_STYLE;
