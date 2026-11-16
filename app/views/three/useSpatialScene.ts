import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SceneSource } from './v2Scene';
import { displayKeys, viewAttributes, type ProjectAttributeSchema } from '@app/extensions';
import { selectionEmphasis, type Selection } from '@core/viewer/selection';
import type { Hover } from '@core/viewer/three/picking';
import {
  attributeKeys,
  DEFAULT_COLOR_MODE,
  effectiveColorMode,
  resolveColoring,
  type ColorMode,
} from './colorBy';
import { isNeutral, neutralColoring, useViewDisplay } from './viewDisplay';
import { accessGroups, buildEdgeItems, buildNodeItems, cellBounds, framingFor, groundGrid, storeyLevels } from './sceneModel';

/**
 * Everything a 3D view derives from the read-only document, plus its view-local UI state
 * (colour-by, level cut, hover, camera fit requests). Derived data is memoised on the
 * document's node/edge arrays, so selection changes never rebuild scene data.
 */
export function useSpatialScene(doc: SceneSource, selection: Selection, attributeSchema?: ProjectAttributeSchema) {
  const { nodes, edges } = doc;
  // Colour-by reads EFFECTIVE values of the project's node fields (the shared resolver), so a type
  // default colours a room exactly as Properties and Graph 2D show it.
  const valued = useMemo(
    () => (attributeSchema ? nodes.map((n) => ({ ...n, attributes: viewAttributes(attributeSchema, 'nodes', n) })) : nodes),
    [nodes, attributeSchema],
  );
  const nodeItems = useMemo(() => buildNodeItems(nodes), [nodes]);
  const edgeItems = useMemo(() => buildEdgeItems(nodes, edges), [nodes, edges]);
  const levels = useMemo(() => storeyLevels(nodes), [nodes]);
  const bounds = useMemo(() => cellBounds(nodes), [nodes]);
  const grid = useMemo(() => groundGrid(nodes), [nodes]);
  const framing = useMemo(() => framingFor(bounds), [bounds]);
  const keys = useMemo(() => (attributeSchema ? displayKeys(attributeSchema, 'nodes', nodes) : attributeKeys(nodes)), [nodes, attributeSchema]);
  const groups = useMemo(() => accessGroups(nodes, edges), [nodes, edges]);
  const emphasis = useMemo(() => selectionEmphasis(selection, edges), [selection, edges]);

  const [chosenColorMode, setColorMode] = useState<ColorMode>(DEFAULT_COLOR_MODE);
  const colorMode = effectiveColorMode(chosenColorMode, keys);
  // Display colour preset (voxels): `neutral` replaces the function (type) colours only; attribute
  // and access-group colourings are explicit choices in the view and stay as chosen.
  const neutral = isNeutral(useViewDisplay()) && colorMode.kind === 'type';
  const coloring = useMemo(() => {
    const resolved = resolveColoring(valued, edges, colorMode);
    return neutral ? neutralColoring(resolved) : resolved;
  }, [valued, edges, colorMode, neutral]);

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
