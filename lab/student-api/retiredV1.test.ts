import { describe, expect, it } from 'vitest';

/** P4: the Student API offers no schema-v1 vocabulary (edge kinds door/atrium/…, `canConnect`). */
const sources = import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true });

describe('Student API without schema v1 (P4)', () => {
  it('declares no v1 kinds or v1 queries', () => {
    const found = Object.entries(sources)
      .filter(([file]) => file !== './retiredV1.test.ts')
      .flatMap(([file, text]) =>
        ['SpatialEdgeKind', 'canConnect', "'vertical-access'", "'atrium'"].filter((id) => text.includes(id)).map((id) => `${file}: ${id}`),
      );
    expect(found).toEqual([]);
  });
});
