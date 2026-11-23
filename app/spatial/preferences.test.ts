import { describe, expect, it } from 'vitest';
import { expectOk } from '../document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2 } from '../document';
import {
  applyDesignCommand,
  applyScenarioCommand,
  checkFacePreference,
  facePreferencesSchema,
  rebasePreferences,
  resolveRelationships,
  resolveWithPreferences,
  type FacePreference,
  type FacePreferences,
  type ScenarioContent,
  type SpatialResolution,
} from './index';

type N = { id: number; position: [number, number, number]; size?: [number, number, number] };
type E = { id: number; source: number; target: number; relationship?: 'access' | 'open' };

const make = (nodes: N[], edges: E[]): DesignDocumentV2 =>
  expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 't' },
      nodes: nodes.map((n) => ({ function: 'room', ...n })),
      edges: edges.map((e) => ({ relationship: 'access', ...e })),
    }),
  );

/** `a` (1) is 1×3×1 at the origin, `b` (2) 1×3×1 beside it on +x: three shared wall faces; edge ab = 1. */
const pair = (bGrid: [number, number, number] = [1, 0, 0], extraNodes: N[] = [], extraEdges: E[] = []) =>
  make(
    [{ id: 1, position: [0, 0, 0], size: [1, 3, 1] }, { id: 2, position: bGrid, size: [1, 3, 1] }, ...extraNodes],
    [{ id: 1, source: 1, target: 2 }, ...extraEdges],
  );

/** The third cell of `a` (offset y = 2), towards b. Not the representative (middle) face. */
/** Deep equality of the data (occupancy.at is a fresh closure on every call). */
const expectSameResolution = (a: SpatialResolution, b: SpatialResolution) => {
  expect(a.edges).toEqual(b.edges);
  expect([...a.byEdge.entries()]).toEqual([...b.byEdge.entries()]);
  expect([...a.occupancy.cells.entries()]).toEqual([...b.occupancy.cells.entries()]);
};

const PREF: FacePreference = { nodeId: 1, offset: [0, 2, 0], direction: '+x' };

describe('checkFacePreference', () => {
  it('accepts a shared face and reports it from the source room', () => {
    const doc = pair();
    expect(checkFacePreference(doc, doc.edges[0]!, PREF)).toEqual({ ok: true, face: { cell: [0, 2, 0], direction: '+x' } });
    // Measured from the target room: converted to the source's view.
    expect(checkFacePreference(doc, doc.edges[0]!, { nodeId: 2, offset: [0, 1, 0], direction: '-x' })).toEqual({
      ok: true,
      face: { cell: [0, 1, 0], direction: '+x' },
    });
  });

  it('refuses a non-endpoint, an offset outside the room, and a face that is not shared', () => {
    const doc = pair();
    const edge = doc.edges[0]!;
    expect(checkFacePreference(doc, edge, { ...PREF, nodeId: 99 })).toEqual({ ok: false, reason: 'not-endpoint' });
    expect(checkFacePreference(doc, edge, { ...PREF, offset: [0, 3, 0] })).toEqual({ ok: false, reason: 'outside-room' });
    expect(checkFacePreference(doc, edge, { ...PREF, direction: '-x' })).toEqual({ ok: false, reason: 'not-shared' });
  });
});

describe('resolveWithPreferences', () => {
  it('without preferences equals resolveRelationships exactly (and ignores unknown edges)', () => {
    const doc = pair([1, 0, 0], [{ id: 3, position: [5, 0, 0] }, { id: 4, position: [9, 9, 4] }], [
      { id: 2, source: 1, target: 3 },
      { id: 3, source: 1, target: 4 },
    ]);
    expectSameResolution(resolveWithPreferences(doc, {}), resolveRelationships(doc));
    expectSameResolution(resolveWithPreferences(doc, { 99: PREF }), resolveRelationships(doc));
  });

  it('a valid preference only adds preferredFace to the direct resolution', () => {
    const doc = pair();
    const plain = resolveRelationships(doc);
    const r = resolveWithPreferences(doc, { 1: PREF });
    expect(r.byEdge.get(1)).toEqual({ ...plain.byEdge.get(1), preferredFace: { cell: [0, 2, 0], direction: '+x' } });
    expect([...r.occupancy.cells.entries()]).toEqual([...plain.occupancy.cells.entries()]);
  });

  it('survives moving both rooms together', () => {
    let doc = pair();
    doc = expectOk(applyDesignCommand(doc, { type: 'set-node-geometry', nodeId: 2, position: [11, 5, 2] }));
    doc = expectOk(applyDesignCommand(doc, { type: 'set-node-geometry', nodeId: 1, position: [10, 5, 2] }));
    const r = resolveWithPreferences(doc, { 1: PREF }).byEdge.get(1)!;
    expect(r.status).toBe('direct');
    expect(r.status === 'direct' && r.preferredFace).toEqual({ cell: [10, 7, 2], direction: '+x' });
  });

  it('survives moving the other room while the face stays shared', () => {
    const doc = pair([1, 1, 0]); // b now covers y 1..3: a's y = 2 face is still shared
    const r = resolveWithPreferences(doc, { 1: PREF }).byEdge.get(1)!;
    expect(r.status === 'direct' && r.preferredFace).toEqual({ cell: [0, 2, 0], direction: '+x' });
  });

  it('moving one room so the face is no longer shared keeps the edge but makes it unresolved, never routed', () => {
    const doc = pair([1, -2, 0]); // b covers y -2..0: still touching a at y = 0, but not at y = 2
    expect(resolveRelationships(doc).byEdge.get(1)!.status).toBe('direct');
    const r = resolveWithPreferences(doc, { 1: PREF });
    expect(doc.edges.map((e) => e.id)).toEqual([1]);
    expect(r.byEdge.get(1)).toMatchObject({ status: 'unresolved', reason: 'preferred-face-unavailable' });

    // Separated rooms: the edge would be routed without the preference, but reserves nothing with it.
    const apart = pair([4, 0, 0]);
    expect(resolveRelationships(apart).byEdge.get(1)!.status).toBe('routed');
    const ra = resolveWithPreferences(apart, { 1: PREF });
    expect(ra.byEdge.get(1)).toMatchObject({ status: 'unresolved', reason: 'preferred-face-unavailable' });
    expect([...ra.occupancy.cells.values()].some((o) => o.kind === 'route')).toBe(false);
  });

  it('resizing a room so the offset falls outside it makes the preference invalid', () => {
    const doc = expectOk(applyDesignCommand(pair(), { type: 'set-node-geometry', nodeId: 1, size: [1, 2, 1] }));
    expect(checkFacePreference(doc, doc.edges[0]!, PREF)).toEqual({ ok: false, reason: 'outside-room' });
    expect(resolveWithPreferences(doc, { 1: PREF }).byEdge.get(1)).toMatchObject({ reason: 'preferred-face-unavailable' });
  });
});

describe('scenario commands', () => {
  const content = (prefs: FacePreferences = {}): ScenarioContent => ({ design: pair(), facePreferences: prefs });

  it('set-face-preference sets only a shared face, and clearing returns to the representative face', () => {
    const set = expectOk(applyScenarioCommand(content(), { type: 'set-face-preference', edgeId: 1, preference: PREF }));
    expect(set.facePreferences).toEqual({ 1: PREF });
    const bad = applyScenarioCommand(content(), { type: 'set-face-preference', edgeId: 1, preference: { ...PREF, direction: '-x' } });
    expect(bad.ok).toBe(false);
    const cleared = expectOk(applyScenarioCommand(set, { type: 'set-face-preference', edgeId: 1, preference: null }));
    expect(cleared.facePreferences).toEqual({});
    expectSameResolution(resolveWithPreferences(cleared.design, cleared.facePreferences), resolveRelationships(cleared.design));
  });

  it('add-edge-at-face adds the edge and its preference in one result; an invalid face adds nothing', () => {
    const start: ScenarioContent = { design: make([{ id: 1, position: [0, 0, 0], size: [1, 3, 1] }, { id: 2, position: [1, 0, 0], size: [1, 3, 1] }], []), facePreferences: {} };
    const next = expectOk(applyScenarioCommand(start, { type: 'add-edge-at-face', edge: { source: 1, target: 2 }, preference: PREF }));
    expect(next.design.edges.map((e) => e.id)).toEqual([1]);
    expect(next.facePreferences).toEqual({ 1: PREF });
    const refused = applyScenarioCommand(start, {
      type: 'add-edge-at-face',
      edge: { source: 1, target: 2 },
      preference: { ...PREF, offset: [0, 7, 0] },
    });
    expect(refused.ok).toBe(false);
  });

  it('removing the edge or a room drops the preference in the same step; moving keeps it', () => {
    const withPref = content({ 1: PREF });
    expect(expectOk(applyScenarioCommand(withPref, { type: 'remove-edge', edgeId: 1 })).facePreferences).toEqual({});
    expect(expectOk(applyScenarioCommand(withPref, { type: 'remove-node', nodeId: 2 })).facePreferences).toEqual({});
    const moved = expectOk(applyScenarioCommand(withPref, { type: 'set-node-geometry', nodeId: 2, position: [6, 0, 0] }));
    expect(moved.design.edges.map((e) => e.id)).toEqual([1]);
    expect(moved.facePreferences).toEqual({ 1: PREF });
  });

  it('remove-edges in a scenario sees preference-unavailable edges as unresolved', () => {
    const broken: ScenarioContent = { design: pair([1, -2, 0]), facePreferences: { 1: PREF } };
    expect(applyDesignCommand(broken.design, { type: 'remove-edges', edgeIds: [1] }).ok).toBe(false); // direct without prefs
    const removed = expectOk(applyScenarioCommand(broken, { type: 'remove-edges', edgeIds: [1] }));
    expect(removed.design.edges).toEqual([]);
    expect(removed.facePreferences).toEqual({});
  });

  it('scenario content serialises to JSON and back, validated by facePreferencesSchema', () => {
    const c = content({ 1: PREF });
    const parsed = JSON.parse(JSON.stringify(c)) as { design: unknown; facePreferences: unknown };
    const prefs = facePreferencesSchema.parse(parsed.facePreferences);
    expect(prefs).toEqual(c.facePreferences);
    expect(expectOk(validateDocumentV2(parsed.design))).toEqual(c.design);
    expect(facePreferencesSchema.safeParse({ 1: { ...PREF, extra: 1 } }).success).toBe(false);
    // A stale (rebased, out-of-room) offset may be negative and must round-trip; it is not a valid face.
    expect(facePreferencesSchema.safeParse({ 1: { ...PREF, offset: [0, -1, 0] } }).success).toBe(true);
    expect(facePreferencesSchema.safeParse({ 1: { ...PREF, offset: [0, 0.5, 0] } }).success).toBe(false);
    expect(applyScenarioCommand(content(), { type: 'set-face-preference', edgeId: 1, preference: { ...PREF, offset: [0, -1, 0] } }).ok).toBe(false);
    expect(facePreferencesSchema.safeParse({ 1: { ...PREF, direction: 'up' } }).success).toBe(false);
    expect(facePreferencesSchema.safeParse({ 'bad id': PREF }).success).toBe(false);
  });
});

describe('preferred face under move and resize (owner rule)', () => {
  const content = (): ScenarioContent => ({ design: pair(), facePreferences: { 1: PREF } });
  const preferred = (c: ScenarioContent) => resolveWithPreferences(c.design, c.facePreferences).byEdge.get(1)!;

  it('resizing keeps the preferred face at its absolute cell (audit probe)', () => {
    const next = expectOk(applyScenarioCommand(content(), { type: 'set-node-geometry', nodeId: 1, position: [0, -1, 0], size: [1, 4, 1] }));
    expect(next.facePreferences).toEqual({ 1: { nodeId: 1, offset: [0, 3, 0], direction: '+x' } });
    const r = preferred(next);
    expect(r.status).toBe('direct');
    expect(r.status === 'direct' && r.preferredFace).toEqual({ cell: [0, 2, 0], direction: '+x' });
  });

  it('a pure translation keeps the offset: the face moves with the room', () => {
    // Move both rooms; same sizes.
    let c = expectOk(applyScenarioCommand(content(), { type: 'set-node-geometry', nodeId: 2, position: [11, 5, 2] }));
    c = expectOk(applyScenarioCommand(c, { type: 'set-node-geometry', nodeId: 1, position: [10, 5, 2] }));
    expect(c.facePreferences).toEqual({ 1: PREF });
    const r = preferred(c);
    expect(r.status === 'direct' && r.preferredFace).toEqual({ cell: [10, 7, 2], direction: '+x' });
  });

  it('shrinking the room away from the face keeps it in absolute terms: unresolved, edge kept, no other face', () => {
    // a now covers y 0..1 only: absolute cell [0,2,0] is outside it.
    const shrunk = expectOk(applyScenarioCommand(content(), { type: 'set-node-geometry', nodeId: 1, size: [1, 2, 1] }));
    expect(shrunk.facePreferences).toEqual({ 1: PREF });
    expect(shrunk.design.edges.map((e) => e.id)).toEqual([1]);
    expect(preferred(shrunk)).toMatchObject({ status: 'unresolved', reason: 'preferred-face-unavailable' });

    // Resized from the min side (a now covers y 1..2; the face at absolute y = 0 is below it): negative offset.
    const moved = expectOk(
      applyScenarioCommand({ design: pair([1, 0, 0]), facePreferences: { 1: { ...PREF, offset: [0, 0, 0] } } }, {
        type: 'set-node-geometry',
        nodeId: 1,
        position: [0, 1, 0],
        size: [1, 2, 1],
      }),
    );
    expect(moved.facePreferences).toEqual({ 1: { nodeId: 1, offset: [0, -1, 0], direction: '+x' } });
    expect(preferred(moved)).toMatchObject({ status: 'unresolved', reason: 'preferred-face-unavailable' });
    // The stale preference survives a JSON round trip through the schema.
    expect(facePreferencesSchema.parse(JSON.parse(JSON.stringify(moved.facePreferences)))).toEqual(moved.facePreferences);
  });

  it('rebasePreferences returns the same object when no preferred room changed size', () => {
    const c = content();
    const moved = expectOk(applyDesignCommand(c.design, { type: 'set-node-geometry', nodeId: 2, position: [1, 1, 0] }));
    expect(rebasePreferences(c.facePreferences, c.design, moved)).toBe(c.facePreferences);
  });
});

describe('preferences only for access edges', () => {
  const openPair = () =>
    make([{ id: 1, position: [0, 0, 0], size: [1, 3, 1] }, { id: 2, position: [1, 0, 0], size: [1, 3, 1] }], [{ id: 1, source: 1, target: 2, relationship: 'open' }]);

  it('set-face-preference and add-edge-at-face refuse an open edge with a readable issue', () => {
    const set = applyScenarioCommand({ design: openPair(), facePreferences: {} }, { type: 'set-face-preference', edgeId: 1, preference: PREF });
    expect(set.ok).toBe(false);
    expect(!set.ok && set.issues[0]!.message).toMatch(/only access edges/);
    const empty: ScenarioContent = { design: make([{ id: 1, position: [0, 0, 0], size: [1, 3, 1] }, { id: 2, position: [1, 0, 0], size: [1, 3, 1] }], []), facePreferences: {} };
    const added = applyScenarioCommand(empty, { type: 'add-edge-at-face', edge: { source: 1, target: 2, relationship: 'open' }, preference: PREF });
    expect(added.ok).toBe(false);
    expect(!added.ok && added.issues[0]!.message).toMatch(/only access edges/);
  });

  it('change-edge-kind to open drops the preference in the same step; back to access does not resurrect it', () => {
    const start: ScenarioContent = { design: pair(), facePreferences: { 1: PREF } };
    const open = expectOk(applyScenarioCommand(start, { type: 'change-edge-kind', edgeId: 1, relationship: 'open' }));
    expect(open.facePreferences).toEqual({});
    const back = expectOk(applyScenarioCommand(open, { type: 'change-edge-kind', edgeId: 1, relationship: 'access' }));
    expect(back.facePreferences).toEqual({});
  });

  it('resolveWithPreferences ignores a stale preference on an open edge (audit probe)', () => {
    const doc = make([{ id: 1, position: [0, 0, 0], size: [1, 3, 1] }, { id: 2, position: [1, -2, 0], size: [1, 3, 1] }], [{ id: 1, source: 1, target: 2, relationship: 'open' }]);
    const r = resolveWithPreferences(doc, { 1: PREF });
    expect(r.byEdge.get(1)!.status).not.toBe('unresolved');
    expectSameResolution(r, resolveRelationships(doc));
  });
});

describe('set-face-preference no-op', () => {
  it('the identical preference, or clearing a missing one, returns the same content object', () => {
    const c: ScenarioContent = { design: pair(), facePreferences: { 1: PREF } };
    expect(expectOk(applyScenarioCommand(c, { type: 'set-face-preference', edgeId: 1, preference: { ...PREF, offset: [0, 2, 0] } }))).toBe(c);
    const none: ScenarioContent = { design: pair(), facePreferences: {} };
    expect(expectOk(applyScenarioCommand(none, { type: 'set-face-preference', edgeId: 1, preference: null }))).toBe(none);
    // A different face is a real change.
    expect(expectOk(applyScenarioCommand(c, { type: 'set-face-preference', edgeId: 1, preference: { ...PREF, offset: [0, 1, 0] } }))).not.toBe(c);
  });
});

describe('remove-edges', () => {
  const doc = () =>
    make(
      [
        { id: 1, position: [0, 0, 0] },
        { id: 2, position: [1, 0, 0] },
        { id: 3, position: [5, 5, 3] },
        { id: 4, position: [9, 9, 6] },
      ],
      [
        { id: 1, source: 1, target: 2 },
        { id: 2, source: 1, target: 3 },
        { id: 3, source: 1, target: 4 },
      ],
    );

  it('removes exactly the listed unresolved edges', () => {
    const next = expectOk(applyDesignCommand(doc(), { type: 'remove-edges', edgeIds: [3, 2] }));
    expect(next.edges.map((e) => e.id)).toEqual([1]);
    expect(next.nodes).toEqual(doc().nodes);
  });

  it('refuses an empty list, duplicates, unknown ids and built edges, changing nothing', () => {
    const d = doc();
    for (const edgeIds of [[], [2, 2], [2, 99], [2, 1]]) {
      const r = applyDesignCommand(d, { type: 'remove-edges', edgeIds });
      expect(r.ok, JSON.stringify(edgeIds)).toBe(false);
    }
    expect(d).toEqual(doc());
  });
});
