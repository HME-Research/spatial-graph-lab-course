import { defineSpatialAlgorithm } from '@student-api';
import { generateHouse, generationParameters } from '../lib/generate-house';

// Use the shared candidate search with this transform’s scoring and preview rules.
export default defineSpatialAlgorithm({
  id: 'generate-next-variation',
  label: 'Generate Next Variation',
  parameters: generationParameters,
  run(ctx) {
    return generateHouse(ctx, 'next');
  },
});
