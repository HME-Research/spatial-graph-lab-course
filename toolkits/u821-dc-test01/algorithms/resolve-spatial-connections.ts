import { defineSpatialAlgorithm } from '@student-api';
import { resolveConnections } from '../lib/resolve-connections';

// Preview missing doors and identify edges that need manual correction.
export default defineSpatialAlgorithm({
  id: 'resolve-spatial-connections',
  label: 'Resolve Spatial Connections',
  run: resolveConnections,
});
