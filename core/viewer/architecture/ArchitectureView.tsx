import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { BoxGeometry } from 'three';
import {
  buildArchitecture,
  elementBounds,
  isElementHighlighted,
  resolveFaces,
  type ArchitecturalElement,
} from '../../architecture';
import { SELECTION_COLOR, typeColor } from '../appearance';
import type { ViewProps } from '../contracts';
import { DEFAULT_CELL_SIZE, type WorldPoint } from '../coordinates';
import { NO_SELECTION, type Selection } from '../selection';

/**
 * Architecture view (workstream C). Renders boxes produced by the pure resolver + geometry step
 * (core/architecture). Read-only: never calls onCommand. Selection only changes material colours;
 * scene geometry depends on `doc` alone, and the camera is never reset by doc/selection changes.
 */

/** Pointer travel (px) above which a press is an orbit/pan drag, not a click. */
const CLICK_TOLERANCE_PX = 4;

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

function framing(bounds: Bounds): { position: WorldPoint; target: WorldPoint } {
  if (!bounds) return { position: [12, 10, 12], target: [0, 1.5, 0] };
  const d = bounds.radius * 1.8 + 6;
  const [cx, cy, cz] = bounds.centre;
  return { position: [cx + d * 0.7, cy + d * 0.6, cz + d * 0.7], target: bounds.centre };
}

export function ArchitectureView({ doc, selection, onSelect }: ViewProps) {
  // Geometry depends on the document only.
  const elements = useMemo(() => buildArchitecture(resolveFaces(doc)), [doc]);
  const bounds = useMemo(() => elementBounds(elements), [elements]);
  const [showRoofs, setShowRoofs] = useState(false); // open-top by default
  const [frameRequest, setFrameRequest] = useState(0);
  const visible = useMemo(() => (showRoofs ? elements : elements.filter((e) => e.part !== 'roof')), [elements, showRoofs]);

  // Stable pick callback so memoised meshes do not re-render when the app passes a new onSelect.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const pick = useCallback((target: Selection) => onSelectRef.current(target), []);

  const pressAt = useRef<{ x: number; y: number } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);
  // Initial camera framing is computed once per view instance.
  const [initial] = useState(() => framing(bounds));

  return (
    <div
      ref={wrapper}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 6, background: '#f4f3ef' }}
      onPointerDown={(e) => {
        pressAt.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <Canvas
        frameloop="demand"
        camera={{ position: [...initial.position], fov: 45, near: 0.1, far: 5000 }}
        onPointerMissed={(e) => {
          const p = pressAt.current;
          if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_TOLERANCE_PX) return; // orbit drag
          pick(NO_SELECTION);
        }}
      >
        <hemisphereLight args={['#ffffff', '#9a8f80', 1.1]} />
        <directionalLight position={[20, 35, 15]} intensity={1.6} />
        <Scene elements={visible} selection={selection} pick={pick} wrapper={wrapper} />
        <GroundGrid bounds={bounds} />
        <CameraRig frameRequest={frameRequest} boundsRef={boundsRef} initialTarget={initial.target} />
      </Canvas>
      <Overlay
        empty={elements.length === 0}
        showRoofs={showRoofs}
        onToggleRoofs={setShowRoofs}
        onFrame={() => setFrameRequest((n) => n + 1)}
      />
    </div>
  );
}

function Scene({
  elements,
  selection,
  pick,
  wrapper,
}: {
  readonly elements: readonly ArchitecturalElement[];
  readonly selection: Selection;
  readonly pick: (target: Selection) => void;
  readonly wrapper: RefObject<HTMLDivElement | null>;
}) {
  // One shared unit box, scaled per element: no per-element geometry allocation.
  const unitBox = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => unitBox.dispose(), [unitBox]);
  const setCursor = useCallback(
    (cursor: string) => {
      if (wrapper.current) wrapper.current.style.cursor = cursor;
    },
    [wrapper],
  );
  return (
    <group>
      {elements.map((e) => (
        <ElementMesh
          key={e.id}
          element={e}
          geometry={unitBox}
          highlighted={isElementHighlighted(e, selection)}
          pick={pick}
          setCursor={setCursor}
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
  setCursor,
}: {
  readonly element: ArchitecturalElement;
  readonly geometry: BoxGeometry;
  readonly highlighted: boolean;
  readonly pick: (target: Selection) => void;
  readonly setCursor: (cursor: string) => void;
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
        if (e.delta > CLICK_TOLERANCE_PX) return; // orbit/pan drag: keep the selection
        pick(element.target);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setCursor('pointer');
      }}
      onPointerOut={() => setCursor('')}
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

/** Reference grid just below the ground-storey floor, aligned to cell boundaries. Not pickable. */
function GroundGrid({ bounds }: { readonly bounds: Bounds }) {
  const W = DEFAULT_CELL_SIZE.horizontal;
  const span = bounds ? Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) : 0;
  const cells = 2 * Math.ceil((span / W + 8) / 2); // even count, with a margin
  const snap = (v: number) => Math.round(v / W) * W + W / 2;
  const cx = bounds ? snap(bounds.centre[0]) : W / 2;
  const cz = bounds ? snap(bounds.centre[2]) : W / 2;
  return <gridHelper args={[cells * W, cells, '#b5b0a6', '#d6d2c9']} position={[cx, -0.12, cz]} raycast={() => null} />;
}

/** Initial framing comes from the Canvas camera; re-frames only when the user asks ("Frame all"). */
function CameraRig({
  frameRequest,
  boundsRef,
  initialTarget,
}: {
  readonly frameRequest: number;
  readonly boundsRef: RefObject<Bounds>;
  readonly initialTarget: WorldPoint;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const [target] = useState<[number, number, number]>(() => [...initialTarget]);
  useEffect(() => {
    if (frameRequest === 0) return;
    const f = framing(boundsRef.current);
    camera.position.set(...f.position);
    controls.current?.target.set(...f.target);
    controls.current?.update();
    invalidate();
  }, [frameRequest, boundsRef, camera, invalidate]);
  return <OrbitControls ref={controls} makeDefault target={target} enableDamping={false} />;
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
  showRoofs,
  onToggleRoofs,
  onFrame,
}: {
  readonly empty: boolean;
  readonly showRoofs: boolean;
  readonly onToggleRoofs: (v: boolean) => void;
  readonly onFrame: () => void;
}) {
  const panel = {
    position: 'absolute',
    background: 'rgba(255,255,255,0.88)',
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 12,
    lineHeight: 1.5,
    color: '#333',
  } as const;
  return (
    <>
      <div style={{ ...panel, top: 8, left: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
        <label>
          <input type="checkbox" checked={showRoofs} onChange={(e) => onToggleRoofs(e.currentTarget.checked)} /> Roofs
        </label>
        <button type="button" onClick={onFrame} style={{ font: 'inherit' }}>
          Frame all
        </button>
      </div>
      {/* Collapsible and click-through, so it never blocks picking the building behind it. */}
      <details open style={{ ...panel, bottom: 8, left: 8, pointerEvents: 'none' }}>
        <summary style={{ fontWeight: 600, cursor: 'pointer', pointerEvents: 'auto' }}>Legend</summary>
        {LEGEND.map(([label, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, background: color, border: '1px solid #999', display: 'inline-block' }} />
            {label}
          </div>
        ))}
      </details>
      {empty && (
        <div style={{ ...panel, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
          No occupied cells to interpret yet.
        </div>
      )}
    </>
  );
}
