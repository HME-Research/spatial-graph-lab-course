# Snapped 3D room editing (Voxels, Building)

Owner: `04-3d-gizmo`. Generic parts: `core/viewer/three/gizmoMath.ts` and `SnappedGizmo.tsx`.

## Behaviour

- Select a room in Voxels or Building. The manipulator shows on the selected room.
  - **Move** shows one arrow per grid axis.
  - **Resize** shows one cube on each positive face. The minimum corner stays fixed.
- A drag follows one grid axis and snaps to whole cells. Step length comes from `CellSize`, which defaults to `DEFAULT_CELL_SIZE` (3 m). It uses the same mapping as `spatialToThree`.
- While you drag, only a preview box moves.
  - The box is drawn in the selection colour when the move is valid, red when it would be blocked, and amber when it needs confirmation.
  - A live status line describes the preview.
  - Each change of snapped step calls `design.proposeEdit` once.
- On release, the edit is checked again against the current document. Then:
  - **Unchanged:** nothing is sent.
  - **Room overlap or invalid:** nothing is sent. A readable reason is shown and the room stays where it was.
  - **ok:** exactly one `set-node-geometry` command is sent.
  - **Takes connector cells:** a warning appears with **Cancel** and **Move anyway and recalculate**. Only the second button sends a command (one, with `confirmRouteDisplacement: true`).
- These cancel and send nothing:
  - Escape, pointer cancel, or lost capture during a drag;
  - Escape or Cancel while confirmation is pending;
  - a document change from elsewhere (undo/redo, Properties, another view);
  - a change of selection.
- Orbit controls are disabled during a handle drag and re-enabled afterwards, including on unmount.
- A handle press is ignored while another pointer is down (an orbit, pan or pinch in progress).
- Handle clicks stop propagation. Drags are longer than the click tolerance, so they never select or clear selection.
- The overlay has Move/Resize buttons and −/+ buttons for one cell per axis. These are the keyboard alternative, and each button press counts as one gesture.
- The hint "Snaps to 3 m grid" shows only while a room is selected.
- Feature gate: nothing renders unless `ViewProps.design` is present.

## Integration (root owner only: `VoxelView.tsx`, `ArchitectureView.tsx`)

```tsx
import { RoomEditGizmo, RoomEditPanel, useRoomEditing } from '../three/editing';

export function VoxelView({ doc, selection, onSelect, design }: ViewProps) {
  const editing = useRoomEditing(design, selection); // optional 3rd arg: CellSize
  // ...
  return (
    <SceneCanvas
      /* unchanged props */
      overlay={
        <>
          {/* existing overlay */}
          <RoomEditPanel editing={editing} />
        </>
      }
    >
      {/* existing scene children */}
      <RoomEditGizmo editing={editing} />
    </SceneCanvas>
  );
}
```

### Requirements

- `RoomEditGizmo` must be a child of `SceneCanvas`. It reads the default OrbitControls through `useThree`.
- The host `DesignPort.onCommand` must record exactly one history step per successful command, as in the frozen contract. The editing module does not touch history.
- Room meshes should be drawn from `design.doc` (multicell `grid` + `size`) once the views render v2.
  - Optional: dim the stored room while `editing.state.phase !== 'idle' && editing.nodeId === id`. The preview box then reads clearly.
- Do **not** use this module in `Graph3DView`. Graph 3D stays abstract and read-only.

### Known behaviour

- Pressing a handle also fires the OrbitControls `start` event. The camera is then marked `data-camera="user"`, so it is not automatically refitted after a gizmo drag. A manual **Fit view** still works.
