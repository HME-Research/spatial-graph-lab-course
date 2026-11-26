import type { ReactNode } from 'react';
import './diagrams.css';

/**
 * The Guide's small diagrams (Programme P4, item H; owner 2026-11-20: generic, two cases each).
 * Explanations never use the built-in example house: every graph, plan and 3D diagram is a small
 * purpose-made example with neutral rooms A, B, C… (or a generic room word where a Function is the
 * point), and most entries show TWO diagrams side by side that contrast two values or cases (e.g.
 * Shared neighbours 0 vs 1). Functions use the House toolkit colours; generic rooms a neutral grey.
 *
 * Panel diagrams are small static mock-ups styled like the app's panels (section headers,
 * collapsible sections, tags). Every diagram is one `role="img"` with a text alternative; nothing
 * inside is interactive. Numbered circles use the same numbers as the entry's steps and its
 * screenshot markers.
 */

/** The House toolkit's function colours (owner 2026-11-20); each function distinct. */
const FN_FILL: Readonly<Record<string, string>> = {
  entrance: '#8e6bb8',
  living: '#e8a33d',
  kitchen: '#d4623b',
  bedroom: '#4f7cc0',
  bath: '#3fa9b5',
  circulation: '#9b9a8f',
};
/** Functions dark enough to need a light label on top. */
const DARK_FN = new Set(['entrance', 'kitchen', 'bedroom']);
/** A generic room (no Function shown). */
const NEUTRAL = '#dfe3e8';
const CELL_LINE = '#9aa0a8';

// ── Small building blocks ─────────────────────────────────────────────────────────────────────

function Svg({ w, h, alt, children }: { readonly w: number; readonly h: number; readonly alt: string; readonly children: ReactNode }) {
  return (
    <svg className="sgl-gd" viewBox={`0 0 ${w} ${h}`} width={w} role="img" aria-label={alt}>
      {children}
    </svg>
  );
}

const Cap = ({ x, y, children, anchor = 'start' }: { readonly x: number; readonly y: number; readonly children: ReactNode; readonly anchor?: 'start' | 'middle' | 'end' }) => (
  <text className="sgl-gd-cap" x={x} y={y} textAnchor={anchor}>
    {children}
  </text>
);

const Txt = ({ x, y, children, anchor = 'middle', cls = '' }: { readonly x: number; readonly y: number; readonly children: ReactNode; readonly anchor?: 'start' | 'middle' | 'end'; readonly cls?: string }) => (
  <text className={`sgl-gd-t ${cls}`.trim()} x={x} y={y} textAnchor={anchor}>
    {children}
  </text>
);

// ── Generic graphs ────────────────────────────────────────────────────────────────────────────

/**
 * A small generic graph, written compactly: `nodes` "A 30 50, B 90 50" (id x y), `edges`
 * "A-B, B-C". Options name nodes / edges with the same ids: `hl` (teal) and `hlB` (gold) colour
 * nodes, `he` / `heB` edges; `sel` / `selEdge` get the pink selection; `open` edges are drawn
 * heavier (Open relationships), `dash` edges dashed, `fade` nodes faded; `fn` gives a node a
 * Function colour, `badge` a number or word beside it.
 */
interface NetOpts {
  readonly w?: number;
  readonly h?: number;
  readonly hl?: string;
  readonly hlB?: string;
  readonly he?: string;
  readonly heB?: string;
  readonly sel?: string;
  readonly selEdge?: string;
  readonly open?: string;
  readonly dash?: string;
  readonly fade?: string;
  readonly fn?: Readonly<Record<string, string>>;
  readonly badge?: Readonly<Record<string, string>>;
}

const words = (s: string | undefined): string[] => (s ?? '').split(/[\s,]+/).filter(Boolean);
const edgeKey = (a: string, b: string) => [a, b].sort().join('-');
const splitEdge = (e: string) => e.split('-') as [string, string];
const edgeSet = (s: string | undefined) => new Set(words(s).map((e) => edgeKey(...splitEdge(e))));

function NetBody({ nodes, edges, o }: { readonly nodes: string; readonly edges: string; readonly o: NetOpts }) {
  const pos = new Map<string, [number, number]>();
  for (const part of nodes.split(',').map((p) => p.trim()).filter(Boolean)) {
    const [id, x, y] = part.split(/\s+/);
    pos.set(id!, [Number(x), Number(y)]);
  }
  const hl = new Set(words(o.hl));
  const hlB = new Set(words(o.hlB));
  const fade = new Set(words(o.fade));
  const he = edgeSet(o.he);
  const heB = edgeSet(o.heB);
  const open = edgeSet(o.open);
  const dash = edgeSet(o.dash);
  const sel = o.selEdge ? edgeKey(...splitEdge(o.selEdge)) : undefined;
  return (
    <g>
      {words(edges).map((e) => {
        const [a, b] = splitEdge(e);
        const k = edgeKey(a, b);
        const [x1, y1] = pos.get(a)!;
        const [x2, y2] = pos.get(b)!;
        const c = ['sgl-gd-e', open.has(k) && 'open', he.has(k) && 'hl', heB.has(k) && 'hlB', sel === k && 'sel', dash.has(k) && 'dash', (fade.has(a) || fade.has(b)) && 'fade'].filter(Boolean).join(' ');
        return <line key={k} className={c} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {[...pos].map(([id, [x, y]]) => {
        const fn = o.fn?.[id];
        const on = hl.has(id) ? 'hl' : hlB.has(id) ? 'hlB' : '';
        return (
          <g key={id} className={fade.has(id) ? 'fade' : undefined}>
            {o.sel === id && <circle className="sgl-gd-selring" cx={x} cy={y} r={16} />}
            <circle className={`sgl-gd-n ${on}`.trim()} cx={x} cy={y} r={12} style={on ? undefined : { fill: fn ? FN_FILL[fn] : NEUTRAL }} />
            <text className={`sgl-gd-id${!on && fn && DARK_FN.has(fn) ? ' light' : ''}`} x={x} y={y + 4} textAnchor="middle">
              {id}
            </text>
            {o.badge?.[id] !== undefined && (
              <text className="sgl-gd-badge" x={x + 15} y={y - 11}>
                {o.badge[id]}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function Net({ alt, nodes, edges, children, ...o }: NetOpts & { readonly alt: string; readonly nodes: string; readonly edges: string; readonly children?: ReactNode }) {
  return (
    <Svg w={o.w ?? 220} h={o.h ?? 110} alt={alt}>
      <NetBody nodes={nodes} edges={edges} o={o} />
      {children}
    </Svg>
  );
}

/** Layouts used again and again. */
const ROW5 = 'A 22 46, B 66 46, C 110 46, D 154 46, E 198 46';
const ROW5_E = 'A-B, B-C, C-D, D-E';
const ROW4 = 'A 30 46, B 83 46, C 137 46, D 190 46';
const ROW4_E = 'A-B, B-C, C-D';
const STAR = 'A 50 22, B 170 22, C 110 55, D 50 88, E 170 88';
const STAR_E = 'C-A, C-B, C-D, C-E';
const LOOP4 = 'A 60 24, B 160 24, C 160 86, D 60 86';
const LOOP4_E = 'A-B, B-C, C-D, D-A';
/** A path with a fork at the end: A–B–C, then C–D and C–E. */
const FORK = 'A 26 55, B 82 55, C 138 55, D 194 22, E 194 88';
const FORK_E = 'A-B, B-C, C-D, C-E';

// ── Plans (one storey, from above) ────────────────────────────────────────────────────────────

interface PlanRoom {
  readonly name: string;
  readonly fn?: string;
  /** Cells [x, y] in plan coordinates (y down). */
  readonly cells: readonly (readonly [number, number])[];
}

/** A plan: rooms of cells; outside walls; between rooms a door (access), nothing (open) or a solid wall. */
function Plan({
  rooms,
  rel = {},
  alt,
  extra,
  w = 220,
  h = 110,
  cell = 44,
  ox = 20,
  oy = 10,
}: {
  readonly rooms: readonly PlanRoom[];
  readonly rel?: Readonly<Record<string, 'access' | 'open'>>;
  readonly alt: string;
  readonly extra?: ReactNode;
  readonly w?: number;
  readonly h?: number;
  readonly cell?: number;
  readonly ox?: number;
  readonly oy?: number;
}) {
  const C = cell;
  const at = new Map<string, string>();
  for (const r of rooms) for (const [x, y] of r.cells) at.set(`${x},${y}`, r.name);
  const fills: ReactNode[] = [];
  const walls: ReactNode[] = [];
  const labels: ReactNode[] = [];
  for (const r of rooms) {
    r.cells.forEach(([x, y], i) => fills.push(<rect key={`${r.name}${i}`} className="sgl-gd-cell" x={ox + x * C} y={oy + y * C} width={C} height={C} style={{ fill: r.fn ? FN_FILL[r.fn] : NEUTRAL }} />));
    const cx = r.cells.reduce((a, c) => a + c[0], 0) / r.cells.length;
    const cy = r.cells.reduce((a, c) => a + c[1], 0) / r.cells.length;
    labels.push(
      <text key={`l${r.name}`} className="sgl-gd-t strong" x={ox + (cx + 0.5) * C} y={oy + (cy + 0.5) * C + 4} textAnchor="middle" style={r.fn && DARK_FN.has(r.fn) ? { fill: '#fff' } : undefined}>
        {r.name}
      </text>,
    );
  }
  for (const [key, name] of at) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    for (const [ddx, ddy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const other = at.get(`${x + ddx},${y + ddy}`);
      const x1 = ox + (ddx === 1 ? x + 1 : x) * C;
      const y1 = oy + (ddy === 1 ? y + 1 : y) * C;
      const x2 = ddx !== 0 ? x1 : x1 + C;
      const y2 = ddy !== 0 ? y1 : y1 + C;
      const k = `${key}${ddx}${ddy}`;
      if (other === undefined) {
        walls.push(<line key={k} className="sgl-gd-wall" x1={x1} y1={y1} x2={x2} y2={y2} />);
        continue;
      }
      if (other === name || ddx === -1 || ddy === -1) continue; // each shared face once
      const kind = rel[[name, other].sort().join('|')];
      if (kind === 'open') walls.push(<line key={k} className="sgl-gd-wall open" x1={x1} y1={y1} x2={x2} y2={y2} />);
      else if (kind === 'access') {
        const mx1 = x1 + (x2 - x1) / 3;
        const my1 = y1 + (y2 - y1) / 3;
        const mx2 = x1 + (2 * (x2 - x1)) / 3;
        const my2 = y1 + (2 * (y2 - y1)) / 3;
        walls.push(<line key={`${k}a`} className="sgl-gd-wall" x1={x1} y1={y1} x2={mx1} y2={my1} />, <line key={`${k}b`} className="sgl-gd-wall" x1={mx2} y1={my2} x2={x2} y2={y2} />);
      } else walls.push(<line key={k} className="sgl-gd-wall inner" x1={x1} y1={y1} x2={x2} y2={y2} />);
    }
  }
  return (
    <Svg w={w} h={h} alt={alt}>
      {fills}
      {walls}
      {labels}
      {extra}
    </Svg>
  );
}

const TWO: readonly PlanRoom[] = [
  { name: 'A', cells: [[0, 0]] },
  { name: 'B', cells: [[1, 0]] },
];

/** Two rooms as a graph (top) and as a plan (below): Access, Open or no relationship. */
function GraphAndPlan({ rel, alt }: { readonly rel: 'access' | 'open' | 'none'; readonly alt: string }) {
  return (
    <Plan
      rooms={TWO}
      rel={rel === 'none' ? {} : { 'A|B': rel }}
      alt={alt}
      h={112}
      ox={66}
      oy={52}
      extra={
        <>
          <NetBody nodes="A 88 20, B 132 20" edges={rel === 'none' ? '' : 'A-B'} o={{ open: rel === 'open' ? 'A-B' : '' }} />
          <Cap x={8} y={24}>
            graph
          </Cap>
          <Cap x={8} y={78}>
            plan
          </Cap>
        </>
      }
    />
  );
}

// ── Oblique 3D ────────────────────────────────────────────────────────────────────────────────

type Pt = [number, number];
type Project = (x: number, y: number, z: number) => Pt;
/** Oblique projection: grid x → right, grid y → back (up and to the right), z → up. */
const oblique =
  (s: number, ox: number, oy: number): Project =>
  (x, y, z) => [ox + x * s + y * s * 0.55, oy - z * s - y * s * 0.4];
const pts = (list: readonly Pt[]) => list.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
const at = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

/** One cell: its front (y), top (z + 1) and right (x + 1) faces. `roofless` draws an open box. */
function Cube({ P, x, y, z, fill, solid, roofless }: { readonly P: Project; readonly x: number; readonly y: number; readonly z: number; readonly fill: string; readonly solid?: boolean; readonly roofless?: boolean }) {
  const front = pts([P(x, y, z), P(x + 1, y, z), P(x + 1, y, z + 1), P(x, y, z + 1)]);
  const top = pts([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)]);
  const side = pts([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)]);
  if (roofless) {
    const floor = pts([P(x, y, z), P(x + 1, y, z), P(x + 1, y + 1, z), P(x, y + 1, z)]);
    const back = pts([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)]);
    const left = pts([P(x, y, z), P(x, y + 1, z), P(x, y + 1, z + 1), P(x, y, z + 1)]);
    return (
      <g className="sgl-gd-cube solid">
        <polygon className="s" points={back} style={{ fill }} />
        <polygon className="s" points={left} style={{ fill }} />
        <polygon points={floor} style={{ fill: '#f4f1ea' }} />
        <polygon points={front} style={{ fill, fillOpacity: 0.2 }} />
        <polygon points={side} style={{ fill, fillOpacity: 0.2 }} />
      </g>
    );
  }
  return (
    <g className={`sgl-gd-cube${solid ? ' solid' : ''}`}>
      <polygon className="f" points={front} style={{ fill }} />
      <polygon className="t" points={top} style={{ fill }} />
      <polygon className="s" points={side} style={{ fill }} />
    </g>
  );
}

type CellSpec = readonly [x: number, y: number, z: number, fill: string];
/** Cells in painting order: back to front, bottom to top, left to right. */
const painted = (cells: readonly CellSpec[]) => [...cells].sort((a, b) => b[1] - a[1] || a[2] - b[2] || a[0] - b[0]);

function Cubes({ cells, alt, solid, roofless, children, h = 120 }: { readonly cells: readonly CellSpec[]; readonly alt: string; readonly solid?: boolean; readonly roofless?: boolean; readonly children?: ReactNode; readonly h?: number }) {
  const P = oblique(40, 40, h - 22);
  return (
    <Svg w={220} h={h} alt={alt}>
      {painted(cells).map(([x, y, z, fill]) => (
        <Cube key={`${x}${y}${z}`} P={P} x={x} y={y} z={z} fill={fill} {...(solid && { solid })} {...(roofless && { roofless })} />
      ))}
      {children}
    </Svg>
  );
}

// ── Panel mock-ups ────────────────────────────────────────────────────────────────────────────

function Mock({ alt, title, children }: { readonly alt: string; readonly title?: string; readonly children: ReactNode }) {
  return (
    <div className="sgl-gd-panel" role="img" aria-label={alt}>
      <div aria-hidden="true">
        {title !== undefined && <div className="sgl-gd-ptitle">{title}</div>}
        {children}
      </div>
    </div>
  );
}

function MNum({ n }: { readonly n: number }) {
  return <span className="sgl-gd-num">{n}</span>;
}

/** A section header like the app's: chevron (collapsible) or thin divider, title, subtitle, ⓘ, "+". */
function MSec({
  title,
  sub,
  open,
  plain,
  plus,
  n,
  children,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly open?: boolean;
  /** Not collapsible (attribute sections): a thin divider and a small title. */
  readonly plain?: boolean;
  readonly plus?: boolean;
  readonly n?: number;
  readonly children?: ReactNode;
}) {
  return (
    <div className={`sgl-gd-sec${plain ? ' plain' : ''}`}>
      <div className="sgl-gd-sechead">
        {!plain && <span className="sgl-gd-chev">{open ? '▾' : '▸'}</span>}
        <span className="sgl-gd-sectitle">{title}</span>
        <span className="sgl-gd-info">i</span>
        {plus && <span className="sgl-gd-plus">+</span>}
        {n !== undefined && <MNum n={n} />}
        {sub !== undefined && <span className="sgl-gd-secsub">{sub}</span>}
      </div>
      {(open || plain) && children !== undefined && <div className="sgl-gd-secbody">{children}</div>}
    </div>
  );
}

function MRow({ label, value, tag, lock, hl, n, faded }: { readonly label: string; readonly value?: ReactNode; readonly tag?: string; readonly lock?: boolean; readonly hl?: boolean; readonly n?: number; readonly faded?: boolean }) {
  return (
    <div className={`sgl-gd-row${hl ? ' hl' : ''}`}>
      <span className="sgl-gd-rlabel">{label}</span>
      {value !== undefined && <span className={`sgl-gd-rvalue${faded ? ' faded' : ''}`}>{value}</span>}
      {lock && <span className="sgl-gd-lock">🔒</span>}
      {tag !== undefined && <span className="sgl-gd-tag">{tag}</span>}
      {n !== undefined && <MNum n={n} />}
    </div>
  );
}

const MBtn = ({ children, primary, n }: { readonly children: ReactNode; readonly primary?: boolean; readonly n?: number }) => (
  <span className={`sgl-gd-btn${primary ? ' primary' : ''}`}>
    {children}
    {n !== undefined && <MNum n={n} />}
  </span>
);

const MSeg = ({ items, on }: { readonly items: readonly string[]; readonly on: string }) => (
  <span className="sgl-gd-seg">
    {items.map((i) => (
      <span key={i} className={i === on ? 'on' : undefined}>
        {i}
      </span>
    ))}
  </span>
);

/** A numbered strip of steps (How to…). */
function Steps({ labels, alt }: { readonly labels: readonly string[]; readonly alt: string }) {
  return (
    <ol className="sgl-gd-steps" aria-label={alt}>
      {labels.map((l, i) => (
        <li key={i}>
          <MNum n={i + 1} />
          <span>{l}</span>
        </li>
      ))}
    </ol>
  );
}

function Code({ lines, alt }: { readonly lines: readonly (readonly [string, boolean?])[]; readonly alt: string }) {
  return (
    <pre className="sgl-gd-code" role="img" aria-label={alt}>
      <code aria-hidden="true">
        {lines.map(([t, hl], i) => (
          <span key={i} className={hl ? 'hl' : undefined}>
            {t}
            {'\n'}
          </span>
        ))}
      </code>
    </pre>
  );
}

// ── Diagram makers shared by several entries ──────────────────────────────────────────────────

/** Grid cells with the size and area written under them. */
function SizeCells({ cols, rows, alt, area, size }: { readonly cols: number; readonly rows: number; readonly alt: string; readonly area: string; readonly size: string }) {
  const C = 30;
  const ox = 110 - (cols * C) / 2;
  const cells: ReactNode[] = [];
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) cells.push(<rect key={`${x}${y}`} className="sgl-gd-cell" x={ox + x * C} y={8 + y * C} width={C} height={C} style={{ fill: NEUTRAL, stroke: CELL_LINE }} />);
  return (
    <Svg w={220} h={112} alt={alt}>
      {cells}
      <rect x={ox} y={8} width={cols * C} height={rows * C} fill="none" className="sgl-gd-wall" />
      <Txt x={110} y={8 + rows * C + 18} cls="strong">
        {size}
      </Txt>
      <Txt x={110} y={8 + rows * C + 32}>
        {area}
      </Txt>
    </Svg>
  );
}

/** The Grow to target area example: Living (target 36), Bedroom (18), Bath (9), before or after. */
function Grow({ after }: { readonly after: boolean }) {
  const C = 26;
  const cell = (x: number, y: number, fn: string, grown = false) => <rect key={`${x}-${y}`} className={`sgl-gd-cell${grown ? ' grow' : ''}`} x={34 + x * C} y={14 + y * C} width={C} height={C} style={{ fill: FN_FILL[fn] }} />;
  return (
    <Svg
      w={220}
      h={112}
      alt={
        after
          ? 'After Grow to target area: the Living room has grown from 1 cell to 4 (36 m²), the Bedroom from 1 to 2 (18 m²); the Bath stays 1 cell (9 m²). New cells are dashed.'
          : 'Before Grow to target area: a Living room, a Bedroom and a Bath, each one cell of 9 m², with targets 36, 18 and 9 m².'
      }
    >
      {after ? (
        <>
          {cell(0, 1, 'living')}
          {cell(1, 1, 'living', true)}
          {cell(0, 0, 'living', true)}
          {cell(1, 0, 'living', true)}
          {cell(2, 1, 'bedroom')}
          {cell(3, 1, 'bedroom', true)}
          {cell(4, 1, 'bath')}
        </>
      ) : (
        <>
          {cell(0, 1, 'living')}
          {cell(2, 1, 'bedroom')}
          {cell(4, 1, 'bath')}
        </>
      )}
      <Cap x={34} y={86}>
        Living {after ? '36' : '9'} · Bedroom {after ? '18' : '9'} · Bath 9 m²
      </Cap>
      <Cap x={34} y={100}>
        targets 36 · 18 · 9 m² (1 cell = 9 m²)
      </Cap>
    </Svg>
  );
}

/** Two rooms seen from the front, cut through: the wall between them has a door or is solid. */
function Section({ door, alt }: { readonly door: boolean; readonly alt: string }) {
  return (
    <Svg w={220} h={112} alt={alt}>
      <rect className="sgl-gd-cell" x={20} y={20} width={180} height={70} style={{ fill: NEUTRAL }} />
      <rect x={20} y={20} width={180} height={70} fill="none" className="sgl-gd-wall" />
      {door ? (
        <>
          <line className="sgl-gd-wall" x1={110} y1={20} x2={110} y2={42} />
          <rect x={104} y={42} width={12} height={48} fill="#fff" stroke="#2b2b28" strokeWidth={1} />
        </>
      ) : (
        <line className="sgl-gd-wall" x1={110} y1={20} x2={110} y2={90} />
      )}
      <Txt x={65} y={60} cls="strong">
        A
      </Txt>
      <Txt x={155} y={60} cls="strong">
        B
      </Txt>
      <Cap x={110} y={106} anchor="middle">
        {door ? 'Access: a door' : 'no edge: a solid wall'}
      </Cap>
    </Svg>
  );
}

/** A corridor between two rooms one cell apart, from above: its own side walls, or none. */
function Corridor({ enclosed }: { readonly enclosed: boolean }) {
  return (
    <Svg
      w={220}
      h={100}
      alt={
        enclosed
          ? 'From above: rooms A and B one cell apart, joined by a generated corridor with walls on both long sides (Walls Enclosed).'
          : 'From above: rooms A and B one cell apart, joined by a generated corridor with no side walls, only posts at its corners (Walls Open).'
      }
    >
      <rect className="sgl-gd-cell" x={20} y={20} width={56} height={56} style={{ fill: NEUTRAL }} />
      <rect className="sgl-gd-cell" x={144} y={20} width={56} height={56} style={{ fill: NEUTRAL }} />
      <rect x={20} y={20} width={56} height={56} fill="none" className="sgl-gd-wall" />
      <rect x={144} y={20} width={56} height={56} fill="none" className="sgl-gd-wall" />
      <rect className="sgl-gd-cell corridor" x={76} y={36} width={68} height={24} />
      {enclosed ? (
        <>
          <line className="sgl-gd-wall inner" x1={76} y1={36} x2={144} y2={36} />
          <line className="sgl-gd-wall inner" x1={76} y1={60} x2={144} y2={60} />
        </>
      ) : (
        [80, 140].flatMap((x) => [36, 60].map((y) => <rect key={`${x}${y}`} x={x - 2.5} y={y - 2.5} width={5} height={5} fill="#2b2b28" />))
      )}
      <Txt x={48} y={52} cls="strong">
        A
      </Txt>
      <Txt x={172} y={52} cls="strong">
        B
      </Txt>
      <Cap x={110} y={94} anchor="middle">
        {enclosed ? 'Walls Enclosed' : 'Walls Open'}
      </Cap>
    </Svg>
  );
}

/** Routes through it on a row of five: the selected edge, its two sides in two colours. */
function Routes({ middle }: { readonly middle: boolean }) {
  return middle ? (
    <Net
      alt="Nodes A to E in a row; edge B–C selected. A and B (2 nodes) are on B's side, coloured teal; C, D and E (3 nodes) are on C's side, coloured gold: 2 · 3, and 2 × 3 = 6 trips use it."
      nodes={ROW5}
      edges={ROW5_E}
      selEdge="B-C"
      hl="A B"
      hlB="C D E"
    >
      <Txt x={44} y={82} cls="strong">
        2
      </Txt>
      <Txt x={154} y={82} cls="strong">
        3
      </Txt>
      <Cap x={110} y={102} anchor="middle">
        2 · 3 · 2 × 3 = 6 trips
      </Cap>
    </Net>
  ) : (
    <Net
      alt="Nodes A to E in a row; edge A–B selected. Only A is on A's side, coloured teal; B, C, D and E (4 nodes) are on B's side, coloured gold: 1 · 4, and 1 × 4 = 4 trips use it."
      nodes={ROW5}
      edges={ROW5_E}
      selEdge="A-B"
      hl="A"
      hlB="B C D E"
    >
      <Txt x={22} y={82} cls="strong">
        1
      </Txt>
      <Txt x={132} y={82} cls="strong">
        4
      </Txt>
      <Cap x={110} y={102} anchor="middle">
        1 · 4 · 1 × 4 = 4 trips
      </Cap>
    </Net>
  );
}

/** Two separate groups, or one. */
function Parts({ two }: { readonly two: boolean }) {
  const nodes = 'A 30 30, B 80 30, C 55 80, D 150 30, E 192 80';
  return two ? (
    <Net alt="Two groups with no edge between them: A, B and C joined in one, D and E in the other: 2 connected parts, the second coloured." nodes={nodes} edges="A-B, B-C, C-A, D-E" hlB="D E" heB="D-E">
      <rect className="sgl-gd-frame" x={10} y={10} width={92} height={90} rx={10} />
      <rect className="sgl-gd-frame hl" x={128} y={10} width={86} height={90} rx={10} />
    </Net>
  ) : (
    <Net alt="Five nodes A to E all joined into one group: 1 connected part; every node can reach every other." nodes={nodes} edges="A-B, B-C, C-A, B-D, D-E">
      <rect className="sgl-gd-frame" x={10} y={10} width={204} height={90} rx={10} />
    </Net>
  );
}

/** Shortest path: next door, or three steps away. */
function PathDiagram({ long }: { readonly long: boolean }) {
  return long ? (
    <Net alt="Shortest path from A to D in a row A–B–C–D: 3 steps, A → B → C → D, highlighted." nodes={ROW4} edges={ROW4_E} hl="A D" hlB="B C" he="A-B, B-C, C-D" badge={{ A: 'From', D: 'To' }} />
  ) : (
    <Net alt="Shortest path from A to B in a row A–B–C–D: 1 step, the edge A–B, highlighted." nodes={ROW4} edges={ROW4_E} hl="A B" he="A-B" badge={{ A: 'From', B: 'To' }} />
  );
}

/** Analyse (reads) or Transform (previews, Apply, Undo). */
function Flow({ transform }: { readonly transform: boolean }) {
  return transform ? (
    <Svg w={220} h={80} alt="Transform: design to preview to Apply; the design changes, and one Undo reverses it.">
      <rect className="sgl-gd-box" x={4} y={20} width={54} height={28} rx={6} />
      <Txt x={31} y={38}>
        Design
      </Txt>
      <path className="sgl-gd-arrow" d="M60 34 h10 m-4 -4 l4 4 l-4 4" />
      <rect className="sgl-gd-box" x={72} y={20} width={58} height={28} rx={6} />
      <Txt x={101} y={38}>
        Preview
      </Txt>
      <path className="sgl-gd-arrow" d="M132 34 h10 m-4 -4 l4 4 l-4 4" />
      <rect className="sgl-gd-box hl" x={144} y={20} width={48} height={28} rx={6} />
      <Txt x={168} y={38}>
        Apply
      </Txt>
      <Cap x={110} y={70} anchor="middle">
        changes the design · ↶ one Undo
      </Cap>
    </Svg>
  ) : (
    <Svg w={220} h={80} alt="Analyse: design to result; the design is unchanged.">
      <rect className="sgl-gd-box" x={20} y={20} width={66} height={28} rx={6} />
      <Txt x={53} y={38}>
        Design
      </Txt>
      <path className="sgl-gd-arrow" d="M90 34 h30 m-5 -4 l5 4 l-5 4" />
      <rect className="sgl-gd-box hl" x={124} y={20} width={66} height={28} rx={6} />
      <Txt x={157} y={38}>
        Result
      </Txt>
      <Cap x={110} y={70} anchor="middle">
        reads only · design unchanged
      </Cap>
    </Svg>
  );
}

/** Three rooms in a row, as a small plan (Graph 2D drag: the plan does not change). */
function RowPlan({ y }: { readonly y: number }) {
  return (
    <>
      {['A', 'B', 'C'].map((n, i) => (
        <g key={n}>
          <rect className="sgl-gd-cell" x={44 + i * 44} y={y} width={44} height={40} style={{ fill: NEUTRAL, stroke: CELL_LINE }} />
          <Txt x={66 + i * 44} y={y + 24} cls="strong">
            {n}
          </Txt>
        </g>
      ))}
    </>
  );
}

// ── The diagrams, by id ───────────────────────────────────────────────────────────────────────

const D: Record<string, () => ReactNode> = {
  // ── Graphs ──
  'graph-none': () => <Net alt="Four nodes A, B, C and D as circles with no lines between them: nothing is related yet." nodes={LOOP4} edges="" />,
  'graph-some': () => <Net alt="The same four nodes with four lines, A–B, B–C, B–D and C–D: a graph saying which nodes are related." nodes={LOOP4} edges="A-B, B-C, B-D, C-D" />,
  'node-one-cell': () => (
    <Svg w={220} h={100} alt="Node 1: its room fills one grid cell; it is one node, numbered 1.">
      <rect className="sgl-gd-cell" x={88} y={14} width={44} height={44} style={{ fill: NEUTRAL, stroke: CELL_LINE }} />
      <NetBody nodes="1 110 36" edges="" o={{ hl: '1' }} />
      <Cap x={110} y={82} anchor="middle">
        1 cell · node 1
      </Cap>
    </Svg>
  ),
  'node-four-cells': () => (
    <Svg w={220} h={100} alt="Node 1: its room grown to four grid cells (2 × 2); still one node, still numbered 1.">
      {[0, 1].flatMap((x) => [0, 1].map((y) => <rect key={`${x}${y}`} className="sgl-gd-cell" x={74 + x * 36} y={4 + y * 36} width={36} height={36} style={{ fill: NEUTRAL, stroke: CELL_LINE }} />))}
      <NetBody nodes="1 110 40" edges="" o={{ hl: '1' }} />
      <Cap x={110} y={94} anchor="middle">
        4 cells · still node 1
      </Cap>
    </Svg>
  ),
  'edge-access': () => <GraphAndPlan rel="access" alt="Nodes A and B joined by an Access edge: a thin line in the graph, a door in the shared wall of their rooms in the plan." />,
  'edge-open': () => <GraphAndPlan rel="open" alt="Nodes A and B joined by an Open edge: a heavy line in the graph, no wall between their rooms in the plan (one space)." />,
  'attr-node': () => (
    <Svg w={220} h={96} alt="A node with its values written beside it: function bedroom, targetArea 18.">
      <NetBody nodes="1 34 46" edges="" o={{ fn: { 1: 'bedroom' } }} />
      <rect className="sgl-gd-tagbox" x={58} y={24} width={154} height={44} rx={4} />
      <text className="sgl-gd-t mono" x={66} y={42}>
        function: bedroom
      </text>
      <text className="sgl-gd-t mono" x={66} y={58}>
        targetArea: 18
      </text>
    </Svg>
  ),
  'attr-edge': () => (
    <Svg w={220} h={96} alt="An edge between nodes 1 and 2 with its value written under it: relationship access.">
      <NetBody nodes="1 50 30, 2 170 30" edges="1-2" o={{ he: '1-2' }} />
      <rect className="sgl-gd-tagbox" x={46} y={54} width={128} height={26} rx={4} />
      <text className="sgl-gd-t mono" x={56} y={71}>
        relationship: access
      </text>
    </Svg>
  ),
  'form-diagram': () => <Net alt="Edge 1 drawn as a line between nodes 1 and 2 in a small diagram of three nodes." nodes="1 40 50, 2 110 50, 3 180 50" edges="1-2, 2-3" he="1-2" hl="1 2" />,
  'form-data': () => (
    <Svg w={220} h={112} alt="The same edge 1 as a JSON record (id 1, source 1, target 2, relationship access) and as a highlighted table row.">
      <rect className="sgl-gd-codebox" x={4} y={4} width={212} height={50} rx={5} />
      {['{ "id": 1, "source": 1, "target": 2,', '  "relationship": "access" }'].map((t, i) => (
        <text key={i} className="sgl-gd-t mono hl" x={10} y={22 + i * 14} xmlSpace="preserve">
          {t}
        </text>
      ))}
      <rect className="sgl-gd-codebox" x={4} y={62} width={212} height={46} rx={5} />
      {['ID', 'Source', 'Target', 'Relationship'].map((t, i) => (
        <text key={t} className="sgl-gd-t strong" x={10 + [0, 26, 76, 126][i]!} y={78}>
          {t}
        </text>
      ))}
      <rect className="sgl-gd-rowhl" x={6} y={84} width={208} height={18} />
      {['1', '1', '2', 'Access'].map((t, i) => (
        <text key={i} className="sgl-gd-t" x={10 + [0, 26, 76, 126][i]!} y={97}>
          {t}
        </text>
      ))}
    </Svg>
  ),
  'space-touching': () => (
    <Plan
      rooms={TWO}
      rel={{ 'A|B': 'access' }}
      alt="Rooms A and B touch and are joined by an Access edge: a door in their shared wall."
      ox={66}
      oy={20}
      extra={
        <Cap x={110} y={100} anchor="middle">
          touching: a door
        </Cap>
      }
    />
  ),
  'space-apart': () => (
    <Svg w={220} h={110} alt="Rooms A and B one cell apart, joined by an Access edge: the app builds a corridor through the free cell between them.">
      <rect className="sgl-gd-cell" x={22} y={20} width={56} height={56} style={{ fill: NEUTRAL }} />
      <rect className="sgl-gd-cell corridor" x={78} y={36} width={64} height={24} />
      <rect className="sgl-gd-cell" x={142} y={20} width={56} height={56} style={{ fill: NEUTRAL }} />
      <rect x={22} y={20} width={56} height={56} fill="none" className="sgl-gd-wall" />
      <rect x={142} y={20} width={56} height={56} fill="none" className="sgl-gd-wall" />
      <Txt x={50} y={52} cls="strong">
        A
      </Txt>
      <Txt x={170} y={52} cls="strong">
        B
      </Txt>
      <Txt x={110} y={30}>
        corridor
      </Txt>
      <Cap x={110} y={100} anchor="middle">
        one cell apart: a corridor
      </Cap>
    </Svg>
  ),

  // ── Attributes ──
  'sections-node': () => (
    <Mock alt="The five attribute sections of a node, in order: Identity (ID 3), Required by the app (Function Bedroom), Geometry (Position, Size), Custom (Target area), Calculated (Area)." title="Bedroom · Node 3">
      <MSec plain title="Identity">
        <MRow label="ID" value="3" lock />
      </MSec>
      <MSec plain title="Required by the app">
        <MRow label="Function" value="Bedroom ▾" />
      </MSec>
      <MSec plain title="Geometry">
        <MRow label="Position" value="2 | 0 | 0" />
        <MRow label="Size" value="1 | 1 | 1" />
      </MSec>
      <MSec plain title="Custom">
        <MRow label="Target area (m²)" value="18" faded tag="Toolkit: House" />
      </MSec>
      <MSec plain title="Calculated">
        <MRow label="Area" value="9 m²" lock />
      </MSec>
    </Mock>
  ),
  'sections-edge': () => (
    <Mock alt="The attribute sections of an edge, in the same order: Identity (ID 1, Source 1, Target 2), Required by the app (Relationship Access), Geometry (Corridor), Custom (a Note you added)." title="Edge 1 ↔ 2">
      <MSec plain title="Identity">
        <MRow label="ID" value="1" lock />
        <MRow label="Source · Target" value="1 · 2" lock />
      </MSec>
      <MSec plain title="Required by the app">
        <MRow label="Relationship" value={<MSeg items={['Access', 'Open']} on="Access" />} />
      </MSec>
      <MSec plain title="Geometry">
        <MRow label="Corridor" value="Design default" faded />
      </MSec>
      <MSec plain title="Custom">
        <MRow label="Note" value="main door" tag="Yours" />
      </MSec>
    </Mock>
  ),
  'ids-before': () => <Net alt="Three nodes numbered 1, 2 and 3, joined in a row." nodes="1 40 50, 2 110 50, 3 180 50" edges="1-2, 2-3" />,
  'ids-after': () => (
    <Net alt="Node 3 deleted (dashed outline) and a new node added: the new node is numbered 4, not 3." nodes="1 40 36, 2 110 36, 4 110 88" edges="1-2, 2-4" hl="4" h={112}>
      <circle className="sgl-gd-ghost" cx={180} cy={36} r={12} />
      <Txt x={180} y={40}>
        3
      </Txt>
      <Cap x={180} y={66} anchor="middle">
        deleted
      </Cap>
    </Net>
  ),
  'fn-bedroom': () => (
    <Cubes cells={[[1, 0, 0, FN_FILL.bedroom!]]} alt="A node with Function Bedroom: drawn in the Bedroom colour (blue) in every view, with the Bedroom's look." solid h={100}>
      <Cap x={110} y={96} anchor="middle">
        Function: Bedroom
      </Cap>
    </Cubes>
  ),
  'fn-kitchen': () => (
    <Cubes cells={[[1, 0, 0, FN_FILL.kitchen!]]} alt="The same node with Function Kitchen: now drawn in the Kitchen colour (terracotta), with the Kitchen's look." solid h={100}>
      <Cap x={110} y={96} anchor="middle">
        Function: Kitchen
      </Cap>
    </Cubes>
  ),
  'geo-1cell': () => <SizeCells cols={1} rows={1} alt="A node of Size 1 | 1 | 1: one grid cell of 3 × 3 m, 9 m²." size="Size 1 | 1 | 1" area="3 × 3 m = 9 m²" />,
  'geo-2cell': () => <SizeCells cols={2} rows={1} alt="A node of Size 2 | 1 | 1: two grid cells side by side, 6 × 3 m, 18 m²." size="Size 2 | 1 | 1" area="6 × 3 m = 18 m²" />,
  'custom-toolkit': () => (
    <Mock alt="Custom attributes from the toolkit: Target area and Priority, showing their Function's defaults faded, tagged Toolkit: House; they cannot be deleted." title="Custom">
      <MRow label="Target area (m²)" value="18 (default)" faded tag="Toolkit: House" />
      <MRow label="Priority" value="2 (default)" faded tag="Toolkit: House" />
    </Mock>
  ),
  'custom-yours': () => (
    <Mock alt="A custom attribute you added: Daylight, with its own value high, tagged Yours; you can delete it." title="Custom">
      <MRow label="Daylight" value="high" tag="Yours" hl />
      <MRow label="Target area (m²)" value="24" tag="Toolkit: House" />
    </Mock>
  ),
  'calc-1cell': () => <SizeCells cols={1} rows={1} alt="A node of one cell: its calculated Area is 9 m²." size="1 cell" area="Area 9 m² (calculated)" />,
  'calc-4cells': () => <SizeCells cols={2} rows={2} alt="The same node made 2 × 2 cells: its calculated Area changes by itself to 36 m²." size="2 × 2 cells" area="Area 36 m² (calculated)" />,

  // ── Views ──
  'g2d-before': () => (
    <Svg w={220} h={118} alt="Before a drag: the diagram shows A, B and C in a row; below, the plan of the three rooms in a row.">
      <NetBody nodes="A 50 22, B 110 22, C 170 22" edges="A-B, B-C" o={{}} />
      <RowPlan y={60} />
      <Cap x={4} y={114}>
        plan
      </Cap>
    </Svg>
  ),
  'g2d-after': () => (
    <Svg w={220} h={118} alt="After dragging node B down in the diagram: the diagram changed, but the plan below is exactly the same: room B did not move.">
      <NetBody nodes="A 50 22, B 110 44, C 170 22" edges="A-B, B-C" o={{ sel: 'B' }} />
      <RowPlan y={66} />
      <Cap x={4} y={116}>
        plan: unchanged
      </Cap>
    </Svg>
  ),
  'g3d-one': () => {
    const P = oblique(46, 16, 96);
    return (
      <Svg w={220} h={112} alt="Graph 3D of a one-storey design: nodes A, B and C all sit on the level 0 plate, joined by flat edges.">
        <polygon className="sgl-gd-plate" points={pts([P(0, 0, 0), P(3, 0, 0), P(3, 2, 0), P(0, 2, 0)])} />
        <NetBody nodes={`A ${at(P(0.5, 1, 0))}, B ${at(P(1.5, 1, 0))}, C ${at(P(2.5, 1, 0))}`} edges="A-B, B-C" o={{}} />
        <Cap x={4} y={108}>
          Level 0
        </Cap>
      </Svg>
    );
  },
  'g3d-two': () => {
    const P = oblique(46, 16, 106);
    return (
      <Svg w={220} h={124} alt="Graph 3D of a two-storey design: A and B on the level 0 plate, C on the level 1 plate above B, joined to B by a vertical edge (highlighted).">
        <polygon className="sgl-gd-plate" points={pts([P(0, 0, 0), P(3, 0, 0), P(3, 2, 0), P(0, 2, 0)])} />
        <polygon className="sgl-gd-plate" points={pts([P(0, 0, 1.4), P(3, 0, 1.4), P(3, 2, 1.4), P(0, 2, 1.4)])} />
        <NetBody nodes={`A ${at(P(0.5, 1, 0))}, B ${at(P(1.5, 1, 0))}, C ${at(P(1.5, 1, 1.4))}`} edges="A-B, B-C" o={{ he: 'B-C' }} />
        <Cap x={4} y={120}>
          Level 0
        </Cap>
        <Cap x={4} y={P(0, 0, 1.4)[1] + 12}>
          Level 1
        </Cap>
      </Svg>
    );
  },
  'vox-function': () => (
    <Cubes
      cells={[
        [0, 0, 0, FN_FILL.bedroom!],
        [1, 0, 0, FN_FILL.living!],
        [2, 0, 0, FN_FILL.kitchen!],
        [0, 0, 1, FN_FILL.bath!],
      ]}
      alt="Voxels coloured by Function: a Bedroom (blue), a Living room (amber) and a Kitchen (terracotta) in a row, a Bath (aqua) above the Bedroom; one see-through cube per cell."
    />
  ),
  'vox-number': () => (
    <Cubes
      cells={[
        [0, 0, 0, '#9fd8d2'],
        [1, 0, 0, '#1f7f77'],
        [2, 0, 0, '#4fb3a9'],
        [0, 0, 1, '#e3f4f2'],
      ]}
      alt="The same voxels coloured by a number, Target area: light for small values, dark for large (the middle room, 36 m², is darkest; the room above, 9 m², lightest)."
    />
  ),
  'bld-access': () => <Section door alt="Two rooms A and B seen from the front, cut through: they are joined by an Access edge, so the wall between them has a door." />,
  'bld-none': () => <Section door={false} alt="Two rooms A and B seen from the front, cut through: they touch but have no edge, so the wall between them is solid." />,
  'plan-l0': () => (
    <Plan
      rooms={[
        { name: 'A', cells: [[0, 0]] },
        { name: 'B', cells: [[1, 0]] },
        { name: 'C', cells: [[2, 0]] },
      ]}
      rel={{ 'A|B': 'access', 'B|C': 'open' }}
      alt="Plan of level 0: rooms A, B and C in a row, a door between A and B, no wall between B and C; a dashed outline marks room D on the level above A."
      ox={44}
      oy={14}
      extra={
        <>
          <rect className="sgl-gd-ghost" x={50} y={20} width={32} height={32} />
          <Cap x={110} y={82} anchor="middle">
            Level 0 · dashed: D above
          </Cap>
        </>
      }
    />
  ),
  'plan-l1': () => (
    <Plan
      rooms={[{ name: 'D', cells: [[0, 0]] }]}
      alt="Plan of level 1: only room D, which stands above room A."
      ox={44}
      oy={14}
      extra={
        <Cap x={110} y={82} anchor="middle">
          Level 1 · only D
        </Cap>
      }
    />
  ),
  'data-json': () => (
    <Code
      alt="The Data view as JSON: the text of one node, with id, function, position, size and custom values."
      lines={[['{ "id": 3,', true], ['  "function": "bedroom",', true], ['  "position": [2, 0, 0],', true], ['  "size": [1, 1, 1],', true], ['  "custom": {} }', true]]}
    />
  ),
  'data-table': () => (
    <Svg w={220} h={100} alt="The Data view as a table: one row per node; the row of node 3 is selected; the Area column is locked (calculated, not saved).">
      <rect className="sgl-gd-codebox" x={2} y={2} width={216} height={94} rx={5} />
      {['ID', 'Function', 'Area 🔒'].map((t, i) => (
        <text key={t} className="sgl-gd-t strong" x={10 + [0, 34, 130][i]!} y={20}>
          {t}
        </text>
      ))}
      {[
        ['1', 'living'],
        ['2', 'kitchen'],
        ['3', 'bedroom'],
      ].map(([a, b], i) => (
        <g key={a}>
          {i === 2 && <rect className="sgl-gd-rowhl" x={4} y={27 + i * 20} width={212} height={19} />}
          <text className="sgl-gd-t" x={10} y={41 + i * 20}>
            {a}
          </text>
          <text className="sgl-gd-t" x={44} y={41 + i * 20}>
            {b}
          </text>
          <text className="sgl-gd-t calc" x={140} y={41 + i * 20}>
            9 m²
          </text>
        </g>
      ))}
    </Svg>
  ),

  // ── Panels (one mock each, numbered like the screenshot) ──
  'panel-properties': () => (
    <Mock alt="Properties of a node: (1) its title, the Function Bedroom and the id Node 3, (2) Required by the app with the Function, (3) Geometry with Position and Size, (4) Custom with Target area and Priority." title="Properties">
      <div className="sgl-gd-row big">
        Bedroom <span className="sgl-gd-tag">Node 3</span> <MNum n={1} />
      </div>
      <MSec plain title="Identity">
        <MRow label="ID" value="3" lock />
      </MSec>
      <MSec plain title="Required by the app" n={2}>
        <MRow label="Function" value="Bedroom ▾" />
      </MSec>
      <MSec plain title="Geometry" n={3}>
        <MRow label="Position" value="2 | 0 | 0 (Level)" />
        <MRow label="Size" value="1 | 1 | 1 (Floors)" />
      </MSec>
      <MSec plain title="Custom" n={4}>
        <MRow label="Target area (m²)" value="18 (default)" faded tag="Toolkit: House" />
        <MRow label="Priority" value="2 (default)" faded tag="Toolkit: House" />
      </MSec>
    </Mock>
  ),
  'panel-attributes': () => (
    <Mock alt="Attributes panel: (1) Node and Edge tabs, (2) the five sections with every attribute, Custom ones tagged Toolkit: House, Area tagged Calculated, (3) + Add attribute." title="Attributes">
      <div className="sgl-gd-tabs">
        <span className="on">Node</span>
        <span>Edge</span>
        <MNum n={1} />
      </div>
      <MSec plain title="Identity" n={2}>
        <MRow label="ID" lock value="Number" />
      </MSec>
      <MSec plain title="Required by the app">
        <MRow label="Function" lock value="Choice" />
      </MSec>
      <MSec plain title="Geometry">
        <MRow label="Position" lock value="Numbers x | y | z" />
        <MRow label="Size" lock value="Numbers x | y | z" />
      </MSec>
      <MSec plain title="Custom">
        <MRow label="Target area" tag="Toolkit: House" />
        <MRow label="Priority" tag="Toolkit: House" />
      </MSec>
      <MSec plain title="Calculated">
        <MRow label="Area" lock tag="Calculated" />
      </MSec>
      <div className="sgl-gd-dashed">
        + Add attribute <MNum n={3} />
      </div>
    </Mock>
  ),
  'panel-designer': () => (
    <Mock alt="Building Designer: (1) Style rooms by Function, (2) the Default look card in Looks by Function, (3) + Style another function, (4) the Corridors section, separate from the looks, with Walls Enclosed or Open, Roof Flat, Pergola or None, and Width." title="Building Designer">
      <MRow label="Style rooms by" value="Function ▾" n={1} />
      <MSec title="Looks by Function" open>
        <div className="sgl-gd-card">
          <b>Default</b> 25 % · Repeat · Flat roof <MNum n={2} />
        </div>
        <div className="sgl-gd-row">
          <MBtn>+ Style another function… ▾</MBtn> <MNum n={3} />
        </div>
      </MSec>
      <MSec title="Corridors" open n={4}>
        <div className="sgl-gd-card open">
          <b>Corridors (generated)</b> Open sides · Flat roof · 1.5 m
          <div className="sgl-gd-sub">WALLS</div>
          <MRow label="Sides" value={<MSeg items={['Enclosed', 'Open']} on="Open" />} tag="Built-in default" />
          <div className="sgl-gd-sub">ROOF</div>
          <MRow label="Style" value="Flat ▾ (Flat · Pergola · None)" />
          <div className="sgl-gd-sub">WIDTH</div>
          <MRow label="Width" value="1.5 m" tag="Built-in default" />
        </div>
      </MSec>
    </Mock>
  ),
  'panel-analyse': () => (
    <Mock alt="Analyse panel: (1) Upload your own (.ts) with its i, (2) Show: All, Built-in, Toolkit, Yours, (3) Node section open with Degree and Neighbours, (4) Edge section open with Routes through it, Touching edges, Shared neighbours and Ends’ edges, (5) Network and (6) Queries collapsed." title="Analyse">
      <div className="sgl-gd-row">
        <MBtn>Upload your own (.ts)</MBtn>
        <span className="sgl-gd-info">i</span> <MNum n={1} />
      </div>
      <div className="sgl-gd-row">
        Show: <MSeg items={['All', 'Built-in', 'Toolkit', 'Yours']} on="All" /> <MNum n={2} />
      </div>
      <MSec title="Node" sub="about the selected node" open plus n={3}>
        <MRow label="Degree" tag="Built-in" />
        <MRow label="Neighbours" tag="Built-in" />
      </MSec>
      <MSec title="Edge" sub="about the selected edge" open plus n={4}>
        <MRow label="Routes through it" tag="Built-in" />
        <MRow label="Touching edges" tag="Built-in" />
        <MRow label="Shared neighbours" tag="Built-in" />
        <MRow label="Ends’ edges" tag="Built-in" />
      </MSec>
      <MSec title="Network" sub="measures of the whole graph" plus n={5} />
      <MSec title="Queries" sub="inputs you pick" plus n={6} />
    </Mock>
  ),
  'panel-transform': () => (
    <Mock alt="Transform panel: (1) Grow to target area under Toolkit: House, (2) its Houses parameter, (3) Run, (4) the preview, one line per node, (5) Apply or Discard." title="Transform">
      <div className="sgl-gd-sub">Toolkit: House</div>
      <div className="sgl-gd-card on">
        <b>Grow to target area</b> <span className="sgl-gd-tag">Toolkit: House</span> <MNum n={1} />
      </div>
      <MRow label="Houses" value="(empty: as many as you drew)" faded n={2} />
      <div className="sgl-gd-row">
        <MBtn primary>Run</MBtn> <MNum n={3} />
      </div>
      <div className="sgl-gd-preview">
        <MNum n={4} /> Living 1: 9 → 36 m² (target 36) ✓<br />
        Bedroom 2: 9 → 18 m² (target 18) ✓<br />
        Bath 3: 9 m² (target 9) ✓
      </div>
      <div className="sgl-gd-row">
        <MBtn primary>Apply</MBtn> <MBtn>Discard</MBtn> <MNum n={5} />
      </div>
    </Mock>
  ),
  'panel-scenarios': () => (
    <Mock alt="Scenarios panel: (1) Scenario 1, the active one, with 3 nodes and 2 edges, and rename, duplicate and delete buttons, (2) a second scenario, (3) + New scenario." title="Scenarios">
      <div className="sgl-gd-card on">
        <b>Scenario 1</b> 3 nodes · 2 edges ✎ ⧉ 🗑 <MNum n={1} />
      </div>
      <div className="sgl-gd-card">
        <b>Scenario 2</b> 4 nodes · 3 edges <MNum n={2} />
      </div>
      <div className="sgl-gd-dashed">
        + New scenario <MNum n={3} />
      </div>
    </Mock>
  ),
  'panel-camera': () => (
    <Mock alt="Camera panel: (1) Target viewport, (2) Save current view with a name, (3) Saved cameras of this scenario." title="Camera">
      <MRow label="Viewport" value="2 · Building ▾" n={1} />
      <div className="sgl-gd-row">
        <span className="sgl-gd-input">Garden side</span> <MBtn>Save view</MBtn> <MNum n={2} />
      </div>
      <MSec plain title="Saved cameras" n={3}>
        <MRow label="Garden side" value="Recall" />
      </MSec>
    </Mock>
  ),
  'panel-display': () => (
    <Mock alt="Display panel: (1) which view's settings, (2) Labels, Legend and Roofs, (3) Colours and Lighting. Appearance only: it never changes the design." title="Display">
      <div className="sgl-gd-row">
        <MSeg items={['Graph 2D', 'Graph 3D', 'Voxels', 'Building', 'Plan', 'Data']} on="Building" /> <MNum n={1} />
      </div>
      <MRow label="Labels · Legend · Roofs" value="☑ ☑ ☑" n={2} />
      <MRow label="Colours" value="By function ▾" n={3} />
      <MRow label="Lighting" value="Default ▾" />
    </Mock>
  ),
  'panel-project': () => (
    <Mock alt="Project panel: (1) Save locally, (2) Export project, (3) Open project, (4) New project, (5) Open example…." title="Project">
      <div className="sgl-gd-row">
        <MBtn primary>Save locally</MBtn> <MNum n={1} />
      </div>
      <div className="sgl-gd-row">
        <MBtn>Export project</MBtn> <MNum n={2} />
      </div>
      <div className="sgl-gd-row">
        <MBtn>Open project</MBtn> <MNum n={3} />
      </div>
      <div className="sgl-gd-row">
        <MBtn>New project</MBtn> <MNum n={4} />
      </div>
      <div className="sgl-gd-row">
        <MBtn>Open example…</MBtn> <MNum n={5} />
      </div>
    </Mock>
  ),
  'corr-enclosed': () => <Corridor enclosed />,
  'corr-open': () => <Corridor enclosed={false} />,
  'roofs-on': () => (
    <Cubes
      cells={[
        [0, 0, 0, FN_FILL.living!],
        [1, 0, 0, FN_FILL.bedroom!],
      ]}
      solid
      alt="Building view with Roofs on: two rooms closed by flat roofs, seen from above at an angle."
      h={100}
    />
  ),
  'roofs-off': () => (
    <Cubes
      cells={[
        [0, 0, 0, FN_FILL.living!],
        [1, 0, 0, FN_FILL.bedroom!],
      ]}
      roofless
      alt="The same two rooms with Roofs off: no roofs, so you look into the rooms from above and see their floors and inner walls."
      h={100}
    />
  ),
  'scen-1': () => <Net alt="Scenario 1: three nodes A, B and C in a row." nodes="A 40 50, B 110 50, C 180 50" edges="A-B, B-C" />,
  'scen-2': () => <Net alt="Scenario 2, a duplicate you changed: a fourth node D joined to B. Scenario 1 still has three nodes." nodes="A 40 36, B 110 36, C 180 36, D 110 90" edges="A-B, B-C, B-D" hl="D" he="B-D" h={112} />,
  'grow-before': () => <Grow after={false} />,
  'grow-after': () => <Grow after />,

  // ── Toolkits & JSON ──
  'tk-none': () => (
    <Code
      alt="No toolkit: a plain graph; you add Functions yourself in the Functions dialog; no transforms and no example designs."
      lines={[['No toolkit'], ['  Functions:  add your own'], ['  Custom:     add your own'], ['  Transform:  (empty)'], ['  Examples:   —']]}
    />
  ),
  'tk-house': () => (
    <Code
      alt="A toolkit folder: functions (one file per Function), algorithms, designs, assets and toolkit.ts with its name and custom attributes."
      lines={[['toolkits/house/'], ['  functions/   living.ts, bath.ts …', true], ['  algorithms/  grow-to-target-area.ts', true], ['  designs/     *.json', true], ['  assets/      façade files', true], ['  toolkit.ts   name, custom attributes']]}
    />
  ),
  'json-node': () => (
    <Code
      alt="A node in the design file: id, function, position, size and custom values."
      lines={[['{ "id": 3,', true], ['  "function": "bedroom",', true], ['  "position": [2, 0, 0],', true], ['  "size": [1, 1, 1],', true], ['  "custom": { "targetArea": 18 } }', true]]}
    />
  ),
  'json-edge': () => (
    <Code alt="An edge in the design file: id, source, target, relationship and custom values." lines={[['{ "id": 1,', true], ['  "source": 1, "target": 3,', true], ['  "relationship": "access",', true], ['  "custom": {} }', true]]} />
  ),
  'avt-analyse': () => <Flow transform={false} />,
  'avt-transform': () => <Flow transform />,
  'route-ai': () => <Steps alt="With an AI kit: 1 download a kit, 2 describe the analysis to an AI assistant, 3 upload the .ts file it writes in Analyse." labels={['Download a kit', 'Describe it to the AI', 'Upload the .ts in Analyse']} />,
  'route-template': () => <Steps alt="From the template: 1 download the template, 2 change it yourself, 3 upload the .ts file in Analyse." labels={['Download the template', 'Change it yourself', 'Upload the .ts in Analyse']} />,
  'route-ai-transform': () => (
    <Steps alt="With an AI kit: 1 download a transform kit, 2 describe the transform to an AI assistant, 3 upload the .ts file it writes in Transform." labels={['Download a kit', 'Describe it to the AI', 'Upload the .ts in Transform']} />
  ),
  'route-template-transform': () => (
    <Steps alt="From the template: 1 download the transform template, 2 change it yourself, 3 upload the .ts file in Transform." labels={['Download the template', 'Change it yourself', 'Upload the .ts in Transform']} />
  ),
  'transform-steps': () => (
    <Steps
      alt="Using a transform: 1 choose it, 2 set its parameters, 3 Run, 4 read the preview, 5 Apply or Discard, 6 Undo reverses all of it."
      labels={['Choose a transform', 'Set its parameters', 'Run', 'Read the preview', 'Apply or Discard', 'Undo reverses all']}
    />
  ),
  'route-agent': () => (
    <Steps
      alt="With a coding agent: 1 make your branch, 2 ask the agent in the repository, 3 it writes the folder and runs the checks, 4 push your branch."
      labels={['Make your branch', 'Ask the agent', 'It writes and checks', 'Push your branch']}
    />
  ),
  'route-chat': () => (
    <Steps
      alt="With a chat assistant: 1 download the toolkit kit, 2 ask the chat, 3 put the folder it gives you in toolkits, 4 check, commit and push your branch."
      labels={['Download the kit', 'Ask the chat', 'Put the folder in toolkits/', 'Check, commit, push']}
    />
  ),

  // ── How to… (numbered steps, like the screenshot markers) ──
  'howto-start': () => <Steps alt="Welcome: 1 Create project (with or without a toolkit), 2 Open project from a file, 3 Open example…, 4 Recent projects." labels={['Create project', 'Open project…', 'Open example…', 'Recent projects']} />,
  'howto-open-example': () => <Steps alt="1 Open example… on Welcome or in Project, 2 pick an example, 3 it opens as a new project with its toolkit, looks and façades, 4 see it in the Building view." labels={['Open example…', 'Pick an example', 'A new project', 'View: Building']} />,
  'howto-select': () => <Steps alt="1 Click a node in Graph 2D, 2 it is highlighted in every view, 3 read and edit it in Properties." labels={['Click a node or edge', 'Highlighted in every view', 'Read and edit in Properties']} />,
  'howto-add-room': () => <Steps alt="1 + Add node, 2 choose its Function in Properties, 3 set Position and Size." labels={['+ Add node', 'Function', 'Position and Size']} />,
  'howto-connect': () => <Steps alt="1 Select the first node, 2 Add edge…, 3 click the second node, 4 choose Access or Open in Properties." labels={['Select the first node', 'Add edge…', 'Click the second node', 'Access or Open']} />,
  'howto-attribute': () => <Steps alt="1 Attributes in the left rail, 2 + Add attribute, 3 Custom attribute, 4 set values in Properties." labels={['Attributes', '+ Add attribute', 'Custom attribute', 'Values in Properties']} />,
  'howto-analysis': () => <Steps alt="1 Select a node, 2 open Analyse, 3 press Degree, 4 read the result; it is highlighted in every view, 5 Clear." labels={['Select a node', 'Analyse', 'Degree', 'Read the result', 'Clear']} />,
  'howto-query': () => <Steps alt="1 Open Queries, 2 press Shortest path, 3 pick From, 4 pick To, 5 read the route." labels={['Open Queries', 'Shortest path', 'Pick From', 'Pick To', 'Read the route']} />,
  'howto-transform': () => <Steps alt="1 Transform, 2 Grow to target area, 3 Run, 4 check the preview, 5 Apply, 6 Undo if you change your mind." labels={['Transform', 'Grow to target area', 'Run', 'Check the preview', 'Apply', 'Undo']} />,
  'howto-upload': () => <Steps alt="1 Upload your own (.ts), 2 the i offers the AI kits and the templates, 3 the analysis appears in its section, tagged Yours." labels={['Upload your own (.ts)', 'i: AI kits and templates', 'Appears in its section']} />,
  'howto-upload-transform': () => (
    <Steps
      alt="1 Upload your own (.ts) in Transform, 2 the i offers the transform kits and the template, 3 choose it under Yours and Run, 4 read the preview and Apply."
      labels={['Upload your own (.ts)', 'i: kits and template', 'Choose it under Yours, Run', 'Preview, then Apply']}
    />
  ),
  'howto-data': () => <Steps alt="1 Set a view to Data, 2 JSON or Table, 3 click a row to select it everywhere, 4 locked columns are calculated and not saved." labels={['View: Data', 'JSON | Table', 'Click a row', 'Locked = calculated']} />,
  'howto-save': () => <Steps alt="1 Project in the left rail, 2 Save locally, 3 Export project, 4 Open project." labels={['Project', 'Save locally', 'Export project', 'Open project']} />,

  // ── Analyse sections ──
  'sec-node-leaf': () => <Net alt="Node section with a dead end selected: A, at the start of the row A–B–C that forks into D and E, has 1 edge and 1 neighbour." nodes={FORK} edges={FORK_E} sel="A" hl="A" he="A-B" badge={{ A: '1' }} />,
  'sec-node-hub': () => <Net alt="Node section with a hub selected: C, where the row forks, has 3 edges and 3 neighbours." nodes={FORK} edges={FORK_E} sel="C" hl="C" he="B-C, C-D, C-E" badge={{ C: '3' }} />,

  // ── Built-in analyses (two cases each) ──
  'deg-1': () => <Net alt="Degree 1: in a star of five nodes, the outer node A has a single edge, highlighted: a dead end." nodes={STAR} edges={STAR_E} hl="A" he="C-A" badge={{ A: '1' }} />,
  'deg-4': () => <Net alt="Degree 4: in the same star, the centre node C has four edges, highlighted: a hub." nodes={STAR} edges={STAR_E} hl="C" he={STAR_E} badge={{ C: '4' }} />,
  'nb-1': () => <Net alt="A selected at the start of the row: its only neighbour, B, is highlighted (1 neighbour)." nodes={FORK} edges={FORK_E} sel="A" hl="B" he="A-B" />,
  'nb-3': () => <Net alt="C selected where the row forks: its neighbours B, D and E are highlighted (3 neighbours)." nodes={FORK} edges={FORK_E} sel="C" hl="B D E" he="B-C, C-D, C-E" />,
  'routes-end': () => <Routes middle={false} />,
  'routes-middle': () => <Routes middle />,
  'touch-1': () => <Net alt="A–B selected at the start of the row: only B–C shares a node with it (at B): 1 touching edge, highlighted." nodes={FORK} edges={FORK_E} selEdge="A-B" he="B-C" />,
  'touch-3': () => <Net alt="B–C selected: A–B shares B with it, C–D and C–E share C: 3 touching edges, highlighted." nodes={FORK} edges={FORK_E} selEdge="B-C" he="A-B, C-D, C-E" />,
  'shared-0': () => <Net alt="A–B selected; node C is joined to B only, so no node is joined to both ends: 0. From A the only way back is the way you came." nodes="A 50 80, B 170 80, C 110 24" edges="A-B, B-C" selEdge="A-B" />,
  'shared-1': () => <Net alt="A–B selected; node C is joined to both A and B: 1 shared neighbour, highlighted. A, B and C form a loop you can walk round." nodes="A 50 80, B 170 80, C 110 24" edges="A-B, B-C, C-A" selEdge="A-B" hl="C" he="B-C, C-A" />,
  'ends-hub-dead': () => <Net alt="Edge C–E selected in a star: C has 4 edges (a hub), E only this one (a dead end): 4 · 1." nodes="A 50 22, B 50 88, C 110 55, D 170 22, E 170 88" edges="C-A, C-B, C-D, C-E" selEdge="C-E" hl="C E" badge={{ C: '4', E: '1' }} />,
  'ends-through': () => <Net alt="Edge B–C selected in a row A–B–C–D: B and C each have 2 edges, so both are on the way through: 2 · 2." nodes={ROW4} edges={ROW4_E} selEdge="B-C" hl="B C" badge={{ B: '2', C: '2' }} />,
  'sum-tree': () => <Net alt="Four nodes and three edges, A–B, B–C and B–D: one edge fewer than nodes, no loop." nodes={LOOP4} edges="A-B, B-C, B-D" />,
  'sum-loop': () => <Net alt="Four nodes and four edges round a square: as many edges as nodes, one loop (highlighted)." nodes={LOOP4} edges={LOOP4_E} he={LOOP4_E} />,
  'mc-row': () => <Net alt="A row A–B–C–D: B and C tie as most connected, with 2 edges each." nodes={ROW4} edges={ROW4_E} hl="B C" badge={{ B: '2', C: '2' }} />,
  'mc-star': () => <Net alt="A star of five nodes: the centre C is the most connected, with 4 edges." nodes={STAR} edges={STAR_E} hl="C" badge={{ C: '4' }} />,
  'parts-one': () => <Parts two={false} />,
  'parts-two': () => <Parts two />,
  'bridges-row': () => <Net alt="A row A–B–C–D: all 3 edges are bridges, highlighted: remove any one and the row splits." nodes={ROW4} edges={ROW4_E} he={ROW4_E} />,
  'bridges-loop': () => <Net alt="A loop A–B–C–D–A: no bridges; remove any one edge and there is still a way round." nodes={LOOP4} edges={LOOP4_E} />,
  'cut-row': () => <Net alt="A row A–B–C–D: B and C are cut nodes, highlighted; remove either and the row splits." nodes={ROW4} edges={ROW4_E} hl="B C" />,
  'cut-loop': () => <Net alt="A loop A–B–C–D–A: no cut nodes; remove any one node and the others are still joined." nodes={LOOP4} edges={LOOP4_E} />,
  'leaf-loop': () => <Net alt="A loop A–B–C–D–A: every node has 2 edges, so there are no leaf nodes (0 dead ends)." nodes={LOOP4} edges={LOOP4_E} />,
  'leaf-star': () => <Net alt="A star of five nodes: the four outer nodes A, B, D and E each have one edge: 4 leaf nodes, highlighted." nodes={STAR} edges={STAR_E} hl="A B D E" />,
  'diam-star': () => <Net alt="A star of five nodes: any two outer nodes are 2 steps apart through the centre, so the diameter is 2 (A → C → E highlighted)." nodes={STAR} edges={STAR_E} hl="A E" hlB="C" he="C-A, C-E" badge={{ E: '2' }} />,
  'diam-row': () => <Net alt="A row of five nodes A to E: from A to E takes 4 steps, so the diameter is 4 (the whole row highlighted)." nodes={ROW5} edges={ROW5_E} hl="A E" hlB="B C D" he={ROW5_E} badge={{ E: '4' }} />,
  'central-row': () => <Net alt="A row of five nodes: the middle node C is the most central, 2 + 1 + 1 + 2 = 6 steps to all the others (step counts beside each node)." nodes={ROW5} edges={ROW5_E} hl="C" badge={{ A: '2', B: '1', D: '1', E: '2' }} />,
  'central-star': () => <Net alt="A star of five nodes: the centre C is the most central, 1 step to each of the 4 others, 4 in total." nodes={STAR} edges={STAR_E} hl="C" badge={{ A: '1', B: '1', D: '1', E: '1' }} />,
  'path-short': () => <PathDiagram long={false} />,
  'path-long': () => <PathDiagram long />,
  'reach-1': () => <Net alt="From A with k = 1: only B, 1 step away, is reached; C, D and E are faded." nodes={ROW5} edges={ROW5_E} sel="A" hl="B" he="A-B" fade="C D E" badge={{ B: '1' }} />,
  'reach-2': () => <Net alt="From A with k = 2: B (1 step) and C (2 steps) are reached; D and E are faded." nodes={ROW5} edges={ROW5_E} sel="A" hl="B C" he="A-B, B-C" fade="D E" badge={{ B: '1', C: '2' }} />,
};

/** Ids of every Guide diagram (tests check that content only names these). */
export const GUIDE_DIAGRAM_IDS: readonly string[] = Object.keys(D);

/** The Guide diagram with this id, or null (an unknown id leaves the slot empty). */
export function renderGuideDiagram(id: string): ReactNode {
  const make = D[id];
  return make ? make() : null;
}
