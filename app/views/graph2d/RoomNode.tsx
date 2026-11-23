import { Handle, Position, useConnection, useStore, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { useFunctionColour } from '../functionColour';

export type RoomNodeData = {
  readonly function: string;
  /** Text lines inside the circle (see `nodeLines`). */
  readonly lines: readonly string[];
  /** Requested lines that did not fit ("+N"). */
  readonly hidden: number;
  readonly diameter: number;
  /** Hover text: label, type, placement. */
  readonly tooltip: string;
  /** True when a selected edge ends at this node. */
  readonly emphasised: boolean;
  /** True when the active project's definition of this node's type is invalid. */
  readonly brokenType?: boolean;
  /** True while this node is the source of an "Add connection" in progress. */
  readonly connectSource?: boolean;
  /** Number of this node's relationships that cannot be built yet (v2 only). */
  readonly unresolved?: number;
  /** Analysis shown on the model (audit M4): fill colour and value label; never part of the document. */
  readonly analysis?: { readonly fill: string; readonly value?: string; readonly stale: boolean };
};

export type RoomFlowNode = Node<RoomNodeData, 'room'>;

/**
 * One node of the abstract diagram: a circle in its type colour with the short display id in the
 * centre. The diagram position is independent of the room's spatial cell. One small handle for
 * drag-to-connect; dragging the circle itself only moves the diagram node.
 */
export const RoomNode = memo(function RoomNode({ id, data, selected }: NodeProps<RoomFlowNode>) {
  // While a connection is dragged from another node, this whole circle is a drop target (phase 06,
  // O01: dropping on the top half used to create nothing because only the bottom dot was a target).
  const connection = useConnection();
  const dropTarget = connection.inProgress && connection.fromNode.id !== id;
  const { lines, hidden, diameter, function: functionId, emphasised, brokenType, connectSource, unresolved, analysis } = data;
  const color = useFunctionColour()(functionId);
  // Counter-scale text against the diagram zoom so labels stay readable on screen (audit m4):
  // the id at least ~11 px, captions at least ~10 px, capped so a zoomed-out diagram stays tidy.
  const zoom = useStore((s) => s.transform[2]);
  const scale = Math.min(1.7, Math.max(1, 0.85 / zoom));
  const [first, ...rest] = lines;
  const ring = selected
    ? `0 0 0 3px #ffffff, 0 0 0 6px ${SELECTION_COLOR}`
    : connectSource
      ? `0 0 0 2px #ffffff, 0 0 0 4px ${SELECTION_COLOR}`
      : undefined;
  // An end of the selected edge is not itself selected: a thin dashed outline, never the solid ring.
  const endpoint = emphasised && !selected && !connectSource;
  return (
    <div
      className={['sgl-circle', connectSource && 'sgl-connect-source', analysis && 'sgl-has-analysis'].filter(Boolean).join(' ')}
      style={{
        width: diameter,
        height: diameter,
        borderColor: color,
        boxShadow: ring,
        ...(endpoint ? { outline: `1.5px dashed ${SELECTION_COLOR}`, outlineOffset: 3 } : {}),
        ['--sgl-label-scale' as string]: scale,
      }}
      title={data.tooltip}
    >
      {/* The border keeps the type colour; while an analysis is shown the fill carries its colour. */}
      <div className={analysis ? 'sgl-circle-fill sgl-analysis-fill' : 'sgl-circle-fill'} style={{ background: analysis ? analysis.fill : color }} />
      <div className="sgl-circle-text">
        {first !== undefined && <span className="sgl-circle-line sgl-circle-primary">{first}</span>}
      </div>
      {(rest.length > 0 || hidden > 0) && (
        <div className="sgl-circle-caption">
          {rest.map((line, i) => (
            <span key={i} className="sgl-circle-line">
              {line}
            </span>
          ))}
          {hidden > 0 && <span className="sgl-circle-more">+{hidden} more (see the popover)</span>}
        </div>
      )}
      {brokenType && (
        <span className="sgl-badge sgl-badge-warning" aria-label="Invalid type definition">
          !
        </span>
      )}
      {!brokenType && !!unresolved && (
        <span className="sgl-badge sgl-badge-unresolved" aria-label={`${unresolved} relationship(s) not buildable yet`}>
          {unresolved}
        </span>
      )}
      {analysis?.value !== undefined && (
        <span className={analysis.stale ? 'sgl-analysis-value stale' : 'sgl-analysis-value'} aria-label={`Analysis value ${analysis.value}`}>
          {analysis.value}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="sgl-handle" title="Drag onto another node to connect (or use “Add connection…”)" />
      {dropTarget && <Handle type="target" position={Position.Top} className="sgl-drop-target" isConnectableStart={false} />}
    </div>
  );
});
