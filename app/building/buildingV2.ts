import { effectiveTypeAppearance, type ConnectorStyle, type DesignDocumentV2 } from '@app/document/v2';
import { resolveRelationships, type ResolutionStatus, type SpatialResolution, type UnresolvedReason } from '@app/spatial';
import type { FacadeProvider } from './contracts';
import { buildConnector, type ConnectorElement } from './connectorGeometry';
import { exampleFacadeProvider } from './facade';
import { buildArchitecture, type ArchitectureOptions, type ArchitecturalElement } from './geometry';
import { resolveBuildingFaces, toResolvedFace, type BuildingFace } from './multicellFaces';
import { applyRoofPolicy } from './roofGeometry';

/**
 * Schema-v2 building generator (03-building). Pure entry point:
 *
 *   buildBuildingV2(doc, { spatial, facade }) → { elements, connectors, relationships }
 *
 * - `elements`: room walls, glazing, slabs, roofs, door frames, thresholds and symbolic vertical
 *   access markers — the existing `ArchitecturalElement` shape, so the current Architecture view
 *   can render them unchanged. Multi-cell rooms, direct openings and flat roofs are resolved by
 *   `resolveBuildingFaces` + `applyRoofPolicy`.
 * - `connectors`: floor / roof / side walls / posts of routed relationships (`ConnectorElement`,
 *   a separate type so existing exhaustive `ElementPart` switches stay valid).
 * - `relationships`: per edge, in document order, the derived status and what was built, so the
 *   UI can explain direct / routed / unresolved. Unresolved edges build nothing.
 *
 * `spatial` must be the resolution of `doc` (the host derives it once: `DesignPort.spatial`).
 * When omitted it is computed with `resolveRelationships(doc)`.
 *
 * Façade: window fraction per type = design override (`settings.typeAppearance`) → project
 * `facade(typeId)` → example provider. Roof: design override → `flat`.
 */

export interface BuildingV2Options extends Omit<ArchitectureOptions, 'facade'> {
  readonly spatial?: SpatialResolution;
  /** Project façade defaults (e.g. the active project's provider); example façades otherwise. */
  readonly facade?: FacadeProvider;
  readonly postSize?: number;
}

/** What was generated for one relationship. */
export type RelationshipGeometry =
  /** Direct contact: openings on the shared faces (door / no wall / slab opening + marker / void). */
  | 'opening'
  /** Direct contact but no opening needed in geometry (should not occur for valid kinds). */
  | 'none'
  /** Straight connector drawn. */
  | 'connector'
  /** Unresolved: nothing physical is generated. */
  | 'not-built'
  /** Routed, but the route's cells were not reserved for it in the occupancy: refused. */
  | 'route-rejected';

export interface RelationshipBuildInfo {
  readonly edgeId: string;
  readonly status: ResolutionStatus;
  readonly geometry: RelationshipGeometry;
  /** Ids of every room element / connector element generated for this relationship. */
  readonly elementIds: readonly string[];
  readonly connectorStyle?: ConnectorStyle;
  readonly reason?: UnresolvedReason;
  readonly message?: string;
}

export interface BuildingModelV2 {
  readonly faces: readonly BuildingFace[];
  readonly elements: readonly ArchitecturalElement[];
  readonly connectors: readonly ConnectorElement[];
  readonly relationships: readonly RelationshipBuildInfo[];
}

/**
 * The building faces and effective façade of `doc`, exactly as `buildBuildingV2` uses them
 * (`resolveBuildingFaces` → `applyRoofPolicy`; window fraction = design override → `base` →
 * example). Shared with the Plan (`planSourceV2`) so both views lay out the same faces.
 */
export function buildingFacesV2(
  doc: DesignDocumentV2,
  spatial: SpatialResolution,
  base: FacadeProvider = exampleFacadeProvider,
): { readonly faces: BuildingFace[]; readonly facade: FacadeProvider } {
  const appearance = (typeId: string) => effectiveTypeAppearance(doc, typeId, base(typeId));
  const facade: FacadeProvider = (typeId) => ({ windowFraction: appearance(typeId).windowFraction });
  const faces = applyRoofPolicy(resolveBuildingFaces(doc, spatial), (t) => appearance(t).roof);
  return { faces, facade };
}

export function buildBuildingV2(doc: DesignDocumentV2, options: BuildingV2Options = {}): BuildingModelV2 {
  const spatial = options.spatial ?? resolveRelationships(doc);
  const { faces, facade } = buildingFacesV2(doc, spatial, options.facade ?? exampleFacadeProvider);
  const elements = buildArchitecture(faces.map(toResolvedFace), {
    facade,
    ...(options.cell ? { cell: options.cell } : {}),
    ...(options.wallThickness !== undefined ? { wallThickness: options.wallThickness } : {}),
    ...(options.slabThickness !== undefined ? { slabThickness: options.slabThickness } : {}),
  });

  const styleByEdge = new Map<string, ConnectorStyle>();
  for (const r of spatial.edges) if (r.status === 'routed') styleByEdge.set(r.edgeId, r.route.style);

  const connectors: ConnectorElement[] = [];
  const relationships: RelationshipBuildInfo[] = [];
  for (const r of spatial.edges) {
    const own = elements.filter((e) => e.edgeId === r.edgeId).map((e) => e.id);
    switch (r.status) {
      case 'direct':
        relationships.push({ edgeId: r.edgeId, status: r.status, geometry: own.length > 0 ? 'opening' : 'none', elementIds: own });
        break;
      case 'routed': {
        const built = buildConnector(r.route, spatial.occupancy, {
          styleOfEdge: (id) => styleByEdge.get(id),
          ...(options.cell ? { cell: options.cell } : {}),
          ...(options.wallThickness !== undefined ? { wallThickness: options.wallThickness } : {}),
          ...(options.slabThickness !== undefined ? { slabThickness: options.slabThickness } : {}),
          ...(options.postSize !== undefined ? { postSize: options.postSize } : {}),
        });
        const connectorStyle = r.route.style; // effective style, `connectorStyleOf(edge)` per contract
        if (built === null) {
          relationships.push({ edgeId: r.edgeId, status: r.status, geometry: 'route-rejected', elementIds: [], connectorStyle });
        } else {
          connectors.push(...built);
          relationships.push({
            edgeId: r.edgeId,
            status: r.status,
            geometry: 'connector',
            elementIds: [...own, ...built.map((c) => c.id)],
            connectorStyle,
          });
        }
        break;
      }
      case 'unresolved':
        relationships.push({
          edgeId: r.edgeId,
          status: r.status,
          geometry: 'not-built',
          elementIds: [],
          reason: r.reason,
          message: r.message,
        });
        break;
    }
  }
  return { faces, elements, connectors, relationships };
}
