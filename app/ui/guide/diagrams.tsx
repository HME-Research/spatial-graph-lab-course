import type { ReactNode } from 'react';
import './diagrams.css';

/**
 * The Guide's small diagrams (Programme P4, item H). Every diagram is drawn from ONE house, the
 * built-in example `app/document/examples/house.json` (= `toolkits/house/designs/house.json`):
 * 1 Entrance [0,1,0], 2 Living [1,1,0], 3 Kitchen [1,0,0] on the ground floor; 4 Bedroom [1,1,1]
 * over the Living room and 5 Bath [0,1,1] over the Entrance; relationships 1: 1–2 Access,
 * 2: 2–3 Open, 3: 2–4 Access, 4: 4–5 Access.
 *
 * Graph diagrams are SVG, laid out like the example's own Graph 2D diagram. Panel diagrams are
 * small static mock-ups styled like the app's panels (section headers, collapsible sections, tags).
 * Every diagram is one `role="img"` with a text alternative; nothing inside is interactive.
 * Numbered circles use the same numbers as the entry's steps and its screenshot markers.
 */

// ── The house ─────────────────────────────────────────────────────────────────────────────────

type Rel = 'access' | 'open';
interface HouseNode {
  readonly id: number;
  readonly name: string;
  readonly fn: string;
  readonly x: number;
  readonly y: number;
}

/** Graph 2D layout of the example (its `diagram.positions`, scaled). */
const NODES: readonly HouseNode[] = [
  { id: 1, name: 'Entrance', fn: 'entrance', x: 40, y: 112 },
  { id: 2, name: 'Living', fn: 'living', x: 130, y: 112 },
  { id: 3, name: 'Kitchen', fn: 'kitchen', x: 220, y: 112 },
  { id: 4, name: 'Bedroom', fn: 'bedroom', x: 130, y: 38 },
  { id: 5, name: 'Bath', fn: 'bath', x: 40, y: 38 },
];
const EDGES: readonly { readonly id: number; readonly s: number; readonly t: number; readonly rel: Rel }[] = [
  { id: 1, s: 1, t: 2, rel: 'access' },
  { id: 2, s: 2, t: 3, rel: 'open' },
  { id: 3, s: 2, t: 4, rel: 'access' },
  { id: 4, s: 4, t: 5, rel: 'access' },
];

/** Function colours (close to the app's default palette for the example). */
const FN_FILL: Readonly<Record<string, string>> = {
  entrance: '#f3d77a',
  living: '#f0a35a',
  kitchen: '#d9c3dc',
  bedroom: '#b98fbf',
  bath: '#e98a86',
  circulation: '#b8c9d9',
};

// ── Small building blocks ─────────────────────────────────────────────────────────────────────

function Svg({ w, h, alt, children }: { readonly w: number; readonly h: number; readonly alt: string; readonly children: ReactNode }) {
  return (
    <svg className="sgl-gd" viewBox={`0 0 ${w} ${h}`} width={w} role="img" aria-label={alt}>
      {children}
    </svg>
  );
}

interface GraphOpts {
  /** Primary highlight (teal, like analysis results). */
  readonly hn?: readonly number[];
  /** Secondary highlight. */
  readonly hn2?: readonly number[];
  /** Highlighted edge ids. */
  readonly he?: readonly number[];
  /** Selected (pink) node / edge. */
  readonly sel?: number;
  readonly selEdge?: number;
  /** Edge ids drawn dashed (removed / imagined). */
  readonly dash?: readonly number[];
  /** Extra imagined edges (drawn dashed). */
  readonly extra?: readonly (readonly [number, number])[];
  readonly faded?: readonly number[];
  /** Text badge next to a node. */
  readonly badge?: Readonly<Record<number, string>>;
  readonly dx?: number;
  readonly dy?: number;
  /** Show the room names (default true). */
  readonly names?: boolean;
}

/** The house graph (nodes numbered by id; Open drawn heavier than Access, as in the app). */
function HouseGraph(o: GraphOpts) {
  const dx = o.dx ?? 0;
  const dy = o.dy ?? 0;
  const at = (id: number) => NODES.find((n) => n.id === id)!;
  const cls = (base: string, on: boolean, extra = '') => [base, on ? 'hl' : '', extra].filter(Boolean).join(' ');
  return (
    <g transform={`translate(${dx} ${dy})`}>
      {EDGES.map((e) => {
        const a = at(e.s);
        const b = at(e.t);
        const c = [
          'sgl-gd-e',
          e.rel === 'open' ? 'open' : '',
          o.he?.includes(e.id) ? 'hl' : '',
          o.selEdge === e.id ? 'sel' : '',
          o.dash?.includes(e.id) ? 'dash' : '',
          o.faded?.includes(e.s) || o.faded?.includes(e.t) ? 'fade' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return <line key={`e${e.id}`} className={c} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      })}
      {(o.extra ?? []).map(([s, t]) => {
        const a = at(s);
        const b = at(t);
        return <path key={`x${s}-${t}`} className="sgl-gd-e dash hl" d={`M${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${a.y + 34} ${b.x} ${b.y}`} fill="none" />;
      })}
      {NODES.map((n) => {
        const on = o.hn?.includes(n.id) ?? false;
        const on2 = o.hn2?.includes(n.id) ?? false;
        const fade = o.faded?.includes(n.id) ?? false;
        const nameBelow = n.y > 80;
        return (
          <g key={`n${n.id}`} className={fade ? 'fade' : undefined}>
            {o.sel === n.id && <circle className="sgl-gd-selring" cx={n.x} cy={n.y} r={15} />}
            <circle className={cls('sgl-gd-n', on, on2 ? 'hl2' : '')} cx={n.x} cy={n.y} r={11} style={{ fill: on ? undefined : FN_FILL[n.fn] }} />
            <text className="sgl-gd-id" x={n.x} y={n.y + 4} textAnchor="middle">
              {n.id}
            </text>
            {o.names !== false && (
              <text className={cls('sgl-gd-t', on || on2)} x={n.x} y={nameBelow ? n.y + 26 : n.y - 17} textAnchor="middle">
                {n.name}
              </text>
            )}
            {o.badge?.[n.id] !== undefined && (
              <text className="sgl-gd-badge" x={n.x + 16} y={n.y - 8}>
                {o.badge[n.id]}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function Graph({ alt, h = 150, w = 260, children, ...o }: GraphOpts & { readonly alt: string; readonly h?: number; readonly w?: number; readonly children?: ReactNode }) {
  return (
    <Svg w={w} h={h} alt={alt}>
      <HouseGraph {...o} />
      {children}
    </Svg>
  );
}

const Cap = ({ x, y, children, anchor = 'start' }: { readonly x: number; readonly y: number; readonly children: ReactNode; readonly anchor?: 'start' | 'middle' | 'end' }) => (
  <text className="sgl-gd-cap" x={x} y={y} textAnchor={anchor}>
    {children}
  </text>
);

// ── Oblique 3D helpers (Graph 3D, Voxels, Building) ────────────────────────────────────────────

/** Oblique view: grid x → right, grid y → back (up and to the right), z → up. */
const iso = (x: number, y: number, z: number, s = 36, ox = 64, oy = 134): [number, number] => [ox + x * s + y * s * 0.55, oy - z * s - y * s * 0.4];
const pts = (list: readonly [number, number][]) => list.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');

/** The example's cells [x, y, z, function] in grid coordinates (the Kitchen is in front, y = 0). */
const CELLS: readonly (readonly [number, number, number, string])[] = [
  [0, 1, 0, 'entrance'],
  [1, 1, 0, 'living'],
  [1, 0, 0, 'kitchen'],
  [1, 1, 1, 'bedroom'],
  [0, 1, 1, 'bath'],
];

/** One cell: its front (y), top (z + 1) and right (x + 1) faces. */
function Cube({ x, y, z, fill, solid }: { readonly x: number; readonly y: number; readonly z: number; readonly fill: string; readonly solid?: boolean }) {
  const P = (a: number, b: number, c: number) => iso(a, b, c);
  const front = pts([P(x, y, z), P(x + 1, y, z), P(x + 1, y, z + 1), P(x, y, z + 1)]);
  const top = pts([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)]);
  const side = pts([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)]);
  return (
    <g className={`sgl-gd-cube${solid ? ' solid' : ''}`}>
      <polygon className="f" points={front} style={{ fill }} />
      <polygon className="t" points={top} style={{ fill }} />
      <polygon className="s" points={side} style={{ fill }} />
    </g>
  );
}

/** Cells in painting order: back to front, bottom to top, left to right. */
const paintOrder = [...CELLS].sort((a, b) => b[1] - a[1] || a[2] - b[2] || a[0] - b[0]);

/** A window on a front face (y) or on a right-hand face (x). */
const frontWindow = (x: number, y: number, z: number) => pts([iso(x + 0.3, y, z + 0.3), iso(x + 0.7, y, z + 0.3), iso(x + 0.7, y, z + 0.75), iso(x + 0.3, y, z + 0.75)]);
const sideWindow = (x: number, y: number, z: number) => pts([iso(x, y + 0.3, z + 0.3), iso(x, y + 0.7, z + 0.3), iso(x, y + 0.7, z + 0.75), iso(x, y + 0.3, z + 0.75)]);

// ── Panel mock-ups ────────────────────────────────────────────────────────────────────────────

function Mock({ alt, title, children, wide }: { readonly alt: string; readonly title?: string; readonly children: ReactNode; readonly wide?: boolean }) {
  return (
    <div className={`sgl-gd-panel${wide ? ' wide' : ''}`} role="img" aria-label={alt}>
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
  hl,
  n,
  children,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly open?: boolean;
  /** Not collapsible (attribute sections): a thin divider and a small title. */
  readonly plain?: boolean;
  readonly plus?: boolean;
  readonly hl?: boolean;
  readonly n?: number;
  readonly children?: ReactNode;
}) {
  return (
    <div className={`sgl-gd-sec${hl ? ' hl' : ''}${plain ? ' plain' : ''}`}>
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

const MBtn = ({ children, primary, hl, n }: { readonly children: ReactNode; readonly primary?: boolean; readonly hl?: boolean; readonly n?: number }) => (
  <span className={`sgl-gd-btn${primary ? ' primary' : ''}${hl ? ' hl' : ''}`}>
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

/** The five attribute sections of the Living room, as in Properties (`hl` = the highlighted section). */
function SectionsMock({ hl, alt }: { readonly hl: 'all' | 'identity' | 'required' | 'geometry' | 'custom' | 'calculated'; readonly alt: string }) {
  const on = (id: string) => hl === 'all' || hl === id;
  return (
    <Mock alt={alt} title="Living · Room 2">
      <MSec plain title="Identity" hl={on('identity')}>
        <MRow label="ID" value="2" lock />
      </MSec>
      <MSec plain title="Required by the app" hl={on('required')}>
        <MRow label="Function" value="Living ▾" />
      </MSec>
      <MSec plain title="Geometry" hl={on('geometry')}>
        <MRow label="Position" value="1 | 1 | 0 (Level)" />
        <MRow label="Size" value="1 | 1 | 1 (Floors)" />
      </MSec>
      <MSec plain title="Custom" hl={on('custom')}>
        <MRow label="Target area (m²)" value="36 (default)" faded tag="Toolkit: House" />
        <MRow label="Daylight" value="high" tag="Yours" />
      </MSec>
      <MSec plain title="Calculated" hl={on('calculated')}>
        <MRow label="Area" value="9 m²" lock tag="Calculated, not saved" />
      </MSec>
    </Mock>
  );
}

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

// ── Floor plan (one storey) ───────────────────────────────────────────────────────────────────

interface PlanRoom {
  readonly name: string;
  readonly fn: string;
  /** Cells [x, y] in plan coordinates (y down = towards the viewer, like the app's plan with +y up flipped). */
  readonly cells: readonly (readonly [number, number])[];
}

function Plan({
  rooms,
  rel,
  alt,
  extra,
  hl = [],
  w = 260,
  h = 150,
  cell = 52,
  ox = 40,
  oy = 14,
}: {
  readonly rooms: readonly PlanRoom[];
  readonly rel: Readonly<Record<string, Rel | 'corridor'>>;
  readonly alt: string;
  readonly extra?: ReactNode;
  readonly hl?: readonly string[];
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
    const on = hl.includes(r.name);
    r.cells.forEach(([x, y], i) => fills.push(<rect key={`${r.name}${i}`} className={`sgl-gd-cell${on ? ' hl' : ''}`} x={ox + x * C} y={oy + y * C} width={C} height={C} style={{ fill: FN_FILL[r.fn] }} />));
    const cx = r.cells.reduce((a, c) => a + c[0], 0) / r.cells.length;
    const cy = r.cells.reduce((a, c) => a + c[1], 0) / r.cells.length;
    labels.push(
      <text key={`l${r.name}`} className="sgl-gd-t" x={ox + (cx + 0.5) * C} y={oy + (cy + 0.5) * C + 4} textAnchor="middle">
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

/** Ground floor of the example, drawn as the app's Plan shows it (Entrance left, Kitchen in front). */
const GROUND: readonly PlanRoom[] = [
  { name: 'Entrance', fn: 'entrance', cells: [[0, 0]] },
  { name: 'Living', fn: 'living', cells: [[1, 0]] },
  { name: 'Kitchen', fn: 'kitchen', cells: [[1, 1]] },
];
const GROUND_REL: Readonly<Record<string, Rel>> = { 'Entrance|Living': 'access', 'Kitchen|Living': 'open' };

// ── The diagrams, by id ───────────────────────────────────────────────────────────────────────

const D: Record<string, () => ReactNode> = {
  // Graphs
  'house-graph': () => <Graph alt="The example house as a graph: five numbered rooms as circles (Entrance, Living and Kitchen below; Bath and Bedroom above), lines for their four relationships." />,
  node: () => <Graph alt="The house graph with node 2, the Living room, highlighted." hn={[2]} />,
  edge: () => <Graph alt="The house graph with edge 1, Entrance–Living, highlighted; the heavier line Living–Kitchen is an Open relationship." he={[1]} hn2={[1, 2]} />,
  attributes: () => (
    <Graph alt="Living node with its values (Function living, Target area 36) and edge Living–Kitchen with Relationship open." hn={[2]} he={[2]} h={176}>
      <rect className="sgl-gd-tagbox" x={8} y={146} width={118} height={26} rx={4} />
      <text className="sgl-gd-t mono" x={14} y={157}>
        function: living
      </text>
      <text className="sgl-gd-t mono" x={14} y={168}>
        targetArea: 36
      </text>
      <rect className="sgl-gd-tagbox" x={140} y={146} width={112} height={16} rx={4} />
      <text className="sgl-gd-t mono" x={146} y={157}>
        relationship: open
      </text>
    </Graph>
  ),
  'same-graph-three-ways': () => (
    <Svg w={260} h={162} alt="Edge 1 shown three ways: a line between Entrance and Living, a JSON record, and a highlighted row in the Data table.">
      <Cap x={42} y={12} anchor="middle">
        Diagram
      </Cap>
      <line className="sgl-gd-e hl" x1={14} y1={40} x2={70} y2={40} />
      <circle className="sgl-gd-n" cx={14} cy={40} r={9} style={{ fill: FN_FILL.entrance }} />
      <circle className="sgl-gd-n" cx={70} cy={40} r={9} style={{ fill: FN_FILL.living }} />
      <text className="sgl-gd-id" x={14} y={44} textAnchor="middle">
        1
      </text>
      <text className="sgl-gd-id" x={70} y={44} textAnchor="middle">
        2
      </text>
      <Cap x={100} y={12}>
        JSON
      </Cap>
      <rect className="sgl-gd-codebox" x={96} y={18} width={160} height={58} rx={5} />
      {['{ "id": 1,', '  "source": 1, "target": 2,', '  "relationship": "access",', '  "custom": {} }'].map((t, i) => (
        <text key={i} className="sgl-gd-t mono hl" x={102} y={32 + i * 12} xmlSpace="preserve">
          {t}
        </text>
      ))}
      <Cap x={6} y={98}>
        Table
      </Cap>
      <rect className="sgl-gd-codebox" x={4} y={104} width={252} height={52} rx={5} />
      {['ID', 'Source', 'Target', 'Relationship'].map((t, i) => (
        <text key={t} className="sgl-gd-t strong" x={12 + [0, 30, 104, 178][i]!} y={120}>
          {t}
        </text>
      ))}
      <rect className="sgl-gd-rowhl" x={6} y={127} width={248} height={18} />
      {['1', '1 · entrance', '2 · living', 'Access'].map((t, i) => (
        <text key={t} className="sgl-gd-t" x={12 + [0, 30, 104, 178][i]!} y={140}>
          {t}
        </text>
      ))}
    </Svg>
  ),
  'graph-vs-space': () => (
    <Svg w={260} h={150} alt="Left: Living and Kitchen joined by a relationship. Right: in the plan the Kitchen has been moved one cell away, so the app builds a corridor through the free cell between them.">
      <Cap x={50} y={12} anchor="middle">
        Graph
      </Cap>
      <line className="sgl-gd-e hl" x1={18} y1={60} x2={82} y2={60} />
      <circle className="sgl-gd-n" cx={18} cy={60} r={10} style={{ fill: FN_FILL.living }} />
      <circle className="sgl-gd-n" cx={82} cy={60} r={10} style={{ fill: FN_FILL.kitchen }} />
      <text className="sgl-gd-id" x={18} y={64} textAnchor="middle">
        2
      </text>
      <text className="sgl-gd-id" x={82} y={64} textAnchor="middle">
        3
      </text>
      <text className="sgl-gd-t" x={18} y={86} textAnchor="middle">
        Living
      </text>
      <text className="sgl-gd-t" x={82} y={86} textAnchor="middle">
        Kitchen
      </text>
      <Cap x={185} y={12} anchor="middle">
        Plan
      </Cap>
      <rect className="sgl-gd-cell" x={118} y={36} width={44} height={44} style={{ fill: FN_FILL.living }} />
      <rect className="sgl-gd-cell corridor" x={162} y={50} width={44} height={16} />
      <rect className="sgl-gd-cell" x={206} y={36} width={44} height={44} style={{ fill: FN_FILL.kitchen }} />
      <text className="sgl-gd-t" x={140} y={96} textAnchor="middle">
        Living
      </text>
      <text className="sgl-gd-t" x={184} y={46} textAnchor="middle">
        corridor
      </text>
      <text className="sgl-gd-t" x={228} y={96} textAnchor="middle">
        Kitchen
      </text>
      <Cap x={130} y={122} anchor="middle">
        Not touching: the app builds a corridor,
      </Cap>
      <Cap x={130} y={136} anchor="middle">
        or marks the relationship Unresolved.
      </Cap>
    </Svg>
  ),

  // Attributes
  'sections-all': () => <SectionsMock hl="all" alt="The five attribute sections of the Living room, in order: Identity, Required by the app, Geometry, Custom, Calculated." />,
  'section-identity': () => <SectionsMock hl="identity" alt="The five attribute sections with Identity highlighted: ID 2, locked." />,
  'section-required': () => <SectionsMock hl="required" alt="The five attribute sections with Required by the app highlighted: Function Living." />,
  'section-geometry': () => <SectionsMock hl="geometry" alt="The five attribute sections with Geometry highlighted: Position 1, 1, Level 0; Size 1, 1, 1 floor." />,
  'section-custom': () => <SectionsMock hl="custom" alt="The five attribute sections with Custom highlighted: Target area tagged Toolkit: House, and a Daylight attribute tagged Yours." />,
  'section-calculated': () => <SectionsMock hl="calculated" alt="The five attribute sections with Calculated highlighted: Area 9 m², locked, calculated and not saved." />,

  // Views
  'view-graph2d': () => (
    <Graph alt="Graph 2D: the house graph; the Living node is dragged to tidy the diagram, which does not move the room." sel={2} h={162}>
      <path className="sgl-gd-arrow" d="M146 128 l18 12 m-8 1 l8 -1 l-2 -8" />
      <Cap x={130} y={158} anchor="middle">
        drag = tidy the diagram only
      </Cap>
    </Graph>
  ),
  'view-graph3d': () => {
    const P = (x: number, y: number, z: number) => iso(x, y, z, 56, 30, 166);
    const L1 = 1.5;
    const left: Record<number, boolean> = { 1: true, 5: true };
    const plate = (z: number) => pts([P(0, 0, z), P(2, 0, z), P(2, 2, z), P(0, 2, z)]);
    const pos: Record<number, [number, number, number]> = { 1: [0.5, 1.5, 0], 2: [1.5, 1.5, 0], 3: [1.5, 0.5, 0], 4: [1.5, 1.5, L1], 5: [0.5, 1.5, L1] };
    const pt = (id: number) => P(...pos[id]!);
    return (
      <Svg w={260} h={176} alt="Graph 3D: each node sits where its room is. Entrance, Living and Kitchen on level 0; Bath and Bedroom on level 1; the vertical edge Living–Bedroom is highlighted.">
        <polygon className="sgl-gd-plate" points={plate(0)} />
        <polygon className="sgl-gd-plate" points={plate(L1)} />
        {EDGES.map((e) => {
          const [x1, y1] = pt(e.s);
          const [x2, y2] = pt(e.t);
          return <line key={e.id} className={`sgl-gd-e${e.rel === 'open' ? ' open' : ''}${e.id === 3 ? ' hl' : ''}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
        {NODES.map((n) => {
          const [x, y] = pt(n.id);
          return (
            <g key={n.id}>
              <circle className="sgl-gd-n" cx={x} cy={y} r={8} style={{ fill: FN_FILL[n.fn] }} />
              <text className="sgl-gd-id" x={x} y={y + 3.5} textAnchor="middle">
                {n.id}
              </text>
              <text className="sgl-gd-t" x={left[n.id] ? x - 11 : x + 11} y={y + 4} textAnchor={left[n.id] ? "end" : "start"}>
                {n.name}
              </text>
            </g>
          );
        })}
        <Cap x={4} y={P(0, 0, L1)[1] + 4}>
          Level 1
        </Cap>
        <Cap x={4} y={P(0, 0, 0)[1] + 4}>
          Level 0
        </Cap>
      </Svg>
    );
  },
  'view-voxels': () => (
    <Svg w={260} h={156} alt="Voxels: five see-through cubes, one per grid cell, coloured by Function: Kitchen in front, Entrance and Living behind it, Bath and Bedroom above them.">
      {paintOrder.map(([x, y, z, fn]) => (
        <Cube key={`${x}${y}${z}`} x={x} y={y} z={z} fill={FN_FILL[fn]!} />
      ))}
      <Cap x={4} y={152}>
        One cube = one 3 × 3 m cell · colour = Function
      </Cap>
    </Svg>
  ),
  'view-building': () => (
    <Svg w={260} h={156} alt="Building: the house as walls, windows and flat roofs, built from the graph and the geometry; the upper floor sits over the Entrance and the Living room.">
      {paintOrder.map(([x, y, z, fn]) => (
        <Cube key={`${x}${y}${z}`} x={x} y={y} z={z} fill={FN_FILL[fn]!} solid />
      ))}
      <polygon className="sgl-gd-win" points={frontWindow(1, 0, 0)} />
      <polygon className="sgl-gd-win" points={frontWindow(0, 1, 0)} />
      <polygon className="sgl-gd-win" points={frontWindow(0, 1, 1)} />
      <polygon className="sgl-gd-win" points={frontWindow(1, 1, 1)} />
      <polygon className="sgl-gd-win" points={sideWindow(2, 0, 0)} />
      <polygon className="sgl-gd-win" points={sideWindow(2, 1, 0)} />
      <polygon className="sgl-gd-win" points={sideWindow(2, 1, 1)} />
      <Cap x={4} y={152}>
        Walls, doors, windows and roofs from graph + geometry
      </Cap>
    </Svg>
  ),
  'view-plan': () => (
    <Plan
      rooms={GROUND}
      rel={GROUND_REL}
      alt="Plan of the ground floor: a door gap between Entrance and Living (Access), no wall between Living and Kitchen (Open), outside walls all round."
      extra={
        <>
          <Cap x={170} y={30}>
            Access → door
          </Cap>
          <Cap x={170} y={88}>
            Open → no wall
          </Cap>
          <Cap x={4} y={142}>
            Level 0 · Bedroom and Bath are on level 1
          </Cap>
        </>
      }
    />
  ),
  'view-data': () => (
    <Svg w={260} h={150} alt="Data view: the Living room highlighted in the JSON text and as a table row; the calculated Area column is locked and not saved.">
      <Cap x={4} y={12}>
        JSON
      </Cap>
      <rect className="sgl-gd-codebox" x={2} y={18} width={122} height={128} rx={5} />
      {['{ "id": 2,', '  "function": "living",', '  "position": [1, 1, 0],', '  "size": [1, 1, 1],', '  "custom": {} }'].map((t, i) => (
        <g key={i}>
          <rect className="sgl-gd-rowhl" x={4} y={26 + i * 14} width={118} height={14} />
          <text className="sgl-gd-t mono tiny" x={7} y={36 + i * 14} xmlSpace="preserve">
            {t}
          </text>
        </g>
      ))}
      <Cap x={132} y={12}>
        Table
      </Cap>
      <rect className="sgl-gd-codebox" x={130} y={18} width={128} height={128} rx={5} />
      <text className="sgl-gd-t tiny strong" x={136} y={34}>
        ID
      </text>
      <text className="sgl-gd-t tiny strong" x={152} y={34}>
        Function
      </text>
      <text className="sgl-gd-t tiny strong" x={204} y={34}>
        Area 🔒
      </text>
      {[
        ['1', 'entrance'],
        ['2', 'living'],
        ['3', 'kitchen'],
        ['4', 'bedroom'],
        ['5', 'bath'],
      ].map(([a, b], i) => (
        <g key={a}>
          {i === 1 && <rect className="sgl-gd-rowhl" x={132} y={41 + i * 18} width={124} height={17} />}
          <text className="sgl-gd-t tiny" x={136} y={53 + i * 18}>
            {a}
          </text>
          <text className="sgl-gd-t tiny" x={152} y={53 + i * 18}>
            {b}
          </text>
          <text className="sgl-gd-t tiny calc" x={204} y={53 + i * 18}>
            9 m²
          </text>
        </g>
      ))}
    </Svg>
  ),

  // Panels
  'panel-properties': () => (
    <Mock alt="Properties of the Living room: (1) its title, the Function Living and the id Room 2, (2) Required by the app with the Function, (3) Geometry with Position and Size, (4) Custom with Target area and Priority." title="Properties">
      <div className="sgl-gd-row big">
        Living <span className="sgl-gd-tag">Room 2</span> <MNum n={1} />
      </div>
      <MSec plain title="Identity">
        <MRow label="ID" value="2" lock />
      </MSec>
      <MSec plain title="Required by the app" n={2}>
        <MRow label="Function" value="Living ▾" />
      </MSec>
      <MSec plain title="Geometry" n={3}>
        <MRow label="Position" value="1 | 1 | 0 (Level)" />
        <MRow label="Size" value="1 | 1 | 1 (Floors)" />
      </MSec>
      <MSec plain title="Custom" n={4}>
        <MRow label="Target area (m²)" value="36 (default)" faded tag="Toolkit: House" />
        <MRow label="Priority" value="1 (default)" faded tag="Toolkit: House" />
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
          <b>Default</b> 25 % · Repeat · Flat roof · 5 rooms <MNum n={2} />
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
    <Mock alt="Analyse panel: (1) Upload your own (.ts) with its i, (2) Show: All, Built-in, Toolkit, Yours, (3) Node section open with Degree and Neighbours, (4) Edge section open with Routes through it, Touching edges, Shared neighbours and Ends’ connections, (5) Network and (6) Queries collapsed." title="Analyse">
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
        <MRow label="Ends’ connections" tag="Built-in" />
      </MSec>
      <MSec title="Network" sub="measures of the whole graph" plus n={5} />
      <MSec title="Queries" sub="inputs you pick" plus n={6} />
    </Mock>
  ),
  'panel-transform': () => (
    <Mock alt="Transform panel: (1) Grow to target area under Toolkit: House, (2) its Houses parameter, (3) Run, (4) the preview, one line per room, (5) Apply or Discard." title="Transform">
      <div className="sgl-gd-sub">Toolkit: House</div>
      <div className="sgl-gd-card on">
        <b>Grow to target area</b> <span className="sgl-gd-tag">Toolkit: House</span> <MNum n={1} />
      </div>
      <MRow label="Houses" value="(empty: as many as you drew)" faded n={2} />
      <div className="sgl-gd-row">
        <MBtn primary>Run</MBtn> <MNum n={3} />
      </div>
      <div className="sgl-gd-preview">
        <MNum n={4} /> Living 2: 9 → 36 m² (target 36) ✓<br />
        Kitchen 3: 9 → 18 m² (target 18) ✓<br />
        Bedroom 4: 9 → 18 m² (target 18) ✓
      </div>
      <div className="sgl-gd-row">
        <MBtn primary>Apply</MBtn> <MBtn>Discard</MBtn> <MNum n={5} />
      </div>
    </Mock>
  ),
  'panel-scenarios': () => (
    <Mock alt="Scenarios panel: (1) Scenario 1, the active one, with 5 nodes and 4 edges, and rename, duplicate and delete buttons, (2) a second scenario, (3) + New scenario." title="Scenarios">
      <div className="sgl-gd-card on">
        <b>Scenario 1</b> 5 nodes · 4 edges ✎ ⧉ 🗑 <MNum n={1} />
      </div>
      <div className="sgl-gd-card">
        <b>Grown</b> 5 nodes · 4 edges <MNum n={2} />
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
    <Mock alt="Project panel: (1) Save locally, (2) Export project, (3) Open project; the toolkit is shown under Advanced." title="Project">
      <div className="sgl-gd-row">
        <MBtn primary>Save locally</MBtn> <MNum n={1} />
      </div>
      <div className="sgl-gd-row">
        <MBtn>Export project</MBtn> <MNum n={2} />
      </div>
      <div className="sgl-gd-row">
        <MBtn>Open project</MBtn> <MNum n={3} />
      </div>
      <MSec title="Advanced" sub="Toolkit: House" />
    </Mock>
  ),

  // Toolkits & JSON
  toolkit: () => (
    <Code
      alt="The house toolkit folder: functions (one file per Function), algorithms (Grow to target area), designs (the example house) and toolkit.ts."
      lines={[
        ['toolkits/house/'],
        ['  functions/      entrance.ts, living.ts, kitchen.ts …', true],
        ['  algorithms/     grow-to-target-area.ts', true],
        ['  designs/        house.json', true],
        ['  toolkit.ts      name, custom attributes'],
      ]}
    />
  ),
  'grow-to-target-area': () => {
    const C = 24;
    const cell = (ox: number, x: number, y: number, fn: string, cls = '') => (
      <rect key={`${ox}-${x}-${y}`} className={`sgl-gd-cell ${cls}`} x={ox + x * C} y={20 + y * C} width={C} height={C} style={{ fill: FN_FILL[fn] }} />
    );
    // Plan rows: 0 = back (Living grows here), 1 = Entrance/Living row, 2 = front (Kitchen).
    return (
      <Svg w={260} h={128} alt="Ground floor before and after Grow to target area: Living grows from 1 to 4 cells (36 m²), the Kitchen from 1 to 2 cells (18 m²); the Entrance stays 1 cell (9 m²).">
        <Cap x={14} y={13}>
          Before
        </Cap>
        {cell(14, 0, 1, 'entrance')}
        {cell(14, 1, 1, 'living')}
        {cell(14, 1, 2, 'kitchen')}
        <path className="sgl-gd-arrow" d="M100 56 h26 m-6 -5 l6 5 l-6 5" />
        <Cap x={146} y={13}>
          After
        </Cap>
        {cell(146, 0, 1, 'entrance')}
        {cell(146, 1, 1, 'living')}
        {cell(146, 2, 1, 'living', 'grow')}
        {cell(146, 1, 0, 'living', 'grow')}
        {cell(146, 2, 0, 'living', 'grow')}
        {cell(146, 1, 2, 'kitchen')}
        {cell(146, 2, 2, 'kitchen', 'grow')}
        <Cap x={4} y={108}>
          Living 9 → 36 m², Kitchen 9 → 18 m², Entrance 9 m²
        </Cap>
        <Cap x={4} y={122}>
          1 cell = 9 m². Upstairs, the Bedroom grows to 18 m².
        </Cap>
      </Svg>
    );
  },
  'design-json': () => (
    <Code
      alt="A shortened design file: one node with id, function, position, size and custom, and one edge with id, source, target, relationship and custom."
      lines={[
        ['{ "schemaVersion": 2,'],
        ['  "nodes": [ {'],
        ['    "id": 3,', true],
        ['    "function": "kitchen",', true],
        ['    "position": [1, 0, 0],', true],
        ['    "size": [1, 1, 1],', true],
        ['    "custom": { "targetArea": 27 } } ],', true],
        ['  "edges": [ {'],
        ['    "id": 2, "source": 2, "target": 3,', true],
        ['    "relationship": "open", "custom": {} } ] }', true],
      ]}
    />
  ),
  'analyse-vs-transform': () => (
    <Svg w={260} h={120} alt="Analyse: design to result; the design is unchanged. Transform: design to preview to Apply; Undo reverses it.">
      <Cap x={4} y={12}>
        Analyse — reads
      </Cap>
      <rect className="sgl-gd-box" x={4} y={18} width={66} height={28} rx={6} />
      <text className="sgl-gd-t" x={37} y={36} textAnchor="middle">
        Design
      </text>
      <path className="sgl-gd-arrow" d="M74 32 h20 m-5 -4 l5 4 l-5 4" />
      <rect className="sgl-gd-box hl" x={98} y={18} width={66} height={28} rx={6} />
      <text className="sgl-gd-t" x={131} y={36} textAnchor="middle">
        Result
      </text>
      <Cap x={170} y={36}>
        design unchanged
      </Cap>
      <Cap x={4} y={70}>
        Transform — changes
      </Cap>
      <rect className="sgl-gd-box" x={4} y={76} width={54} height={28} rx={6} />
      <text className="sgl-gd-t" x={31} y={94} textAnchor="middle">
        Design
      </text>
      <path className="sgl-gd-arrow" d="M60 90 h12 m-4 -4 l4 4 l-4 4" />
      <rect className="sgl-gd-box" x={74} y={76} width={58} height={28} rx={6} />
      <text className="sgl-gd-t" x={103} y={94} textAnchor="middle">
        Preview
      </text>
      <path className="sgl-gd-arrow" d="M134 90 h12 m-4 -4 l4 4 l-4 4" />
      <rect className="sgl-gd-box hl" x={148} y={76} width={50} height={28} rx={6} />
      <text className="sgl-gd-t" x={173} y={94} textAnchor="middle">
        Apply
      </text>
      <text className="sgl-gd-t" x={206} y={94}>
        ↶ Undo
      </text>
    </Svg>
  ),
  'ask-ai': () => <Steps alt="Four steps: download the AI kit, describe the measure to an AI assistant, upload the .ts file in Analyse, it appears tagged Yours." labels={['Download the AI kit', 'Describe the measure to the AI', 'Upload your own (.ts)', 'It appears, tagged Yours']} />,

  // How to…
  'howto-start': () => <Steps alt="Welcome: 1 Try example, 2 Create project (with or without a toolkit), 3 Open project from a file, 4 Open example…, 5 Recent projects." labels={['Try example', 'Create project', 'Open project…', 'Open example…', 'Recent projects']} />,
  'howto-open-example': () => <Steps alt="1 Open example… on Welcome or in Project, 2 pick the example house or a toolkit design, 3 it opens as a new project with its toolkit, looks and façades, 4 see it in the Building view." labels={['Open example…', 'Pick an example', 'A new project', 'View: Building']} />,
  'howto-select': () => <Steps alt="1 Click a node in Graph 2D, 2 it is highlighted in every view, 3 read and edit it in Properties." labels={['Click a node or edge', 'Highlighted in every view', 'Read and edit in Properties']} />,
  'howto-add-room': () => <Steps alt="1 + Add node, 2 choose its Function in Properties, 3 set Position and Size." labels={['+ Add node', 'Function', 'Position and Size']} />,
  'howto-connect': () => <Steps alt="1 Select the first room, 2 Add connection…, 3 click the second room, 4 choose Access or Open in Properties." labels={['Select the first room', 'Add connection…', 'Click the second room', 'Access or Open']} />,
  'howto-attribute': () => <Steps alt="1 Attributes in the left rail, 2 + Add attribute, 3 Custom attribute, 4 set values in Properties." labels={['Attributes', '+ Add attribute', 'Custom attribute', 'Values in Properties']} />,
  'howto-analysis': () => <Steps alt="1 Select a node, 2 open Analyse, 3 press Degree, 4 read the result; it is highlighted in every view, 5 Clear." labels={['Select a node', 'Analyse', 'Degree', 'Read the result', 'Clear']} />,
  'howto-query': () => <Steps alt="1 Open Queries, 2 press Shortest path, 3 pick From, 4 pick To, 5 read the route." labels={['Open Queries', 'Shortest path', 'Pick From', 'Pick To', 'Read the route']} />,
  'howto-transform': () => <Steps alt="1 Transform, 2 Grow to target area, 3 Run, 4 check the preview, 5 Apply, 6 Undo if you change your mind." labels={['Transform', 'Grow to target area', 'Run', 'Check the preview', 'Apply', 'Undo']} />,
  'howto-upload': () => <Steps alt="1 Upload your own (.ts), 2 the i offers the AI kit and the template, 3 the analysis appears in its section, tagged Yours." labels={['Upload your own (.ts)', 'i: AI kit and template', 'Appears in its section']} />,
  'howto-data': () => <Steps alt="1 Set a view to Data, 2 JSON or Table, 3 click a row to select it everywhere, 4 locked columns are calculated and not saved." labels={['View: Data', 'JSON | Table', 'Click a row', 'Locked = calculated']} />,
  'howto-save': () => <Steps alt="1 Project in the left rail, 2 Save locally, 3 Export project, 4 Open project." labels={['Project', 'Save locally', 'Export project', 'Open project']} />,

  // Analyse sections
  'section-node': () => <Graph alt="Node section: questions about the one selected node, here the Living room." sel={2} hn={[2]} />,
  'section-edge': () => <Graph alt="Edge section: questions about the one selected edge, here Living–Kitchen." selEdge={2} hn2={[2, 3]} he={[2]} />,
  'section-network': () => (
    <Graph alt="Network section: the whole graph at once, outlined.">
      <rect className="sgl-gd-frame" x={6} y={6} width={248} height={138} rx={12} />
    </Graph>
  ),
  'section-queries': () => <Graph alt="Queries section: you pick the inputs, here From = Entrance and To = Bath." hn={[1, 5]} badge={{ 1: 'From', 5: 'To' }} />,

  // Built-in analyses
  degree: () => <Graph alt="Living has degree 3: its three edges, to Entrance, Kitchen and Bedroom, are highlighted." hn={[2]} he={[1, 2, 3]} badge={{ 2: '3' }} />,
  neighbours: () => <Graph alt="Living selected; its neighbours Entrance, Kitchen and Bedroom are highlighted." sel={2} hn={[1, 3, 4]} he={[1, 2, 3]} />,
  'routes-through': () => (
    <Graph
      alt="Edge Living–Bedroom selected. Entrance, Living and Kitchen (3 rooms) are on one side, Bedroom and Bath (2 rooms) on the other: every trip between the two sides uses it, 3 × 2 = 6 of the 10 trips."
      selEdge={3}
      hn={[1, 2, 3]}
      hn2={[4, 5]}
      h={166}
    >
      <Cap x={4} y={162}>
        3 rooms × 2 rooms = 6 of 10 trips use Living–Bedroom.
      </Cap>
    </Graph>
  ),
  'shared-neighbours': () => (
    <Svg
      w={300}
      h={150}
      alt="Before and after. Before: Living–Kitchen selected; no room is joined to both, so the answer is 0 and the only way back from the Kitchen is the way you came. After adding Entrance–Kitchen (dashed): the Entrance is joined to both, the answer is 1, and Entrance, Living and Kitchen form a loop you can walk round."
    >
      <g transform="translate(-14 0) scale(0.62)">
        <HouseGraph selEdge={2} names={false} />
      </g>
      <g transform="translate(140 0) scale(0.62)">
        <HouseGraph selEdge={2} hn={[1]} he={[1]} extra={[[1, 3]]} names={false} />
      </g>
      <line className="sgl-gd-e" x1={146} y1={14} x2={146} y2={104} />
      <Cap x={10} y={118}>Before: 0</Cap>
      <Cap x={162} y={118}>After: 1 (a loop)</Cap>
      <Cap x={4} y={136}>1 Entrance · 2 Living · 3 Kitchen</Cap>
      <Cap x={4} y={148}>Loop: 1 → 2 → 3 → 1, no need to go back</Cap>
    </Svg>
  ),
  'ends-connections': () => (
    <Graph
      alt="Edge Living–Kitchen selected: the Living room has 3 relationships (a hub), the Kitchen only this one (a dead end): 3 · 1."
      selEdge={2}
      hn={[2, 3]}
      he={[1, 3]}
      badge={{ 2: '3', 3: '1' }}
      h={166}
    >
      <Cap x={4} y={162}>
        Living 3 · Kitchen 1: a hub joined to a dead end.
      </Cap>
    </Graph>
  ),
  'touching-edges': () => <Graph alt="Edge Living–Bedroom selected; the edges that share one of its ends, Entrance–Living, Living–Kitchen and Bedroom–Bath, are highlighted." selEdge={3} he={[1, 2, 4]} />,
  summary: () => (
    <Graph alt="The whole house graph with the counts: 5 nodes and 4 edges." h={168}>
      <rect className="sgl-gd-tagbox" x={80} y={146} width={100} height={18} rx={4} />
      <text className="sgl-gd-t strong" x={130} y={159} textAnchor="middle">
        5 nodes · 4 edges
      </text>
    </Graph>
  ),
  'most-connected-node': () => <Graph alt="Living is the most connected node, with 3 edges." hn={[2]} badge={{ 2: '3' }} />,
  'connected-parts': () => (
    <Svg w={260} h={110} alt="Two connected parts: House 1 and a copy, House 2, with no relationship between them.">
      <g transform="translate(0 6) scale(0.48)">
        <HouseGraph names={false} />
      </g>
      <g transform="translate(132 6) scale(0.48)">
        <HouseGraph names={false} hn={[1, 2, 3, 4, 5]} he={[1, 2, 3, 4]} />
      </g>
      <rect className="sgl-gd-frame" x={8} y={2} width={118} height={78} rx={10} />
      <rect className="sgl-gd-frame hl" x={140} y={2} width={118} height={78} rx={10} />
      <Cap x={67} y={98} anchor="middle">
        House 1
      </Cap>
      <Cap x={199} y={98} anchor="middle">
        House 2 (a copy)
      </Cap>
    </Svg>
  ),
  bridges: () => <Graph alt="Bridges highlighted: all four edges, because the house has no loops." he={[1, 2, 3, 4]} />,
  'cut-nodes': () => <Graph alt="Cut nodes Living and Bedroom: remove the Living room and the Entrance, the Kitchen and the upper floor are cut off from each other." hn={[2, 4]} />,
  'leaf-nodes': () => <Graph alt="Leaf nodes highlighted: Entrance, Kitchen and Bath each have one edge." hn={[1, 3, 5]} />,
  diameter: () => <Graph alt="Diameter 3: the longest shortest route, Entrance–Living–Bedroom–Bath, is highlighted." hn={[1, 5]} hn2={[2, 4]} he={[1, 3, 4]} badge={{ 5: '3 steps' }} />,
  'most-central-node': () => <Graph alt="Living is the most central node: 1 step to Entrance, Kitchen and Bedroom and 2 to the Bath, 5 steps in total." hn={[2]} badge={{ 1: '1', 3: '1', 4: '1', 5: '2' }} />,
  'shortest-path': () => (
    <Graph alt="Shortest path from Entrance to Bath: Entrance–Living–Bedroom–Bath, 3 steps, although the Bath is right above the Entrance." hn={[1, 5]} hn2={[2, 4]} he={[1, 3, 4]} badge={{ 1: 'From', 5: 'To' }} />
  ),
  'reach-within-k': () => <Graph alt="From the Entrance within 2 steps: Living (1 step), Kitchen and Bedroom (2 steps); the Bath is 3 steps away, outside." hn={[1]} hn2={[2, 3, 4]} faded={[5]} badge={{ 2: '1', 3: '2', 4: '2' }} />,
};

/** Ids of every Guide diagram (tests check that content only names these). */
export const GUIDE_DIAGRAM_IDS: readonly string[] = Object.keys(D);

/** The Guide diagram with this id, or null (an unknown id leaves the slot empty). */
export function renderGuideDiagram(id: string): ReactNode {
  const make = D[id];
  return make ? make() : null;
}
