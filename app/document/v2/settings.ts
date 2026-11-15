import { DEFAULT_CONNECTOR_STYLE, DEFAULT_ROOF_STYLE, type ConnectorStyle, type RoofStyle } from './constants';
import type { DesignDocumentV2, RelationshipEdge } from './schema';

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
  readonly roof: RoofStyle;
  /** Where each value came from, for "Reset to project default" and explanations. */
  readonly source: { readonly windowFraction: 'design' | 'project'; readonly roof: 'design' | 'default' };
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
    roof: own?.roof ?? DEFAULT_ROOF_STYLE,
    source: {
      windowFraction: own?.windowFraction === undefined ? 'project' : 'design',
      roof: own?.roof === undefined ? 'default' : 'design',
    },
  };
}

/** Effective connector style of a relationship (`enclosed` unless set). */
export const connectorStyleOf = (edge: Pick<RelationshipEdge, 'connectorStyle'>): ConnectorStyle =>
  edge.connectorStyle ?? DEFAULT_CONNECTOR_STYLE;
