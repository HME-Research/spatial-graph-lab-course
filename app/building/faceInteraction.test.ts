import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { applyScenarioCommand, resolveRelationships, resolveWithPreferences, type FacePreference } from '@app/spatial';
import type { GridCoord } from '@core/spatial';
import { buildBuildingV2 } from './buildingV2';
import { wallAction } from './faceInteraction';
import { groupWallRuns } from './wallRuns';

/** Rooms: a = 1, b = 2, c = 3, d = 4. Face ids start with the owner room's id. */
type N = { id: number; position: GridCoord; size?: [number, number, number] };
type E = { id: number; source: number; target: number; relationship?: 'access' | 'open' };

const make = (nodes: N[], edges: E[] = []): DesignDocumentV2 =>
  expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 't' },
      nodes: nodes.map((n) => ({ function: 'gallery', size: [1, 1, 1], ...n })),
      edges: edges.map((e) => ({ relationship: 'access', ...e })),
    }),
  );

describe('groupWallRuns', () => {
  it('groups contiguous coplanar exterior walls per room and storey, split by a neighbour', () => {
    const doc = make([
      { id: 1, position: [0, 0, 0], size: [3, 1, 2] },
      { id: 2, position: [1, -1, 0] },
    ]);
    const runs = groupWallRuns(buildBuildingV2(doc).faces);
    const aMinusY = runs.filter((r) => r.ownerNodeId === 1 && r.direction === '-y');
    expect(aMinusY.map((r) => [r.id, r.faceIds])).toEqual([
      ['1:-y:0:0', ['1:0.0.0:-y']],
      ['1:-y:0:1', ['1:2.0.0:-y']],
      ['1:-y:1:0', ['1:0.0.1:-y', '1:1.0.1:-y', '1:2.0.1:-y']],
    ]);
    expect(runs.find((r) => r.id === '1:+y:0:0')).toMatchObject({ conditionClass: 'exterior', level: 0, start: [0, 0, 0], end: [2, 0, 0] });
    // The face shared with b is not exterior, so it is in no run; slabs are never in a run.
    const inRuns = new Set(runs.flatMap((r) => r.faceIds));
    expect(inRuns.has('1:1.0.0:-y')).toBe(false);
    expect([...inRuns].some((id) => id.endsWith('z'))).toBe(false);
  });

  it('orders ±x walls along the layout u axis (grid −y) and is independent of input order', () => {
    const faces = buildBuildingV2(make([{ id: 3, position: [10, 0, 0], size: [1, 3, 1] }])).faces;
    const run = groupWallRuns(faces).find((r) => r.direction === '+x')!;
    expect(run.faceIds).toEqual(['3:0.2.0:+x', '3:0.1.0:+x', '3:0.0.0:+x']);
    expect(groupWallRuns([...faces].reverse())).toEqual(groupWallRuns(faces));
  });
});

describe('wallAction', () => {
  const doc = make(
    [
      { id: 1, position: [0, 0, 0], size: [2, 1, 1] },
      { id: 2, position: [0, 1, 0], size: [2, 1, 1] },
      { id: 3, position: [2, 0, 0] },
      { id: 4, position: [6, 0, 0] },
    ],
    [
      { id: 1, source: 1, target: 3, relationship: 'open' },
      { id: 2, source: 3, target: 4 },
    ],
  );
  const spatial = resolveRelationships(doc);
  const model = buildBuildingV2(doc, { spatial });

  it('offers to add a relationship on a wall shared by two unrelated rooms, with a room-relative preference', () => {
    expect(wallAction('1:1.0.0:+y', model, doc, spatial)).toEqual({
      kind: 'add',
      source: 1,
      target: 2,
      preference: { nodeId: 1, offset: [1, 0, 0], direction: '+y' },
    });
  });

  it('reports an existing relationship', () => {
    expect(wallAction('1:1.0.0:+x', model, doc, spatial)).toEqual({ kind: 'existing', edgeId: 1, relationshipKind: 'open' });
  });

  it('refuses exterior, slab, connector, interior and unknown faces', () => {
    expect(wallAction('1:0.0.0:-y', model, doc, spatial)).toEqual({ kind: 'not-eligible', reason: 'exterior' });
    expect(wallAction('1:0.0.0:+z', model, doc, spatial)).toEqual({ kind: 'not-eligible', reason: 'slab' });
    expect(wallAction('3:+x', model, doc, spatial)).toEqual({ kind: 'not-eligible', reason: 'route' });
    expect(wallAction('1:0.0.0:+x', model, doc, spatial)).toEqual({ kind: 'not-eligible', reason: 'interior' });
    expect(wallAction('99:+x', model, doc, spatial)).toEqual({ kind: 'not-eligible', reason: 'unknown-face' });
  });
});

describe('preferred face in the building', () => {
  /** a and b are 1×3×1 side by side: three shared walls; the representative one is the middle. */
  const base = (bGrid: GridCoord = [1, 0, 0]) =>
    make([{ id: 1, position: [0, 0, 0], size: [1, 3, 1] }, { id: 2, position: bGrid, size: [1, 3, 1] }], [{ id: 1, source: 1, target: 2 }]);
  const PREF: FacePreference = { nodeId: 1, offset: [0, 2, 0], direction: '+x' };
  const doorFaces = (doc: DesignDocumentV2, prefs: Record<string, FacePreference>) =>
    buildBuildingV2(doc, { spatial: resolveWithPreferences(doc, prefs) }).faces.filter((f) => f.condition === 'door').map((f) => f.id);

  it('the door opens on the preferred face instead of the representative one', () => {
    expect(doorFaces(base(), {})).toEqual(['1:0.1.0:+x']);
    expect(doorFaces(base(), { 1: PREF })).toEqual(['1:0.2.0:+x']);
  });

  it('an unavailable preference builds no door anywhere', () => {
    const doc = base([1, -2, 0]); // still touching at y = 0 only
    expect(doorFaces(doc, {})).toEqual(['1:0.0.0:+x']);
    const model = buildBuildingV2(doc, { spatial: resolveWithPreferences(doc, { 1: PREF }) });
    expect(model.faces.some((f) => f.edgeId === 1)).toBe(false);
    expect(model.relationships[0]).toMatchObject({ status: 'unresolved', reason: 'preferred-face-unavailable', geometry: 'not-built' });
  });

  it('wallAction → add-edge-at-face places the door where the student clicked', () => {
    const doc = make([{ id: 1, position: [0, 0, 0], size: [1, 3, 1] }, { id: 2, position: [1, 0, 0], size: [1, 3, 1] }]);
    const spatial = resolveRelationships(doc);
    const action = wallAction('1:0.2.0:+x', buildBuildingV2(doc, { spatial }), doc, spatial);
    if (action.kind !== 'add') throw new Error('expected add');
    const next = expectOk(
      applyScenarioCommand(
        { design: doc, facePreferences: {} },
        { type: 'add-edge-at-face', edge: { source: action.source, target: action.target }, preference: action.preference },
      ),
    );
    expect(doorFaces(next.design, next.facePreferences)).toEqual(['1:0.2.0:+x']);
  });
});
