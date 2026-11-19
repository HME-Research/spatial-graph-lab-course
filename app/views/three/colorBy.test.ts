import { describe, expect, it } from 'vitest';
import { validateDocumentV2 } from '@app/document/v2';
import type { Attributes } from '@app/document';
import type { RoomNode } from '@app/document/v2';
import { expectOk, threeRooms } from '@app/document/test-fixtures';
import example from '../../document/test-designs/two-storey.json';
import { typeColor } from '@core/viewer/appearance';
import {
  attributeKeys,
  CATEGORY_PALETTE,
  colorModeFromValue,
  colorModeToValue,
  DEFAULT_COLOR_MODE,
  effectiveColorMode,
  mixHex,
  MISSING_COLOR,
  NUMERIC_HIGH,
  NUMERIC_LOW,
  numericColor,
  resolveColoring,
} from './colorBy';

const node = (id: string, attributes: Attributes, typeId = 'room'): RoomNode => ({
  size: [1, 1, 1],
  id,
  grid: [Number(id.replace(/\D/g, '') || 0), 0, 0],
  typeId,
  attributes,
});

describe('colour by type', () => {
  it('uses the shared typeColor and a sorted legend with counts', () => {
    const doc = threeRooms();
    const c = resolveColoring(doc.nodes, doc.edges, DEFAULT_COLOR_MODE);
    expect(c.colorOf.get('a')).toBe(typeColor('gallery'));
    expect(c.colorOf.get('b')).toBe(typeColor('studio'));
    expect(c.legend).toEqual([
      { label: 'gallery', color: typeColor('gallery'), count: 2 },
      { label: 'studio', color: typeColor('studio'), count: 1 },
    ]);
    expect(c.missing.size).toBe(0);
  });
});

describe('colour by access group', () => {
  it('gives each connected component its own colour', () => {
    const nodes = [node('n1', {}), node('n2', {}), node('n5', {})];
    const edges = [{ id: 'e', source: 'n1', target: 'n2', kind: 'access' as const, attributes: {} }];
    const c = resolveColoring(nodes, edges, { kind: 'group' });
    expect(c.colorOf.get('n1')).toBe(c.colorOf.get('n2'));
    expect(c.colorOf.get('n5')).not.toBe(c.colorOf.get('n1'));
    expect(c.legend.map((e) => [e.label, e.count])).toEqual([
      ['Group 1', 2],
      ['Group 2', 1],
    ]);
  });
});

describe('colour by attribute', () => {
  it('categorical strings, with missing and null values shown as an explicit fallback', () => {
    const doc = expectOk(validateDocumentV2(example));
    const c = resolveColoring(doc.nodes, doc.edges, { kind: 'attribute', key: 'daylight' });
    // store has daylight: null; studio-ground and studio-upper have no daylight key
    expect([...c.missing].sort()).toEqual(['store', 'studio-ground', 'studio-upper']);
    for (const id of c.missing) expect(c.colorOf.get(id)).toBe(MISSING_COLOR);
    expect(c.legend.map((e) => [e.label, e.count, e.missing ?? false])).toEqual([
      ['high', 2, false],
      ['medium', 1, false],
      ['no value (missing or null)', 3, true],
    ]);
    expect(c.colorOf.get('entry-gallery')).toBe(c.colorOf.get('gallery-upper'));
    expect(c.colorOf.get('entry-gallery')).not.toBe(MISSING_COLOR);
    expect(c.scale).toBeUndefined();
  });

  it('booleans are categorical (false before true)', () => {
    const doc = expectOk(validateDocumentV2(example));
    const c = resolveColoring(doc.nodes, doc.edges, { kind: 'attribute', key: 'public' });
    expect(c.legend.map((e) => e.label)).toEqual(['false', 'true']);
    expect(c.missing.size).toBe(0);
  });

  it('numbers use a sequential scale from min to max', () => {
    const nodes = [node('n1', { area: 10 }), node('n2', { area: 30 }), node('n3', { area: 20 }), node('n4', {})];
    const c = resolveColoring(nodes, [], { kind: 'attribute', key: 'area' });
    expect(c.scale).toEqual({ min: 10, max: 30 });
    expect(c.colorOf.get('n1')).toBe(NUMERIC_LOW);
    expect(c.colorOf.get('n2')).toBe(NUMERIC_HIGH);
    expect(c.colorOf.get('n3')).toBe(mixHex(NUMERIC_LOW, NUMERIC_HIGH, 0.5));
    expect(c.colorOf.get('n4')).toBe(MISSING_COLOR);
    expect(c.legend.map((e) => e.label)).toEqual(['10', '20', '30', 'no value (missing or null)']);
  });

  it('summarises many distinct numbers as min and max', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(`n${i}`, { v: i }));
    const c = resolveColoring(nodes, [], { kind: 'attribute', key: 'v' });
    expect(c.legend.map((e) => e.label)).toEqual(['min 0', 'max 11']);
  });

  it('keeps 1 and "1" distinct when types are mixed', () => {
    const nodes = [node('n1', { k: 1 }), node('n2', { k: '1' }), node('n3', { k: true })];
    const c = resolveColoring(nodes, [], { kind: 'attribute', key: 'k' });
    expect(c.legend).toHaveLength(3);
    expect(new Set(c.colorOf.values()).size).toBe(3);
    expect(c.scale).toBeUndefined();
  });

  it('notes repeated colours when values exceed the palette', () => {
    const nodes = Array.from({ length: CATEGORY_PALETTE.length + 1 }, (_, i) => node(`n${i}`, { k: `v${i}` }));
    expect(resolveColoring(nodes, [], { kind: 'attribute', key: 'k' }).note).toMatch(/repeat/);
  });
});

describe('colour mode helpers', () => {
  it('lists attribute keys used by any node, sorted', () => {
    expect(attributeKeys([node('n1', { b: 1 }), node('n2', { a: null, b: 2 })])).toEqual(['a', 'b']);
  });

  it('falls back to type when the chosen attribute disappears', () => {
    expect(effectiveColorMode({ kind: 'attribute', key: 'gone' }, ['x'])).toBe(DEFAULT_COLOR_MODE);
    const keep = { kind: 'attribute', key: 'x' } as const;
    expect(effectiveColorMode(keep, ['x'])).toBe(keep);
  });

  it('round-trips select values, including keys containing ":"', () => {
    for (const m of [{ kind: 'type' }, { kind: 'group' }, { kind: 'attribute', key: 'a:b' }] as const) {
      expect(colorModeFromValue(colorModeToValue(m))).toEqual(m);
    }
  });

  it('numericColor gives the midpoint for a single value', () => {
    expect(numericColor(5, 5, 5)).toBe(mixHex(NUMERIC_LOW, NUMERIC_HIGH, 0.5));
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
  });
});
