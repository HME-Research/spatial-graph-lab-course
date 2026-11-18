import { defineNodeType } from '@student-api';

/**
 * Mostly closed storage room. The example design's store also has a `daylight` attribute, which
 * this type does not declare: it is kept unchanged and reported as information.
 */
export default defineNodeType({
  id: 'storage',
  label: 'Storage',
  facade: { windowFraction: 0.04 },
  attributes: {
    public: { kind: 'boolean', default: false },
  },
});
