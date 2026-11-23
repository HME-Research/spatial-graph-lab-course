import {
  Background,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  useViewport,
  type Connection,
  type EdgeTypes,
  type IsValidConnection,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { DiagramPosition, GraphIssue } from '@app/document';
import {
  addToSelection,
  isEdgeSelected,
  isNodeSelected,
  NO_SELECTION,
  selectedEdgeIds,
  selectedNodeIds,
  selectEdge,
  selectionEmphasis,
  selectItems,
  selectNode,
  toggleSelected,
} from '@core/viewer/selection';
import { boxFromDrag, boxSelect, type BoxFilter } from './boxSelect';
import type { ViewProps } from '../contracts';
import { useRemembered } from '../panelMemory';
import { useFunctionName } from '../functionColour';
import { functionStatus, typeDisplayName } from '../project';
import { resolveDiagramPositions } from './diagram';
import { nodesMissingHandles } from './handleRepair';
import {
  addNodeRequest,
  changeRelationshipKindCommand,
  connectRequest,
  describePlacement,
  dragStopCommand,
  modelFromV2,
  removeEdgeCommand,
  removeNodeCommand,
  type DiagramModel,
  type ModelCommand,
} from './diagramModel';
import { presentEdge, relationshipLegend, UNRESOLVED_REASON_TEXT, RELATIONSHIP_KIND_LABELS, type LegendRow } from './edgePresentation';
import './graph2d.css';
import { IssueList } from './IssueList';
import { invalidConnectionRows, NO_INVALID_CONNECTIONS, removeInvalidCommand } from './invalidConnections';
import { DIAGRAM_FIT_PADDING, legendStartsOpen } from './legendPlacement';
import { RemoveInvalidDialog } from './RemoveInvalidDialog';
import { menuItems, NodeContextMenu, type MenuAction, type MenuTarget } from './NodeContextMenu';
import { displayKeys } from '@app/extensions';
import { useAnalysisOverlay } from '../analysisOverlay';
import { duplicateRoom } from '../duplicateRoom';
import { analysisNodeStyle, isAnalysisEdge } from '../presentation/analysis';
import { attributeKeysOf, NodeDisplayControl, nodeLines, sanitizeDisplay, type DisplaySettings } from './NodeDisplay';
import { NodePopover, popoverRows } from './NodePopover';
import { RelationEdge, type RelationFlowEdge } from './RelationEdge';
import { RoomNode, type RoomFlowNode } from './RoomNode';

const NODE_TYPES: NodeTypes = { room: RoomNode };
const EDGE_TYPES: EdgeTypes = { relation: RelationEdge };

/** View-local, non-document UI state per node: React Flow measurements and in-progress drag. */
interface NodeOverlay {
  readonly measured?: { readonly width: number; readonly height: number };
  readonly drag?: XYPosition;
}

interface OpenMenu {
  readonly target: MenuTarget;
  /** Container pixels. */
  readonly point: { readonly x: number; readonly y: number };
  /** Diagram coordinates of the opening point ("Add node here"). */
  readonly flow?: DiagramPosition;
}

/** A box selection in progress: container pixels (drawing) and diagram coordinates (hit test). */
interface BoxDrag {
  readonly pointerId: number;
  readonly startPx: XYPosition;
  readonly endPx: XYPosition;
  readonly start: XYPosition;
  readonly end: XYPosition;
  /** Ctrl/⌘ held at the start: the boxed items are added to the selection. */
  readonly additive: boolean;
}

/** Below this many pixels a box drag is a click on empty canvas (clears the selection). */
const BOX_MIN_PX = 4;

const isCtrl = (event: { ctrlKey: boolean; metaKey: boolean }) => event.ctrlKey || event.metaKey;

/** Short status line after an action; `created` follows the new edge's live status. */
type Notice =
  | { readonly kind: 'created'; readonly edgeId: number }
  | { readonly kind: 'message'; readonly text: string };

/**
 * Graph 2D editor: one abstract diagram of the entire 3D spatial graph (all storeys), drawn as
 * circles. Diagram positions are independent of spatial cells. Reads the design port; every edit is
 * one command.
 */
export function Graph2DView(props: ViewProps) {
  // One provider per panel instance, so split panels keep independent viewports.
  return (
    <ReactFlowProvider>
      <Graph2DEditor {...props} />
    </ReactFlowProvider>
  );
}

function Graph2DEditor({ selection, onSelect, project, design }: ViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flow = useReactFlow();
  // Nodes that are drawn (sized) but whose handles React Flow lost and will not re-measure by
  // itself: measure them again, or their edges are never drawn (see handleRepair.ts).
  const missingHandles = useStore((s) => nodesMissingHandles(s.nodeLookup.values()));
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    if (missingHandles) updateNodeInternals(missingHandles.split(','));
  }, [missingHandles, updateNodeInternals]);
  const [overlay, setOverlay] = useState<Readonly<Record<string, NodeOverlay>>>({});
  const [issues, setIssues] = useState<readonly GraphIssue[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [popoverNode, setPopoverNode] = useState<number | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [connectFrom, setConnectFrom] = useState<number | null>(null);
  /** Box selection: the toolbar toggle (dragging empty canvas draws a box instead of panning), its filter and the box being drawn. */
  const boxModeMemory = useRemembered<boolean>('boxmode:graph2d');
  const [boxMode, setBoxModeState] = useState(() => boxModeMemory?.load() ?? false);
  const setBoxMode = (on: boolean) => {
    setBoxModeState(on);
    boxModeMemory?.save(on);
  };
  const boxFilterMemory = useRemembered<BoxFilter>('boxfilter:graph2d');
  const [boxFilter, setBoxFilterState] = useState<BoxFilter>(() => {
    const f = boxFilterMemory?.load();
    return f && typeof f.nodes === 'boolean' && typeof f.edges === 'boolean' && (f.nodes || f.edges) ? f : { nodes: true, edges: true };
  });
  const setBoxFilter = (next: BoxFilter) => {
    // At least one kind stays on, so a box always selects something it covers.
    if (!next.nodes && !next.edges) return;
    setBoxFilterState(next);
    boxFilterMemory?.save(next);
  };
  const [boxDrag, setBoxDrag] = useState<BoxDrag | null>(null);
  /** The click event that ends a box drag must not clear the selection it just made. */
  const suppressPaneClick = useRef(false);
  /** "Remove invalid connections" review: open, and the rows the student unchecked (rows start checked). */
  const [reviewInvalid, setReviewInvalid] = useState(false);
  const [keepInvalid, setKeepInvalid] = useState<ReadonlySet<number>>(() => new Set());
  /** Panel size (CSS px), so the legend starts folded in small (split / 4-viewport) panels. */
  const [panelSize, setPanelSize] = useState<{ readonly width: number; readonly height: number } | null>(null);
  /** Legend open state chosen by the user; null = automatic (open only in a large panel). */
  const [legendChoice, setLegendChoice] = useState<boolean | null>(null);
  // The diagram viewport (pan/zoom) and display options are remembered by the hosting panel.
  const viewportMemory = useRemembered<Viewport>('viewport:graph2d');
  const [initialViewport] = useState(() => viewportMemory?.load());
  /**
   * Like the 3D cameras: the diagram starts automatically fitted and, while it is, a panel resize
   * (split/single, side panels opened or collapsed, window size) refits it. The first user pan or
   * zoom keeps the user's viewport from then on; the Fit button returns to automatic fitting.
   */
  const autoFitMemory = useRemembered<boolean>('autofit:graph2d');
  const autoFit = useRef<boolean>(autoFitMemory?.load() ?? initialViewport === undefined);
  const setAutoFit = (value: boolean) => {
    autoFit.current = value;
    autoFitMemory?.save(value);
  };
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    let last = '';
    const observer = new ResizeObserver(([entry]) => {
      const size = entry ? `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}` : '';
      if (size === last) return;
      if (entry) setPanelSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
      const first = last === '';
      last = size;
      if (first || !autoFit.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void flow.fitView({ padding: DIAGRAM_FIT_PADDING, maxZoom: 1.5 }));
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [flow]);
  const displayMemory = useRemembered<DisplaySettings>('display:graph2d');
  const [display, setDisplayState] = useState(() => sanitizeDisplay(displayMemory?.load()));
  const setDisplay = (next: DisplaySettings) => {
    setDisplayState(next);
    displayMemory?.save(next);
  };

  const designDoc = design.doc;
  const designSpatial = design.spatial;
  const attributeSchema = project?.attributes;
  /** Analysis values shown on the model (Algorithms tab "Show on the model"); audit M4. */
  const analysis = useAnalysisOverlay();
  const model = useMemo<DiagramModel>(
    () => modelFromV2(designDoc, designSpatial, attributeSchema),
    [designDoc, designSpatial, attributeSchema],
  );

  // A different design (no room in common with the previous one, e.g. Load example / Open JSON)
  // is fitted too while automatic fitting is on; edits within a design never move the diagram.
  const previousIds = useRef<ReadonlySet<number> | null>(null);
  useEffect(() => {
    const ids = new Set(model.nodes.map((n) => n.id));
    const before = previousIds.current;
    previousIds.current = ids;
    if (!before || ids.size === 0 || !autoFit.current) return;
    if ([...ids].some((id) => before.has(id))) return;
    const frame = requestAnimationFrame(() => void flow.fitView({ padding: DIAGRAM_FIT_PADDING, maxZoom: 1.5 }));
    return () => cancelAnimationFrame(frame);
  }, [model, flow]);

  /** Send a command through the design port; show issues on rejection. */
  const run = useCallback(
    (command: ModelCommand): boolean => {
      const outcome = design.onCommand(command);
      setIssues(outcome.ok ? [] : outcome.issues);
      return outcome.ok;
    },
    [design],
  );

  const positions = useMemo(() => resolveDiagramPositions(model), [model]);
  const activeProject = project?.project ?? null;
  const typeStatus = useMemo(() => {
    const map = new Map<string, ReturnType<typeof functionStatus>>();
    for (const node of model.nodes) if (!map.has(node.function)) map.set(node.function, functionStatus(activeProject, node.function));
    return map;
  }, [model, activeProject]);
  const isBroken = (functionId: string) => typeStatus.get(functionId)?.kind === 'broken';

  /** Endpoints of the selected relationship(s) that are not selected themselves. */
  const emphasised = useMemo(() => selectionEmphasis(selection, model.edges).secondaryNodes, [model, selection]);

  const unresolvedCount = useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of model.edges) {
      if (e.resolution?.status !== 'unresolved') continue;
      counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
      counts.set(e.target, (counts.get(e.target) ?? 0) + 1);
    }
    return counts;
  }, [model]);

  const functionName = useFunctionName();
  const lines = useMemo(() => new Map(model.nodes.map((n) => [n.id, nodeLines(n, display, functionName)])), [model, display, functionName]);

  const nodes = useMemo<RoomFlowNode[]>(() => {
    const analysisFill = (id: number) => (analysis ? analysisNodeStyle(id, analysis, NO_SELECTION).fill : null);
    return model.nodes.map((node) => {
        const o = overlay[node.id];
        const p = positions.get(node.id) ?? [0, 0];
        const l = lines.get(node.id) ?? nodeLines(node, display, functionName);
        const broken = typeStatus.get(node.function)?.kind === 'broken';
        const unresolved = unresolvedCount.get(node.id) ?? 0;
        return {
          id: String(node.id),
          type: 'room',
          position: o?.drag ?? { x: p[0], y: p[1] },
          ariaLabel: `Node ${node.label}, type ${functionName(node.function)}`,
          data: {
            function: node.function,
            lines: l.lines,
            hidden: l.hidden,
            diameter: l.diameter,
            tooltip:
              `${node.label} · ${functionName(node.function)}${broken ? ' (invalid type definition)' : ''}\n${describePlacement(node)}` +
              (unresolved ? `\n${unresolved} relationship(s) not buildable yet` : ''),
            emphasised: emphasised.has(node.id),
            brokenType: broken,
            connectSource: connectFrom === node.id,
            unresolved,
            ...(analysisFill(node.id) !== null && {
              analysis: {
                fill: analysisFill(node.id)!,
                // A highlight-only result (P4) colours the node without a value label.
                ...(analysis!.hasValues && { value: analysis!.valueLabelOf.get(node.id) ?? '–' }),
                stale: analysis!.stale,
              },
            }),
          },
          selected: isNodeSelected(selection, node.id),
          ...(o?.measured ? { measured: o.measured } : {}),
        };
      });
  }, [model, positions, overlay, selection, emphasised, typeStatus, lines, display, unresolvedCount, connectFrom, analysis, functionName]);

  const invalidRows = useMemo(() => invalidConnectionRows(model), [model]);
  const reviewing = reviewInvalid && invalidRows.length > 0;
  /** Preview while reviewing: the checked (to be removed) relationships are marked in the diagram. */
  const removePreview = useMemo(
    () => (reviewing ? new Set(invalidRows.filter((r) => !keepInvalid.has(r.edgeId)).map((r) => r.edgeId)) : null),
    [reviewing, invalidRows, keepInvalid],
  );
  // The review closes for good when nothing is left to remove (e.g. an edit elsewhere resolved it),
  // so it never pops up again by itself later.
  useEffect(() => {
    if (reviewInvalid && invalidRows.length === 0) {
      setReviewInvalid(false);
      setKeepInvalid(new Set());
    }
  }, [reviewInvalid, invalidRows]);

  const edges = useMemo<RelationFlowEdge[]>(
    () =>
      model.edges.map((edge) => ({
        id: String(edge.id),
        source: String(edge.source),
        target: String(edge.target),
        type: 'relation',
        data: {
          presentation: presentEdge(model, edge),
          ...(removePreview?.has(edge.id) && { removePreview: true }),
          ...(isAnalysisEdge(analysis, edge.id) && { analysed: true }),
        },
        selected: isEdgeSelected(selection, edge.id),
      })),
    [model, selection, removePreview, analysis],
  );

  // Only measurements and drag positions are kept locally; selection/removal changes are ignored
  // because the app owns both (clicks and commands below).
  const onNodesChange = useCallback((changes: NodeChange<RoomFlowNode>[]) => {
    setOverlay((prev) => {
      let next: Record<string, NodeOverlay> | null = null;
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions) {
          next ??= { ...prev };
          next[change.id] = { ...next[change.id], measured: change.dimensions };
        } else if (change.type === 'position' && change.position && change.dragging) {
          next ??= { ...prev };
          next[change.id] = { ...next[change.id], drag: change.position };
        }
      }
      return next ?? prev;
    });
  }, []);

  // Dragging a node of a multi-selection keeps the selection: React Flow moves all selected nodes.
  const onNodeDragStart = useCallback<OnNodeDrag<RoomFlowNode>>(
    (_event, node) => {
      setPopoverNode(null);
      const id = Number(node.id);
      if (!isNodeSelected(selection, id)) onSelect(selectNode(id));
    },
    [onSelect, selection],
  );

  // One command per drag, on stop (all dragged nodes together). Never a spatial move: cells are untouched.
  const onNodeDragStop = useCallback<OnNodeDrag<RoomFlowNode>>(
    (_event, node, dragged) => {
      const all = dragged.length > 0 ? dragged : [node];
      setOverlay((prev) => {
        let next: Record<string, NodeOverlay> | null = null;
        for (const n of all) {
          const current = prev[n.id];
          if (!current?.drag) continue;
          next ??= { ...prev };
          next[n.id] = current.measured ? { measured: current.measured } : {};
        }
        return next ?? prev;
      });
      const command = dragStopCommand(model, all.map((n) => ({ id: Number(n.id), x: n.position.x, y: n.position.y })));
      if (command) run(command);
    },
    [model, run],
  );

  /** Create the relationship at once (default kind), select it and show a short status. */
  const connect = (source: number, target: number) => {
    setConnectFrom(null);
    const request = connectRequest(model, source, target);
    if (request.status === 'existing') {
      onSelect(selectEdge(request.edgeId));
      setNotice({ kind: 'message', text: 'These nodes are already connected; that relationship is now selected.' });
    } else if (request.status === 'refused') {
      setNotice({ kind: 'message', text: request.message });
    } else if (run(request.command)) {
      onSelect(selectEdge(request.edgeId));
      setNotice({ kind: 'created', edgeId: request.edgeId });
    }
  };

  const startConnect = (nodeId: number) => {
    setPopoverNode(null);
    setNotice(null);
    setConnectFrom(nodeId);
    onSelect(selectNode(nodeId));
  };

  const addNode = (nearNodeId?: number, at?: DiagramPosition) => {
    const { nodeId, command } = addNodeRequest(model, nearNodeId, at);
    if (run(command)) onSelect(selectNode(nodeId));
  };

  /** Duplicate (menu; Ctrl+D is app-wide, in App): one command; the copy is selected, or the reason is shown. */
  const duplicate = (nodeId: number) => {
    const outcome = duplicateRoom(design, nodeId);
    setIssues(outcome.ok ? [] : outcome.issues);
    if (!outcome.ok) return;
    onSelect(selectNode(outcome.nodeId));
    setNotice({ kind: 'message', text: outcome.message });
  };

  const removeSelected = () => {
    if (selection.kind === 'node') run(removeNodeCommand(model, selection.id));
    else if (selection.kind === 'edge') run(removeEdgeCommand(model, selection.id));
    // Several items: ONE command, one Undo step.
    else if (selection.kind === 'multi' && run({ type: 'remove-items', nodeIds: selection.nodes, edgeIds: selection.edges })) onSelect(NO_SELECTION);
  };

  /** Hit-test the box (diagram coordinates) against the circles and lines as React Flow draws them. */
  const finishBox = (drag: BoxDrag) => {
    const { box, mode } = boxFromDrag(drag.start, drag.end);
    const circles = model.nodes.map((n) => {
      const internal = flow.getInternalNode(String(n.id));
      const p = internal?.internals.positionAbsolute ?? (() => {
        const q = positions.get(n.id) ?? [0, 0];
        return { x: q[0], y: q[1] };
      })();
      const d = lines.get(n.id)?.diameter ?? 46;
      const w = internal?.measured.width ?? d;
      const h = internal?.measured.height ?? d;
      return { id: n.id, circle: { centre: [p.x + w / 2, p.y + h / 2] as [number, number], radius: Math.min(w, h) / 2 } };
    });
    const hit = boxSelect({ nodes: circles, edges: model.edges }, box, mode, boxFilter);
    onSelect(drag.additive ? addToSelection(selection, hit.nodes, hit.edges) : selectItems(hit.nodes, hit.edges));
  };

  /** A box starts on empty canvas: always while the toggle is on, or with Shift held. */
  const onBoxPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (!boxMode && !event.shiftKey) || connectFrom !== null) return;
    const target = event.target as Element;
    if (!target.closest('.react-flow__pane') || target.closest('.react-flow__panel, .react-flow__node, .react-flow__edge')) return;
    // Keep React Flow from panning (Shift+drag while the toggle is off).
    event.stopPropagation();
    event.preventDefault();
    containerRef.current?.setPointerCapture(event.pointerId);
    setMenu(null);
    setPopoverNode(null);
    const px = pointIn(event);
    const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setBoxDrag({ pointerId: event.pointerId, startPx: px, endPx: px, start: at, end: at, additive: isCtrl(event) });
  };
  const onBoxPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!boxDrag || event.pointerId !== boxDrag.pointerId) return;
    setBoxDrag({ ...boxDrag, endPx: pointIn(event), end: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
  };
  const onBoxPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!boxDrag || event.pointerId !== boxDrag.pointerId) return;
    containerRef.current?.releasePointerCapture(event.pointerId);
    const drag = { ...boxDrag, endPx: pointIn(event), end: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) };
    setBoxDrag(null);
    // The click that may follow this pointerup must not clear the selection; any later click may.
    suppressPaneClick.current = true;
    setTimeout(() => (suppressPaneClick.current = false), 0);
    if (Math.abs(drag.endPx.x - drag.startPx.x) < BOX_MIN_PX && Math.abs(drag.endPx.y - drag.startPx.y) < BOX_MIN_PX) {
      // A click on empty canvas: clears the selection (Ctrl/⌘ keeps it).
      if (!drag.additive) onSelect(NO_SELECTION);
      return;
    }
    finishBox(drag);
  };

  /** Open the review list, or say explicitly why there is nothing to remove. */
  const openInvalidReview = () => {
    setMenu(null);
    setPopoverNode(null);
    setConnectFrom(null);
    if (invalidRows.length === 0) {
      setReviewInvalid(false);
      setNotice({ kind: 'message', text: NO_INVALID_CONNECTIONS });
      return;
    }
    setNotice(null);
    setKeepInvalid(new Set());
    setReviewInvalid(true);
  };
  const closeInvalidReview = () => {
    setReviewInvalid(false);
    setKeepInvalid(new Set());
    containerRef.current?.focus();
  };
  /** ONE `remove-edges` command for the checked rows = one undo step. */
  const confirmInvalidReview = () => {
    const command = removeInvalidCommand(invalidRows, keepInvalid);
    if (!command || command.type !== 'remove-edges') return;
    if (!run(command)) return;
    const removed = new Set(command.edgeIds);
    if (selection.kind === 'edge' && removed.has(selection.id)) onSelect(NO_SELECTION);
    const n = command.edgeIds.length;
    closeInvalidReview();
    setNotice({ kind: 'message', text: `Removed ${n} invalid connection${n === 1 ? '' : 's'}. Ctrl/⌘+Z restores ${n === 1 ? 'it' : 'them'}.` });
  };

  const onMenuAction = (action: MenuAction) => {
    switch (action.type) {
      case 'remove-invalid':
        return openInvalidReview();
      case 'inspect':
        onSelect(selectNode(action.nodeId));
        setPopoverNode(action.nodeId);
        return;
      case 'connect':
        return startConnect(action.nodeId);
      case 'add-node':
        return addNode(action.nearNodeId, action.nearNodeId === undefined ? menu?.flow : undefined);
      case 'duplicate-node':
        return duplicate(action.nodeId);
      case 'remove-node':
        return void run(removeNodeCommand(model, action.nodeId));
      case 'remove-edge':
        return void run(removeEdgeCommand(model, action.edgeId));
      case 'set-relationship-kind':
        return void run(changeRelationshipKindCommand(action.edgeId, action.kind));
    }
  };

  const pointIn = (event: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const openMenu = (event: ReactMouseEvent | MouseEvent, target: MenuTarget) => {
    event.preventDefault();
    const p = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setPopoverNode(null);
    setConnectFrom(null);
    if (target.kind === 'node') onSelect(selectNode(target.id));
    else if (target.kind === 'edge') onSelect(selectEdge(target.id));
    setMenu({ target, point: pointIn(event), flow: [Math.round(p.x), Math.round(p.y)] });
  };

  /** Centre and radius of a node in container pixels (for keyboard-opened menus and the popover). */
  const nodeAnchor = (nodeId: number, viewport: Viewport) => {
    const p = overlay[nodeId]?.drag ?? (() => {
      const q = positions.get(nodeId) ?? [0, 0];
      return { x: q[0], y: q[1] };
    })();
    const d = lines.get(nodeId)?.diameter ?? 46;
    return {
      x: (p.x + d / 2) * viewport.zoom + viewport.x,
      y: (p.y + d / 2) * viewport.zoom + viewport.y,
      radius: (d / 2) * viewport.zoom,
    };
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea, button, .sgl-menu, .sgl-popover')) return;
    // An open menu, popover or review list closes itself on Escape.
    if (menu || popoverNode || reviewing) return;
    const focusedAttr = target.closest('.react-flow__node')?.getAttribute('data-id');
    const focusedNode = focusedAttr === null || focusedAttr === undefined ? null : Number(focusedAttr);
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelected();
    } else if (event.key === 'Escape') {
      if (boxDrag) setBoxDrag(null);
      else if (connectFrom !== null) setConnectFrom(null);
      else onSelect(NO_SELECTION);
    } else if (event.key === 'Enter' || event.key === ' ') {
      const nodeId = focusedNode ?? (selection.kind === 'node' ? selection.id : null);
      if (nodeId === null) return;
      event.preventDefault();
      if (connectFrom !== null && connectFrom !== nodeId) connect(connectFrom, nodeId);
      else {
        onSelect(selectNode(nodeId));
        setPopoverNode(nodeId);
      }
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      const nodeId = focusedNode ?? (selection.kind === 'node' ? selection.id : null);
      event.preventDefault();
      const box = containerRef.current?.getBoundingClientRect();
      if (nodeId !== null) {
        const a = nodeAnchor(nodeId, flow.getViewport());
        onSelect(selectNode(nodeId));
        setMenu({ target: { kind: 'node', id: nodeId }, point: { x: a.x + a.radius, y: a.y } });
      } else if (selection.kind === 'edge') {
        setMenu({ target: { kind: 'edge', id: selection.id }, point: { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) / 2 } });
      }
    }
  };

  const isValidConnection = useCallback<IsValidConnection>((c) => c.source !== c.target, []);
  const onConnect = (c: Connection) => {
    if (c.source !== c.target) connect(Number(c.source), Number(c.target));
  };

  const legendOpen = legendChoice ?? (panelSize === null ? false : legendStartsOpen(panelSize));
  const popover = popoverNode && selection.kind === 'node' && selection.id === popoverNode ? model.byNode.get(popoverNode) : undefined;
  const menuList = menu ? menuItems(model, menu.target) : [];
  const connectSource = connectFrom ? model.byNode.get(connectFrom) : undefined;
  // A "created" notice disappears with its edge (undo, delete elsewhere).
  const shownNotice = notice?.kind === 'created' && !model.edges.some((e) => e.id === notice.edgeId) ? null : notice;
  // Every project node field is offered (the same list for every node), then other stored keys.
  const attributeKeys = useMemo(
    () => (attributeSchema && designDoc ? displayKeys(attributeSchema, 'nodes', designDoc.nodes) : attributeKeysOf(model)),
    [attributeSchema, designDoc, model],
  );

  return (
    <div
      ref={containerRef}
      className={`sgl-graph2d${boxMode ? ' sgl-box-mode' : ''}`}
      onKeyDown={onKeyDown}
      tabIndex={-1}
      // Capture phase: a box drag must start before React Flow can treat it as a pan.
      onPointerDownCapture={onBoxPointerDown}
      onPointerMove={onBoxPointerMove}
      onPointerUp={onBoxPointerUp}
      onPointerCancel={() => setBoxDrag(null)}
    >
      <ReactFlow<RoomFlowNode, RelationFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        // A click selects (Properties shows the room). The quick summary opens on double-click,
        // "Inspect" in the context menu or Enter, so it never covers a neighbouring circle that the
        // student wants to click next (phase 06, G01).
        onNodeClick={(e, node) => {
          // React Flow ids are the room ids as text.
          const id = Number(node.id);
          if (connectFrom !== null && connectFrom !== id) return connect(connectFrom, id);
          setConnectFrom(null);
          setNotice(null);
          // Ctrl/⌘-click adds the node to the selection, or removes it.
          if (isCtrl(e)) {
            setPopoverNode(null);
            return onSelect(toggleSelected(selection, 'node', id));
          }
          onSelect(selectNode(id));
          setPopoverNode((open) => (open === id ? open : null));
        }}
        onNodeDoubleClick={(_e, node) => {
          if (connectFrom !== null) return;
          onSelect(selectNode(Number(node.id)));
          setPopoverNode(Number(node.id));
        }}
        zoomOnDoubleClick={false}
        onEdgeClick={(e, edge) => {
          setConnectFrom(null);
          setNotice(null);
          const id = Number(edge.id);
          onSelect(isCtrl(e) ? toggleSelected(selection, 'edge', id) : selectEdge(id));
        }}
        onPaneClick={(e) => {
          // The click ending a box drag was handled on pointerup; Ctrl/⌘-click keeps the selection.
          if (suppressPaneClick.current || isCtrl(e)) return;
          setConnectFrom(null);
          setNotice(null);
          onSelect(NO_SELECTION);
        }}
        onNodeContextMenu={(e, node) => openMenu(e, { kind: 'node', id: Number(node.id) })}
        onEdgeContextMenu={(e, edge) => openMenu(e, { kind: 'edge', id: Number(edge.id) })}
        onPaneContextMenu={(e) => openMenu(e, { kind: 'pane' })}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        // Dropping on (or right next to) a target circle completes the connection; small enough
        // that a careless handle drag in empty space creates nothing.
        connectionRadius={30}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        selectNodesOnDrag={false}
        // "Select area": dragging empty canvas draws a box (handled above) instead of panning;
        // the middle and right buttons still pan, the wheel still zooms.
        panOnDrag={boxMode ? [1, 2] : true}
        {...(initialViewport ? { defaultViewport: initialViewport } : { fitView: true })}
        onMoveStart={(event) => {
          setMenu(null);
          // A move caused by the user (pointer, wheel, keyboard) ends automatic fitting.
          if (event) setAutoFit(false);
        }}
        onMoveEnd={(_event, viewport) => viewportMemory?.save(viewport)}
        fitViewOptions={{ padding: DIAGRAM_FIT_PADDING, maxZoom: 1.5 }}
        minZoom={0.2}
        attributionPosition="top-right"
      >
        <Background gap={20} />
        <Controls showInteractive={false} onFitView={() => setAutoFit(true)} />

        <Panel position="top-left" className="sgl-toolbar">
          <button
            type="button"
            onClick={() => addNode(selection.kind === 'node' ? selection.id : undefined)}
            title="Add a node in a free cell (next to the selected node, if any)"
          >
            + Add node
          </button>
          <button
            type="button"
            onClick={() => (connectFrom ? setConnectFrom(null) : selection.kind === 'node' && startConnect(selection.id))}
            disabled={!connectFrom && selection.kind !== 'node'}
            aria-pressed={connectFrom !== null}
            title="Connect the selected node: then click the node to connect to"
          >
            {connectFrom ? 'Cancel connection' : 'Add connection…'}
          </button>
          <button
            type="button"
            onClick={removeSelected}
            disabled={selection.kind === 'none'}
            title="Delete the selection: nodes (with their relationships) and relationships, as one undo step"
          >
            Delete{' '}
            {selection.kind === 'edge'
              ? 'relationship'
              : selection.kind === 'multi'
                ? `${selectedNodeIds(selection).length + selectedEdgeIds(selection).length} selected`
                : 'node'}
          </button>
          <button
            type="button"
            onClick={() => setBoxMode(!boxMode)}
            aria-pressed={boxMode}
            title={
              'Select area: drag on empty canvas to draw a box. Left → right selects what is fully inside; ' +
              'right → left also what the box touches. Hold Ctrl/⌘ to add to the selection. Shift+drag does this at any time.'
            }
          >
            ⬚ Select area
          </button>
          {boxMode && (
            <span className="sgl-box-filter" role="group" aria-label="What the box selects">
              <label title="The box selects nodes">
                <input type="checkbox" checked={boxFilter.nodes} onChange={(e) => setBoxFilter({ ...boxFilter, nodes: e.target.checked })} /> Nodes
              </label>
              <label title="The box selects relationships">
                <input type="checkbox" checked={boxFilter.edges} onChange={(e) => setBoxFilter({ ...boxFilter, edges: e.target.checked })} /> Relationships
              </label>
            </span>
          )}
          {invalidRows.length > 0 && (
            // Contextual: offered only while some relationship cannot be built (never automatic).
            <button
              type="button"
              className="sgl-invalid-button"
              onClick={() => (reviewing ? closeInvalidReview() : openInvalidReview())}
              aria-pressed={reviewing}
              aria-haspopup="dialog"
              title="Review the relationships that cannot be built and remove the ones you choose (one undo step)"
            >
              Remove invalid connections ({invalidRows.length})…
            </button>
          )}
          <span className="sgl-hint">
            Click: select · Ctrl/⌘-click: add or remove · {boxMode ? 'drag on empty canvas: select area' : 'Shift+drag: select area'} · double-click:
            summary · right-click: actions · drag the dot under a node onto another node to connect
          </span>
          {analysis && (
            <span className="sgl-analysis-note" title="Shown from the Algorithms section; clear it there">
              Colours: analysis “{analysis.title}”{analysis.stale ? ' (out of date)' : ''}
            </span>
          )}
          {/* Notices sit BELOW the toolbar inside the same panel, so they never cover its buttons (audit V02). */}
          {(connectSource || shownNotice) && (
            <div className="sgl-status" aria-live="polite">
              {connectSource ? (
                <>
                  Connecting from <strong>{connectSource.label}</strong>: click the node to connect to.{' '}
                  <button type="button" className="sgl-link" onClick={() => setConnectFrom(null)}>
                    Cancel (Esc)
                  </button>
                </>
              ) : shownNotice ? (
                <NoticeLine notice={shownNotice} model={model} onRemove={(id) => run(removeEdgeCommand(model, id))} onDismiss={() => setNotice(null)} />
              ) : null}
            </div>
          )}
        </Panel>

        {model.nodes.length === 0 && (
          <Panel position="top-center" className="sgl-empty">
            This scenario has no nodes yet. Click <strong>+ Add node</strong> to start.
          </Panel>
        )}


        {issues.length > 0 && (
          <Panel position="top-right" className="sgl-issues-panel">
            <IssueList issues={issues} onDismiss={() => setIssues([])} />
          </Panel>
        )}

        <Panel position="bottom-left" className="sgl-display-panel">
          <NodeDisplayControl settings={display} attributeKeys={attributeKeys} onChange={setDisplay} />
        </Panel>

        {display.showLegend && (
          // Collapsible, and click-through when open, so it never blocks nodes underneath. It starts
          // folded in small panels (split / 4-viewport layouts) so it does not hide nodes there.
          <Panel position="bottom-right" className="sgl-legend" aria-label="Relationship legend">
            <details
              open={legendOpen}
              onToggle={(e) => {
                // React also fires `toggle` when it applies `open`: only a different state is the user's choice.
                if (e.currentTarget.open !== legendOpen) setLegendChoice(e.currentTarget.open);
              }}
            >
              <summary>Relationships</summary>
              <RelationshipLegendRows />
            </details>
          </Panel>
        )}
      </ReactFlow>

      {boxDrag && (
        <div
          className={`sgl-box-rect sgl-box-${boxFromDrag(boxDrag.startPx, boxDrag.endPx).mode}`}
          aria-hidden="true"
          style={{
            left: Math.min(boxDrag.startPx.x, boxDrag.endPx.x),
            top: Math.min(boxDrag.startPx.y, boxDrag.endPx.y),
            width: Math.abs(boxDrag.endPx.x - boxDrag.startPx.x),
            height: Math.abs(boxDrag.endPx.y - boxDrag.startPx.y),
          }}
        />
      )}

      {popover && (
        <PopoverLayer
          containerRef={containerRef}
          anchorOf={nodeAnchor}
          nodeId={popover.id}
          onClose={() => setPopoverNode(null)}
          onConnect={() => startConnect(popover.id)}
          rows={popoverRows(model, popover, {
            brokenType: isBroken(popover.function),
            typeName: typeDisplayName(typeStatus.get(popover.function) ?? { kind: 'no-project' }, popover.function),
            attributeKeys: display.attributeKeys,
          })}
          node={popover}
        />
      )}

      {reviewing && (
        <RemoveInvalidDialog
          rows={invalidRows}
          unchecked={keepInvalid}
          onToggle={(edgeId, checked) =>
            setKeepInvalid((prev) => {
              const next = new Set(prev);
              if (checked) next.delete(edgeId);
              else next.add(edgeId);
              return next;
            })
          }
          onConfirm={confirmInvalidReview}
          onCancel={closeInvalidReview}
        />
      )}

      {menu && menuList.length > 0 && (
        <NodeContextMenu
          items={menuList}
          point={menu.point}
          containerRef={containerRef}
          label={menuLabel(model, menu.target)}
          onAction={onMenuAction}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function menuLabel(model: DiagramModel, target: MenuTarget): string {
  if (target.kind === 'node') return `Actions for node ${model.byNode.get(target.id)?.label ?? target.id}`;
  if (target.kind === 'edge') return 'Actions for relationship';
  return 'Diagram actions';
}

/** Tracks pan/zoom so the popover stays beside its node. */
function PopoverLayer({
  containerRef,
  anchorOf,
  nodeId,
  ...rest
}: {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly anchorOf: (nodeId: number, viewport: Viewport) => { x: number; y: number; radius: number };
  readonly nodeId: number;
} & Omit<Parameters<typeof NodePopover>[0], 'anchor' | 'containerRef'>) {
  const viewport = useViewport();
  return <NodePopover {...rest} containerRef={containerRef} anchor={anchorOf(nodeId, viewport)} />;
}

function NoticeLine({
  notice,
  model,
  onRemove,
  onDismiss,
}: {
  readonly notice: Notice;
  readonly model: DiagramModel;
  readonly onRemove: (edgeId: number) => void;
  readonly onDismiss: () => void;
}) {
  const dismiss = (
    <button type="button" className="sgl-icon-button" onClick={onDismiss} aria-label="Dismiss" title="Dismiss">
      ×
    </button>
  );
  if (notice.kind === 'message') {
    return (
      <>
        {notice.text} {dismiss}
      </>
    );
  }
  const edge = model.edges.find((e) => e.id === notice.edgeId);
  if (!edge) return null;
  const a = model.byNode.get(edge.source)?.label ?? edge.source;
  const b = model.byNode.get(edge.target)?.label ?? edge.target;
  const kind = RELATIONSHIP_KIND_LABELS[edge.relationship];
  const unresolved = edge.resolution?.status === 'unresolved' ? edge.resolution : undefined;
  return (
    <>
      Connected <strong>{a}</strong> ↔ <strong>{b}</strong> as {kind}
      {' '}(change it from the right-click menu or Properties).
      {unresolved && <span className="sgl-unresolved-text"> Unresolved: {UNRESOLVED_REASON_TEXT[unresolved.reason]}</span>}{' '}
      <button type="button" className="sgl-link" onClick={() => onRemove(edge.id)} title="Delete this new relationship (Ctrl/⌘+Z also undoes it)">
        Remove
      </button>{' '}
      <span className="sgl-muted">· Ctrl/⌘+Z to undo</span> {dismiss}
    </>
  );
}

function LegendLine({ row }: { readonly row: Pick<LegendRow, 'stroke'> }) {
  return (
    <svg width="36" height="10" aria-hidden="true">
      <line
        x1="2"
        y1="5"
        x2="34"
        y2="5"
        stroke={row.stroke.stroke}
        strokeWidth={row.stroke.strokeWidth}
        {...(row.stroke.strokeDasharray ? { strokeDasharray: row.stroke.strokeDasharray } : {})}
      />
    </svg>
  );
}

function RelationshipLegendRows() {
  return (
    <>
      {relationshipLegend().map((row) => (
        <div key={row.key} className="sgl-legend-row" title={row.hint}>
          <LegendLine row={row} />
          <span>{row.label}</span>
        </div>
      ))}
      <div className="sgl-muted">Hover a line for details</div>
    </>
  );
}

