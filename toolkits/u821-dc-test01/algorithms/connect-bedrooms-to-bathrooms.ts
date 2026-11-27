import { defineSpatialAlgorithm } from '@student-api';
import { resolveConnections } from '../lib/resolve-connections';

// Use the house rules to connect each upper bedroom to one wall-sharing ensuite.
export default defineSpatialAlgorithm({
  id: 'connect-bedrooms-to-bathrooms',
  label: 'Connect bedrooms to bathrooms',
  run(ctx) {
    return resolveConnections(ctx, true);
  },
});
