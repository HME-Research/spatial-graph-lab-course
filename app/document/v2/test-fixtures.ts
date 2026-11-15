/** Shared v2 test helpers (imported by *.test.ts only). */

/** Two rooms that do not touch — a 2×3×1 gallery and a 1×1×1 studio — joined by an access edge. */
export function v2Raw() {
  return {
    schemaVersion: 2,
    metadata: { name: 'v2' },
    nodes: [
      { id: 'a', displayId: '01', grid: [0, 0, 0], size: [2, 3, 1], typeId: 'gallery', attributes: {} },
      { id: 'b', displayId: '02', grid: [5, 0, 0], typeId: 'studio' },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b', kind: 'access' }],
    diagram: { positions: { a: [0, 0], b: [100, 0] } },
  } as Record<string, unknown> & { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
}
