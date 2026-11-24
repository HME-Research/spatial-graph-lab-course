import { EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react';
import { memo } from 'react';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { ANALYSIS_HIGHLIGHT } from '../presentation/vocabulary';
import { circleSegment, type Circle } from './diagram';
import type { EdgePresentation } from './edgePresentation';
import { BASE_NODE_DIAMETER } from './NodeDisplay';

export type RelationEdgeData = {
  readonly presentation: EdgePresentation;
  /** "Remove invalid edges" preview: this relationship is checked for removal. */
  readonly removePreview?: boolean;
  /** Highlighted by the shown analysis (P4: a path, a bridge, a node's edges…). */
  readonly analysed?: boolean;
  /** Selected edge only (2026-11-24): swap its source and target (one undo step). */
  readonly onReverse?: () => void;
};
export type RelationFlowEdge = Edge<RelationEdgeData, 'relation'>;

/** Width of the invisible stroke that receives clicks and hover. */
export const EDGE_HIT_WIDTH = 16;

/** Half-length of the direction chevron's arms (px) and where along the edge it sits (0 = source, 1 = target; past the label a selected edge shows in its middle). */
const CHEVRON = 6;
const CHEVRON_AT = 0.8;

/**
 * A small chevron pointing from source to target (2026-11-24): the edge's orientation convention
 * (doors swing into the target; boundary shifts name source and target). Not a directed relation:
 * shown only while the edge is hovered or selected (CSS), so the diagram stays undirected.
 */
export function directionChevron(from: readonly [number, number], to: readonly [number, number]): string | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < CHEVRON * 4) return null;
  const ux = dx / len;
  const uy = dy / len;
  const tip = [from[0] + dx * CHEVRON_AT + ux * CHEVRON * 0.5, from[1] + dy * CHEVRON_AT + uy * CHEVRON * 0.5];
  const back = [tip[0]! - ux * CHEVRON, tip[1]! - uy * CHEVRON];
  const r = (n: number) => Math.round(n * 100) / 100;
  return `M ${r(back[0]! - uy * CHEVRON)},${r(back[1]! + ux * CHEVRON)} L ${r(tip[0]!)},${r(tip[1]!)} L ${r(back[0]! + uy * CHEVRON)},${r(back[1]! - ux * CHEVRON)}`;
}

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
  const chevron = directionChevron(from, to);
  return (
    <>
      {data.removePreview && (
        <path
          className="sgl-edge-remove-preview"
          d={path}
          fill="none"
          stroke={p.stroke}
          strokeOpacity={0.22}
          strokeWidth={p.strokeWidth * 4 + 8}
          strokeLinecap="round"
          data-remove-preview={id}
        />
      )}
      {data.analysed && (
        <path className="sgl-edge-analysed" d={path} fill="none" stroke={ANALYSIS_HIGHLIGHT} strokeOpacity={0.55} strokeWidth={p.strokeWidth * 3 + 6} strokeLinecap="round" data-analysed={id} />
      )}
      {selected && (
        // The halo scales with the kind's own weight, so a selected Open (heavier) still reads heavier
        // than a selected Access (audit m7); the kind stroke itself is drawn on top unchanged.
        <path d={path} fill="none" stroke={SELECTION_COLOR} strokeOpacity={0.3} strokeWidth={p.strokeWidth * 3 + 3} strokeLinecap="round" />
      )}
      <path
        id={id}
        className="react-flow__edge-path"
        d={path}
        fill="none"
        style={{ stroke: p.stroke, strokeWidth: p.strokeWidth, ...(p.strokeDasharray ? { strokeDasharray: p.strokeDasharray } : {}) }}
      />
      {chevron && (
        <path className="sgl-edge-direction" d={chevron} fill="none" stroke={p.stroke} strokeWidth={Math.max(1.5, p.strokeWidth)} strokeLinecap="round" strokeLinejoin="round" data-edge-direction={id} />
      )}
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
            {data.onReverse && (
              <button
                type="button"
                className="sgl-edge-reverse"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onReverse?.();
                }}
                title={`Reverse: make ${p.target} the source and ${p.source} the target (same edge). Its door then swings the other way.`}
                aria-label="Reverse source and target"
              >
                ⇄
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
