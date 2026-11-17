/**
 * Where to put a small panel next to a point on screen (pure; used by the Building's 3D anchor and
 * the Plan). Prefers the right of the point, vertically centred on it; flips to the left when it
 * would leave the view; always stays `margin` px inside the view.
 */
export function placeBeside(
  point: { readonly x: number; readonly y: number },
  panel: { readonly width: number; readonly height: number },
  view: { readonly width: number; readonly height: number },
  gap = 16,
  margin = 8,
): { readonly left: number; readonly top: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  let left = point.x + gap;
  if (left + panel.width > view.width - margin) left = point.x - gap - panel.width;
  return {
    left: clamp(left, margin, view.width - panel.width - margin),
    top: clamp(point.y - panel.height / 2, margin, view.height - panel.height - margin),
  };
}
