import { defineSpatialAlgorithm } from '@student-api';
import { resolveConnections } from '../lib/resolve-connections';

// Use the same checked repair preview for missing connections.
export default defineSpatialAlgorithm({
  id: 'resolve-missing-connections',
  label: 'Resolve Missing Connections',
  run: resolveConnections,
});
