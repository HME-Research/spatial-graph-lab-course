import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocumentV2 } from '@app/document';
import { resolveRelationships } from '@app/spatial';
import { createMetricEvaluator } from './registry';

/** Boundary-shift calculated values (2026-11-24): derived from the applied geometry, never stored. */
describe('boundary-shift metrics', () => {
  it('boundary-adjusted, actual-area, boundary-shift-applied and boundary-shift-status follow the applied geometry', () => {
    // Rooms 1 | 2 | 3 in a row; both edges would shrink room 2, so only the first in edge order applies.
    const doc = expectOk(
      validateDocumentV2({
        schemaVersion: 2,
        metadata: { name: 'row' },
        nodes: [1, 2, 3].map((id) => ({ id, function: 'room', position: [id - 1, 0, 0] })),
        edges: [
          { id: 1, source: 1, target: 2, relationship: 'access', boundaryShift: 'toward-target' },
          { id: 2, source: 2, target: 3, relationship: 'access', boundaryShift: 'toward-target' },
        ],
      }),
    );
    const ctx = { doc, spatial: resolveRelationships(doc) };
    const m = createMetricEvaluator();
    expect([1, 2, 3].map((id) => m.value(ctx, 'boundary-adjusted', id))).toEqual([true, true, false]);
    expect([1, 2, 3].map((id) => m.value(ctx, 'area', id))).toEqual([9, 9, 9]);
    expect([1, 2, 3].map((id) => m.value(ctx, 'actual-area', id))).toEqual([13.5, 4.5, 9]);
    expect([1, 2].map((id) => m.value(ctx, 'boundary-shift-applied', id))).toEqual([true, false]);
    expect([1, 2].map((id) => m.value(ctx, 'boundary-shift-status', id))).toEqual(['applied', 'room-already-adjusted']);
    // A change of the request alone (same resolution object) is not served from a stale cache.
    const none = { ...doc, edges: doc.edges.map((e) => ({ ...e, boundaryShift: 'none' as const })) };
    expect(m.value({ doc: none, spatial: ctx.spatial }, 'boundary-adjusted', 1)).toBe(false);
    expect(m.value({ doc: none, spatial: ctx.spatial }, 'actual-area', 1)).toBe(9);
  });
});
