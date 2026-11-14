import { BaseEdge, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react';
import { memo } from 'react';
import type { EdgeKind } from '@app/document';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { EDGE_STYLES, NODE_HEIGHT, NODE_WIDTH, rectBorderPoint, type Rect } from './diagram';

export type RelationEdgeData = { readonly kind: EdgeKind };
export type RelationFlowEdge = Edge<RelationEdgeData, 'relation'>;

function rectOf(node: InternalNode): Rect {
  const { x, y } = node.internals.positionAbsolute;
  return { x, y, width: node.measured.width ?? NODE_WIDTH, height: node.measured.height ?? NODE_HEIGHT };
}

const centre = (r: Rect): [number, number] => [r.x + r.width / 2, r.y + r.height / 2];

/**
 * Straight "floating" edge between node borders. Undirected, so it ignores handle positions.
 * Horizontal kinds are solid, vertical kinds dashed (see EDGE_STYLES and the legend).
 */
export const RelationEdge = memo(function RelationEdge({ id, source, target, data, selected }: EdgeProps<RelationFlowEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode || !data) return null;
  const a = rectOf(sourceNode);
  const b = rectOf(targetNode);
  const [sx, sy] = rectBorderPoint(a, centre(b));
  const [tx, ty] = rectBorderPoint(b, centre(a));
  const style = EDGE_STYLES[data.kind];
  return (
    <BaseEdge
      id={id}
      path={`M ${sx},${sy} L ${tx},${ty}`}
      interactionWidth={18}
      label={`${style.symbol} ${data.kind}`}
      labelX={(sx + tx) / 2}
      labelY={(sy + ty) / 2}
      labelStyle={{ fontSize: 11, fill: selected ? SELECTION_COLOR : style.stroke, fontWeight: selected ? 700 : 500 }}
      labelShowBg
      labelBgPadding={[4, 2]}
      labelBgBorderRadius={3}
      labelBgStyle={{ fill: '#ffffff', fillOpacity: 0.9 }}
      style={{
        stroke: selected ? SELECTION_COLOR : style.stroke,
        strokeWidth: selected ? style.strokeWidth + 1.5 : style.strokeWidth,
        ...(style.strokeDasharray ? { strokeDasharray: style.strokeDasharray } : {}),
      }}
    />
  );
});
