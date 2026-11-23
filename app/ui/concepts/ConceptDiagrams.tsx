import type { ReactNode } from 'react';
import type { ConceptId } from './concepts';

/**
 * Simple inline SVG diagrams for the concept dialogs. Drawn with CSS classes (`.sgl-dg-*` in
 * ui.css) so they follow the design tokens; no images, no external files.
 */
const W = 300;
const H = 120;

function Caption({ x, y, children }: { readonly x: number; readonly y: number; readonly children: ReactNode }) {
  return (
    <text x={x} y={y} className="sgl-dg-caption" textAnchor="middle">
      {children}
    </text>
  );
}

/** Plan of two rooms; `kind` decides what the shared wall becomes. */
function RoomPair({ x, kind }: { readonly x: number; readonly kind: 'access' | 'open' }) {
  const y = 18;
  const w = 56;
  const h = 64;
  return (
    <g>
      <rect x={x} y={y} width={w * 2} height={h} className={kind === 'open' ? 'sgl-dg-room sgl-dg-room-merged' : 'sgl-dg-room'} />
      {kind === 'access' ? (
        <>
          <line x1={x + w} y1={y} x2={x + w} y2={y + 22} className="sgl-dg-wall" />
          <line x1={x + w} y1={y + 42} x2={x + w} y2={y + h} className="sgl-dg-wall" />
          <path d={`M${x + w} ${y + 22} A20 20 0 0 1 ${x + w + 20} ${y + 42}`} className="sgl-dg-door" />
          <line x1={x + w} y1={y + 22} x2={x + w + 20} y2={y + 22} className="sgl-dg-door" />
        </>
      ) : (
        <line x1={x + w} y1={y} x2={x + w} y2={y + h} className="sgl-dg-removed" />
      )}
      <Caption x={x + w} y={y + h + 18}>
        {kind === 'access' ? 'Access: wall with a door' : 'Open: no wall'}
      </Caption>
    </g>
  );
}

function AccessOpen() {
  return (
    <>
      <RoomPair x={14} kind="access" />
      <RoomPair x={W - 14 - 112} kind="open" />
    </>
  );
}

function ProjectScenario() {
  return (
    <>
      <rect x={8} y={6} width={W - 16} height={H - 12} rx={8} className="sgl-dg-frame" />
      <text x={20} y={26} className="sgl-dg-label">
        Project
      </text>
      <text x={20} y={44} className="sgl-dg-small">
        Functions · Attribute fields · Settings
      </text>
      {['A', 'B', 'C'].map((name, i) => (
        <g key={name}>
          <rect x={22 + i * 90} y={56} width={76} height={46} rx={5} className={i === 0 ? 'sgl-dg-card sgl-dg-card-active' : 'sgl-dg-card'} />
          <text x={60 + i * 90} y={76} className="sgl-dg-label" textAnchor="middle">
            Scenario {name}
          </text>
          <text x={60 + i * 90} y={93} className="sgl-dg-small" textAnchor="middle">
            own nodes
          </text>
        </g>
      ))}
    </>
  );
}

function CalculatedValues() {
  return (
    <>
      <rect x={10} y={16} width={104} height={30} rx={5} className="sgl-dg-input" />
      <text x={62} y={36} className="sgl-dg-label" textAnchor="middle">
        Size 2 × 2
      </text>
      <rect x={10} y={60} width={104} height={30} rx={5} className="sgl-dg-input" />
      <text x={62} y={80} className="sgl-dg-label" textAnchor="middle">
        3 edges
      </text>
      <path d="M120 31 C150 31 150 53 176 53 M120 75 C150 75 150 53 176 53" className="sgl-dg-arrow" />
      <path d="M170 48 L178 53 L170 58" className="sgl-dg-arrow" />
      <rect x={182} y={30} width={108} height={46} rx={5} className="sgl-dg-calc" />
      <text x={236} y={50} className="sgl-dg-label" textAnchor="middle">
        Area 36 m²
      </text>
      <text x={236} y={67} className="sgl-dg-small" textAnchor="middle">
        Degree 3 · read-only
      </text>
      <Caption x={62} y={110}>
        you edit
      </Caption>
      <Caption x={236} y={110}>
        calculated
      </Caption>
    </>
  );
}

function Module({ x, y, w, h }: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} className="sgl-dg-module" />
      <rect x={x + w * 0.2} y={y + h * 0.2} width={w * 0.6} height={h * 0.55} className="sgl-dg-glass" />
    </g>
  );
}

function RepeatStretch() {
  const x = 70;
  const len = 210;
  return (
    <>
      <text x={8} y={33} className="sgl-dg-label">
        Repeat
      </text>
      {[0, 1, 2, 3].map((i) => (
        <Module key={i} x={x + (i * len) / 4} y={12} w={len / 4} h={36} />
      ))}
      <text x={8} y={89} className="sgl-dg-label">
        Stretch
      </text>
      <Module x={x} y={68} w={len} h={36} />
    </>
  );
}

const DIAGRAMS: Readonly<Record<ConceptId, () => ReactNode>> = {
  'access-open': AccessOpen,
  'project-scenario': ProjectScenario,
  'calculated-values': CalculatedValues,
  'repeat-stretch': RepeatStretch,
};

export function ConceptDiagram({ id, label }: { readonly id: ConceptId; readonly label: string }) {
  const Diagram = DIAGRAMS[id];
  return (
    <svg className="sgl-dg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} data-diagram={id}>
      <Diagram />
    </svg>
  );
}
