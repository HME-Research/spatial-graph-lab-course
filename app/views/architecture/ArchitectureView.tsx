import type { ThreeEvent } from '@react-three/fiber';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry } from 'three';
import {
  buildArchitecture,
  buildBuildingV2,
  elementBounds,
  isConnectorHighlighted,
  isElementHighlighted,
  resolveFaces,
  type ArchitecturalElement,
  type ConnectorElement,
} from '@app/building';
import { SELECTION_COLOR, typeColor } from '@core/viewer/appearance';
import { EMPTY_FACADE_MODULES, layoutFacadeModules } from '@app/assets';
import type { ViewProps } from '../contracts';
import { useFacadeLibrary } from '../three/facadeLibrary';
import { FacadeModules } from './FacadeModules';
import { brokenTypeIds, projectFacadeProvider } from '../project';
import { useRemembered } from '../panelMemory';
import { useRoomHighlight } from '../roomHighlight';
import { useViewportCamera } from '../viewportCamera';
import { buildEdgeItems, framingFor } from '../three/sceneModel';
import { RoomEditGizmo, RoomEditPanel, useRoomEditing } from '../three/editing';
import { lineOf, RelationshipTube, useUnitCylinder, ViewRelationshipLegend } from '../three/v2Scene';
import { useDefaultOpen, useOverlayWidth } from '../three/overlayWidth';
import { presetColour, useRoofsDisplay, useViewDisplay, type SceneDisplay } from '../three/viewDisplay';
import { StoreyLabels } from '../three/StoreyLabels';
import { eligibleWallFaces, faceIndex, wallActionOf, wallClickSelection, wallPanelModel } from '../three/wallInteraction/wallPanelModel';
import { WallActionPanel } from '../three/wallInteraction/WallActionPanel';
import { WallPanelAnchor } from '../three/wallInteraction/WallPanelAnchor';
import type { DesignPort } from '@app/spatial';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { NO_SELECTION, type Selection } from '@core/viewer/selection';
import { isDeliberateObjectClick } from '@core/viewer/three/interaction';
import { pickHandlers } from '@core/viewer/three/picking';
import { SceneCanvas } from '@core/viewer/three/SceneCanvas';
import { ControlBar, InfoPanel, NAVIGATION_HINT } from '@core/viewer/three/ViewControls';
import type { CameraState, GroundGrid } from '@core/viewer/three/viewport';

/**
 * Building view (internal mode id `architecture`). Renders boxes produced by the pure resolver +
 * geometry step (app/building) in the shared SceneCanvas (camera fitting, orbit controls, picking).
 *
 * With the design port (schema v2) the model is `buildBuildingV2(design.doc, design.spatial)`:
 * multicell rooms, direct openings, generated straight connectors (enclosed / covered / deck),
 * flat roofs on exposed tops and windows from the Designer's per-type rules. Connectors are part
 * of the camera bounds and picking (a connector selects its relationship). Unresolved
 * relationships build nothing and are drawn as short-dashed red lines. The snapped gizmo moves and
 * resizes the selected room (one command per completed gesture). Without the port it keeps its
 * v1 behaviour. Geometry depends on the document only; selection only changes colours.
 */

type Bounds = ReturnType<typeof elementBounds>;

const COLORS = {
  internalWall: '#d8d3ca',
  doorWall: '#c4a87e',
  glazing: '#9fd3f0',
  slab: '#b8b8b8',
  roof: '#8c8c8c',
  threshold: '#6f8f6f',
  connectorFloor: '#a9a294',
  connectorWall: '#cfc6b3',
  connectorPost: '#7d7466',
} as const;

function elementColor(e: ArchitecturalElement, display: SceneDisplay | null): string {
  switch (e.part) {
    case 'wall':
      if (e.condition === 'exterior' || e.outside) return presetColour(typeColor(e.ownerTypeId), display);
      return e.condition === 'door' ? COLORS.doorWall : COLORS.internalWall;
    case 'glazing':
      return COLORS.glazing;
    case 'slab':
      return COLORS.slab;
    case 'roof':
      return COLORS.roof;
    case 'threshold':
      return COLORS.threshold;
  }
}

function connectorColor(c: ConnectorElement): string {
  switch (c.part) {
    case 'connector-floor':
      return COLORS.connectorFloor;
    case 'connector-roof':
      return COLORS.roof;
    case 'connector-wall':
      return COLORS.connectorWall;
    case 'connector-post':
      return COLORS.connectorPost;
  }
}

/** Façades without a project: exactly the example façades (stable reference for memoisation). */
const NO_PROJECT_FACADE = projectFacadeProvider(null);
const NO_CONNECTORS: readonly ConnectorElement[] = [];
const NO_FACES: ReadonlySet<string> = new Set();

const LIGHTING = (
  <>
    <hemisphereLight args={['#ffffff', '#9a8f80', 1.1]} />
    <directionalLight position={[20, 35, 15]} intensity={1.6} />
  </>
);

export function ArchitectureView({ doc, selection, onSelect, project, design }: ViewProps) {
  // Geometry depends on the document (and its derived resolution) and the project's façades only.
  const facade = project?.facade ?? NO_PROJECT_FACADE;
  const v2Doc = design?.doc;
  const v2Spatial = design?.spatial;
  const v2 = useMemo(() => (v2Doc && v2Spatial ? buildBuildingV2(v2Doc, { spatial: v2Spatial, facade }) : null), [v2Doc, v2Spatial, facade]);
  const elements = useMemo(() => (v2 ? v2.elements : buildArchitecture(resolveFaces(doc), { facade })), [v2, doc, facade]);
  const connectors = v2?.connectors ?? NO_CONNECTORS;
  // Imported façade modules: an extra layer on exterior walls (the elements above are unchanged).
  const library = useFacadeLibrary();
  const modules = useMemo(
    () => (v2 && v2Doc ? layoutFacadeModules(v2.faces, v2.looks, library.sizeOf) : EMPTY_FACADE_MODULES),
    [v2, v2Doc, library],
  );
  const broken = useMemo(() => brokenTypeIds(project?.project ?? null, v2Doc ?? doc), [project, v2Doc, doc]);
  const bounds = useMemo(() => elementBounds([...elements, ...connectors]), [elements, connectors]);
  const framing = useMemo(() => framingFor(bounds), [bounds]);
  const grid = useMemo(() => groundGridFor(bounds), [bounds]);
  const camera = useRemembered<CameraState>('camera:architecture');
  const viewportCamera = useViewportCamera();
  // Roof visibility is the Display setting (per scenario and view mode; default shown) when the app provides
  // one; without a provider: v1 open-top, v2 shown. Either way it is a view cutaway only.
  const [showRoofs, setShowRoofs] = useRoofsDisplay(design !== undefined);
  const [fitRequest, setFitRequest] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  // A façade module replaces its wall (owner 2026-11-17): the wall and Designer windows of every face
  // a module covers are not drawn. The Building model itself (and the Plan) is unchanged.
  const covered = useMemo(() => new Set(modules.instances.flatMap((i) => i.faceIds)), [modules]);
  const visible = useMemo(
    () => elements.filter((e) => (showRoofs || e.part !== 'roof') && !(covered.has(e.faceId) && (e.part === 'wall' || e.part === 'glazing'))),
    [elements, showRoofs, covered],
  );
  const visibleConnectors = useMemo(
    () => (showRoofs ? connectors : connectors.filter((c) => c.part !== 'connector-roof')),
    [connectors, showRoofs],
  );
  const editing = useRoomEditing(design, selection);
  const tube = useUnitCylinder();
  const unresolved = useMemo(
    () =>
      v2Doc && v2Spatial
        ? buildEdgeItems(v2Doc.nodes, doc.edges).filter((e) => v2Spatial.byEdge.get(e.id)?.status === 'unresolved')
        : [],
    [v2Doc, v2Spatial, doc.edges],
  );
  const roofsHiddenByDesigner = useMemo(
    () => (v2 ? [...v2.looks.values()].some((l) => l.look.roof === 'none') : false),
    [v2],
  );

  // Shared-wall interaction (wave 2, D): hover highlights an eligible shared wall, a click opens the
  // wall panel. Which wall is open is view-local state (not a Selection kind). Schema v2 only.
  const faces = useMemo(() => (v2 ? faceIndex(v2.faces) : null), [v2]);
  const eligible = useMemo(
    () => (v2 && v2Doc && v2Spatial ? eligibleWallFaces(v2.faces, v2Doc, v2Spatial) : NO_FACES),
    [v2, v2Doc, v2Spatial],
  );
  const [hoveredWall, setHoveredWall] = useState<string | null>(null);
  const [activeWall, setActiveWall] = useState<string | null>(null);
  const shownHover = hoveredWall !== null && eligible.has(hoveredWall) ? hoveredWall : null;
  const hoverPanel = useMemo(
    () => (shownHover && faces && v2Doc && v2Spatial ? wallPanelModel(shownHover, faces, v2Doc, v2Spatial) : null),
    [shownHover, faces, v2Doc, v2Spatial],
  );

  // Stable pick callback so memoised meshes do not re-render when the app passes a new onSelect.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const pick = useCallback((target: Selection) => {
    setActiveWall(null);
    onSelectRef.current(target);
  }, []);
  const latestWall = useRef({ faces, v2Doc, v2Spatial });
  latestWall.current = { faces, v2Doc, v2Spatial };
  const clickWall = useCallback((faceId: string) => {
    const { faces: f, v2Doc: d, v2Spatial: s } = latestWall.current;
    if (!f || !d || !s) return;
    const action = wallActionOf(faceId, f, d, s);
    if (action.kind === 'not-eligible') return;
    setActiveWall(faceId);
    // An existing relationship is selected (Properties shows it); any other shared wall selects its owner
    // room, as before the wall panel (I2), so the room editor stays available.
    onSelectRef.current(wallClickSelection(faceId, f, action));
  }, []);
  const hoverWall = useCallback((faceId: string | null) => setHoveredWall(faceId), []);

  return (
    <SceneCanvas
      {...viewportCamera}
      ariaLabel="Building view"
      framing={framing}
      fitRequest={fitRequest}
      cameraMemory={camera}
      grid={grid}
      cursor={hovered || hoveredEdge ? 'pointer' : 'grab'}
      onBackgroundClick={() => pick(NO_SELECTION)}
      lighting={LIGHTING}
      background="#f4f3ef"
      flat={false}
      frameloop="demand"
      damping={false}
      overlay={
        <>
          <Overlay
            empty={elements.length === 0}
            brokenTypes={broken}
            showRoofs={showRoofs}
            onToggleRoofs={setShowRoofs}
            onFit={() => setFitRequest((n) => n + 1)}
            v2={design !== undefined}
            connectors={connectors.length > 0}
            roofsHiddenByDesigner={roofsHiddenByDesigner}
            hint={
              hoverPanel && hoverPanel.kind !== 'unavailable'
                ? `Wall between ${hoverPanel.rooms[0].label} and ${hoverPanel.rooms[1].label}: click for ${hoverPanel.kind === 'add' ? 'Add relationship' : 'its relationship'}`
                : NAVIGATION_HINT
            }
            hintWall={shownHover}
            besideEditor={editing.active}
            design={design}
            facadeModules={modules.instances.length > 0}
            missingFacades={modules.missingAssets}
          />
          <RoomEditPanel editing={editing} />
        </>
      }
    >
      <Scene
        elements={visible}
        connectors={visibleConnectors}
        selection={selection}
        pick={pick}
        setHovered={setHovered}
        eligibleWalls={eligible}
        hoveredWall={shownHover}
        activeWall={activeWall}
        onWallHover={hoverWall}
        onWallClick={clickWall}
      />
      {modules.instances.length > 0 && (
        <FacadeModules instances={modules.instances} assets={library.byId} selection={selection} pick={pick} setHovered={setHovered} />
      )}
      <StoreyLabels nodes={v2Doc?.nodes ?? doc.nodes} bounds={bounds} />
      {design && faces && activeWall !== null && faces.get(activeWall) && (
        // Pinned beside the clicked wall (follows it when the camera moves), not docked over the view.
        <WallPanelAnchor face={faces.get(activeWall)!}>
          <WallActionPanel
            className="anchored"
            design={design}
            faceId={activeWall}
            faces={faces}
            onSelect={onSelect}
            onClose={() => setActiveWall(null)}
          />
        </WallPanelAnchor>
      )}
      {unresolved.map((e) => {
        const line = lineOf(design, e.id);
        if (!line) return null;
        return (
          <RelationshipTube
            key={e.id}
            item={e}
            line={line}
            geometry={tube}
            selected={selection.kind === 'edge' && selection.id === e.id}
            hovered={hoveredEdge === e.id}
            ghost={false}
            handlers={pickHandlers('edge', e.id, pick, (update) => {
              const next = update(null);
              setHoveredEdge(next ? next.id : null);
            })}
          />
        );
      })}
      <RoomEditGizmo editing={editing} />
    </SceneCanvas>
  );
}

function Scene({
  elements,
  connectors,
  selection,
  pick,
  setHovered,
  eligibleWalls,
  hoveredWall,
  activeWall,
  onWallHover,
  onWallClick,
}: {
  readonly elements: readonly ArchitecturalElement[];
  readonly connectors: readonly ConnectorElement[];
  readonly selection: Selection;
  readonly pick: (target: Selection) => void;
  readonly setHovered: (hovered: boolean) => void;
  /** Faces of shared walls between two distinct rooms (`wallAction` eligible). */
  readonly eligibleWalls: ReadonlySet<string>;
  readonly hoveredWall: string | null;
  readonly activeWall: string | null;
  readonly onWallHover: (faceId: string | null) => void;
  readonly onWallClick: (faceId: string) => void;
}) {
  const display = useViewDisplay();
  // Rooms lit up by the Designer's highlight button (never part of the selection).
  const lit = useRoomHighlight()?.nodeIds;
  // One shared unit box, scaled per element: no per-element geometry allocation.
  const unitBox = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => unitBox.dispose(), [unitBox]);
  return (
    <group>
      {elements.map((e) => (
        <BoxMesh
          key={e.id}
          position={e.position}
          size={e.size}
          target={e.target}
          color={elementColor(e, display)}
          kind={e.part === 'glazing' ? 'glass' : e.part === 'threshold' ? 'hidden' : 'solid'}
          geometry={unitBox}
          highlighted={isElementHighlighted(e, selection) || (lit?.has(e.ownerNodeId) ?? false)}
          pick={pick}
          setHovered={setHovered}
          {...(eligibleWalls.has(e.faceId) && {
            wall: e.faceId === activeWall ? 'active' : e.faceId === hoveredWall ? 'hover' : 'eligible',
            faceId: e.faceId,
            onWallHover,
            onWallClick,
          })}
        />
      ))}
      {connectors.map((c) => (
        <BoxMesh
          key={c.id}
          position={c.position}
          size={c.size}
          target={c.target}
          color={connectorColor(c)}
          kind="solid"
          geometry={unitBox}
          highlighted={isConnectorHighlighted(c, selection)}
          pick={pick}
          setHovered={setHovered}
        />
      ))}
    </group>
  );
}

const BoxMesh = memo(function BoxMesh({
  position,
  size,
  target,
  color,
  kind,
  geometry,
  highlighted,
  pick,
  setHovered,
  wall,
  faceId,
  onWallHover,
  onWallClick,
}: {
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly target: Selection;
  readonly color: string;
  /** `hidden`: an invisible pick target (the Open threshold), shown faintly only when hovered or selected. */
  readonly kind: 'solid' | 'glass' | 'hidden';
  readonly geometry: BoxGeometry;
  readonly highlighted: boolean;
  readonly pick: (target: Selection) => void;
  readonly setHovered: (hovered: boolean) => void;
  /** Part of an eligible shared wall (wave 2, D): a click opens the wall panel and selects per `wallClickSelection` (I2). */
  readonly wall?: 'eligible' | 'hover' | 'active';
  readonly faceId?: string;
  readonly onWallHover?: (faceId: string | null) => void;
  readonly onWallClick?: (faceId: string) => void;
}) {
  const glass = kind === 'glass';
  const hidden = kind === 'hidden';
  const wallTint = wall === 'active' ? 0.6 : wall === 'hover' ? 0.35 : 0;
  const emphasis = Math.max(highlighted ? 0.55 : 0, wallTint);
  return (
    <mesh
      geometry={geometry}
      position={[...position]}
      scale={[...size]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        // Orbit/pan drags and right-clicks keep the selection.
        if (!isDeliberateObjectClick(e.delta, e.nativeEvent)) return;
        if (wall && faceId !== undefined && onWallClick) onWallClick(faceId);
        else pick(target);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        onWallHover?.(faceId ?? null);
      }}
      onPointerOut={() => {
        setHovered(false);
        onWallHover?.(null);
      }}
    >
      <meshStandardMaterial
        // Selection TINTS the element (keeps doors, glazing and walls readable while editing) instead
        // of painting it solid magenta (audit O8 note; recorded as the reconciled "eighth" minor finding).
        color={color}
        transparent={glass || hidden}
        opacity={glass ? (highlighted ? 0.75 : 0.45) : hidden ? (emphasis > 0 ? 0.35 : 0) : 1}
        depthWrite={!glass && !hidden}
        roughness={glass ? 0.1 : 0.85}
        emissive={emphasis > 0 ? SELECTION_COLOR : '#000000'}
        emissiveIntensity={emphasis}
      />
    </mesh>
  );
});

/** Reference grid just below the ground-storey floor, aligned to cell boundaries, with a margin. */
function groundGridFor(bounds: Bounds): GroundGrid {
  const W = DEFAULT_CELL_SIZE.horizontal;
  const span = bounds ? Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) : 0;
  const cells = 2 * Math.ceil((span / W + 8) / 2); // even count, with a margin
  const snap = (v: number) => Math.round(v / W) * W + W / 2;
  const cx = bounds ? snap(bounds.centre[0]) : W / 2;
  const cz = bounds ? snap(bounds.centre[2]) : W / 2;
  return { center: [cx, -0.12, cz], size: cells * W, divisions: cells };
}

const LEGEND: readonly (readonly [label: string, color: string])[] = [
  ['Exterior wall (type colour)', typeColor('gallery')],
  ['Glazing (Designer: window coverage)', COLORS.glazing],
  ['Internal solid wall', COLORS.internalWall],
  ['Door wall', COLORS.doorWall],
  ['Slab / atrium void', COLORS.slab],
  ['Roof (exposed tops)', COLORS.roof],
];

const CONNECTOR_LEGEND: readonly (readonly [label: string, color: string])[] = [
  ['Connector floor / deck', COLORS.connectorFloor],
  ['Corridor wall (enclosed)', COLORS.connectorWall],
  ['Walkway post (covered)', COLORS.connectorPost],
];

function Overlay({
  empty,
  brokenTypes,
  showRoofs,
  onToggleRoofs,
  onFit,
  v2,
  connectors,
  roofsHiddenByDesigner,
  hint,
  hintWall,
  besideEditor,
  design,
  facadeModules,
  missingFacades,
}: {
  /** Imported façade modules are drawn (legend entry). */
  readonly facadeModules: boolean;
  /** Imported façade ids the design uses that the project does not have. */
  readonly missingFacades: readonly string[];
  /** The hovered shared wall (its face id), shown in the hint line. */
  readonly hintWall: string | null;
  /** The room editor occupies the bottom-right cell. */
  readonly besideEditor: boolean;
  /** v2 port: its relationship legend ("what gets built") is part of the one Legend disclosure. */
  readonly design: DesignPort | undefined;
  readonly empty: boolean;
  /** Node types of this design whose toolkit definition is broken. */
  readonly brokenTypes: readonly string[];
  readonly showRoofs: boolean;
  readonly onToggleRoofs: (v: boolean) => void;
  readonly onFit: () => void;
  readonly v2: boolean;
  readonly connectors: boolean;
  readonly roofsHiddenByDesigner: boolean;
  readonly hint: string;
}) {
  const { probe, width, compact } = useOverlayWidth();
  const [legendOpen, setLegendOpen] = useDefaultOpen(compact, width !== null);
  return (
    <>
      <ControlBar>
        <label title={v2 ? 'View cutaway only: the Designer decides which room types have roofs' : 'Show roofs'}>
          <input type="checkbox" checked={showRoofs} onChange={(e) => onToggleRoofs(e.currentTarget.checked)} /> Roofs
        </label>
        <button type="button" onClick={onFit} title="Frame the whole model again (also after you orbit or zoom)">
          Fit view
        </button>
      </ControlBar>
      {(brokenTypes.length > 0 || missingFacades.length > 0 || (v2 && roofsHiddenByDesigner && showRoofs)) && (
        <InfoPanel>
          {missingFacades.length > 0 && (
            <div role="status" className="viewer3d-notice">
              <strong>Imported façade missing:</strong> this scenario uses {missingFacades.length === 1 ? 'a façade' : `${missingFacades.length} façades`} that the
              project no longer has. Those walls are shown without it; choose another façade in the Building Designer.
            </div>
          )}
          {brokenTypes.length > 0 && (
            <div role="status" className="viewer3d-notice">
              <strong>Invalid type definition:</strong> {brokenTypes.join(', ')}. These rooms are shown with closed exterior walls
              until the definition is fixed.
            </div>
          )}
          {v2 && roofsHiddenByDesigner && showRoofs && (
            <div className="viewer3d-count">Some room types have no roof (Designer setting).</div>
          )}
        </InfoPanel>
      )}
      {probe}
      {/*
        ONE legend (materials + "what gets built"), audit M3: it starts closed in narrow panels so it
        never hides the building, is open on wide screens, and scrolls when taller than its space.
      */}
      <details open={legendOpen} onToggle={(e) => setLegendOpen(e.currentTarget.open)} className="viewer3d-panel viewer3d-legend viewer3d-legend-collapsible">
        <summary className="viewer3d-legend-title">Legend</summary>
        <ul>
          {LEGEND.map(([label, color]) => (
            <li key={label}>
              <span className="viewer3d-swatch" style={{ background: color }} />
              {label}
            </li>
          ))}
          {facadeModules && (
            <li>
              <span className="viewer3d-swatch" style={{ background: 'repeating-linear-gradient(90deg, #8a8378 0 3px, #c8c2b8 3px 6px)' }} />
              Imported façade (Designer, 3DM)
            </li>
          )}
          {connectors &&
            CONNECTOR_LEGEND.map(([label, color]) => (
              <li key={label}>
                <span className="viewer3d-swatch" style={{ background: color }} />
                {label}
              </li>
            ))}
        </ul>
        {design && <ViewRelationshipLegend view="architecture" design={design} />}
      </details>
      {empty ? (
        <div className="viewer3d-empty">No occupied cells to interpret yet.</div>
      ) : besideEditor && compact ? null : (
        // Narrow panel while editing: the room editor already shows the snap and Esc hints.
        <div className={besideEditor ? 'viewer3d-hint beside-edit' : 'viewer3d-hint'} data-wall-hover={hintWall ?? undefined}>
          {hint}
        </div>
      )}
    </>
  );
}
