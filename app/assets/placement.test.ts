import { type DesignDocumentV2, type FacadeModule, functionLooks, functionStyleSettings, validateDocumentV2 } from '@app/document';
import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { buildBuildingV2, DEFAULT_WALL_THICKNESS, layoutFace, type BuildingFace, type Vec3 } from '@app/building';
import { applyDesignCommand } from '@app/spatial';
import type { GridCoord } from '@core/spatial';
import { designUsesFacadeModules, distortedModules, EMPTY_FACADE_MODULES, facadeAssetIdsOf, layoutFacadeModules, cardsUsingFacade, withoutFacadeAsset, type FacadeModuleInstance } from './placement';

const A1 = 'facade-0123456789abcdef';
const A2 = 'facade-fedcba9876543210';
const BAY = { width: 3, height: 3 };
const RUN9 = { width: 9, height: 3 };
const sizes: Record<string, { width: number; height: number; depth: number }> = {
  [A1]: { ...BAY, depth: 0.2 },
  [A2]: { ...RUN9, depth: 0.2 },
};
const sizeOf = (id: string) => sizes[id] ?? null;

type N = { id: number; grid: GridCoord; size?: [number, number, number]; typeId: string };

/** Gallery A (1): 3 × 1 × 1 bays at the origin; studio B (2): one cell east of it, joined by access edge 1. */
function design(settings: Record<string, unknown> = {}, nodes?: N[]): DesignDocumentV2 {
  const rooms: N[] = nodes ?? [
    { id: 1, grid: [0, 0, 0], size: [3, 1, 1], typeId: 'gallery' },
    { id: 2, grid: [3, 0, 0], typeId: 'studio' },
  ];
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'facades' },
      nodes: rooms.map((n) => ({ id: n.id, grid: n.grid, size: n.size ?? [1, 1, 1], typeId: n.typeId })),
      edges: nodes ? [] : [{ id: 1, source: 1, target: 2, kind: 'access' }],
      settings: { styleBy: 'function', styles: {}, ...settings },
    }),
  );
}

const repeat = (assetId = A1): FacadeModule => ({ assetId, placement: 'repeat' });
const stretch = (assetId = A1): FacadeModule => ({ assetId, placement: 'stretch' });
/** The same module for both functions (there is no design-wide default; each function chooses). */
const both = (m: FacadeModule) => (functionStyleSettings({ gallery: { facade: m }, studio: { facade: m } }));

function modules(doc: DesignDocumentV2) {
  const built = buildBuildingV2(doc);
  return { faces: built.faces, layout: layoutFacadeModules(built.faces, built.looks, sizeOf) };
}

const exteriorWalls = (faces: readonly BuildingFace[], owner?: number) =>
  faces.filter((f) => f.orientation === 'wall' && f.condition === 'exterior' && (owner === undefined || f.ownerNodeId === owner));

const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const apply = (m: Float64Array, p: Vec3): Vec3 => [
  m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
  m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
  m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
];
const det3 = (m: Float64Array) =>
  m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) + m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);

describe('imported façade modules: which walls, Repeat and Stretch', () => {
  it('no façade settings: nothing, and the shared empty layout', () => {
    const doc = design();
    expect(designUsesFacadeModules(doc)).toBe(false);
    expect(modules(doc).layout).toBe(EMPTY_FACADE_MODULES);
  });

  it('Repeat puts one module on every exterior wall bay of each function that chose it', () => {
    const doc = design(both(repeat()));
    const { faces, layout } = modules(doc);
    expect(layout.missingAssets).toEqual([]);
    // a: −y 3 bays, +y 3 bays, −x 1 (its +x side is shared with b); b: −y, +y, +x.
    expect(exteriorWalls(faces, 1)).toHaveLength(7);
    expect(exteriorWalls(faces, 2)).toHaveLength(3);
    expect(layout.instances).toHaveLength(10);
    expect(new Set(layout.instances.map((i) => i.id)).size).toBe(10);
    for (const i of layout.instances) {
      expect(i).toMatchObject({ assetId: A1, placement: 'repeat', scaleAlong: 1, scaleUp: 1 });
      expect(i.faceIds).toHaveLength(1);
    }
    // Shared walls (a|b, with or without a door) and slabs never get one.
    const covered = new Set(layout.instances.flatMap((i) => i.faceIds));
    for (const f of faces) if (f.orientation !== 'wall' || f.condition !== 'exterior') expect(covered.has(f.id)).toBe(false);
  });

  it('Stretch fits one module across each wall run (3 bays → one 9 m module)', () => {
    const doc = design(functionStyleSettings({ gallery: { facade: stretch(A2) } }));
    const { layout } = modules(doc);
    const a = layout.instances.filter((i) => i.ownerNodeId === 1);
    expect(a.map((i) => [i.placement, i.faceIds.length]).sort()).toEqual([
      ['stretch', 1],
      ['stretch', 3],
      ['stretch', 3],
    ]);
    const long = a.filter((i) => i.faceIds.length === 3);
    for (const i of long) expect(i.scaleAlong).toBeCloseTo(1, 12); // a 9 m source on 9 m: true size
    const short = a.find((i) => i.faceIds.length === 1)!;
    expect(short.scaleAlong).toBeCloseTo(1 / 3, 12); // the 9 m module squeezed onto one 3 m bay
    expect(distortedModules(layout.instances, 'gallery')).toMatchObject({ count: 1, minAlong: 1 / 3, maxAlong: 1 / 3 });
    // The studio chose nothing: no module.
    expect(layout.instances.some((i) => i.ownerNodeId === 2)).toBe(false);
  });

  it('a 3 m module repeated stays true size; the same module stretched over 3 bays is scaled ×3', () => {
    const repeated = modules(design(both(repeat(A1)))).layout.instances;
    expect(distortedModules(repeated, 'gallery')).toBeNull();
    const stretched = modules(design(both(stretch(A1)))).layout.instances;
    expect(distortedModules(stretched, 'gallery')).toMatchObject({ count: 2, minAlong: 3, maxAlong: 3, minUp: 1, maxUp: 1 });
  });

  it('each function draws only its own module; a function without one gets none', () => {
    const doc = design(functionStyleSettings({ gallery: { facade: stretch(A2) }, studio: { windowFraction: 0.5 } }));
    const { layout } = modules(doc);
    expect(new Set(layout.instances.map((i) => i.ownerTypeId))).toEqual(new Set(['gallery']));
    expect(new Set(layout.instances.map((i) => i.assetId))).toEqual(new Set([A2]));
    expect(facadeAssetIdsOf(doc)).toEqual([A2]);
    expect(facadeAssetIdsOf(design(functionStyleSettings({ gallery: { facade: repeat(A2) }, studio: { facade: repeat(A1) } })))).toEqual([A1, A2].sort());
  });

  it('a design-wide facadeDefault is not part of the format; a card may say "none" (opt out of Default, 2026-11-18)', () => {
    const base = { schemaVersion: 2, metadata: { name: 'x' }, nodes: [], edges: [] };
    expect(validateDocumentV2({ ...base, settings: { styleBy: 'function', styles: {}, facadeDefault: repeat() } }).ok).toBe(false);
    expect(validateDocumentV2({ ...base, settings: { styleBy: 'function', styles: { function: { groups: [{ value: 'gallery', look: { facade: 'none' } }] } } } }).ok).toBe(true);
  });

  it('open-sided functions (no exterior walls) never get a module', () => {
    const doc = design(functionStyleSettings({ gallery: { walls: 'open', facade: repeat() }, studio: { facade: repeat() } }));
    const { layout } = modules(doc);
    expect(layout.instances.every((i) => i.ownerTypeId === 'studio')).toBe(true);
    expect(layout.instances).toHaveLength(3);
  });

  it('an asset missing from the project draws nothing and is reported', () => {
    const missing = 'facade-aaaaaaaaaaaaaaaa';
    const doc = design(functionStyleSettings({ gallery: { facade: repeat(missing) }, studio: { facade: repeat(A1) } }));
    const { layout } = modules(doc);
    expect(layout.missingAssets).toEqual([missing]);
    expect(layout.instances.every((i) => i.assetId === A1 && i.ownerNodeId === 2)).toBe(true);
  });
});

describe('imported façade modules: mounting (Rhino coordinate adaptation; the module replaces the wall)', () => {
  /** A single room: four exterior walls with outward normals +X, −X, −Z (grid +y) and +Z (grid −y). */
  const single = design(functionStyleSettings({ gallery: { facade: repeat() } }), [{ id: 1, grid: [2, 5, 1], typeId: 'gallery' }]);
  const { faces, layout } = modules(single);
  const t = DEFAULT_WALL_THICKNESS;
  const depth = 0.2;

  it.each(['+x', '-x', '+y', '-y'] as const)('wall %s: exactly one bay wide and one storey high, back on the inner wall surface, unmirrored', (direction) => {
    const face = faces.find((f) => f.direction === direction && f.orientation === 'wall')!;
    const instance: FacadeModuleInstance = layout.instances.find((i) => i.faceIds[0] === face.id)!;
    const frame = layoutFace(face).frame;
    const right = cross(frame.v, frame.normal);
    const corners: Vec3[] = [];
    for (const a of [0, 3]) for (const b of [0, 3]) for (const c of [0, depth]) corners.push(apply(instance.matrix, [a, b, c]));
    const along = corners.map((p) => dot(sub(p, frame.origin), right));
    const up = corners.map((p) => dot(sub(p, frame.origin), frame.v));
    const out = corners.map((p) => dot(sub(p, frame.origin), frame.normal));
    expect(Math.min(...along)).toBeCloseTo(-1.5, 9);
    expect(Math.max(...along)).toBeCloseTo(1.5, 9);
    expect(Math.min(...up)).toBeCloseTo(-1.5, 9);
    expect(Math.max(...up)).toBeCloseTo(1.5, 9);
    expect(Math.min(...out)).toBeCloseTo(-t / 2, 9); // back of the module on the wall's INNER surface: it replaces the wall
    expect(Math.max(...out)).toBeCloseTo(-t / 2 + depth, 9); // depth never scaled
    // a = 0 (the module's left edge seen from outside) lands on the LEFT seen from outside.
    expect(dot(sub(apply(instance.matrix, [0, 0, 0]), frame.origin), right)).toBeCloseTo(-1.5, 9);
    expect(det3(instance.matrix)).toBeGreaterThan(0); // a rotation (+ positive scale), never a mirror
  });
});

describe('Outside +Y (flip): the module is turned round, not mirrored', () => {
  const flipped = design(functionStyleSettings({ gallery: { facade: { ...repeat(), flip: true } } }), [{ id: 1, grid: [2, 5, 1], typeId: 'gallery' }]);
  const plain = design(functionStyleSettings({ gallery: { facade: repeat() } }), [{ id: 1, grid: [2, 5, 1], typeId: 'gallery' }]);
  it.each(['+x', '-x', '+y', '-y'] as const)('wall %s: same bay and depth slot, other side out, a rotation', (direction) => {
    const f = modules(flipped);
    const p = modules(plain);
    const face = f.faces.find((x) => x.direction === direction && x.orientation === 'wall')!;
    const mf = f.layout.instances.find((i) => i.faceIds[0] === face.id)!.matrix;
    const mp = p.layout.instances.find((i) => i.faceIds[0] === face.id)!.matrix;
    const frame = layoutFace(face).frame;
    const right = cross(frame.v, frame.normal);
    const t = DEFAULT_WALL_THICKNESS;
    // (a, b, c) on the flipped module lands where (3 − a, b, 0.2 − c) lands on the plain one.
    for (const [a, b, c] of [[0, 0, 0], [3, 3, 0.2], [0.5, 1, 0.05]] as Vec3[]) {
      const x = apply(mf, [a, b, c]);
      const y = apply(mp, [3 - a, b, 0.2 - c]);
      for (let k = 0; k < 3; k++) expect(x[k]).toBeCloseTo(y[k]!, 9);
    }
    // The model's front (c = depth) now faces the room; its back (c = 0) faces out.
    expect(dot(sub(apply(mf, [1.5, 1.5, 0]), frame.origin), frame.normal)).toBeCloseTo(-t / 2 + 0.2, 9);
    expect(dot(sub(apply(mf, [1.5, 1.5, 0.2]), frame.origin), frame.normal)).toBeCloseTo(-t / 2, 9);
    expect(dot(sub(apply(mf, [0, 0, 0]), frame.origin), right)).toBeCloseTo(1.5, 9);
    expect(det3(mf)).toBeGreaterThan(0);
  });
});

describe('regression: imported façades never change the Building elements', () => {
  it('buildBuildingV2 output is identical with and without façade settings', () => {
    const plain = design();
    const withFacades = design(functionStyleSettings({ gallery: { facade: stretch(A2) }, studio: { facade: repeat(A1) } }));
    // Same faces, elements and connectors; only the per-room looks (which carry the module) differ.
    const { looks: _withLooks, ...withRest } = buildBuildingV2(withFacades);
    const { looks: _plainLooks, ...plainRest } = buildBuildingV2(plain);
    expect(withRest).toEqual(plainRest);
  });

  it('set-look sets and clears the façade of a function (one step each)', () => {
    const doc = design();
    const set = expectOk(applyDesignCommand(doc, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'studio' }, patch: { facade: stretch() } }));
    expect(functionLooks(set.settings).studio).toEqual({ facade: stretch() });
    const cleared = expectOk(applyDesignCommand(set, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'studio' }, patch: { facade: null } }));
    expect(functionLooks(cleared.settings)).toEqual({ studio: {} }); // the card stays, now empty
    expect(applyDesignCommand(doc, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'studio' }, patch: { facade: { assetId: 'not-an-id', placement: 'repeat' } } }).ok).toBe(false);
    // Door / open bay variants survive the command (regression: they were dropped, so the Door bay could not be set).
    const withBays = { ...stretch(), door: { assetId: A2, flip: true as const }, open: { assetId: A1 } };
    const bays = expectOk(applyDesignCommand(doc, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'studio' }, patch: { facade: withBays } }));
    expect(functionLooks(bays.settings).studio).toEqual({ facade: withBays });
    // Another field changed later keeps them too.
    const roofed = expectOk(applyDesignCommand(bays, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'studio' }, patch: { roof: 'none' } }));
    expect(functionLooks(roofed.settings).studio?.facade).toEqual(withBays);
  });
});

describe('door / open bay variants (optional per function)', () => {
  /** a and b two cells apart, joined by an open-air (deck) connector of `kind`; c touches a directly (interior door). */
  function linked(kind: 'access' | 'open', facade: FacadeModule, connectorStyle: 'deck' | 'enclosed' = 'deck'): DesignDocumentV2 {
    return expectOk(
      validateDocumentV2({
        schemaVersion: 2,
        metadata: { name: 'variants' },
        nodes: [
          { id: 1, grid: [0, 0, 0], size: [1, 1, 1], typeId: 'gallery' },
          { id: 2, grid: [3, 0, 0], size: [1, 1, 1], typeId: 'gallery' },
          { id: 3, grid: [0, 1, 0], size: [1, 1, 1], typeId: 'gallery' },
        ],
        edges: [
          { id: 1, source: 1, target: 2, kind, connectorStyle },
          { id: 2, source: 1, target: 3, kind: 'access' },
        ],
        settings: functionStyleSettings({ gallery: { facade } }),
      }),
    );
  }
  const variantFaces = (faces: readonly BuildingFace[], condition: 'door' | 'open') => faces.filter((f) => f.orientation === 'wall' && f.condition === condition && f.outside);

  it('a door module replaces each outside door bay; interior doors and walls keep their own geometry', () => {
    const doc = linked('access', { ...repeat(A1), door: { assetId: A2 } });
    const { faces, layout } = modules(doc);
    const doors = variantFaces(faces, 'door');
    expect(doors).toHaveLength(2); // both connector ends
    const doorModules = layout.instances.filter((i) => i.variant === 'door');
    expect(doorModules.map((i) => i.faceIds[0]).sort()).toEqual(doors.map((f) => f.id).sort());
    for (const i of doorModules) expect(i).toMatchObject({ assetId: A2, placement: 'repeat', scaleAlong: 1 / 3, scaleUp: 1 });
    // The interior door between a and c gets nothing; every exterior wall still gets the wall module.
    const interiorDoor = faces.find((f) => f.condition === 'door' && !f.outside)!;
    expect(layout.instances.some((i) => i.faceIds.includes(interiorDoor.id))).toBe(false);
    expect(layout.instances.filter((i) => i.variant === 'wall')).toHaveLength(exteriorWalls(faces).length);
    expect(new Set(layout.instances.map((i) => i.id)).size).toBe(layout.instances.length);
  });

  it('without the variant, door and open bays keep the automatic geometry (no module)', () => {
    for (const kind of ['access', 'open'] as const) {
      const { layout } = modules(linked(kind, repeat(A1)));
      expect(layout.instances.every((i) => i.variant === 'wall')).toBe(true);
    }
    // A door variant does not apply to open bays, and vice versa.
    expect(modules(linked('open', { ...repeat(A1), door: { assetId: A2 } })).layout.instances.some((i) => i.variant !== 'wall')).toBe(false);
  });

  it('an open module replaces each outside open bay, turned round when flipped', () => {
    const plain = modules(linked('open', { ...repeat(A1), open: { assetId: A1 } })).layout.instances.filter((i) => i.variant === 'open');
    const flipped = modules(linked('open', { ...repeat(A1), open: { assetId: A1, flip: true } })).layout.instances.filter((i) => i.variant === 'open');
    expect(plain).toHaveLength(2);
    expect(flipped.map((i) => i.id)).toEqual(plain.map((i) => i.id));
    expect([...flipped[0]!.matrix]).not.toEqual([...plain[0]!.matrix]);
    expect(det3(flipped[0]!.matrix)).toBeGreaterThan(0); // a rotation, never a mirror
  });

  it('enclosed corridors have no outside door bays: no door module', () => {
    const { layout } = modules(linked('access', { ...repeat(A1), door: { assetId: A2 } }, 'enclosed'));
    expect(layout.instances.some((i) => i.variant === 'door')).toBe(false);
  });

  it('variant assets count as used and are reported when missing', () => {
    const doc = linked('access', { ...repeat(A1), door: { assetId: 'facade-00000000000000aa' }, open: { assetId: A2 } });
    expect(facadeAssetIdsOf(doc)).toEqual(['facade-00000000000000aa', A1, A2].sort());
    expect(modules(doc).layout.missingAssets).toEqual(['facade-00000000000000aa']);
  });

  it('the format accepts door / open variants and refuses unknown fields or a placement on a variant', () => {
    expect((functionLooks(design(functionStyleSettings({ gallery: { facade: { ...repeat(), door: { assetId: A2, flip: true }, open: { assetId: A1 } } } })).settings).gallery?.facade as FacadeModule | undefined)?.door).toEqual({ assetId: A2, flip: true });
    const refused = (variant: unknown) =>
      validateDocumentV2({ schemaVersion: 2, metadata: { name: 'x' }, nodes: [], edges: [], settings: { styleBy: 'function', styles: { function: { groups: [{ value: 'gallery', look: { facade: { ...repeat(), door: variant } } }] } } } }).ok;
    expect(refused({ assetId: A2, placement: 'repeat' })).toBe(false);
    expect(refused({ assetId: 'nope' })).toBe(false);
    expect(refused({ assetId: A2, flip: false })).toBe(false);
  });
});

describe('removing a used façade: its uses become Automatic', () => {
  it('drops the façade where it is the module, only the bay where it is a bay module; untouched designs are the same object', () => {
    const doc = design(
      functionStyleSettings({
        gallery: { facade: { ...repeat(A1), door: { assetId: A2 } }, roof: 'none' },
        studio: { facade: { ...stretch(A2), open: { assetId: A1 }, door: { assetId: A2 } } },
      }),
    );
    expect(cardsUsingFacade(doc, A1)).toEqual(['gallery', 'studio']);
    const out = withoutFacadeAsset(doc, A1);
    expect(functionLooks(out.settings).gallery).toEqual({ roof: 'none' }); // the façade is gone, its door bay with it
    expect(functionLooks(out.settings).studio).toEqual({ facade: { ...stretch(A2), door: { assetId: A2 } } });
    expect(facadeAssetIdsOf(out)).toEqual([A2]);
    expect(withoutFacadeAsset(out, A1)).toBe(out);
    // A card whose only setting was the façade stays, empty: its rooms inherit everything again.
    expect(functionLooks(withoutFacadeAsset(design(both(repeat(A1))), A1).settings)).toEqual({ gallery: {}, studio: {} });
    expect(validateDocumentV2(out).ok).toBe(true);
  });
});
