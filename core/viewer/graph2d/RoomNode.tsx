import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { GraphNode } from '../../spatial';
import { SELECTION_COLOR, typeColor } from '../appearance';
import { formatGrid } from './diagram';

export type RoomNodeData = {
  readonly node: GraphNode;
  /** True when a selected edge ends at this node. */
  readonly emphasised: boolean;
};

export type RoomFlowNode = Node<RoomNodeData, 'room'>;

/** One spatial-graph node: its ID, function (typeId) and spatial cell. One handle for connecting. */
export const RoomNode = memo(function RoomNode({ data, selected }: NodeProps<RoomFlowNode>) {
  const { node, emphasised } = data;
  const color = typeColor(node.typeId);
  const ring = selected ? SELECTION_COLOR : emphasised ? SELECTION_COLOR : undefined;
  return (
    <div
      className="sgl-room"
      style={{
        borderColor: ring ?? color,
        boxShadow: selected ? `0 0 0 3px ${SELECTION_COLOR}` : emphasised ? `0 0 0 1px ${SELECTION_COLOR}` : undefined,
      }}
      title={`${node.id} · ${node.typeId} · cell ${formatGrid(node.grid)}`}
    >
      <div className="sgl-room-type" style={{ background: color }}>
        {node.typeId}
      </div>
      <div className="sgl-room-id">{node.id}</div>
      <div className="sgl-room-cell">
        cell {formatGrid(node.grid)} · storey {node.grid[2]}
      </div>
      <Handle type="source" position={Position.Bottom} className="sgl-handle" title="Drag to another node to connect" />
    </div>
  );
});
