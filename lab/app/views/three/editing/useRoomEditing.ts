import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { DEFAULT_CELL_SIZE, type CellSize } from '@core/viewer/coordinates';
import type { Selection } from '@core/viewer/selection';
import { snapHint, type GizmoAxis, type GizmoMode, type GizmoSide, type GizmoTone } from '@core/viewer/three/gizmoMath';
import type { GizmoBox } from '@core/viewer/three/SnappedGizmo';
import { nodeLabel } from '@app/document';
import type { DesignPort } from '@app/spatial';
import {
  beginDrag,
  cancelEdit,
  confirmEdit,
  displayedGeometry,
  dragStatus,
  endDrag,
  IDLE,
  nudge as nudgeRoom,
  previewTone,
  updateDraft,
  updateDrag,
  type EditFeedback,
  type EditStep,
  type RoomEditState,
} from './roomEditSession';
import { roomWorldBox, type RoomGeometry } from './roomGeometry';
import { roomKeyStep, type RoomKey, type ScreenFrame } from './roomKeys';

/**
 * Snapped 3D room editing for one view (Voxels or Building). Shared by the in-canvas gizmo
 * (`RoomEditGizmo`) and the HTML overlay (`RoomEditPanel`); the view calls this hook once and
 * passes the result to both.
 *
 * Feature gate: inactive unless `design` (the optional v2 `ViewProps.design`) is present and a room
 * of `design.doc` is selected. The hook holds only transient gesture state; the document changes
 * exclusively through `design.onCommand` (one call per completed gesture).
 */
export interface RoomEditing {
  readonly active: boolean;
  readonly nodeId: number | null;
  /** Display label of the selected room ("01"). */
  readonly label: string;
  /** Default mode of `nudge` (the gizmo and the keys choose their own). */
  readonly mode: GizmoMode;
  readonly setMode: (mode: GizmoMode) => void;
  readonly state: RoomEditState;
  /** Draft geometry during a gesture, else the stored room geometry. */
  readonly geometry: RoomGeometry | null;
  readonly box: GizmoBox | null;
  readonly tone: GizmoTone;
  readonly cell: CellSize;
  /** "Snaps to 3 m grid". */
  readonly hint: string;
  /** Live preview status while dragging. */
  readonly status: string | null;
  readonly feedback: EditFeedback | null;
  readonly dismissFeedback: () => void;
  /** Callbacks for `SnappedGizmo`. */
  readonly gizmo: {
    readonly onDragStart: (axis: GizmoAxis, mode: GizmoMode, side: GizmoSide) => void;
    readonly onDragSteps: (axis: GizmoAxis, steps: number) => void;
    readonly onDragEnd: (axis: GizmoAxis) => void;
    readonly onDragCancel: () => void;
  };
  /** "Move anyway and recalculate". */
  readonly confirm: () => void;
  /** Cancel a drag or a pending confirmation. */
  readonly cancel: () => void;
  /** One whole-cell step on an axis (default: the current mode, the maximum face). */
  readonly nudge: (axis: GizmoAxis, steps: number, mode?: GizmoMode, side?: GizmoSide) => void;
  /**
   * Arrow keys / PageUp / PageDown (`roomKeys.ts`): one nudge for a room key, in the given screen
   * frame; true when the key was used (the caller then prevents its default). Nothing while a
   * gesture or confirmation is open, or no room is editable.
   */
  readonly handleKey: (event: RoomKey, frame: ScreenFrame, storeys: boolean) => boolean;
  /** Where the 3D camera looks: set by `RoomEditGizmo` inside the canvas, read by the key handler. */
  readonly cameraFrame: MutableRefObject<(() => ScreenFrame) | null>;
  /**
   * During a drag started with `gizmo.onDragStart`: preview a snapped draft derived elsewhere (the
   * Plan's 2D handles change x and y at once). Release with `gizmo.onDragEnd` as for the gizmo.
   */
  readonly setDraft: (draft: RoomGeometry) => void;
}

export function useRoomEditing(
  design: DesignPort | undefined,
  selection: Selection,
  cell: CellSize = DEFAULT_CELL_SIZE,
): RoomEditing {
  const selectedId = selection.kind === 'node' ? selection.id : null;
  const node = design && selectedId !== null ? design.doc.nodes.find((n) => n.id === selectedId) : undefined;
  const nodeId = node ? node.id : null;

  const [mode, setMode] = useState<GizmoMode>('move');
  const [state, setStateValue] = useState<RoomEditState>(IDLE);
  const [feedback, setFeedback] = useState<EditFeedback | null>(null);

  // Latest values for event callbacks (pointer events arrive between renders).
  const live = useRef({ design, state, nodeId, mode });
  live.current = { design, state, nodeId, mode };
  const setState = useCallback((next: RoomEditState) => {
    live.current.state = next;
    setStateValue(next);
  }, []);
  const apply = useCallback(
    (step: EditStep) => {
      setState(step.state);
      setFeedback(step.feedback);
    },
    [setState],
  );

  // A different selection, or a document change from elsewhere (undo/redo, Properties, another
  // view) abandons any gesture or pending confirmation: its preview would be stale.
  useEffect(() => {
    setState(IDLE);
    setFeedback(null);
  }, [nodeId, setState]);
  useEffect(() => {
    if (live.current.state.phase !== 'idle') setState(IDLE);
  }, [design?.doc, setState]);

  const gizmo = useMemo(
    () => ({
      // The grabbed handle decides move or resize (the gizmo shows both, gumball-style).
      onDragStart: (axis: GizmoAxis, m: GizmoMode, side: GizmoSide) => {
        const { design: d, nodeId: id } = live.current;
        if (!d || id === null) return;
        setFeedback(null);
        setState(beginDrag(d, id, m, axis, side));
      },
      onDragSteps: (_axis: GizmoAxis, steps: number) => {
        const { design: d, state: s } = live.current;
        if (d) setState(updateDrag(d, s, steps));
      },
      onDragEnd: () => {
        const { design: d, state: s } = live.current;
        if (d) apply(endDrag(d, s));
      },
      onDragCancel: () => apply(cancelEdit(live.current.state)),
    }),
    [apply, setState],
  );

  const confirm = useCallback(() => {
    const { design: d, state: s } = live.current;
    if (d) apply(confirmEdit(d, s));
  }, [apply]);
  const cancel = useCallback(() => apply(cancelEdit(live.current.state)), [apply]);
  const nudge = useCallback(
    (axis: GizmoAxis, steps: number, mode?: GizmoMode, side: GizmoSide = 1) => {
      const { design: d, nodeId: id, mode: m, state: s } = live.current;
      if (!d || id === null || s.phase !== 'idle') return;
      apply(nudgeRoom(d, id, mode ?? m, axis, steps, side));
    },
    [apply],
  );
  const handleKey = useCallback(
    (event: RoomKey, frame: ScreenFrame, storeys: boolean) => {
      const step = roomKeyStep(event, frame, storeys);
      const { design: d, nodeId: id, state: s } = live.current;
      if (!step || !d || id === null || s.phase !== 'idle') return false;
      apply(nudgeRoom(d, id, step.mode, step.axis, step.steps, step.side));
      return true;
    },
    [apply],
  );
  const cameraFrame = useRef<(() => ScreenFrame) | null>(null);
  const setDraft = useCallback(
    (draft: RoomGeometry) => {
      const { design: d, state: s } = live.current;
      if (d) setState(updateDraft(d, s, draft));
    },
    [setState],
  );
  const dismissFeedback = useCallback(() => setFeedback(null), []);

  // Escape also cancels a pending confirmation (a drag's Escape is handled by the gizmo).
  useEffect(() => {
    if (state.phase !== 'confirm') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [state.phase, cancel]);

  const geometry = design && nodeId !== null ? displayedGeometry(design.doc, state, nodeId) : null;
  const box = geometry ? roomWorldBox(geometry, cell) : null;

  return {
    active: geometry !== null,
    nodeId,
    label: node ? nodeLabel(node) : '',
    mode,
    setMode,
    state,
    geometry,
    box,
    tone: previewTone(state),
    cell,
    hint: snapHint(cell),
    status: design ? dragStatus(design.doc, state) : null,
    feedback,
    dismissFeedback,
    gizmo,
    confirm,
    cancel,
    nudge,
    handleKey,
    cameraFrame,
    setDraft,
  };
}
