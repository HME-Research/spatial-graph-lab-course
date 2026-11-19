import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  DEFAULT_CUT_HEIGHT,
  buildPlan,
  planBoundsAllLevels,
  planLevels,
  planSourceV2,
  wallAction,
  type FacadeProvider,
  type PlanModel,
  type PlanRect,
  type PlanSource,
  type PlanWallTarget,
  type WallAction,
} from '@app/building';
import type { DesignPort } from '@app/spatial';
import { SELECTION_COLOR, typeColor } from '@core/viewer/appearance';
import { NO_SELECTION, selectEdge, selectNode, selectionEmphasis, type Emphasis, type Selection, type SelectionHandler } from '@core/viewer/selection';
import type { ViewProps } from '../contracts';
import { projectFacadeProvider } from '../project';
import { useRemembered } from '../panelMemory';
import { centreLinePath, crossedRectPath, doorSwingPath, grow, windowPath } from './planShapes';
import { effectiveLevel, fitViewport, panBy, staleWallHover, viewBoxOf, wheelFactor, wheelPixels, zoomAt, type PlanViewport, type ScreenSize } from './planViewport';
import './plan.css';
import { useRoomHighlight } from '../roomHighlight';
import { useAnalysisOverlay } from '../analysisOverlay';
import { useStyleValues } from '../styleValues';
import type { ProjectAttributeSchema } from '@app/extensions';

/**
 * Plan view (workstream C): the architectural floor plan of ONE storey, drawn as SVG from
 * `buildPlan` — the horizontal section, at 1.2 m, of the same Gate F `FaceLayout` the Building view
 * turns into 3D boxes. Reads `ViewProps.design` (the DesignPort) directly; it never copies the graph.
 *
 * - Storey selector (top-right): only storeys that exist. A storey without rooms says so.
 * - Click a room → selects its node; click a door / opening / slab opening / connector cell →
 *   selects its relationship; click empty space → clears. The shared selection is highlighted.
 * - Wheel zooms at the pointer, drag pans, "Fit" frames the whole building (all storeys, so the
 *   frame stays put when the storey changes).
 * - Unresolved relationships build no face condition, so they never appear as openings.
 * - Wall targets (eligible shared walls) are reported through `onWallTarget` only — a data hook
 *   for the wall-editing workstream; this view adds no relationship UI of its own.
 */

/** Hover/click on an eligible shared wall, with the shared `wallAction` verdict. */
export type PlanWallEvent =
  | { readonly type: 'hover' | 'click'; readonly target: PlanWallTarget; readonly action: WallAction }
  | { readonly type: 'leave'; readonly faceId: string };

export interface PlanViewProps extends ViewProps {
  /** Optional data hook (workstream D). Without it, wall targets are not drawn or interactive. */
  readonly onWallTarget?: (event: PlanWallEvent) => void;
  /** Wave 2 (D): the wall whose panel is open, drawn highlighted (view-local, not a Selection). */
  readonly activeWall?: string | null;
}

interface RememberedPlan {
  readonly level?: number;
  /** Null = keep fitting the building to the panel. */
  readonly viewport?: PlanViewport | null;
}

const NO_PROJECT_FACADE = projectFacadeProvider(null);
const DEFAULT_SIZE: ScreenSize = { width: 800, height: 600 };
/** Pointer travel (px) after which a press becomes a pan instead of a click. */
const DRAG_THRESHOLD = 4;

export const levelName = (level: number) => `Level ${level}`;

export function PlanView({ selection, onSelect, project, design, onWallTarget, activeWall = null }: PlanViewProps) {
  return (
    <PlanCanvas
      design={design}
      selection={selection}
      onSelect={onSelect}
      facade={project?.facade ?? NO_PROJECT_FACADE}
      attributes={project?.attributes}
      onWallTarget={onWallTarget}
      activeWall={activeWall}
    />
  );
}

interface Activation {
  readonly onClick: (e: { stopPropagation(): void }) => void;
  readonly onKeyDown: (e: KeyboardEvent) => void;
  readonly tabIndex: number;
  readonly role: 'button';
}

function PlanCanvas({
  design,
  selection,
  onSelect,
  facade,
  attributes,
  onWallTarget,
  activeWall,
}: {
  readonly design: DesignPort;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
  readonly facade: FacadeProvider;
  /** The project's attribute schema, for "Style rooms by" a custom attribute (S3). */
  readonly attributes: ProjectAttributeSchema | undefined;
  readonly onWallTarget: PlanViewProps['onWallTarget'];
  readonly activeWall: string | null;
}) {
  const { doc, spatial } = design;
  // Geometry depends on the document, its resolution and the project façades only.
  const styleValues = useStyleValues(doc, spatial, attributes);
  const source: PlanSource = useMemo(() => planSourceV2(doc, spatial, { facade, ...(styleValues && { styleValues }) }), [doc, spatial, facade, styleValues]);
  const levels = useMemo(() => planLevels(source), [source]);
  const allBounds = useMemo(() => planBoundsAllLevels(source), [source]);

  const memory = useRemembered<RememberedPlan>('plan:view');
  const [wantedLevel, setWantedLevel] = useState<number | undefined>(() => memory?.load()?.level);
  const level = effectiveLevel(levels, wantedLevel);
  const plan = useMemo(() => (level === null ? null : buildPlan(source, level, DEFAULT_CUT_HEIGHT)), [source, level]);

  // Panel size, so the viewBox matches the element's pixel aspect (1 px = same metres on x and y).
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<ScreenSize>(DEFAULT_SIZE);
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((s) => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [manual, setManual] = useState<PlanViewport | null>(() => memory?.load()?.viewport ?? null);
  const viewport = manual ?? fitViewport(allBounds, size);
  useEffect(() => {
    memory?.save({ ...(wantedLevel !== undefined ? { level: wantedLevel } : {}), viewport: manual });
  }, [memory, wantedLevel, manual]);

  // Latest values for the native wheel listener (React's onWheel is passive and cannot preventDefault).
  const live = useRef({ viewport, size });
  live.current = { viewport, size };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const { viewport: v, size: s } = live.current;
      // Line / page wheels (e.g. Firefox, some mice) report deltaY in lines or pages, not pixels.
      setManual(zoomAt(v, s, wheelFactor(wheelPixels(e.deltaY, e.deltaMode, s.height)), e.clientX - r.left, e.clientY - r.top));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Drag to pan. A press that moves less than DRAG_THRESHOLD stays a click.
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean; start: PlanViewport } | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, start: viewport };
    suppressClick.current = false;
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setManual(panBy(d.start, dx, dy));
  };
  const endDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) suppressClick.current = true;
    drag.current = null;
  };

  const select = useCallback(
    (next: Selection) => {
      if (suppressClick.current) return;
      onSelect(next);
    },
    [onSelect],
  );
  const activate = (next: Selection): Activation => ({
    onClick: (e) => {
      e.stopPropagation();
      select(next);
    },
    onKeyDown: (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onSelect(next);
    },
    tabIndex: 0,
    role: 'button',
  });

  const emphasis = useMemo(() => selectionEmphasis(selection, doc.edges), [selection, doc.edges]);
  // Rooms lit up by the Designer's highlight button (never part of the selection).
  const lit = useRoomHighlight()?.nodeIds;
  // Nodes and edges highlighted by the shown analysis (P4).
  const analysis = useAnalysisOverlay();
  const unresolvedHere = useMemo(() => {
    if (!plan) return 0;
    const here = new Set(plan.rooms.map((r) => r.nodeId));
    return spatial.edges.filter((r) => {
      if (r.status !== 'unresolved') return false;
      const e = doc.edges.find((x) => x.id === r.edgeId);
      return e !== undefined && (here.has(e.source) || here.has(e.target));
    }).length;
  }, [plan, spatial, doc.edges]);

  const [hoveredWall, setHoveredWall] = useState<string | null>(null);
  const wallModel = useMemo(() => ({ faces: source.layouts.map((l) => l.face) }), [source]);
  // A storey switch or a design change can remove the hovered wall without a pointerleave: forget
  // it and tell the host, so no stale hover survives (wave 2, D).
  const hoverLevel = useRef(level);
  useEffect(() => {
    const levelChanged = hoverLevel.current !== level;
    hoverLevel.current = level;
    if (hoveredWall === null) return;
    if (!staleWallHover(hoveredWall, levelChanged, plan?.wallTargets ?? [])) return;
    setHoveredWall(null);
    onWallTarget?.({ type: 'leave', faceId: hoveredWall });
  }, [level, plan, hoveredWall, onWallTarget]);
  const wallEvent = (type: 'hover' | 'click', target: PlanWallTarget) => {
    onWallTarget?.({ type, target, action: wallAction(target.faceId, wallModel, doc, spatial) });
  };

  const fit = () => setManual(null);
  const zoomBy = (factor: number) => setManual(zoomAt(viewport, size, factor));

  let body: ReactNode = null;
  if (plan) {
    body = (
      <PlanDrawing
        plan={plan}
        px={viewport.scale}
        emphasis={emphasis}
        lit={lit}
        analysed={analysis ? { nodes: analysis.highlightNodes, edges: analysis.highlightEdges } : undefined}
        activate={activate}
        wallTargets={onWallTarget ? plan.wallTargets : []}
        hoveredWall={hoveredWall}
        activeWall={activeWall}
        onWallHover={(t) => {
          if (t) {
            setHoveredWall(t.faceId);
            wallEvent('hover', t);
          } else {
            if (hoveredWall !== null) onWallTarget?.({ type: 'leave', faceId: hoveredWall });
            setHoveredWall(null);
          }
        }}
        onWallClick={(t) => {
          if (!suppressClick.current) wallEvent('click', t);
        }}
      />
    );
  }

  const message =
    level === null
      ? 'This scenario has no rooms yet. Add a room in Graph 2D or the Building view to see its plan.'
      : plan && plan.rooms.length === 0
        ? `No rooms on ${levelName(level)}${plan.routeCells.length > 0 ? ' — only generated connectors pass through it' : ''}.`
        : null;

  return (
    <div className="sgl-plan" ref={hostRef}>
      <svg
        ref={svgRef}
        className="sgl-plan-svg"
        data-view-surface="plan"
        role="group"
        aria-label={level === null ? 'Floor plan (empty)' : `Floor plan of ${levelName(level)}`}
        viewBox={viewBoxOf(viewport, size)}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => select(NO_SELECTION)}
        style={{ '--sgl-plan-selection': SELECTION_COLOR } as CSSProperties}
      >
        {body}
      </svg>

      <div className="sgl-plan-level">
        <label>
          <span>Storey</span>
          <select aria-label="Plan storey" value={level ?? ''} disabled={levels.length === 0} onChange={(e) => setWantedLevel(Number(e.target.value))}>
            {levels.length === 0 && <option value="">—</option>}
            {levels.map((z) => (
              <option key={z} value={z}>
                {levelName(z)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="sgl-plan-zoom" role="group" aria-label="Plan zoom">
        <button type="button" onClick={() => zoomBy(1.25)} title="Zoom in" aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(0.8)} title="Zoom out" aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={fit} title="Fit the building to the panel" aria-pressed={manual === null}>
          Fit
        </button>
      </div>

      <p className="sgl-plan-note">
        Cut at {DEFAULT_CUT_HEIGHT.toFixed(1)} m · dashed = above
        {unresolvedHere > 0 && ` · ${unresolvedHere} unresolved relationship${unresolvedHere === 1 ? '' : 's'} not drawn`}
      </p>

      {message && (
        <div className="sgl-plan-empty" role="status">
          {message}
        </div>
      )}
    </div>
  );
}

const rectProps = (r: PlanRect) => ({ x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 });

/** The SVG content of one storey. Exported for static-markup tests. */
export function PlanDrawing({
  plan,
  px,
  emphasis,
  activate,
  wallTargets = [],
  hoveredWall = null,
  activeWall = null,
  onWallHover,
  onWallClick,
  lit,
  analysed,
}: {
  readonly plan: PlanModel;
  /** Metres per screen pixel (labels and hit areas keep a constant on-screen size). */
  readonly px: number;
  readonly emphasis: Emphasis;
  readonly activate: (s: Selection) => Partial<Activation>;
  readonly wallTargets?: readonly PlanWallTarget[];
  readonly hoveredWall?: string | null;
  readonly activeWall?: string | null;
  readonly onWallHover?: (t: PlanWallTarget | null) => void;
  readonly onWallClick?: (t: PlanWallTarget) => void;
  /** Rooms lit up by the Designer's highlight button. */
  readonly lit?: ReadonlySet<number> | undefined;
  /** Nodes and edges highlighted by the shown analysis (P4). */
  readonly analysed?: { readonly nodes: ReadonlySet<number>; readonly edges: ReadonlySet<number> } | undefined;
}) {
  const edgeClass = (base: string, edgeId: number | null) =>
    edgeId !== null && emphasis.edges.has(edgeId) ? `${base} selected` : edgeId !== null && analysed?.edges.has(edgeId) ? `${base} analysed` : base;
  const hit = 4 * px; // 4 px of extra hit area around thin elements
  const labelSize = 12 * px;
  return (
    <>
      <g className="sgl-plan-routes">
        {plan.routeCells.map((r) => (
          <rect
            key={`${r.edgeId}:${r.cell.join(',')}`}
            className={edgeClass('sgl-plan-route', r.edgeId)}
            data-edge-id={r.edgeId}
            {...rectProps(r.rect)}
            {...activate(selectEdge(r.edgeId))}
            aria-label={`Connector of relationship ${r.edgeId}`}
          />
        ))}
      </g>

      <g className="sgl-plan-rooms">
        {plan.rooms.map((room) => {
          const cls =
            (emphasis.primaryNodes.has(room.nodeId) ? ' selected' : emphasis.secondaryNodes.has(room.nodeId) ? ' related' : '') +
            (lit?.has(room.nodeId) ? ' highlighted' : '') +
            (analysed?.nodes.has(room.nodeId) ? ' analysed' : '');
          return (
            <rect
              key={room.nodeId}
              className={`sgl-plan-room${cls}`}
              data-node-id={room.nodeId}
              style={{ '--sgl-plan-type': typeColor(room.typeId) } as CSSProperties}
              {...rectProps(room.rect)}
              {...activate(selectNode(room.nodeId))}
              aria-label={`Room ${room.label}`}
            />
          );
        })}
      </g>

      <g className="sgl-plan-slabs">
        {plan.slabs.map((s) => {
          const cls = edgeClass(`sgl-plan-slab ${s.kind} ${s.position === 'ceiling' ? 'above' : 'floor'}`, s.edgeId);
          const interactive = s.edgeId !== null ? activate(selectEdge(s.edgeId)) : {};
          if (s.kind === 'access-marker') {
            return <rect key={s.id} className={cls} data-face-id={s.faceId} data-edge-id={s.edgeId ?? undefined} {...rectProps(s.rect)} {...interactive} />;
          }
          return (
            <g key={s.id} className={cls} data-face-id={s.faceId} data-edge-id={s.edgeId ?? undefined} {...interactive}>
              <rect {...rectProps(s.rect)} vectorEffect="non-scaling-stroke" />
              <path d={crossedRectPath(s.rect)} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </g>

      <g className="sgl-plan-walls">
        {plan.walls.map((w) => (
          <rect key={w.id} className={`sgl-plan-wall ${w.condition}`} data-face-id={w.faceId} {...rectProps(w.rect)} />
        ))}
      </g>

      {wallTargets.length > 0 && (
        <g className="sgl-plan-wall-targets">
          {wallTargets.map((t) => (
            <line
              key={t.faceId}
              className={`sgl-plan-wall-target${t.faceId === hoveredWall ? ' hovered' : ''}${t.faceId === activeWall ? ' active' : ''}`}
              data-face-id={t.faceId}
              x1={t.line.x0}
              y1={t.line.y0}
              x2={t.line.x1}
              y2={t.line.y1}
              strokeWidth={10 * px}
              onPointerEnter={() => onWallHover?.(t)}
              onPointerLeave={() => onWallHover?.(null)}
              onClick={(e) => {
                e.stopPropagation();
                onWallClick?.(t);
              }}
            />
          ))}
        </g>
      )}

      <g className="sgl-plan-openings">
        {plan.openings.map((o) => {
          const interactive = o.edgeId !== null ? activate(selectEdge(o.edgeId)) : {};
          return (
            <g
              key={o.id}
              className={edgeClass(`sgl-plan-opening ${o.kind}`, o.edgeId)}
              data-face-id={o.faceId}
              data-edge-id={o.edgeId ?? undefined}
              {...interactive}
            >
              <rect className="sgl-plan-hit" {...rectProps(grow(o.rect, hit))} />
              {o.kind === 'door' && <path d={doorSwingPath(o)} vectorEffect="non-scaling-stroke" />}
              {o.kind === 'window' && <path d={windowPath(o)} vectorEffect="non-scaling-stroke" />}
              {o.kind === 'open' && <path d={centreLinePath(o)} vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
      </g>

      <g className="sgl-plan-labels" aria-hidden="true">
        {plan.rooms.map((room) => {
          const cx = (room.rect.x0 + room.rect.x1) / 2;
          const cy = (room.rect.y0 + room.rect.y1) / 2;
          const span = room.levels[0] === room.levels[1] ? null : `L${room.levels[0]}–L${room.levels[1]}`;
          return (
            <text key={room.nodeId} x={cx} y={cy} fontSize={labelSize} textAnchor="middle" dominantBaseline="central">
              {room.label}
              {span && (
                <tspan x={cx} dy={labelSize * 1.2} fontSize={labelSize * 0.8} className="sgl-plan-span">
                  {span}
                </tspan>
              )}
            </text>
          );
        })}
      </g>
    </>
  );
}
