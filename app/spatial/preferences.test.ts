import { describe, expect, it } from 'vitest';
import { expectOk } from '../document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2 } from '../document/v2';
import {
  applyDesignCommand,
  applyScenarioCommand,
  checkFacePreference,
  facePreferencesSchema,
  resolveRelationships,
  resolveWithPreferences,
  type FacePreference,
  type FacePreferences,
  type ScenarioContent,
  type SpatialResolution,
} from './index';

type N = { id: string; grid: [number, number, number]; size?: [number, number, number] };
type E = { id: string; source: string; target: string; kind?: 'access' | 'open' };

const make = (nodes: N[], edges: E[]): DesignDocumentV2 =>
  expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 't' },
      nodes: nodes.map((n) => ({ typeId: 'room', ...n })),
      edges: edges.map((e) => ({ kind: 'access', ...e })),
    }),
  );

/** `a` is 1×3×1 at the origin, `b` 1×3×1 beside it on +x: three shared wall faces. */
const pair = (bGrid: [number, number, number] = [1, 0, 0], extraNodes: N[] = [], extraEdges: E[] = []) =>
  make(
    [{ id: 'a', grid: [0, 0, 0], size: [1, 3, 1] }, { id: 'b', grid: bGrid, size: [1, 3, 1] }, ...extraNodes],
    [{ id: 'ab', source: 'a', target: 'b' }, ...extraEdges],
  );

/** The third cell of `a` (offset y = 2), towards b. Not the representative (middle) face. */
/** Deep equality of the data (occupancy.at is a fresh closure on every call). */
const expectSameResolution = (a: SpatialResolution, b: SpatialResolution) => {
  expect(a.edges).toEqual(b.edges);
  expect([...a.byEdge.entries()]).toEqual([...b.byEdge.entries()]);
  expect([...a.occupancy.cells.entries()]).toEqual([...b.occupancy.cells.entries()]);
};

const PREF: FacePreference = { nodeId: 'a', offset: [0, 2, 0], direction: '+x' };

describe('checkFacePreference', () => {
  it('accepts a shared face and reports it from the source room', () => {
    const doc = pair();
    expect(checkFacePreference(doc, doc.edges[0]!, PREF)).toEqual({ ok: true, face: { cell: [0, 2, 0], direction: '+x' } });
    // Measured from the target room: converted to the source's view.
    expect(checkFacePreference(doc, doc.edges[0]!, { nodeId: 'b', offset: [0, 1, 0], direction: '-x' })).toEqual({
      ok: true,
      face: { cell: [0, 1, 0], direction: '+x' },
    });
  });

  it('refuses a non-endpoint, an offset outside the room, and a face that is not shared', () => {
    const doc = pair();
    const edge = doc.edges[0]!;
    expect(checkFacePreference(doc, edge, { ...PREF, nodeId: 'zz' })).toEqual({ ok: false, reason: 'not-endpoint' });
    expect(checkFacePreference(doc, edge, { ...PREF, offset: [0, 3, 0] })).toEqual({ ok: false, reason: 'outside-room' });
    expect(checkFacePreference(doc, edge, { ...PREF, direction: '-x' })).toEqual({ ok: false, reason: 'not-shared' });
  });
});

describe('resolveWithPreferences', () => {
  it('without preferences equals resolveRelationships exactly (and ignores unknown edges)', () => {
    const doc = pair([1, 0, 0], [{ id: 'c', grid: [5, 0, 0] }, { id: 'd', grid: [9, 9, 4] }], [
      { id: 'ac', source: 'a', target: 'c' },
      { id: 'ad', source: 'a', target: 'd' },
    ]);
    expectSameResolution(resolveWithPreferences(doc, {}), resolveRelationships(doc));
    expectSameResolution(resolveWithPreferences(doc, { nope: PREF }), resolveRelationships(doc));
  });

  it('a valid preference only adds preferredFace to the direct resolution', () => {
    const doc = pair();
    const plain = resolveRelationships(doc);
    const r = resolveWithPreferences(doc, { ab: PREF });
    expect(r.byEdge.get('ab')).toEqual({ ...plain.byEdge.get('ab'), preferredFace: { cell: [0, 2, 0], direction: '+x' } });
    expect([...r.occupancy.cells.entries()]).toEqual([...plain.occupancy.cells.entries()]);
  });

  it('survives moving both rooms together', () => {
    let doc = pair();
    doc = expectOk(applyDesignCommand(doc, { type: 'set-node-geometry', nodeId: 'b', grid: [11, 5, 2] }));
    doc = expectOk(applyDesignCommand(doc, { type: 'set-node-geometry', nodeId: 'a', grid: [10, 5, 2] }));
    const r = resolveWithPreferences(doc, { ab: PREF }).byEdge.get('ab')!;
    expect(r.status).toBe('direct');
    expect(r.status === 'direct' && r.preferredFace).toEqual({ cell: [10, 7, 2], direction: '+x' });
  });

  it('survives moving the other room while the face stays shared', () => {
    const doc = pair([1, 1, 0]); // b now covers y 1..3: a's y = 2 face is still shared
    const r = resolveWithPreferences(doc, { ab: PREF }).byEdge.get('ab')!;
    expect(r.status === 'direct' && r.preferredFace).toEqual({ cell: [0, 2, 0], direction: '+x' });
  });

  it('moving one room so the face is no longer shared keeps the edge but makes it unresolved, never routed', () => {
    const doc = pair([1, -2, 0]); // b covers y -2..0: still touching a at y = 0, but not at y = 2
    expect(resolveRelationships(doc).byEdge.get('ab')!.status).toBe('direct');
    const r = resolveWithPreferences(doc, { ab: PREF });
    expect(doc.edges.map((e) => e.id)).toEqual(['ab']);
    expect(r.byEdge.get('ab')).toMatchObject({ status: 'unresolved', reason: 'preferred-face-unavailable' });

    // Separated rooms: the edge would be routed without the preference, but reserves nothing with it.
    const apart = pair([4, 0, 0]);
    expect(resolveRelationships(apart).byEdge.get('ab')!.status).toBe('routed');
    const ra = resolveWithPreferences(apart, { ab: PREF });
    expect(ra.byEdge.get('ab')).toMatchObject({ status: 'unresolved', reason: 'preferred-face-unavailable' });
    expect([...ra.occupancy.cells.values()].some((o) => o.kind === 'route')).toBe(false);
  });

  it('resizing a room so the offset falls outside it makes the preference invalid', () => {
    const doc = expectOk(applyDesignCommand(pair(), { type: 'set-node-geometry', nodeId: 'a', size: [1, 2, 1] }));
    expect(checkFacePreference(doc, doc.edges[0]!, PREF)).toEqual({ ok: false, reason: 'outside-room' });
    expect(resolveWithPreferences(doc, { ab: PREF }).byEdge.get('ab')).toMatchObject({ reason: 'preferred-face-unavailable' });
  });
});

describe('scenario commands', () => {
  const content = (prefs: FacePreferences = {}): ScenarioContent => ({ design: pair(), facePreferences: prefs });

  it('set-face-preference sets only a shared face, and clearing returns to the representative face', () => {
    const set = expectOk(applyScenarioCommand(content(), { type: 'set-face-preference', edgeId: 'ab', preference: PREF }));
    expect(set.facePreferences).toEqual({ ab: PREF });
    const bad = applyScenarioCommand(content(), { type: 'set-face-preference', edgeId: 'ab', preference: { ...PREF, direction: '-x' } });
    expect(bad.ok).toBe(false);
    const cleared = expectOk(applyScenarioCommand(set, { type: 'set-face-preference', edgeId: 'ab', preference: null }));
    expect(cleared.facePreferences).toEqual({});
    expectSameResolution(resolveWithPreferences(cleared.design, cleared.facePreferences), resolveRelationships(cleared.design));
  });

  it('add-edge-at-face adds the edge and its preference in one result; an invalid face adds nothing', () => {
    const start: ScenarioContent = { design: make([{ id: 'a', grid: [0, 0, 0], size: [1, 3, 1] }, { id: 'b', grid: [1, 0, 0], size: [1, 3, 1] }], []), facePreferences: {} };
    const next = expectOk(applyScenarioCommand(start, { type: 'add-edge-at-face', edge: { id: 'ab', source: 'a', target: 'b' }, preference: PREF }));
    expect(next.design.edges.map((e) => e.id)).toEqual(['ab']);
    expect(next.facePreferences).toEqual({ ab: PREF });
    const refused = applyScenarioCommand(start, {
      type: 'add-edge-at-face',
      edge: { id: 'ab', source: 'a', target: 'b' },
      preference: { ...PREF, offset: [0, 7, 0] },
    });
    expect(refused.ok).toBe(false);
  });

  it('removing the edge or a room drops the preference in the same step; moving keeps it', () => {
    const withPref = content({ ab: PREF });
    expect(expectOk(applyScenarioCommand(withPref, { type: 'remove-edge', edgeId: 'ab' })).facePreferences).toEqual({});
    expect(expectOk(applyScenarioCommand(withPref, { type: 'remove-node', nodeId: 'b' })).facePreferences).toEqual({});
    const moved = expectOk(applyScenarioCommand(withPref, { type: 'set-node-geometry', nodeId: 'b', grid: [6, 0, 0] }));
    expect(moved.design.edges.map((e) => e.id)).toEqual(['ab']);
    expect(moved.facePreferences).toEqual({ ab: PREF });
  });

  it('remove-edges in a scenario sees preference-unavailable edges as unresolved', () => {
    const broken: ScenarioContent = { design: pair([1, -2, 0]), facePreferences: { ab: PREF } };
    expect(applyDesignCommand(broken.design, { type: 'remove-edges', edgeIds: ['ab'] }).ok).toBe(false); // direct without prefs
    const removed = expectOk(applyScenarioCommand(broken, { type: 'remove-edges', edgeIds: ['ab'] }));
    expect(removed.design.edges).toEqual([]);
    expect(removed.facePreferences).toEqual({});
  });

  it('scenario content serialises to JSON and back, validated by facePreferencesSchema', () => {
    const c = content({ ab: PREF });
    const parsed = JSON.parse(JSON.stringify(c)) as { design: unknown; facePreferences: unknown };
    const prefs = facePreferencesSchema.parse(parsed.facePreferences);
    expect(prefs).toEqual(c.facePreferences);
    expect(expectOk(validateDocumentV2(parsed.design))).toEqual(c.design);
    expect(facePreferencesSchema.safeParse({ ab: { ...PREF, extra: 1 } }).success).toBe(false);
    expect(facePreferencesSchema.safeParse({ ab: { ...PREF, offset: [0, -1, 0] } }).success).toBe(false);
    expect(facePreferencesSchema.safeParse({ ab: { ...PREF, direction: 'up' } }).success).toBe(false);
    expect(facePreferencesSchema.safeParse({ 'bad id': PREF }).success).toBe(false);
  });
});

describe('remove-edges', () => {
  const doc = () =>
    make(
      [
        { id: 'a', grid: [0, 0, 0] },
        { id: 'b', grid: [1, 0, 0] },
        { id: 'c', grid: [5, 5, 3] },
        { id: 'd', grid: [9, 9, 6] },
      ],
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'ac', source: 'a', target: 'c' },
        { id: 'ad', source: 'a', target: 'd' },
      ],
    );

  it('removes exactly the listed unresolved edges', () => {
    const next = expectOk(applyDesignCommand(doc(), { type: 'remove-edges', edgeIds: ['ad', 'ac'] }));
    expect(next.edges.map((e) => e.id)).toEqual(['ab']);
    expect(next.nodes).toEqual(doc().nodes);
  });

  it('refuses an empty list, duplicates, unknown ids and built edges, changing nothing', () => {
    const d = doc();
    for (const edgeIds of [[], ['ac', 'ac'], ['ac', 'zz'], ['ac', 'ab']]) {
      const r = applyDesignCommand(d, { type: 'remove-edges', edgeIds });
      expect(r.ok, JSON.stringify(edgeIds)).toBe(false);
    }
    expect(d).toEqual(doc());
  });
});
