/**
 * Graph 2D relationship legend placement (wave 2, D). In the 4-viewport layout at laptop sizes a
 * quarter panel is about 450 × 300 px, and an open legend in the bottom-right corner covers the
 * nodes fitted underneath it. The legend therefore starts folded (title row only) in small panels
 * and open in large ones; the student's own open/close choice always wins afterwards.
 */
export const LEGEND_OPEN_MIN_WIDTH = 640;
export const LEGEND_OPEN_MIN_HEIGHT = 440;

export const legendStartsOpen = (size: { readonly width: number; readonly height: number }): boolean =>
  size.width >= LEGEND_OPEN_MIN_WIDTH && size.height >= LEGEND_OPEN_MIN_HEIGHT;

/**
 * Fit padding of the diagram (wave 2, D), in CSS pixels per side, so a fitted diagram keeps its
 * nodes clear of the overlays: the toolbar and hint (top), the Display / legend toggles and the
 * zoom controls (bottom and left). A fraction (the former 0.25) left nodes under the folded legend
 * and the toolbar in a quarter-size panel.
 */
export const DIAGRAM_FIT_PADDING = { top: '96px', bottom: '64px', left: '56px', right: '40px' } as const;
