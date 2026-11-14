import {
  Background,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type EdgeTypes,
  type IsValidConnection,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { EDGE_KINDS, type EdgeKind, type GraphCommand, type GraphIssue } from '@app/document';
import type { ViewProps } from '../contracts';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';
import {
  EDGE_KIND_LABELS,
  EDGE_STYLES,
  connectionOptions,
  nextFreeId,
  orientationOf,
  resolveDiagramPositions,
  suggestDiagramPosition,
  suggestFreeCell,
} from './diagram';
import './graph2d.css';
import { IssueList } from './IssueList';
import { RelationEdge, type RelationFlowEdge } from './RelationEdge';
import { RoomNode, type RoomFlowNode } from './RoomNode';

const NODE_TYPES: NodeTypes = { room: RoomNode };
const EDGE_TYPES: EdgeTypes = { relation: RelationEdge };

/** View-local, non-document UI state per node: React Flow measurements and in-progress drag. */
interface NodeOverlay {
  readonly measured?: { readonly width: number; readonly height: number };
  readonly drag?: XYPosition;
}

/**
 * Graph 2D editor: one abstract diagram of the entire 3D spatial graph (all storeys).
 * Reads `doc` only; every edit is a GraphCommand sent through `onCommand`.
 */
export function Graph2DView(props: ViewProps) {
  // One provider per panel instance, so split panels keep independent viewports.
  return (
    <ReactFlowProvider>
      <Graph2DEditor {...props} />
    </ReactFlowProvider>
  );
}

function Graph2DEditor({ doc, selection, onSelect, onCommand }: ViewProps) {
  const [overlay, setOverlay] = useState<Readonly<Record<string, NodeOverlay>>>({});
  const [pending, setPending] = useState<{ source: string; target: string } | null>(null);
  const [issues, setIssues] = useState<readonly GraphIssue[]>([]);

  /** Send a command; show issues on rejection. Returns whether it was applied. */
  const run = useCallback(
    (command: GraphCommand): boolean => {
      const outcome = onCommand(command);
      setIssues(outcome.ok ? [] : outcome.issues);
      return outcome.ok;
    },
    [onCommand],
  );

  const positions = useMemo(() => resolveDiagramPositions(doc), [doc]);

  const emphasised = useMemo(() => {
    if (selection.kind !== 'edge') return new Set<string>();
    const edge = doc.edges.find((e) => e.id === selection.id);
    return new Set(edge ? [edge.source, edge.target] : []);
  }, [doc, selection]);

  const nodes = useMemo<RoomFlowNode[]>(
    () =>
      doc.nodes.map((node) => {
        const o = overlay[node.id];
        const p = positions.get(node.id) ?? [0, 0];
        return {
          id: node.id,
          type: 'room',
          position: o?.drag ?? { x: p[0], y: p[1] },
          data: { node, emphasised: emphasised.has(node.id) },
          selected: selection.kind === 'node' && selection.id === node.id,
          ...(o?.measured ? { measured: o.measured } : {}),
        };
      }),
    [doc, positions, overlay, selection, emphasised],
  );

  const edges = useMemo<RelationFlowEdge[]>(
    () =>
      doc.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'relation',
        data: { kind: edge.kind },
        selected: selection.kind === 'edge' && selection.id === edge.id,
      })),
    [doc, selection],
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
    (_event, node) => onSelect(selectNode(node.id)),
    [onSelect],
  );

  // One set-diagram-position per drag, on stop. Never move-node: the spatial cell is untouched.
  const onNodeDragStop = useCallback<OnNodeDrag<RoomFlowNode>>(
    (_event, node) => {
      const position: [number, number] = [Math.round(node.position.x), Math.round(node.position.y)];
      setOverlay((prev) => {
        const current = prev[node.id];
        if (!current?.drag) return prev;
        return { ...prev, [node.id]: current.measured ? { measured: current.measured } : {} };
      });
      const stored = doc.diagram.positions[node.id];
      if (stored && stored[0] === position[0] && stored[1] === position[1]) return;
      run({ type: 'set-diagram-position', nodeId: node.id, position });
    },
    [doc, run],
  );

  const isValidConnection = useCallback<IsValidConnection>((c) => c.source !== c.target, []);
  const onConnect = useCallback((c: Connection) => {
    if (c.source !== c.target) setPending({ source: c.source, target: c.target });
  }, []);

  const pendingOptions = pending ? connectionOptions(doc, pending.source, pending.target) : undefined;

  const createEdge = (kind: EdgeKind) => {
    if (!pending) return;
    const id = nextFreeId('edge', doc.edges.map((e) => e.id));
    if (run({ type: 'add-edge', edge: { id, source: pending.source, target: pending.target, kind } })) {
      setPending(null);
      onSelect(selectEdge(id));
    }
  };

  const addNode = () => {
    const nearId = selection.kind === 'node' ? selection.id : undefined;
    const near = nearId === undefined ? undefined : doc.nodes.find((n) => n.id === nearId);
    const id = nextFreeId('node', doc.nodes.map((n) => n.id));
    const command: GraphCommand = {
      type: 'add-node',
      node: { id, grid: suggestFreeCell(doc, nearId), typeId: near?.typeId ?? 'room', attributes: {} },
      diagramPosition: suggestDiagramPosition(doc, nearId),
    };
    if (run(command)) onSelect(selectNode(id));
  };

  const removeSelected = () => {
    if (selection.kind === 'node') run({ type: 'remove-node', nodeId: selection.id });
    else if (selection.kind === 'edge') run({ type: 'remove-edge', edgeId: selection.id });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea, button')) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelected();
    } else if (event.key === 'Escape') {
      setPending(null);
      onSelect(NO_SELECTION);
    }
  };

  return (
    <div className="sgl-graph2d" onKeyDown={onKeyDown} tabIndex={-1}>
      <ReactFlow<RoomFlowNode, RelationFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_e, node) => onSelect(selectNode(node.id))}
        onEdgeClick={(_e, edge) => onSelect(selectEdge(edge.id))}
        onPaneClick={() => onSelect(NO_SELECTION)}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        // Dropping anywhere on a target node (not only on its small dot) completes the connection.
        connectionRadius={70}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        selectNodesOnDrag={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />

        <Panel position="top-left" className="sgl-toolbar">
          <button type="button" onClick={addNode} title="Add a node in a free cell (next to the selected node, if any)">
            + Add node
          </button>
          <button
            type="button"
            onClick={removeSelected}
            disabled={selection.kind === 'none'}
            title="Remove the selected node (with its edges) or the selected edge"
          >
            Delete {selection.kind === 'edge' ? 'edge' : 'node'}
          </button>
          <span className="sgl-hint">
            Drag a node to rearrange the diagram. Drag from a node’s dot onto another node to connect.
          </span>
        </Panel>

        {doc.nodes.length === 0 && (
          <Panel position="top-center" className="sgl-empty">
            This design has no nodes yet. Click <strong>+ Add node</strong> to start.
          </Panel>
        )}

        {pendingOptions && (
          <Panel position="top-center" className="sgl-connect" role="dialog" aria-label="Choose edge kind">
            <div>
              Connect <code>{pendingOptions.source.id}</code> ↔ <code>{pendingOptions.target.id}</code> as:
            </div>
            <div className="sgl-kind-buttons">
              {pendingOptions.kinds.map(({ kind, valid }) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!valid}
                  onClick={() => createEdge(kind)}
                  title={valid ? `Create a ${orientationOf(kind)} "${kind}" edge` : 'Not possible for these two cells'}
                >
                  {EDGE_STYLES[kind].symbol} {EDGE_KIND_LABELS[kind]}
                </button>
              ))}
            </div>
            {pendingOptions.reason && <p className="sgl-reason">{pendingOptions.reason}</p>}
            <button type="button" className="sgl-link" onClick={() => setPending(null)}>
              Cancel
            </button>
          </Panel>
        )}

        {issues.length > 0 && (
          <Panel position="top-right" className="sgl-issues-panel">
            <IssueList issues={issues} onDismiss={() => setIssues([])} />
          </Panel>
        )}

        {/* Collapsible, and click-through when open, so it never blocks nodes underneath. */}
        <Panel position="bottom-right" className="sgl-legend" aria-label="Edge legend">
          <details open>
            <summary>Edges</summary>
            {EDGE_KINDS.map((kind) => {
              const s = EDGE_STYLES[kind];
              return (
                <div key={kind} className="sgl-legend-row">
                  <svg width="36" height="10" aria-hidden="true">
                    <line
                      x1="2"
                      y1="5"
                      x2="34"
                      y2="5"
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                      {...(s.strokeDasharray ? { strokeDasharray: s.strokeDasharray } : {})}
                    />
                  </svg>
                  <span>
                    {s.symbol} {kind} <span className="sgl-muted">({orientationOf(kind)})</span>
                  </span>
                </div>
              );
            })}
            <div className="sgl-muted">Solid = same storey · dashed = between storeys</div>
          </details>
        </Panel>
      </ReactFlow>
    </div>
  );
}
