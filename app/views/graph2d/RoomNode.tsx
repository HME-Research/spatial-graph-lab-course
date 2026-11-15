import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { SELECTION_COLOR, typeColor } from '@core/viewer/appearance';

export type RoomNodeData = {
  readonly typeId: string;
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
};

export type RoomFlowNode = Node<RoomNodeData, 'room'>;

/**
 * One node of the abstract diagram: a circle in its type colour with the short display id in the
 * centre. The diagram position is independent of the room's spatial cell. One small handle for
 * drag-to-connect; dragging the circle itself only moves the diagram node.
 */
export const RoomNode = memo(function RoomNode({ data, selected }: NodeProps<RoomFlowNode>) {
  const { lines, hidden, diameter, typeId, emphasised, brokenType, connectSource, unresolved } = data;
  const color = typeColor(typeId);
  const ring = selected
    ? `0 0 0 3px #ffffff, 0 0 0 6px ${SELECTION_COLOR}`
    : emphasised || connectSource
      ? `0 0 0 2px #ffffff, 0 0 0 4px ${SELECTION_COLOR}`
      : undefined;
  return (
    <div
      className={connectSource ? 'sgl-circle sgl-connect-source' : 'sgl-circle'}
      style={{ width: diameter, height: diameter, borderColor: color, boxShadow: ring }}
      title={data.tooltip}
    >
      <div className="sgl-circle-fill" style={{ background: color }} />
      <div className="sgl-circle-text">
        {lines.map((line, i) => (
          <span key={i} className={i === 0 ? 'sgl-circle-line sgl-circle-primary' : 'sgl-circle-line'}>
            {line}
          </span>
        ))}
        {hidden > 0 && <span className="sgl-circle-more">+{hidden}</span>}
      </div>
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
      <Handle type="source" position={Position.Bottom} className="sgl-handle" title="Drag onto another node to connect" />
    </div>
  );
});
