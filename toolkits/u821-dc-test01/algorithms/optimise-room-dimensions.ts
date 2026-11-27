import { defineSpatialAlgorithm } from '@student-api';
import { generateHouse, generationParameters } from '../lib/generate-house';

// Use the shared candidate search with this transform’s scoring and preview rules.
export default defineSpatialAlgorithm({
  id: 'optimise-room-dimensions',
  label: 'Optimise Room Dimensions',
  parameters: generationParameters,
  run(ctx) {
    return generateHouse(ctx, 'dimensions');
  },
});
