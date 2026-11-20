import { useEffect, type MutableRefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { SceneLabel } from '@core/viewer/three/SceneCanvas';
import { cameraFrame, type ScreenFrame } from './roomKeys';
import { SnappedGizmo } from '@core/viewer/three/SnappedGizmo';
import { formatSize } from './roomGeometry';
import type { GizmoSide } from '@core/viewer/three/gizmoMath';
import type { RoomEditing } from './useRoomEditing';

/** Handles on both faces of every axis: either face of a room can be dragged. */
const BOTH_SIDES: readonly GizmoSide[] = [1, -1];

/**
 * In-canvas part of room editing: the snapped manipulator, the preview box and the room label.
 * Place inside a SceneCanvas (as a child). Renders nothing while editing is inactive.
 */
export function RoomEditGizmo({ editing }: { readonly editing: RoomEditing }) {
  const { active, box, geometry } = editing;
  if (!active || !box || !geometry) return null;
  return <ActiveGizmo editing={editing} box={box} geometry={geometry} />;
}

/** Lets the view's key handler read where this canvas's camera looks (arrow keys follow the screen). */
function useCameraFrame(target: MutableRefObject<(() => ScreenFrame) | null>) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const dir = new Vector3();
    const top = new Vector3();
    target.current = () => {
      camera.getWorldDirection(dir);
      top.set(0, 1, 0).applyQuaternion(camera.quaternion);
      return cameraFrame([dir.x, dir.y, dir.z], [top.x, top.y, top.z]);
    };
    return () => {
      target.current = null;
    };
  }, [camera, target]);
}

function ActiveGizmo({
  editing,
  box,
  geometry,
}: {
  readonly editing: RoomEditing;
  readonly box: NonNullable<RoomEditing['box']>;
  readonly geometry: NonNullable<RoomEditing['geometry']>;
}) {
  useCameraFrame(editing.cameraFrame);
  // At the room's top front-left corner: every gizmo arrow and cube sits on a face CENTRE line, so
  // the corner never covers a handle (audit M2). The label is also click-through.
  const top: [number, number, number] = [
    box.center[0] - box.size[0] / 2,
    box.center[1] + box.size[1] / 2 + 0.12 * editing.cell.vertical,
    box.center[2] + box.size[2] / 2,
  ];
  return (
    <>
      <SnappedGizmo box={box} mode="gumball" sides={BOTH_SIDES} cell={editing.cell} tone={editing.tone} {...editing.gizmo} />
      <SceneLabel position={top} text={`${editing.label} · ${formatSize(geometry.size)}`} strong />
    </>
  );
}
