import { useMemo } from 'react';
import { spatialToThree } from '@core/viewer/coordinates';
import type { Bounds } from '@core/viewer/three/viewport';
import { LevelLabels } from './LevelLabels';
import { storeyLevels } from './sceneModel';

/**
 * "L0", "L1", … storey labels for a view that has rooms and world bounds but no level cut (the
 * Building view): one self-contained element, so a view hooks it up with a single line. Follows the
 * Display `labels` setting through `LevelLabels`.
 */
export function StoreyLabels({ nodes, bounds }: { readonly nodes: Parameters<typeof storeyLevels>[0]; readonly bounds: Bounds | null }) {
  const levels = useMemo(() => storeyLevels(nodes), [nodes]);
  return <LevelLabels levels={levels} bounds={bounds} levelCentreY={(level) => spatialToThree([0, 0, level])[1]} />;
}
