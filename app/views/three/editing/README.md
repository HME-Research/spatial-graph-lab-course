# Snapped 3D room editing (Voxels, Building)

Owner: `04-3d-gizmo`. Generic parts: `core/viewer/three/gizmoMath.ts` and `SnappedGizmo.tsx`.

## Behaviour

- Select a room in Voxels or Building. A gumball-style manipulator shows on the selected room, with both kinds of handle on BOTH faces of every axis:
  - a **resize** cube next to each face; dragging it moves that face and the opposite face stays fixed;
  - a small **move** arrow beyond each cube, pointing out along the same grid axis.
  - The grabbed handle decides whether the drag moves or resizes. There is no rotation: rooms are axis-aligned grid boxes.
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
- The overlay shows only the live status during a drag, outcome messages and the corridor confirmation. There are no Move/Resize or −/+ step buttons (removed 2026-11-17): the keyboard alternative is the room's position and size fields in Properties.
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
- Room meshes should be drawn from `design.doc` (multicell `position` + `size`) once the views render v2.
  - Optional: dim the stored room while `editing.state.phase !== 'idle' && editing.nodeId === id`. The preview box then reads clearly.
- Do **not** use this module in `Graph3DView`. Graph 3D stays abstract and read-only.

### The Plan (2D)

The Plan's "Edit rooms" toggle reuses `useRoomEditing` and this session without the 3D gizmo: it starts a gesture with `gizmo.onDragStart`, previews each snapped x/y draft with `setDraft` (`updateDraft` in the session, the same `proposeEdit` rules as `updateDrag`) and releases with `gizmo.onDragEnd` / `onDragCancel`. Its pure 2D handle maths is `app/views/plan/planRoomEdit.ts`.

### Arrow keys (2026-11-20)

`roomKeys.ts` (pure) maps a key to one `nudge` (arrows move a cell, Shift+arrow grows towards the arrow, Shift+Alt+arrow shrinks from that side, PageUp/PageDown move a storey in 3D only; never Ctrl/Cmd or a lone Alt). `useRoomEditing().handleKey(event, frame, storeys)` sends it through the session (one validated command per press). The 3D views wrap their `SceneCanvas` in `RoomKeyScope` (a focusable box; a press on the scene focuses it) and read the camera's frame through `editing.cameraFrame`, which `RoomEditGizmo` sets from inside the canvas (up = the grid axis nearest to where the camera looks). The Plan handles the keys on its root with `PLAN_FRAME` (+y up) while Edit rooms is on.

### Known behaviour

- Pressing a handle also fires the OrbitControls `start` event. The camera is then marked `data-camera="user"`, so it is not automatically refitted after a gizmo drag. A manual **Fit view** still works.
