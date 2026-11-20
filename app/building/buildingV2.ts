import { nodeLooks, type DesignDocumentV2, type EffectiveCorridorLook, type WallStyle, type NodeLook, type StyleValues } from '@app/document';
import { resolveRelationships, type ResolutionStatus, type SpatialResolution, type UnresolvedReason } from '@app/spatial';
import type { FacadeProvider } from './contracts';
import type { RoofStyleProvider, WallStyleProvider, WindowLayoutProvider } from './faceLayout';
import { buildConnector, type ConnectorElement } from './connectorGeometry';
import { exampleFacadeProvider } from './facade';
import { buildArchitecture, type ArchitectureOptions, type ArchitecturalElement } from './geometry';
import { resolveBuildingFaces, toResolvedFace, type BuildingFace } from './multicellFaces';
import { isExposedTop } from './roofGeometry';

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
 * Façade and roof per ROOM (`nodeLooks`: the room's card under "Style rooms by" → Default →
 * project `facade(functionId)` → example provider / built-in). Faces are styled by `ownerNodeId`.
 */

export interface BuildingV2Options extends Omit<ArchitectureOptions, 'facade'> {
  readonly spatial?: SpatialResolution;
  /** Project façade defaults (e.g. the active project's provider); example façades otherwise. */
  readonly facade?: FacadeProvider;
  /** Values of the styling attribute that the document cannot read itself (custom / measured). */
  readonly styleValues?: StyleValues;
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
  readonly edgeId: number;
  readonly status: ResolutionStatus;
  readonly geometry: RelationshipGeometry;
  /** Ids of every room element / connector element generated for this relationship. */
  readonly elementIds: readonly string[];
  /** Routed only: the corridor's effective walls and roof (`route.look`). */
  readonly corridor?: EffectiveCorridorLook;
  readonly reason?: UnresolvedReason;
  readonly message?: string;
}

export interface BuildingModelV2 {
  readonly faces: readonly BuildingFace[];
  readonly elements: readonly ArchitecturalElement[];
  readonly connectors: readonly ConnectorElement[];
  readonly relationships: readonly RelationshipBuildInfo[];
  /** Effective look of every room (node id → card + look), as used for the faces. */
  readonly looks: ReadonlyMap<number, NodeLook>;
}

/**
 * The building faces and effective per-room look of `doc`, exactly as `buildBuildingV2` uses them
 * (`resolveBuildingFaces` → roofs of `none` rooms removed). The providers are keyed by node id
 * (`styleKey: 'node'`). Shared with the Plan (`planSourceV2`) so both views lay out the same faces.
 */
export function buildingFacesV2(
  doc: DesignDocumentV2,
  spatial: SpatialResolution,
  base: FacadeProvider = exampleFacadeProvider,
  styleValues?: StyleValues,
): {
  readonly faces: BuildingFace[];
  readonly facade: FacadeProvider;
  readonly windowLayout: WindowLayoutProvider;
  readonly walls: WallStyleProvider;
  readonly roof: RoofStyleProvider;
  readonly styleKey: 'node';
  readonly looks: ReadonlyMap<number, NodeLook>;
} {
  const looks = nodeLooks(doc, base, styleValues);
  // A face's owner is always a room of `doc`; the example default only guards a stale resolution.
  // Providers are called with the style key: the room id as text (`styleKey: 'node'`).
  const look = (key: string) => looks.get(Number(key))?.look;
  const facade: FacadeProvider = (nodeId) => ({ windowFraction: look(nodeId)?.windowFraction ?? 0 });
  const windowLayout: WindowLayoutProvider = (nodeId) => look(nodeId)?.windowLayout ?? 'repeat';
  const walls: WallStyleProvider = (nodeId) => look(nodeId)?.walls ?? 'enclosed';
  const roof: RoofStyleProvider = (nodeId) => look(nodeId)?.roof ?? 'flat';
  // A wall between an enclosed and an open-walled room is the enclosed room's façade (2026-11-20).
  const wallsOf = (nodeId: number) => looks.get(nodeId)?.look.walls ?? 'enclosed';
  const faces = resolveBuildingFaces(doc, spatial, { wallsOf }).filter((f) => !isExposedTop(f) || roof(String(f.ownerNodeId)) !== 'none');
  return { faces, facade, windowLayout, walls, roof, styleKey: 'node', looks };
}

export function buildBuildingV2(doc: DesignDocumentV2, options: BuildingV2Options = {}): BuildingModelV2 {
  const spatial = options.spatial ?? resolveRelationships(doc);
  const { faces, facade, windowLayout, walls, roof, styleKey, looks } = buildingFacesV2(doc, spatial, options.facade ?? exampleFacadeProvider, options.styleValues);
  const elements = buildArchitecture(faces.map(toResolvedFace), {
    facade,
    windowLayout,
    walls,
    roof,
    styleKey,
    ...(options.cell ? { cell: options.cell } : {}),
    ...(options.wallThickness !== undefined ? { wallThickness: options.wallThickness } : {}),
    ...(options.slabThickness !== undefined ? { slabThickness: options.slabThickness } : {}),
  });

  const wallsByEdge = new Map<number, WallStyle>();
  const widthByEdge = new Map<number, number>();
  for (const r of spatial.edges) {
    if (r.status !== 'routed') continue;
    wallsByEdge.set(r.edgeId, r.route.look.walls);
    widthByEdge.set(r.edgeId, r.route.look.width);
  }

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
          wallsOfEdge: (id) => wallsByEdge.get(id),
          widthOfEdge: (id) => widthByEdge.get(id),
          ...(options.cell ? { cell: options.cell } : {}),
          ...(options.wallThickness !== undefined ? { wallThickness: options.wallThickness } : {}),
          ...(options.slabThickness !== undefined ? { slabThickness: options.slabThickness } : {}),
          ...(options.postSize !== undefined ? { postSize: options.postSize } : {}),
        });
        const corridor = r.route.look; // effective look, `corridorLookOf(edge, doc.settings)` per contract
        if (built === null) {
          relationships.push({ edgeId: r.edgeId, status: r.status, geometry: 'route-rejected', elementIds: [], corridor });
        } else {
          connectors.push(...built);
          relationships.push({
            edgeId: r.edgeId,
            status: r.status,
            geometry: 'connector',
            elementIds: [...own, ...built.map((c) => c.id)],
            corridor,
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
  return { faces, elements, connectors, relationships, looks };
}
