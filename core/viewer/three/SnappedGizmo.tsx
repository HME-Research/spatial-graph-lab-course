import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import { SELECTION_COLOR } from '../appearance';
import { useManipulatorPresence } from './manipulators';
import { DEFAULT_CELL_SIZE, type CellSize, type WorldPoint } from '../coordinates';
import {
  axisParameter,
  GIZMO_AXES,
  gridAxisCellLength,
  gridAxisDirection,
  snapToSteps,
  type GizmoAxis,
  type GizmoMode,
  type GizmoTone,
} from './gizmoMath';

/**
 * Generic grid-snapped manipulator for one axis-aligned box (generic: knows nothing about rooms or
 * documents). Drawn inside a SceneCanvas.
 *
 * - `move`: one arrow per grid axis; `resize`: one cube on each POSITIVE face (minimum-corner anchor).
 * - A drag is constrained to one grid axis and reported only as whole cell `steps` since the drag
 *   started (`onDragSteps`, called when the value changes). The caller draws the preview by passing
 *   an updated `box`; the gizmo stores no transform of its own.
 * - Pointer capture keeps the drag alive off the handle. Orbit controls are disabled for the drag and
 *   restored afterwards (also on unmount). A press is ignored while another pointer is already down
 *   (an orbit, pan or pinch in progress).
 * - Release → `onDragEnd`; Escape, pointer cancel or lost capture → `onDragCancel`.
 * - Handle clicks never reach the scene background, so a drag never clears the selection.
 */

export type { GizmoMode, GizmoTone } from './gizmoMath';

/** Axis-aligned box in Three.js world space. */
export interface GizmoBox {
  readonly center: WorldPoint;
  /** Full extents along Three.js X, Y, Z. */
  readonly size: WorldPoint;
}

export interface SnappedGizmoProps {
  readonly box: GizmoBox;
  readonly mode: GizmoMode;
  /** Cell size that defines one step (default DEFAULT_CELL_SIZE). */
  readonly cell?: CellSize;
  /** Axes to offer (default x, y, z). */
  readonly axes?: readonly GizmoAxis[];
  readonly tone?: GizmoTone;
  /** Draw the box outline (default true). */
  readonly showBox?: boolean;
  readonly onDragStart?: (axis: GizmoAxis) => void;
  readonly onDragSteps: (axis: GizmoAxis, steps: number) => void;
  readonly onDragEnd: (axis: GizmoAxis) => void;
  readonly onDragCancel: () => void;
}

export const AXIS_COLORS: Readonly<Record<GizmoAxis, string>> = Object.freeze({
  x: '#d64541',
  y: '#3c9a4b',
  z: '#3a6fd8',
});
const ACTIVE_COLOR = '#f5b301';
export const TONE_COLORS: Readonly<Record<GizmoTone, string>> = Object.freeze({
  normal: SELECTION_COLOR,
  blocked: '#c0392b',
  warning: '#d68910',
});

/** Gizmo render order: drawn over the scene so handles inside a cluster stay visible. */
const RENDER_ORDER = 30;

interface OrbitLike {
  enabled: boolean;
}

/** Pointer handlers attached to one handle's hit target. */
interface HandleHandlers {
  onPointerDown(e: ThreeEvent<PointerEvent>): void;
  onPointerMove(e: ThreeEvent<PointerEvent>): void;
  onPointerUp(e: ThreeEvent<PointerEvent>): void;
  onPointerCancel(): void;
  onLostPointerCapture(): void;
  onClick(e: ThreeEvent<MouseEvent>): void;
  onPointerOver(e: ThreeEvent<PointerEvent>): void;
  onPointerOut(): void;
}

interface ActiveDrag {
  readonly axis: GizmoAxis;
  readonly pointerId: number;
  readonly origin: WorldPoint;
  readonly startT: number;
  steps: number;
  readonly release: () => void;
}

/** Rotation turning a +Y-aligned primitive (cylinder, cone) to the world direction of `axis`. */
function rotationFor(axis: GizmoAxis): [number, number, number] {
  switch (axis) {
    case 'x':
      return [0, 0, -Math.PI / 2];
    case 'y':
      return [-Math.PI / 2, 0, 0]; // +Y → −Z (grid +y)
    case 'z':
      return [0, 0, 0];
  }
}

export function SnappedGizmo({
  box,
  mode,
  cell = DEFAULT_CELL_SIZE,
  axes = GIZMO_AXES,
  tone = 'normal',
  showBox = true,
  onDragStart,
  onDragSteps,
  onDragEnd,
  onDragCancel,
}: SnappedGizmoProps) {
  // While shown, the canvas's view cube and projection toggle step back (they never cover a handle).
  useManipulatorPresence();
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  const canvas = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const callbacks = useRef({ onDragStart, onDragSteps, onDragEnd, onDragCancel });
  callbacks.current = { onDragStart, onDragSteps, onDragEnd, onDragCancel };

  const drag = useRef<ActiveDrag | null>(null);
  const [activeAxis, setActiveAxis] = useState<GizmoAxis | null>(null);
  const [hoverAxis, setHoverAxis] = useState<GizmoAxis | null>(null);

  // Pointers currently pressed anywhere (window capture phase runs before R3F and OrbitControls).
  const pressed = useRef(new Set<number>());
  useEffect(() => {
    const down = (e: PointerEvent) => pressed.current.add(e.pointerId);
    const up = (e: PointerEvent) => pressed.current.delete(e.pointerId);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);

  const finish = (cancelled: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    d.release();
    setActiveAxis(null);
    canvas.style.cursor = '';
    if (cancelled) callbacks.current.onDragCancel();
    else callbacks.current.onDragEnd(d.axis);
    invalidate();
  };

  // Escape cancels a drag; captured so the app's own Escape handling does not also run.
  useEffect(() => {
    if (activeAxis === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [activeAxis]);

  // Unmount mid-drag (view hidden, selection removed): cancel and give the camera back.
  useEffect(() => () => finish(true), []);

  const handlersFor = (axis: GizmoAxis): HandleHandlers => ({
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.button !== 0 || drag.current || pressed.current.size > 1) return;
      const dir = gridAxisDirection(axis);
      const origin: WorldPoint = [e.point.x, e.point.y, e.point.z];
      const t = axisParameter(
        { origin: [e.ray.origin.x, e.ray.origin.y, e.ray.origin.z], direction: [e.ray.direction.x, e.ray.direction.y, e.ray.direction.z] },
        origin,
        dir,
      );
      if (t === null) return;
      const target = e.target as unknown as {
        setPointerCapture(id: number): void;
        releasePointerCapture(id: number): void;
        hasPointerCapture?(id: number): boolean;
      };
      target.setPointerCapture(e.pointerId);
      const wasEnabled = controls?.enabled ?? false;
      if (controls) controls.enabled = false;
      const pointerId = e.pointerId;
      drag.current = {
        axis,
        pointerId,
        origin,
        startT: t,
        steps: 0,
        release: () => {
          if (controls) controls.enabled = wasEnabled;
          try {
            if (target.hasPointerCapture?.(pointerId) ?? true) target.releasePointerCapture(pointerId);
          } catch {
            // Already released (e.g. pointer cancelled by the browser).
          }
        },
      };
      setActiveAxis(axis);
      canvas.style.cursor = 'grabbing';
      callbacks.current.onDragStart?.(axis);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const d = drag.current;
      if (!d || d.axis !== axis || e.pointerId !== d.pointerId) return;
      e.stopPropagation();
      const t = axisParameter(
        { origin: [e.ray.origin.x, e.ray.origin.y, e.ray.origin.z], direction: [e.ray.direction.x, e.ray.direction.y, e.ray.direction.z] },
        d.origin,
        gridAxisDirection(axis),
      );
      if (t === null) return; // axis seen end-on: keep the last snapped value
      const steps = snapToSteps(t - d.startT, gridAxisCellLength(axis, cell));
      if (steps !== d.steps) {
        d.steps = steps;
        callbacks.current.onDragSteps(axis, steps);
        invalidate();
      }
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      e.stopPropagation();
      finish(false);
    },
    onPointerCancel: () => finish(true),
    onLostPointerCapture: () => finish(true),
    onClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHoverAxis(axis);
      if (!drag.current) canvas.style.cursor = 'grab';
    },
    onPointerOut: () => {
      setHoverAxis((h) => (h === axis ? null : h));
      if (!drag.current) canvas.style.cursor = '';
    },
  });

  return (
    <group>
      {showBox && <BoxOutline box={box} color={TONE_COLORS[tone]} />}
      {axes.map((axis) => {
        const color = activeAxis === axis || (activeAxis === null && hoverAxis === axis) ? ACTIVE_COLOR : AXIS_COLORS[axis];
        const dimmed = activeAxis !== null && activeAxis !== axis;
        return (
          <Handle
            key={axis}
            axis={axis}
            mode={mode}
            box={box}
            cell={cell}
            color={color}
            opacity={dimmed ? 0.3 : 1}
            handlers={handlersFor(axis)}
          />
        );
      })}
    </group>
  );
}

function Handle({
  axis,
  mode,
  box,
  cell,
  color,
  opacity,
  handlers,
}: {
  readonly axis: GizmoAxis;
  readonly mode: GizmoMode;
  readonly box: GizmoBox;
  readonly cell: CellSize;
  readonly color: string;
  readonly opacity: number;
  readonly handlers: HandleHandlers;
}) {
  const unit = cell.horizontal;
  const dir = gridAxisDirection(axis);
  // Half extent of the box along this axis (world index of the axis direction).
  const worldIndex = axis === 'x' ? 0 : axis === 'y' ? 2 : 1;
  const half = box.size[worldIndex] / 2;
  const gap = 0.12 * unit;
  const material = { color, transparent: true, opacity, depthTest: false, depthWrite: false } as const;
  const at = (distance: number): [number, number, number] => [
    box.center[0] + dir[0] * distance,
    box.center[1] + dir[1] * distance,
    box.center[2] + dir[2] * distance,
  ];
  const rotation = rotationFor(axis);

  if (mode === 'resize') {
    const s = 0.28 * unit;
    return (
      <group position={at(half + gap + s / 2)} rotation={rotation}>
        <mesh renderOrder={RENDER_ORDER}>
          <boxGeometry args={[s, s, s]} />
          <meshBasicMaterial {...material} />
        </mesh>
        {/* Larger invisible hit target for touch. */}
        <mesh {...handlers}>
          <boxGeometry args={[s * 1.9, s * 1.9, s * 1.9]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  const shaft = 0.45 * unit;
  const cone = 0.18 * unit;
  return (
    <group position={at(half + gap)} rotation={rotation}>
      <mesh position={[0, shaft / 2, 0]} renderOrder={RENDER_ORDER}>
        <cylinderGeometry args={[0.025 * unit, 0.025 * unit, shaft, 10]} />
        <meshBasicMaterial {...material} />
      </mesh>
      <mesh position={[0, shaft + cone / 2, 0]} renderOrder={RENDER_ORDER}>
        <coneGeometry args={[0.07 * unit, cone, 16]} />
        <meshBasicMaterial {...material} />
      </mesh>
      <mesh position={[0, (shaft + cone) / 2, 0]} {...handlers}>
        <cylinderGeometry args={[0.13 * unit, 0.13 * unit, shaft + cone, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Always-on-top outline and faint fill of the (preview) box. Not pickable. */
function BoxOutline({ box, color }: { readonly box: GizmoBox; readonly color: string }) {
  const [sx, sy, sz] = box.size;
  const geo = useMemo(() => {
    const b = new BoxGeometry(sx, sy, sz);
    return { box: b, edges: new EdgesGeometry(b) };
  }, [sx, sy, sz]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  return (
    <group position={[...box.center]}>
      <mesh geometry={geo.box} raycast={() => null} renderOrder={RENDER_ORDER - 1}>
        <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <lineSegments geometry={geo.edges} raycast={() => null} renderOrder={RENDER_ORDER - 1}>
        <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </lineSegments>
    </group>
  );
}
