import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { describePlacement, type DiagramModel, type DiagramNode } from './diagramModel';
import { presentEdge, UNRESOLVED_REASON_TEXT } from './edgePresentation';
import { formatAttributeValue } from './NodeDisplay';

/** Box size and position in container (panel) pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  readonly left: number;
  readonly top: number;
  readonly side: 'right' | 'left' | 'inside';
}

const GAP = 10;

/**
 * Where to put a box of `size` next to a circle at `anchor` (centre + radius, container px) so it
 * stays inside the container: to the right of the node, else to the left, else clamped inside.
 * Vertically centred on the node and clamped to the container. Pure (tested without a DOM).
 */
export function placeBeside(
  anchor: { readonly x: number; readonly y: number; readonly radius: number },
  size: Size,
  container: Size,
  margin = 8,
): Placement {
  const fitsRight = anchor.x + anchor.radius + GAP + size.width <= container.width - margin;
  const fitsLeft = anchor.x - anchor.radius - GAP - size.width >= margin;
  const side: Placement['side'] = fitsRight ? 'right' : fitsLeft ? 'left' : 'inside';
  const rawLeft =
    side === 'right' ? anchor.x + anchor.radius + GAP : side === 'left' ? anchor.x - anchor.radius - GAP - size.width : anchor.x - size.width / 2;
  return {
    left: clamp(rawLeft, margin, container.width - size.width - margin),
    top: clamp(anchor.y - size.height / 2, margin, container.height - size.height - margin),
    side,
  };
}

/** Top-left for a box opened at a pointer position, kept inside the container. */
export function placeAtPoint(point: { readonly x: number; readonly y: number }, size: Size, container: Size, margin = 4): Placement {
  const left = point.x + size.width <= container.width - margin ? point.x : point.x - size.width;
  const top = point.y + size.height <= container.height - margin ? point.y : point.y - size.height;
  return {
    left: clamp(left, margin, container.width - size.width - margin),
    top: clamp(top, margin, container.height - size.height - margin),
    side: 'inside',
  };
}

/** Clamp, preferring `min` when the range is empty (box larger than the container). */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

/**
 * Measure `ref`'s box and the container after render and return the CSS that places it with
 * `place`. Hidden until measured, so it never flashes at a wrong (clipped) position.
 */
export function usePlacement(
  ref: RefObject<HTMLElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  place: (size: Size, container: Size) => Placement,
  deps: readonly unknown[],
): CSSProperties {
  const [placement, setPlacement] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const container = containerRef.current;
    if (!el || !container) return;
    const box = el.getBoundingClientRect();
    const area = container.getBoundingClientRect();
    setPlacement(place({ width: box.width, height: box.height }, { width: area.width, height: area.height }));
  }, deps);
  return placement ? { left: placement.left, top: placement.top } : { left: 0, top: 0, visibility: 'hidden' };
}

/** Close on Escape or on a pointer press outside `ref`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) close.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref]);
}

export interface PopoverRow {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'warning' | 'unresolved';
}

/**
 * Read-only facts for the popover: id, type, placement, attributes (selected ones first) and
 * relationships, including why any of them cannot be built. Pure.
 */
export function popoverRows(
  model: DiagramModel,
  node: DiagramNode,
  /** `typeName`: the project's display name for the type (e.g. "Gallery (gallery)"), if any. */
  options: { readonly brokenType: boolean; readonly typeName?: string; readonly attributeKeys: readonly string[] },
): readonly PopoverRow[] {
  const rows: PopoverRow[] = [];
  rows.push({ label: 'Type', value: options.brokenType ? node.function : (options.typeName ?? node.function) });
  if (options.brokenType) rows.push({ label: 'Warning', value: 'This type’s definition in the project is invalid.', tone: 'warning' });
  rows.push({ label: 'Placement', value: describePlacement(node) });
  const keys = Object.keys(node.custom).sort();
  const ordered = [...options.attributeKeys.filter((k) => keys.includes(k)), ...keys.filter((k) => !options.attributeKeys.includes(k))];
  for (const key of ordered.slice(0, 6)) rows.push({ label: key, value: formatAttributeValue(node.custom[key]) });
  if (ordered.length > 6) rows.push({ label: 'More', value: `${ordered.length - 6} more attributes in Properties` });
  const edges = model.edges.filter((e) => e.source === node.id || e.target === node.id);
  rows.push({ label: 'Edges', value: edges.length === 0 ? 'none' : String(edges.length) });
  for (const edge of edges) {
    if (edge.resolution?.status !== 'unresolved') continue;
    const other = model.byNode.get(edge.source === node.id ? edge.target : edge.source);
    rows.push({
      label: `↔ ${other?.label ?? '?'}`,
      value: `${presentEdge(model, edge).label}. ${UNRESOLVED_REASON_TEXT[edge.resolution.reason]}`,
      tone: 'unresolved',
    });
  }
  return rows;
}

/**
 * Compact read-only details anchored beside a node. Not an editor: Properties stays the place to
 * change values. Closes with Escape or a click outside; keeps itself inside the panel.
 */
export function NodePopover({
  node,
  rows,
  anchor,
  containerRef,
  onClose,
  onConnect,
}: {
  readonly node: DiagramNode;
  readonly rows: readonly PopoverRow[];
  readonly anchor: { readonly x: number; readonly y: number; readonly radius: number };
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onConnect?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const style = usePlacement(ref, containerRef, (size, container) => placeBeside(anchor, size, container), [
    anchor.x,
    anchor.y,
    anchor.radius,
    rows,
  ]);
  return (
    <div ref={ref} className="sgl-popover nodrag nopan" style={style} role="dialog" aria-label={`Details of node ${node.label}`}>
      <div className="sgl-popover-head">
        <strong>{node.label}</strong>
        <button type="button" className="sgl-icon-button" onClick={onClose} aria-label="Close details" title="Close (Esc)">
          ×
        </button>
      </div>
      <dl>
        {rows.map((row, i) => (
          <div key={i} className={row.tone ? `sgl-popover-row sgl-${row.tone}` : 'sgl-popover-row'}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {onConnect && (
        <div className="sgl-popover-actions">
          <button type="button" onClick={onConnect} title="Then click the node to connect to">
            Add edge…
          </button>
          <span className="sgl-muted">Edit values in Properties.</span>
        </div>
      )}
    </div>
  );
}
