import { SceneLabel } from '@core/viewer/three/SceneCanvas';
import { SnappedGizmo } from '@core/viewer/three/SnappedGizmo';
import { formatSize } from './roomGeometry';
import type { RoomEditing } from './useRoomEditing';

/**
 * In-canvas part of room editing: the snapped manipulator, the preview box and the room label.
 * Place inside a SceneCanvas (as a child). Renders nothing while editing is inactive.
 */
export function RoomEditGizmo({ editing }: { readonly editing: RoomEditing }) {
  const { active, box, geometry } = editing;
  if (!active || !box || !geometry) return null;
  const top: [number, number, number] = [box.center[0], box.center[1] + box.size[1] / 2 + 0.35 * editing.cell.vertical, box.center[2]];
  return (
    <>
      <SnappedGizmo box={box} mode={editing.mode} cell={editing.cell} tone={editing.tone} {...editing.gizmo} />
      <SceneLabel position={top} text={`${editing.label} · ${formatSize(geometry.size)}`} strong />
    </>
  );
}
