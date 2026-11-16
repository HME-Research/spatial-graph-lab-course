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
import type { ViewProps } from '../contracts';
import { brokenTypeIds, projectFacadeProvider } from '../project';
import { useRemembered } from '../panelMemory';
import { useViewportCamera } from '../viewportCamera';
import { buildEdgeItems, framingFor } from '../three/sceneModel';
import { RoomEditGizmo, RoomEditPanel, useRoomEditing } from '../three/editing';
import { lineOf, RelationshipTube, useUnitCylinder, ViewRelationshipLegend } from '../three/v2Scene';
import { useDefaultOpen, useOverlayWidth } from '../three/overlayWidth';
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
  marker: '#e8a33d',
  connectorFloor: '#a9a294',
  connectorWall: '#cfc6b3',
  connectorPost: '#7d7466',
} as const;

function elementColor(e: ArchitecturalElement): string {
  switch (e.part) {
    case 'wall':
      if (e.condition === 'exterior') return typeColor(e.ownerTypeId);
      return e.condition === 'door' ? COLORS.doorWall : COLORS.internalWall;
    case 'glazing':
      return COLORS.glazing;
    case 'slab':
      return COLORS.slab;
    case 'roof':
      return COLORS.roof;
    case 'threshold':
      return COLORS.threshold;
    case 'circulation-marker':
      return COLORS.marker;
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
  const broken = useMemo(() => brokenTypeIds(project?.project ?? null, v2Doc ?? doc), [project, v2Doc, doc]);
  const bounds = useMemo(() => elementBounds([...elements, ...connectors]), [elements, connectors]);
  const framing = useMemo(() => framingFor(bounds), [bounds]);
  const grid = useMemo(() => groundGridFor(bounds), [bounds]);
  const camera = useRemembered<CameraState>('camera:architecture');
  const viewportCamera = useViewportCamera();
  // v1: open-top by default. v2: roofs follow the Designer's rules, so they are shown; the checkbox
  // is only a view cutaway and never changes the design.
  const [showRoofs, setShowRoofs] = useState(design !== undefined);
  const [fitRequest, setFitRequest] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const visible = useMemo(() => (showRoofs ? elements : elements.filter((e) => e.part !== 'roof')), [elements, showRoofs]);
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
    () => (v2Doc ? Object.values(v2Doc.settings.typeAppearance).some((a) => a.roof === 'none') : false),
    [v2Doc],
  );

  // Stable pick callback so memoised meshes do not re-render when the app passes a new onSelect.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const pick = useCallback((target: Selection) => onSelectRef.current(target), []);

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
            hint={NAVIGATION_HINT}
            besideEditor={editing.active}
            design={design}
          />
          <RoomEditPanel editing={editing} />
        </>
      }
    >
      <Scene elements={visible} connectors={visibleConnectors} selection={selection} pick={pick} setHovered={setHovered} />
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
}: {
  readonly elements: readonly ArchitecturalElement[];
  readonly connectors: readonly ConnectorElement[];
  readonly selection: Selection;
  readonly pick: (target: Selection) => void;
  readonly setHovered: (hovered: boolean) => void;
}) {
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
          color={elementColor(e)}
          kind={e.part === 'glazing' ? 'glass' : e.part === 'circulation-marker' ? 'marker' : 'solid'}
          geometry={unitBox}
          highlighted={isElementHighlighted(e, selection)}
          pick={pick}
          setHovered={setHovered}
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
}: {
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly target: Selection;
  readonly color: string;
  readonly kind: 'solid' | 'glass' | 'marker';
  readonly geometry: BoxGeometry;
  readonly highlighted: boolean;
  readonly pick: (target: Selection) => void;
  readonly setHovered: (hovered: boolean) => void;
}) {
  const glass = kind === 'glass';
  const marker = kind === 'marker';
  return (
    <mesh
      geometry={geometry}
      position={[...position]}
      scale={[...size]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        // Orbit/pan drags and right-clicks keep the selection.
        if (isDeliberateObjectClick(e.delta, e.nativeEvent)) pick(target);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <meshStandardMaterial
        // Selection TINTS the element (keeps doors, glazing and walls readable while editing) instead
        // of painting it solid magenta (audit O8 note; recorded as the reconciled "eighth" minor finding).
        color={color}
        transparent={glass || marker}
        opacity={glass ? (highlighted ? 0.75 : 0.45) : marker ? 0.85 : 1}
        depthWrite={!glass}
        roughness={glass ? 0.1 : 0.85}
        emissive={highlighted ? SELECTION_COLOR : '#000000'}
        emissiveIntensity={highlighted ? 0.55 : 0}
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
  ['Open: no wall (threshold)', COLORS.threshold],
  ['Slab / atrium void', COLORS.slab],
  ['Roof (exposed tops)', COLORS.roof],
  ['Vertical access (symbolic)', COLORS.marker],
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
  besideEditor,
  design,
}: {
  /** The room editor occupies the bottom-right cell. */
  readonly besideEditor: boolean;
  /** v2 port: its relationship legend ("what gets built") is part of the one Legend disclosure. */
  readonly design: DesignPort | undefined;
  readonly empty: boolean;
  /** Node types of this design whose project definition is broken. */
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
      {(brokenTypes.length > 0 || (v2 && roofsHiddenByDesigner && showRoofs)) && (
        <InfoPanel>
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
        <div className={besideEditor ? 'viewer3d-hint beside-edit' : 'viewer3d-hint'}>{hint}</div>
      )}
    </>
  );
}
