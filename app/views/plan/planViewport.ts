import type { PlanRect } from '@app/building';

/**
 * Pan/zoom of the Plan SVG (pure). The viewport is a centre in plan metres plus a scale in metres
 * per screen pixel, so the SVG `viewBox` always matches the element's pixel aspect and one screen
 * pixel is the same length along x and y.
 */
export interface PlanViewport {
  readonly cx: number;
  readonly cy: number;
  /** Metres per CSS pixel. */
  readonly scale: number;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/** Allowed scale range (metres per pixel): from ~1 mm/px to ~2 m/px. */
export const MIN_SCALE = 0.001;
export const MAX_SCALE = 2;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Fit `bounds` inside `size` with `padding` pixels on every side. Null bounds → a 10 m frame. */
export function fitViewport(bounds: PlanRect | null, size: ScreenSize, padding = 32): PlanViewport {
  const b = bounds ?? { x0: -5, x1: 5, y0: -5, y1: 5 };
  const w = Math.max(size.width - 2 * padding, 1);
  const h = Math.max(size.height - 2 * padding, 1);
  const scale = clampScale(Math.max((b.x1 - b.x0) / w, (b.y1 - b.y0) / h, MIN_SCALE));
  return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, scale };
}

export function viewBoxOf(v: PlanViewport, size: ScreenSize): string {
  const w = size.width * v.scale;
  const h = size.height * v.scale;
  return `${v.cx - w / 2} ${v.cy - h / 2} ${w} ${h}`;
}

/** Plan point under a screen point (`px`, `py` relative to the element's top-left). */
export function toPlan(v: PlanViewport, size: ScreenSize, px: number, py: number): readonly [number, number] {
  return [v.cx + (px - size.width / 2) * v.scale, v.cy + (py - size.height / 2) * v.scale];
}

/** Zoom by `factor` (> 1 zooms in) keeping the plan point under (`px`, `py`) fixed on screen. */
export function zoomAt(v: PlanViewport, size: ScreenSize, factor: number, px = size.width / 2, py = size.height / 2): PlanViewport {
  if (!(factor > 0) || !Number.isFinite(factor)) return v;
  const scale = clampScale(v.scale / factor);
  const [x, y] = toPlan(v, size, px, py);
  return { cx: x - (px - size.width / 2) * scale, cy: y - (py - size.height / 2) * scale, scale };
}

/** Pan by a screen-pixel drag (`dx`, `dy`): the drawing follows the pointer. */
export function panBy(v: PlanViewport, dx: number, dy: number): PlanViewport {
  return { cx: v.cx - dx * v.scale, cy: v.cy - dy * v.scale, scale: v.scale };
}

/** `WheelEvent.deltaMode` values. */
export const WHEEL_DELTA_PIXEL = 0;
export const WHEEL_DELTA_LINE = 1;
export const WHEEL_DELTA_PAGE = 2;
/** One wheel line ≈ a third of a 100 px notch (a line-mode notch usually reports 3 lines). */
export const WHEEL_LINE_PIXELS = 100 / 3;

/**
 * A wheel delta in pixels whatever its `deltaMode` (wave 2, D): line-mode wheels (Firefox, some
 * mice) report small line counts that would otherwise zoom almost nothing; page mode uses the
 * panel height. Unknown modes are treated as pixels.
 */
export function wheelPixels(delta: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === WHEEL_DELTA_LINE) return delta * WHEEL_LINE_PIXELS;
  if (deltaMode === WHEEL_DELTA_PAGE) return delta * (pageHeight > 0 ? pageHeight : 800);
  return delta;
}

/**
 * Is the hovered wall stale (wave 2, D)? After a storey switch it always is (the pointer is over a
 * different drawing); after a design change only when the wall is no longer a target.
 */
export function staleWallHover(faceId: string, levelChanged: boolean, targets: readonly { readonly faceId: string }[]): boolean {
  return levelChanged || !targets.some((t) => t.faceId === faceId);
}

/** Wheel delta (pixels) → zoom factor; one notch (100 px) ≈ 1.2×. */
export const wheelFactor = (deltaY: number): number => Math.pow(1.2, -Math.max(-5, Math.min(5, deltaY / 100)));

/** The storey to show: `wanted` if it exists, else the ground storey (0), else the lowest, else null. */
export function effectiveLevel(levels: readonly number[], wanted: number | undefined): number | null {
  if (levels.length === 0) return null;
  if (wanted !== undefined && levels.includes(wanted)) return wanted;
  return levels.includes(0) ? 0 : levels[0]!;
}
