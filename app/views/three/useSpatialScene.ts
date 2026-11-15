import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SceneSource } from './v2Scene';
import { selectionEmphasis, type Selection } from '@core/viewer/selection';
import type { Hover } from '@core/viewer/three/picking';
import {
  attributeKeys,
  DEFAULT_COLOR_MODE,
  effectiveColorMode,
  resolveColoring,
  type ColorMode,
} from './colorBy';
import { accessGroups, buildEdgeItems, buildNodeItems, cellBounds, framingFor, groundGrid, storeyLevels } from './sceneModel';

/**
 * Everything a 3D view derives from the read-only document, plus its view-local UI state
 * (colour-by, level cut, hover, camera fit requests). Derived data is memoised on the
 * document's node/edge arrays, so selection changes never rebuild scene data.
 */
export function useSpatialScene(doc: SceneSource, selection: Selection) {
  const { nodes, edges } = doc;
  const nodeItems = useMemo(() => buildNodeItems(nodes), [nodes]);
  const edgeItems = useMemo(() => buildEdgeItems(nodes, edges), [nodes, edges]);
  const levels = useMemo(() => storeyLevels(nodes), [nodes]);
  const bounds = useMemo(() => cellBounds(nodes), [nodes]);
  const grid = useMemo(() => groundGrid(nodes), [nodes]);
  const framing = useMemo(() => framingFor(bounds), [bounds]);
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
    framing,
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
