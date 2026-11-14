import type { ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DesignDocument } from '@app/document';
import type { SelectionHandler } from '../contracts';
import { selectEdge, selectNode, type Selection } from '../selection';
import {
  attributeKeys,
  DEFAULT_COLOR_MODE,
  effectiveColorMode,
  resolveColoring,
  type ColorMode,
} from './colorBy';
import { isDeliberateObjectClick } from './interaction';
import { CAMERA_FOV } from './SceneCanvas';
import {
  accessGroups,
  buildEdgeItems,
  buildNodeItems,
  cellBounds,
  fitCamera,
  groundGrid,
  selectionEmphasis,
  storeyLevels,
} from './sceneModel';

export interface Hover {
  readonly kind: 'node' | 'edge';
  readonly id: string;
}

/**
 * Everything a 3D view derives from the read-only document, plus its view-local UI state
 * (colour-by, level cut, hover, camera fit requests). Derived data is memoised on the
 * document's node/edge arrays, so selection changes never rebuild scene data.
 */
export function useSpatialScene(doc: DesignDocument, selection: Selection) {
  const { nodes, edges } = doc;
  const nodeItems = useMemo(() => buildNodeItems(nodes), [nodes]);
  const edgeItems = useMemo(() => buildEdgeItems(nodes, edges), [nodes, edges]);
  const levels = useMemo(() => storeyLevels(nodes), [nodes]);
  const bounds = useMemo(() => cellBounds(nodes), [nodes]);
  const grid = useMemo(() => groundGrid(nodes), [nodes]);
  const fit = useMemo(() => fitCamera(bounds, CAMERA_FOV), [bounds]);
  const keys = useMemo(() => attributeKeys(nodes), [nodes]);
  const groups = useMemo(() => accessGroups(nodes, edges), [nodes, edges]);
  const emphasis = useMemo(() => selectionEmphasis(selection, edges), [selection, edges]);

  const [chosenColorMode, setColorMode] = useState<ColorMode>(DEFAULT_COLOR_MODE);
  const colorMode = effectiveColorMode(chosenColorMode, keys);
  const coloring = useMemo(() => resolveColoring(nodes, edges, colorMode), [nodes, edges, colorMode]);

  const [maxLevel, setMaxLevel] = useState<number | null>(null);
  const isLevelHidden = useCallback((level: number) => maxLevel !== null && level > maxLevel, [maxLevel]);

  const [rawHovered, setHovered] = useState<Hover | null>(null);
  // An item removed or ghosted while hovered must not keep the pointer cursor or info.
  const hovered =
    rawHovered &&
    (rawHovered.kind === 'node'
      ? nodeItems.some((n) => n.id === rawHovered.id && !isLevelHidden(n.level))
      : edges.some((e) => e.id === rawHovered.id))
      ? rawHovered
      : null;

  // Camera: framed on mount, on "Fit view", and when the first node appears in an empty document.
  const [fitRequest, setFitRequest] = useState(0);
  const refit = useCallback(() => setFitRequest((n) => n + 1), []);
  const hasNodes = nodes.length > 0;
  const hadNodes = useRef(hasNodes);
  useEffect(() => {
    if (hasNodes && !hadNodes.current) refit();
    hadNodes.current = hasNodes;
  }, [hasNodes, refit]);

  return {
    nodeItems,
    edgeItems,
    levels,
    bounds,
    grid,
    fit,
    fitRequest,
    refit,
    attributeKeys: keys,
    groups,
    emphasis,
    colorMode,
    setColorMode,
    coloring,
    maxLevel,
    setMaxLevel,
    isLevelHidden,
    hovered,
    setHovered,
  };
}

/** Pointer handlers for a pickable node or edge, following the click-vs-drag rule. */
export function pickHandlers(
  kind: Hover['kind'],
  id: string,
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
