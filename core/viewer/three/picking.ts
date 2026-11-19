import type { ThreeEvent } from '@react-three/fiber';
import { selectEdge, selectNode, type SelectionHandler } from '../selection';
import { isDeliberateObjectClick } from './interaction';

/** The pickable item under the pointer. */
export interface Hover {
  readonly kind: 'node' | 'edge';
  readonly id: number;
}

/** Pointer handlers for a pickable node or edge, following the click-vs-drag rule. */
export function pickHandlers(
  kind: Hover['kind'],
  id: number,
  onSelect: SelectionHandler,
  setHovered: (update: (prev: Hover | null) => Hover | null) => void,
) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation(); // only the front-most object is picked
      if (isDeliberateObjectClick(e.delta, e.nativeEvent)) onSelect(kind === 'node' ? selectNode(id) : selectEdge(id));
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(() => ({ kind, id }));
    },
    onPointerOut: () => setHovered((prev) => (prev?.kind === kind && prev.id === id ? null : prev)),
  };
}
