import type { ThreeEvent } from '@react-three/fiber';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry } from 'three';
import {
  buildArchitecture,
  elementBounds,
  isElementHighlighted,
  resolveFaces,
  type ArchitecturalElement,
} from '@app/building';
import { SELECTION_COLOR, typeColor } from '@core/viewer/appearance';
import type { ViewProps } from '../contracts';
import { brokenTypeIds, projectFacadeProvider } from '../project';
import { useRemembered } from '../panelMemory';
import { framingFor } from '../three/sceneModel';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { NO_SELECTION, type Selection } from '@core/viewer/selection';
import { isDeliberateObjectClick } from '@core/viewer/three/interaction';
import { SceneCanvas } from '@core/viewer/three/SceneCanvas';
import { ControlBar, InfoPanel, NAVIGATION_HINT } from '@core/viewer/three/ViewControls';
import type { CameraState, GroundGrid } from '@core/viewer/three/viewport';

/**
 * Architecture view (workstream C). Renders boxes produced by the pure resolver + geometry step
 * (app/building) in the shared SceneCanvas (camera fitting, orbit controls, picking rules).
 * Read-only: never calls onCommand. Selection only changes material colours; scene geometry
 * depends on `doc` alone, and the camera is never reset by doc/selection changes.
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

/** Façades without a project: exactly the example façades (stable reference for memoisation). */
const NO_PROJECT_FACADE = projectFacadeProvider(null);

const LIGHTING = (
  <>
    <hemisphereLight args={['#ffffff', '#9a8f80', 1.1]} />
    <directionalLight position={[20, 35, 15]} intensity={1.6} />
  </>
);

export function ArchitectureView({ doc, selection, onSelect, project }: ViewProps) {
  // Geometry depends on the document and the project's façades only.
  const facade = project?.facade ?? NO_PROJECT_FACADE;
  const elements = useMemo(() => buildArchitecture(resolveFaces(doc), { facade }), [doc, facade]);
  const broken = useMemo(() => brokenTypeIds(project?.project ?? null, doc), [project, doc]);
  const bounds = useMemo(() => elementBounds(elements), [elements]);
  const framing = useMemo(() => framingFor(bounds), [bounds]);
  const grid = useMemo(() => groundGridFor(bounds), [bounds]);
  const camera = useRemembered<CameraState>('camera:architecture');
  const [showRoofs, setShowRoofs] = useState(false); // open-top by default
  const [fitRequest, setFitRequest] = useState(0);
  const [hovered, setHovered] = useState(false);
  const visible = useMemo(() => (showRoofs ? elements : elements.filter((e) => e.part !== 'roof')), [elements, showRoofs]);

  // Stable pick callback so memoised meshes do not re-render when the app passes a new onSelect.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const pick = useCallback((target: Selection) => onSelectRef.current(target), []);

  return (
    <SceneCanvas
      ariaLabel="Architecture view"
      framing={framing}
      fitRequest={fitRequest}
      cameraMemory={camera}
      grid={grid}
      cursor={hovered ? 'pointer' : 'grab'}
      onBackgroundClick={() => pick(NO_SELECTION)}
      lighting={LIGHTING}
      background="#f4f3ef"
      flat={false}
      frameloop="demand"
      damping={false}
      overlay={
        <Overlay
          empty={elements.length === 0}
          brokenTypes={broken}
          showRoofs={showRoofs}
          onToggleRoofs={setShowRoofs}
          onFit={() => setFitRequest((n) => n + 1)}
        />
      }
    >
      <Scene elements={visible} selection={selection} pick={pick} setHovered={setHovered} />
    </SceneCanvas>
  );
}

function Scene({
  elements,
  selection,
  pick,
  setHovered,
}: {
  readonly elements: readonly ArchitecturalElement[];
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
        <ElementMesh
          key={e.id}
          element={e}
          geometry={unitBox}
          highlighted={isElementHighlighted(e, selection)}
          pick={pick}
          setHovered={setHovered}
        />
      ))}
    </group>
  );
}

const ElementMesh = memo(function ElementMesh({
  element,
  geometry,
  highlighted,
  pick,
  setHovered,
}: {
  readonly element: ArchitecturalElement;
  readonly geometry: BoxGeometry;
  readonly highlighted: boolean;
  readonly pick: (target: Selection) => void;
  readonly setHovered: (hovered: boolean) => void;
}) {
  const glass = element.part === 'glazing';
  const marker = element.part === 'circulation-marker';
  return (
    <mesh
      geometry={geometry}
      position={[...element.position]}
      scale={[...element.size]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        // Orbit/pan drags and right-clicks keep the selection.
        if (isDeliberateObjectClick(e.delta, e.nativeEvent)) pick(element.target);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <meshStandardMaterial
        color={highlighted ? SELECTION_COLOR : elementColor(element)}
        transparent={glass || marker}
        opacity={glass ? (highlighted ? 0.75 : 0.45) : marker ? 0.85 : 1}
        depthWrite={!glass}
        roughness={glass ? 0.1 : 0.85}
        emissive={highlighted ? SELECTION_COLOR : '#000000'}
        emissiveIntensity={highlighted ? 0.25 : 0}
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
  ['Glazing', COLORS.glazing],
  ['Internal solid wall', COLORS.internalWall],
  ['Door wall', COLORS.doorWall],
  ['Open: no wall (threshold)', COLORS.threshold],
  ['Slab / atrium void', COLORS.slab],
  ['Vertical access (symbolic)', COLORS.marker],
];

function Overlay({
  empty,
  brokenTypes,
  showRoofs,
  onToggleRoofs,
  onFit,
}: {
  readonly empty: boolean;
  /** Node types of this design whose project definition is broken. */
  readonly brokenTypes: readonly string[];
  readonly showRoofs: boolean;
  readonly onToggleRoofs: (v: boolean) => void;
  readonly onFit: () => void;
}) {
  return (
    <>
      <ControlBar>
        <label>
          <input type="checkbox" checked={showRoofs} onChange={(e) => onToggleRoofs(e.currentTarget.checked)} /> Roofs
        </label>
        <button type="button" onClick={onFit}>
          Fit view
        </button>
      </ControlBar>
      {brokenTypes.length > 0 && (
        <InfoPanel>
          <div role="status" className="viewer3d-notice">
            <strong>Invalid type definition:</strong> {brokenTypes.join(', ')}. These rooms are shown with closed exterior
            walls until the definition is fixed.
          </div>
        </InfoPanel>
      )}
      {/* Collapsible and click-through, so it never blocks picking the building behind it. */}
      <details open className="viewer3d-panel viewer3d-legend viewer3d-passthrough">
        <summary className="viewer3d-legend-title">Legend</summary>
        <ul>
          {LEGEND.map(([label, color]) => (
            <li key={label}>
              <span className="viewer3d-swatch" style={{ background: color }} />
              {label}
            </li>
          ))}
        </ul>
      </details>
      {empty ? (
        <div className="viewer3d-empty">No occupied cells to interpret yet.</div>
      ) : (
        <div className="viewer3d-hint">{NAVIGATION_HINT}</div>
      )}
    </>
  );
}
