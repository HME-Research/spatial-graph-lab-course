import {
  Background,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
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
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import type { DiagramPosition, GraphIssue } from '@app/document';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';
import type { ViewProps } from '../contracts';
import { useRemembered } from '../panelMemory';
import { nodeTypeStatus, typeDisplayName } from '../project';
import { resolveDiagramPositions } from './diagram';
import {
  addNodeRequest,
  changeRelationshipKindCommand,
  connectRequest,
  describePlacement,
  diagramPositionCommand,
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
import { analysisNodeStyle } from '../presentation/analysis';
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

/** Short status line after an action; `created` follows the new edge's live status. */
type Notice =
  | { readonly kind: 'created'; readonly edgeId: string }
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
  const [overlay, setOverlay] = useState<Readonly<Record<string, NodeOverlay>>>({});
  const [issues, setIssues] = useState<readonly GraphIssue[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [popoverNode, setPopoverNode] = useState<string | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  /** "Remove invalid connections" review: open, and the rows the student unchecked (rows start checked). */
  const [reviewInvalid, setReviewInvalid] = useState(false);
  const [keepInvalid, setKeepInvalid] = useState<ReadonlySet<string>>(() => new Set());
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
  const previousIds = useRef<ReadonlySet<string> | null>(null);
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
    const map = new Map<string, ReturnType<typeof nodeTypeStatus>>();
    for (const node of model.nodes) if (!map.has(node.typeId)) map.set(node.typeId, nodeTypeStatus(activeProject, node.typeId));
    return map;
  }, [model, activeProject]);
  const isBroken = (typeId: string) => typeStatus.get(typeId)?.kind === 'broken';

  const emphasised = useMemo(() => {
    if (selection.kind !== 'edge') return new Set<string>();
    const edge = model.edges.find((e) => e.id === selection.id);
    return new Set(edge ? [edge.source, edge.target] : []);
  }, [model, selection]);

  const unresolvedCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of model.edges) {
      if (e.resolution?.status !== 'unresolved') continue;
      counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
      counts.set(e.target, (counts.get(e.target) ?? 0) + 1);
    }
    return counts;
  }, [model]);

  const lines = useMemo(() => new Map(model.nodes.map((n) => [n.id, nodeLines(n, display)])), [model, display]);

  const nodes = useMemo<RoomFlowNode[]>(
    () =>
      model.nodes.map((node) => {
        const o = overlay[node.id];
        const p = positions.get(node.id) ?? [0, 0];
        const l = lines.get(node.id) ?? nodeLines(node, display);
        const broken = typeStatus.get(node.typeId)?.kind === 'broken';
        const unresolved = unresolvedCount.get(node.id) ?? 0;
        return {
          id: node.id,
          type: 'room',
          position: o?.drag ?? { x: p[0], y: p[1] },
          ariaLabel: `Node ${node.label}, type ${node.typeId}`,
          data: {
            typeId: node.typeId,
            lines: l.lines,
            hidden: l.hidden,
            diameter: l.diameter,
            tooltip:
              `${node.label} · ${node.typeId}${broken ? ' (invalid type definition)' : ''}\n${describePlacement(node)}` +
              (unresolved ? `\n${unresolved} relationship(s) not buildable yet` : ''),
            emphasised: emphasised.has(node.id),
            brokenType: broken,
            connectSource: connectFrom === node.id,
            unresolved,
            ...(analysis && {
              analysis: {
                fill: analysisNodeStyle(node.id, analysis, NO_SELECTION).fill ?? '#cccccc',
                value: analysis.valueLabelOf.get(node.id) ?? '–',
                stale: analysis.stale,
              },
            }),
          },
          selected: selection.kind === 'node' && selection.id === node.id,
          ...(o?.measured ? { measured: o.measured } : {}),
        };
      }),
    [model, positions, overlay, selection, emphasised, typeStatus, lines, display, unresolvedCount, connectFrom, analysis],
  );

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
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'relation',
        data: { presentation: presentEdge(model, edge), ...(removePreview?.has(edge.id) && { removePreview: true }) },
        selected: selection.kind === 'edge' && selection.id === edge.id,
      })),
    [model, selection, removePreview],
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

  const onNodeDragStart = useCallback<OnNodeDrag<RoomFlowNode>>(
    (_event, node) => {
      setPopoverNode(null);
      onSelect(selectNode(node.id));
    },
    [onSelect],
  );

  // One set-diagram-position per drag, on stop. Never a spatial move: the room's cell is untouched.
  const onNodeDragStop = useCallback<OnNodeDrag<RoomFlowNode>>(
    (_event, node) => {
      const position: [number, number] = [Math.round(node.position.x), Math.round(node.position.y)];
      setOverlay((prev) => {
        const current = prev[node.id];
        if (!current?.drag) return prev;
        return { ...prev, [node.id]: current.measured ? { measured: current.measured } : {} };
      });
      const stored = model.diagram.positions[node.id];
      if (stored && stored[0] === position[0] && stored[1] === position[1]) return;
      run(diagramPositionCommand(model, node.id, position));
    },
    [model, run],
  );

  /** Create the relationship at once (default kind), select it and show a short status. */
  const connect = (source: string, target: string) => {
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

  const startConnect = (nodeId: string) => {
    setPopoverNode(null);
    setNotice(null);
    setConnectFrom(nodeId);
    onSelect(selectNode(nodeId));
  };

  const addNode = (nearNodeId?: string, at?: DiagramPosition) => {
    const { nodeId, command } = addNodeRequest(model, nearNodeId, at);
    if (run(command)) onSelect(selectNode(nodeId));
  };

  const removeSelected = () => {
    if (selection.kind === 'node') run(removeNodeCommand(model, selection.id));
    else if (selection.kind === 'edge') run(removeEdgeCommand(model, selection.id));
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
  const nodeAnchor = (nodeId: string, viewport: Viewport) => {
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
    const focusedNode = target.closest('.react-flow__node')?.getAttribute('data-id') ?? null;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelected();
    } else if (event.key === 'Escape') {
      if (connectFrom) setConnectFrom(null);
      else onSelect(NO_SELECTION);
    } else if (event.key === 'Enter' || event.key === ' ') {
      const nodeId = focusedNode ?? (selection.kind === 'node' ? selection.id : null);
      if (!nodeId) return;
      event.preventDefault();
      if (connectFrom && connectFrom !== nodeId) connect(connectFrom, nodeId);
      else {
        onSelect(selectNode(nodeId));
        setPopoverNode(nodeId);
      }
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      const nodeId = focusedNode ?? (selection.kind === 'node' ? selection.id : null);
      event.preventDefault();
      const box = containerRef.current?.getBoundingClientRect();
      if (nodeId) {
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
    if (c.source !== c.target) connect(c.source, c.target);
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
    <div ref={containerRef} className="sgl-graph2d" onKeyDown={onKeyDown} tabIndex={-1}>
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
        onNodeClick={(_e, node) => {
          if (connectFrom && connectFrom !== node.id) return connect(connectFrom, node.id);
          setConnectFrom(null);
          setNotice(null);
          onSelect(selectNode(node.id));
          setPopoverNode((open) => (open === node.id ? open : null));
        }}
        onNodeDoubleClick={(_e, node) => {
          if (connectFrom) return;
          onSelect(selectNode(node.id));
          setPopoverNode(node.id);
        }}
        zoomOnDoubleClick={false}
        onEdgeClick={(_e, edge) => {
          setConnectFrom(null);
          setNotice(null);
          onSelect(selectEdge(edge.id));
        }}
        onPaneClick={() => {
          setConnectFrom(null);
          setNotice(null);
          onSelect(NO_SELECTION);
        }}
        onNodeContextMenu={(e, node) => openMenu(e, { kind: 'node', id: node.id })}
        onEdgeContextMenu={(e, edge) => openMenu(e, { kind: 'edge', id: edge.id })}
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
            title="Delete the selected node (with its relationships) or the selected relationship"
          >
            Delete {selection.kind === 'edge' ? 'relationship' : 'node'}
          </button>
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
          <span className="sgl-hint">Click: select · double-click: summary · right-click: actions · drag the dot under a node onto another node to connect</span>
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

      {popover && (
        <PopoverLayer
          containerRef={containerRef}
          anchorOf={nodeAnchor}
          nodeId={popover.id}
          onClose={() => setPopoverNode(null)}
          onConnect={() => startConnect(popover.id)}
          rows={popoverRows(model, popover, {
            brokenType: isBroken(popover.typeId),
            typeName: typeDisplayName(typeStatus.get(popover.typeId) ?? { kind: 'no-project' }, popover.typeId),
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
  readonly anchorOf: (nodeId: string, viewport: Viewport) => { x: number; y: number; radius: number };
  readonly nodeId: string;
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
  readonly onRemove: (edgeId: string) => void;
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
  const kind = RELATIONSHIP_KIND_LABELS[edge.kind];
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

