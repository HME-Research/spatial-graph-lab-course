/**
 * Fallback node-type colours shared by all views until the student type registry exists
 * (Phase 6). Deterministic: the same functionId always gets the same colour in 2D and 3D.
 */
export const FALLBACK_TYPE_PALETTE = [
  '#4e79a7',
  '#f28e2b',
  '#59a14f',
  '#e15759',
  '#b07aa1',
  '#76b7b2',
  '#edc948',
  '#9c755f',
] as const;

/** Colour used for selection highlights in every view. */
export const SELECTION_COLOR = '#ff2d95';

export function typeColor(functionId: string): string {
  let hash = 0;
  for (let i = 0; i < functionId.length; i++) hash = (hash * 31 + functionId.charCodeAt(i)) >>> 0;
  return FALLBACK_TYPE_PALETTE[hash % FALLBACK_TYPE_PALETTE.length]!;
}
