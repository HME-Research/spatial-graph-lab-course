import { EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react';
import { memo } from 'react';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { circleSegment, type Circle } from './diagram';
import type { EdgePresentation } from './edgePresentation';
import { BASE_NODE_DIAMETER } from './NodeDisplay';

export type RelationEdgeData = { readonly presentation: EdgePresentation };
export type RelationFlowEdge = Edge<RelationEdgeData, 'relation'>;

/** Width of the invisible stroke that receives clicks and hover. */
export const EDGE_HIT_WIDTH = 16;

function circleOf(node: InternalNode): Circle {
  const { x, y } = node.internals.positionAbsolute;
  const width = node.measured.width ?? BASE_NODE_DIAMETER;
  const height = node.measured.height ?? BASE_NODE_DIAMETER;
  return { centre: [x + width / 2, y + height / 2], radius: Math.min(width, height) / 2 };
}

/**
 * Straight undirected edge from circle border to circle border. Stroke encodes intent and derived
 * spatial status (see edgePresentation); selection adds a pink halo underneath so the status stroke
 * stays visible. The label appears only when selected; the tooltip explains the status.
 */
export const RelationEdge = memo(function RelationEdge({ id, source, target, data, selected }: EdgeProps<RelationFlowEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode || !data) return null;
  const { from, to } = circleSegment(circleOf(sourceNode), circleOf(targetNode));
  const path = `M ${from[0]},${from[1]} L ${to[0]},${to[1]}`;
  const p = data.presentation;
  return (
    <>
      {selected && (
        <path d={path} fill="none" stroke={SELECTION_COLOR} strokeOpacity={0.35} strokeWidth={p.strokeWidth + 8} strokeLinecap="round" />
      )}
      <path
        id={id}
        className="react-flow__edge-path"
        d={path}
        fill="none"
        style={{ stroke: p.stroke, strokeWidth: p.strokeWidth, ...(p.strokeDasharray ? { strokeDasharray: p.strokeDasharray } : {}) }}
      />
      <path className="react-flow__edge-interaction" d={path} fill="none" strokeOpacity={0} strokeWidth={EDGE_HIT_WIDTH}>
        <title>{p.title}</title>
      </path>
      {selected && (
        <EdgeLabelRenderer>
          <div
            className="sgl-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${(from[0] + to[0]) / 2}px, ${(from[1] + to[1]) / 2}px)` }}
          >
            {p.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
