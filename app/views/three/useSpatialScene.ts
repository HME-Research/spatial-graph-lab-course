import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SceneSource } from './v2Scene';
import { displayKeys, viewAttributes, type ProjectAttributeSchema } from '@app/extensions';
import { defaultMetricEvaluator, type EnabledMetricIds, type MetricContext } from '@app/metrics';
import { selectionEmphasis, type Selection } from '@core/viewer/selection';
import type { Hover } from '@core/viewer/three/picking';
import {
  attributeKeys,
  DEFAULT_COLOR_MODE,
  effectiveColorMode,
  metricColorSource,
  resolveColoring,
  type ColorMode,
} from './colorBy';
import { useEnabledMetrics } from './enabledMetrics';
import { useFunctionColour, useFunctionName } from '../functionColour';
import { isNeutral, neutralColoring, useViewDisplay } from './viewDisplay';
import { accessGroups, buildEdgeItems, buildNodeItems, cellBounds, framingFor, groundGrid, storeyLevels } from './sceneModel';

/**
 * Everything a 3D view derives from the read-only document, plus its view-local UI state
 * (colour-by, hover, camera fit requests; each view applies its own level filter). Derived data is memoised on the
 * document's node/edge arrays, so selection changes never rebuild scene data.
 */
export function useSpatialScene(
  doc: SceneSource,
  selection: Selection,
  attributeSchema?: ProjectAttributeSchema,
  /** The v2 document and its resolution (the design port): enables colour-by calculated values. */
  design?: MetricContext,
  /** Default: the project's enabled calculated values (`EnabledMetricsContext`). */
  enabledMetricIdsArg?: EnabledMetricIds,
) {
  const projectMetricIds = useEnabledMetrics();
  const functionColour = useFunctionColour();
  const functionName = useFunctionName();
  const enabledMetricIds = enabledMetricIdsArg ?? projectMetricIds;
  const { nodes, edges } = doc;
  // Colour-by reads EFFECTIVE values of the project's node fields (the shared resolver), so a type
  // default colours a room exactly as Properties and Graph 2D show it.
  const valued = useMemo(
    () => (attributeSchema ? nodes.map((n) => ({ ...n, custom: viewAttributes(attributeSchema, 'nodes', n) })) : nodes),
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

  // Calculated values are derived on read for the current document and resolution (never stored).
  const metricDoc = design?.doc;
  const metricSpatial = design?.spatial;
  const metricSource = useMemo(
    () => (metricDoc && metricSpatial ? metricColorSource(defaultMetricEvaluator, { doc: metricDoc, spatial: metricSpatial }, enabledMetricIds) : undefined),
    [metricDoc, metricSpatial, enabledMetricIds],
  );
  const metricOptions = useMemo(() => metricSource?.metrics ?? [], [metricSource]);
  const metricIds = useMemo(() => metricOptions.map((m) => m.id), [metricOptions]);

  const [chosenColorMode, setColorMode] = useState<ColorMode>(DEFAULT_COLOR_MODE);
  const colorMode = effectiveColorMode(chosenColorMode, keys, metricIds);
  // Display colour preset (voxels): `neutral` replaces the function (type) colours only; attribute,
  // calculated-value and access-group colourings are explicit choices in the view and stay as chosen.
  const neutral = isNeutral(useViewDisplay()) && colorMode.kind === 'type';
  const coloring = useMemo(() => {
    const resolved = resolveColoring(valued, edges, colorMode, metricSource, functionColour, functionName);
    return neutral ? neutralColoring(resolved) : resolved;
  }, [valued, edges, colorMode, metricSource, neutral, functionColour, functionName]);

  const [rawHovered, setHovered] = useState<Hover | null>(null);
  // An item removed while hovered must not keep the pointer cursor or info.
  const hovered =
    rawHovered &&
    (rawHovered.kind === 'node'
      ? nodeItems.some((n) => n.id === rawHovered.id)
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
    metricOptions,
    groups,
    emphasis,
    colorMode,
    setColorMode,
    coloring,
    hovered,
    setHovered,
  };
}
