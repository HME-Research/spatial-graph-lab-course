import { DEFAULT_CELL_SIZE, type CellSize } from '@core/viewer/coordinates';
import { DEFAULT_WALL_THICKNESS, groupWallRuns, layoutFace, type FaceFrame, type ResolvedFace } from '@app/building';
import {
  FACADE_VARIANTS,
  lookAssetIds,
  storedLooks,
  type DesignDocumentV2,
  type FacadeModule,
  type FacadePlacement,
  type FacadeVariantKind,
  type Look,
  type NodeLook,
  type StyleBy,
  type StyleGroupRef,
  type StyleSetup,
} from '@app/document/v2';
import { placeComponent, targetFromFaceFrame, targetFromWallRun, type ComponentSize } from './facadeAdapter';

/**
 * Imported façade modules on a building (pure). The face layout, and so the Building model, the
 * Plan and the façade metrics, are NOT changed. The module REPLACES the wall where it is placed
 * (owner 2026-11-17, superseding D6's "mounted on the outer surface"): its back sits on the wall's
 * INNER surface (half a wall thickness inside the centre plane), and the Building view hides the
 * wall and Designer windows of every face a module covers (`FacadeModuleInstance.faceIds`).
 *
 * Which walls: exterior wall faces of rooms whose effective look (`nodeLooks`: the room's card
 * under "Style rooms by", else Default) has a module and whose walls are `enclosed`. Faces of
 * other conditions (shared walls, interior doors and open sides) never get the wall module.
 *
 * Door and Open bays on the façade (`outside` faces: the end of an open-air connector, condition
 * `door` / `open`) get the module's optional `door` / `open` variant, one per bay, fitted like
 * Repeat. Without that variant they keep the automatic geometry (glass door, open threshold).
 *
 * - `repeat`: one instance per exterior wall face (one 3 m bay × one storey).
 * - `stretch`: one instance per wall run (`groupWallRuns`: contiguous, coplanar exterior bays of one
 *   room on one storey) — note this differs from the Stretch WINDOW layout, which spans a room's
 *   whole side over all storeys; a module is one rectangle, so it cannot follow an L-shaped outline.
 * Width and height are fitted exactly (non-uniform scale); depth is never scaled; `right = up × normal`
 * keeps modules unmirrored on every wall (see `targetFromFaceFrame`).
 */

export interface FacadeModuleInstance {
  /** Deterministic: `${faceId}:module` (repeat) or `${runId}:module` (stretch). */
  readonly id: string;
  readonly assetId: string;
  readonly placement: FacadePlacement;
  /** Which module of the function: its wall module, or the `door` / `open` bay variant (always `repeat`). */
  readonly variant: 'wall' | FacadeVariantKind;
  readonly ownerNodeId: string;
  readonly ownerTypeId: string;
  /** The exterior wall faces the instance covers (one for repeat). */
  readonly faceIds: readonly string[];
  /** Column-major 4×4 (Three.js `Matrix4.fromArray` order): panel (a, b, c) metres → world. */
  readonly matrix: Float64Array;
  /** Scale applied along the façade and upward (1 = drawn at its true size). */
  readonly scaleAlong: number;
  readonly scaleUp: number;
}

export interface FacadeModuleLayout {
  readonly instances: readonly FacadeModuleInstance[];
  /** Asset ids the design uses that are not in the project (nothing is drawn for them). */
  readonly missingAssets: readonly string[];
}

export interface FacadeModuleOptions {
  readonly cell?: CellSize;
  readonly wallThickness?: number;
}

type WallFace = Pick<ResolvedFace, 'id' | 'ownerNodeId' | 'ownerTypeId' | 'cell' | 'direction' | 'orientation' | 'condition' | 'neighbourNodeId' | 'edgeId' | 'outside'>;

const isVariant = (condition: string): condition is FacadeVariantKind => (FACADE_VARIANTS as readonly string[]).includes(condition);

export const EMPTY_FACADE_MODULES: FacadeModuleLayout = Object.freeze({ instances: [], missingAssets: [] });

/** True when any stored look of the design (any remembered setup) uses an imported façade. */
export function designUsesFacadeModules(doc: Pick<DesignDocumentV2, 'settings'>): boolean {
  for (const { look } of storedLooks(doc.settings)) if (look.facade !== undefined) return true;
  return false;
}

/** Every asset id a design refers to (any card of any remembered setup), sorted. */
export function facadeAssetIdsOf(doc: Pick<DesignDocumentV2, 'settings'>): string[] {
  const ids = new Set<string>();
  for (const { look } of storedLooks(doc.settings)) for (const id of lookAssetIds(look)) ids.add(id);
  return [...ids].sort();
}

/** Readable name of a card, e.g. "gallery", "Default", "Area band 2" (`by` is the setup's attribute). */
export function styleCardName(by: StyleBy, group: StyleGroupRef): string {
  if (group.kind === 'default') return by === 'function' ? 'Default' : `Default (${by})`;
  if (group.kind === 'band') return `${by} band ${group.index + 1}`;
  return by === 'function' ? String(group.value) : `${by} = ${String(group.value)}`;
}

/** Cards (any remembered setup) whose façade or door / open bay uses `assetId`, as readable names. */
export function cardsUsingFacade(doc: Pick<DesignDocumentV2, 'settings'>, assetId: string): string[] {
  const out: string[] = [];
  for (const { by, group, look } of storedLooks(doc.settings)) if (lookAssetIds(look).includes(assetId)) out.push(styleCardName(by, group));
  return out;
}

/** The look without any use of `assetId` (a façade that IS it is removed; a bay using it loses that bay). */
function lookWithout(look: Look, assetId: string): Look {
  if (!look.facade) return look;
  const { facade, ...rest } = look;
  if (facade.assetId === assetId) return rest;
  const kept = { ...facade };
  for (const v of FACADE_VARIANTS) if (kept[v]?.assetId === assetId) delete kept[v];
  return { ...rest, facade: kept };
}

/**
 * The design with every use of `assetId` replaced by the automatic geometry (pure), in every
 * remembered setup. Returns the same object when nothing uses it.
 */
export function withoutFacadeAsset<D extends Pick<DesignDocumentV2, 'settings'>>(doc: D, assetId: string): D {
  if (cardsUsingFacade(doc, assetId).length === 0) return doc;
  const styles = Object.fromEntries(
    Object.entries(doc.settings.styles).map(([by, setup]): [string, StyleSetup] => [
      by,
      {
        ...setup,
        ...(setup.default ? { default: lookWithout(setup.default, assetId) } : {}),
        ...(setup.groups ? { groups: setup.groups.map((g) => ({ value: g.value, look: lookWithout(g.look, assetId) })) } : {}),
        ...(setup.bands ? { bands: setup.bands.map((b) => lookWithout(b, assetId)) } : {}),
      },
    ]),
  );
  return { ...doc, settings: { ...doc.settings, styles } };
}

export function layoutFacadeModules(
  faces: readonly WallFace[],
  /** Per-room looks (`nodeLooks` / `buildingFacesV2(...).looks` / `BuildingModelV2.looks`). */
  looks: ReadonlyMap<string, NodeLook>,
  sizeOf: (assetId: string) => ComponentSize | null,
  options: FacadeModuleOptions = {},
): FacadeModuleLayout {
  if (![...looks.values()].some((l) => l.look.facade !== null)) return EMPTY_FACADE_MODULES;
  const cell = options.cell ?? DEFAULT_CELL_SIZE;
  const wallThickness = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const optionsFor = (module: FacadeModule) => ({ mountOffset: -wallThickness / 2, flip: module.flip === true });

  const moduleOf = (nodeId: string): FacadeModule | null => {
    const look = looks.get(nodeId)?.look;
    return look && look.walls === 'enclosed' ? look.facade : null;
  };

  const missing = new Set<string>();
  const sized = (module: { readonly assetId: string }): ComponentSize | null => {
    const size = sizeOf(module.assetId);
    if (!size) missing.add(module.assetId);
    return size;
  };

  const eligible = faces.filter((f) => f.orientation === 'wall' && f.condition === 'exterior' && moduleOf(f.ownerNodeId) !== null);
  const frames = new Map<string, FaceFrame>();
  const frameOf = (face: WallFace): FaceFrame => {
    let frame = frames.get(face.id);
    if (!frame) {
      frame = layoutFace(face as ResolvedFace, { cell, wallThickness }).frame;
      frames.set(face.id, frame);
    }
    return frame;
  };

  const instances: FacadeModuleInstance[] = [];
  for (const face of eligible) {
    const module = moduleOf(face.ownerNodeId)!;
    if (module.placement !== 'repeat') continue;
    const size = sized(module);
    if (!size) continue;
    const placed = placeComponent(size, targetFromFaceFrame(frameOf(face), cell), optionsFor(module));
    instances.push({
      id: `${face.id}:module`,
      assetId: module.assetId,
      placement: 'repeat',
      variant: 'wall',
      ownerNodeId: face.ownerNodeId,
      ownerTypeId: face.ownerTypeId,
      faceIds: [face.id],
      matrix: placed.matrix,
      scaleAlong: placed.scaleAlong,
      scaleUp: placed.scaleUp,
    });
  }

  const stretchFaces = eligible.filter((f) => moduleOf(f.ownerNodeId)!.placement === 'stretch');
  if (stretchFaces.length > 0) {
    const byId = new Map(stretchFaces.map((f) => [f.id, f] as const));
    for (const run of groupWallRuns(stretchFaces)) {
      const runFaces = run.faceIds.map((id) => byId.get(id)!);
      const first = runFaces[0]!;
      const module = moduleOf(first.ownerNodeId)!;
      const size = sized(module);
      if (!size) continue;
      const placed = placeComponent(size, targetFromWallRun(runFaces.map(frameOf), cell), optionsFor(module));
      instances.push({
        id: `${run.id}:module`,
        assetId: module.assetId,
        placement: 'stretch',
        variant: 'wall',
        ownerNodeId: run.ownerNodeId,
        ownerTypeId: first.ownerTypeId,
        faceIds: run.faceIds,
        matrix: placed.matrix,
        scaleAlong: placed.scaleAlong,
        scaleUp: placed.scaleUp,
      });
    }
  }

  // Door / Open bays on the façade: the function's variant module, one per bay (if set).
  for (const face of faces) {
    if (face.orientation !== 'wall' || !face.outside || !isVariant(face.condition)) continue;
    const module = moduleOf(face.ownerNodeId);
    const variant = module?.[face.condition];
    if (!variant) continue;
    const size = sized(variant);
    if (!size) continue;
    const placed = placeComponent(size, targetFromFaceFrame(frameOf(face), cell), { mountOffset: -wallThickness / 2, flip: variant.flip === true });
    instances.push({
      id: `${face.id}:module`,
      assetId: variant.assetId,
      placement: 'repeat',
      variant: face.condition,
      ownerNodeId: face.ownerNodeId,
      ownerTypeId: face.ownerTypeId,
      faceIds: [face.id],
      matrix: placed.matrix,
      scaleAlong: placed.scaleAlong,
      scaleUp: placed.scaleUp,
    });
  }
  return { instances, missingAssets: [...missing].sort() };
}

/** Instances of one type scaled by more than `tolerance` (default 5 %) along or up: a fit warning. */
export function distortedModules(instances: readonly FacadeModuleInstance[], typeId: string, tolerance = 0.05): {
  readonly count: number;
  readonly minAlong: number;
  readonly maxAlong: number;
  readonly minUp: number;
  readonly maxUp: number;
} | null {
  const own = instances.filter((i) => i.ownerTypeId === typeId && (Math.abs(i.scaleAlong - 1) > tolerance || Math.abs(i.scaleUp - 1) > tolerance));
  if (own.length === 0) return null;
  return {
    count: own.length,
    minAlong: Math.min(...own.map((i) => i.scaleAlong)),
    maxAlong: Math.max(...own.map((i) => i.scaleAlong)),
    minUp: Math.min(...own.map((i) => i.scaleUp)),
    maxUp: Math.max(...own.map((i) => i.scaleUp)),
  };
}
