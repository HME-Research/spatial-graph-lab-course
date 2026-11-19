import { describe, expect, it } from 'vitest';
import { expectIssue, expectOk } from './test-fixtures';
import {
  bandIndex,
  effectiveLook,
  groupOfValue,
  nodeLooks,
  readDesignJson,
  serializeDesignV2,
  storedLooks,
  styleSetupOf,
  validateDocumentV2,
  type DesignDocumentV2,
  type DesignSettings,
  type StyleSetup,
} from './index';

/** "Style rooms by" (owner 2026-11-18): the evaluator and the stored format. */

type Room = { id: number; typeId: string; z?: number };

function design(rooms: Room[], settings: unknown): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'styles' },
      // Rooms apart from each other: no contact needed here.
      nodes: rooms.map((r, i) => ({ id: r.id, grid: [i * 3, 0, r.z ?? 0], size: [1, 1, 1], typeId: r.typeId })),
      edges: [],
      settings,
    }),
  );
}

const base = (fraction: number) => () => ({ windowFraction: fraction });

describe('which card a room falls in', () => {
  it('bands are [lower, next): the first and last are open-ended; boundaries belong to the upper band', () => {
    expect(bandIndex([50, 100], 10)).toBe(0);
    expect(bandIndex([50, 100], 50)).toBe(1);
    expect(bandIndex([50, 100], 99.99)).toBe(1);
    expect(bandIndex([50, 100], 100)).toBe(2);
    expect(bandIndex([50, 100], 1e9)).toBe(2);
    expect(bandIndex([], 7)).toBe(0);
  });

  it('value cards match exactly; text is trimmed and case-insensitive; no match or no value is Default', () => {
    const setup: StyleSetup = { groups: [{ value: 'Gallery', look: {} }, { value: 3, look: {} }, { value: true, look: {} }] };
    expect(groupOfValue(setup, '  gallery ')).toEqual({ kind: 'value', value: 'Gallery' });
    expect(groupOfValue(setup, 3)).toEqual({ kind: 'value', value: 3 });
    expect(groupOfValue(setup, '3')).toEqual({ kind: 'default' }); // a number card is not a text card
    expect(groupOfValue(setup, true)).toEqual({ kind: 'value', value: true });
    expect(groupOfValue(setup, false)).toEqual({ kind: 'default' });
    for (const missing of [undefined, null, '', '   ', Number.NaN, {}]) expect(groupOfValue(setup, missing)).toEqual({ kind: 'default' });
  });

  it('a banded setup puts numbers in bands and everything else in Default', () => {
    const setup: StyleSetup = { dividers: [50, 100], bands: [{}, {}, {}] };
    expect(groupOfValue(setup, 75)).toEqual({ kind: 'band', index: 1 });
    expect(groupOfValue(setup, 'big')).toEqual({ kind: 'default' });
    expect(groupOfValue(setup, undefined)).toEqual({ kind: 'default' });
  });
});

describe('effective look: card → Default → toolkit → built-in', () => {
  const setup: StyleSetup = {
    default: { windowFraction: 0.3, roof: 'pergola' },
    groups: [{ value: 'gallery', look: { windowFraction: 0.1 } }],
  };

  it('a card wins; what it leaves out comes from Default, then the toolkit, then built-in', () => {
    const look = effectiveLook(setup, { kind: 'value', value: 'gallery' }, { windowFraction: 0.9 });
    expect(look).toMatchObject({ windowFraction: 0.1, roof: 'pergola', windowLayout: 'repeat', walls: 'enclosed', facade: null });
    expect(look.source).toEqual({ windowFraction: 'card', roof: 'default', windowLayout: 'base', walls: 'base', facade: 'base' });
  });

  it('Default applies to rooms without a card, and the toolkit value only when Default leaves it out', () => {
    expect(effectiveLook(setup, { kind: 'default' }, { windowFraction: 0.9 }).windowFraction).toBe(0.3);
    expect(effectiveLook({}, { kind: 'default' }, { windowFraction: 0.9 }).windowFraction).toBe(0.9);
    // A card that does not exist behaves like Default.
    expect(effectiveLook(setup, { kind: 'value', value: 'studio' }, { windowFraction: 0.9 }).windowFraction).toBe(0.3);
  });
});

describe('nodeLooks: every room exactly one look', () => {
  const rooms: Room[] = [
    { id: 1, typeId: 'gallery', z: 0 },
    { id: 2, typeId: 'gallery', z: 1 },
    { id: 3, typeId: 'studio', z: 2 },
  ];

  it('by Function (the default attribute): rooms of a function share its card', () => {
    const doc = design(rooms, { styleBy: 'function', styles: { function: { groups: [{ value: 'gallery', look: { roof: 'none' } }] } } });
    const looks = nodeLooks(doc, base(0.2));
    expect(looks.get(1)!.look.roof).toBe('none');
    expect(looks.get(2)!.look.roof).toBe('none');
    expect(looks.get(3)!).toMatchObject({ group: { kind: 'default' }, look: { roof: 'flat', windowFraction: 0.2 } });
  });

  it('by Level with bands: rooms of the SAME function can look different', () => {
    const settings = {
      styleBy: 'level',
      styles: {
        level: { dividers: [1], bands: [{ windowFraction: 0.05 }, { windowFraction: 0.8 }] },
        // The Function setup stays remembered, but is not used while styling by Level.
        function: { groups: [{ value: 'gallery', look: { roof: 'none' } }] },
      },
    };
    const looks = nodeLooks(design(rooms, settings), base(0.2));
    expect(looks.get(1)!.look).toMatchObject({ windowFraction: 0.05, roof: 'flat' });
    expect(looks.get(2)!.look).toMatchObject({ windowFraction: 0.8, roof: 'flat' });
    expect(looks.get(3)!.group).toEqual({ kind: 'band', index: 1 });
  });

  it('custom and measured attributes come from the caller; rooms without a value use Default', () => {
    const settings = { styleBy: 'metric:area', styles: { 'metric:area': { default: { roof: 'pergola' }, dividers: [20], bands: [{}, { roof: 'none' }] } } };
    const values = new Map<number, unknown>([
      [1, 9],
      [2, 45],
    ]);
    const looks = nodeLooks(design(rooms, settings), base(0.2), values);
    expect(looks.get(1)!.look.roof).toBe('pergola'); // band 0 sets nothing: Default
    expect(looks.get(2)!.look.roof).toBe('none');
    expect(looks.get(3)!.group).toEqual({ kind: 'default' });
  });
});

describe('stored format', () => {
  it('defaults to styling by Function with nothing set, and round-trips every kind of setup', () => {
    const plain = design([{ id: 1, typeId: 'gallery' }], undefined);
    expect(plain.settings).toEqual({ styleBy: 'function', styles: {} });
    const settings: DesignSettings = {
      styleBy: 'attribute:usage',
      styles: {
        function: { default: { windowFraction: 0.3 }, groups: [{ value: 'gallery', look: { roof: 'pergola' } }] },
        'attribute:usage': { groups: [{ value: 'Public', look: { walls: 'open' } }, { value: true, look: {} }] },
        level: { dividers: [1, 3], bands: [{}, { windowLayout: 'stretch' }, {}] },
      },
    };
    const doc = design([{ id: 1, typeId: 'gallery' }], settings);
    const back = expectOk(readDesignJson(serializeDesignV2(doc))).doc;
    expect(back.settings).toEqual(settings);
    expect([...storedLooks(back.settings)]).toHaveLength(7); // 2 function + 2 usage cards + 3 level bands
    expect(styleSetupOf(back.settings, 'metric:area')).toEqual({});
  });

  it('refuses unknown attributes, duplicate cards, unordered dividers and a wrong number of bands', () => {
    const raw = (settings: unknown) => ({ schemaVersion: 2, metadata: { name: 'x' }, nodes: [], edges: [], settings });
    expectIssue(validateDocumentV2(raw({ styleBy: 'colour', styles: {} })), 'schema', ['settings', 'styleBy']);
    expectIssue(
      validateDocumentV2(raw({ styleBy: 'function', styles: { function: { groups: [{ value: 'Café', look: {} }, { value: ' café', look: {} }] } } })),
      'schema',
      ['settings', 'styles', 'function', 'groups', 1, 'value'],
    );
    expectIssue(validateDocumentV2(raw({ styleBy: 'level', styles: { level: { dividers: [3, 1], bands: [{}, {}, {}] } } })), 'schema', ['settings', 'styles', 'level', 'dividers', 1]);
    expectIssue(validateDocumentV2(raw({ styleBy: 'level', styles: { level: { dividers: [1], bands: [{}] } } })), 'schema', ['settings', 'styles', 'level', 'bands']);
    expectIssue(validateDocumentV2(raw({ styleBy: 'level', styles: { level: { dividers: [1] } } })), 'schema', ['settings', 'styles', 'level', 'bands']);
    // The old per-function format is not read (the app was not distributed; owner 2026-11-18).
    expect(validateDocumentV2(raw({ typeAppearance: {} })).ok).toBe(false);
  });
});
