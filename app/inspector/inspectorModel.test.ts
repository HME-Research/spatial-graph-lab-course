import { describe, expect, it } from 'vitest';
import { applyDesignCommand } from '@app/spatial';
import { expectOk, threeRooms } from '@app/document/test-fixtures';
import {
  attributeKindOf,
  attributesToRows,
  gridToDraft,
  parseGridDraft,
  rowsToAttributes,
  sameGrid,
  type AttributeRow,
} from './inspectorModel';

describe('attribute rows', () => {
  const attributes = { daylight: 'high', occupancy: 8, public: true, note: null };

  it('round-trips every JSON primitive kind', () => {
    const rows = attributesToRows(attributes);
    expect(rows.map((r) => r.kind)).toEqual(['text', 'number', 'boolean', 'none']);
    const back = rowsToAttributes(rows);
    expect(back).toEqual({ ok: true, value: attributes });
  });

  it('keeps numeric-looking text as text', () => {
    const rows: AttributeRow[] = [{ key: 'code', kind: 'text', value: '08' }];
    expect(rowsToAttributes(rows)).toEqual({ ok: true, value: { code: '08' } });
  });

  it('trims names and rejects empty or duplicate names', () => {
    expect(rowsToAttributes([{ key: ' area ', kind: 'number', value: '9' }])).toEqual({ ok: true, value: { area: 9 } });
    expect(rowsToAttributes([{ key: '  ', kind: 'text', value: 'x' }]).ok).toBe(false);
    const dup = rowsToAttributes([
      { key: 'a', kind: 'text', value: '1' },
      { key: 'a ', kind: 'text', value: '2' },
    ]);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.message).toMatch(/twice/);
  });

  it('rejects invalid numbers and booleans', () => {
    expect(rowsToAttributes([{ key: 'n', kind: 'number', value: '' }]).ok).toBe(false);
    expect(rowsToAttributes([{ key: 'n', kind: 'number', value: 'abc' }]).ok).toBe(false);
    expect(rowsToAttributes([{ key: 'n', kind: 'number', value: 'Infinity' }]).ok).toBe(false);
    expect(rowsToAttributes([{ key: 'b', kind: 'boolean', value: 'maybe' }]).ok).toBe(false);
  });

  it('classifies values', () => {
    expect(attributeKindOf(0)).toBe('number');
    expect(attributeKindOf('')).toBe('text');
    expect(attributeKindOf(false)).toBe('boolean');
    expect(attributeKindOf(null)).toBe('none');
  });

  it('produces a record the app accepts via set-node-attributes', () => {
    const parsed = rowsToAttributes(attributesToRows(attributes));
    if (!parsed.ok) throw new Error(parsed.message);
    const next = expectOk(applyDesignCommand(threeRooms(), { type: 'set-node-attributes', nodeId: 1, attributes: parsed.value }));
    expect(next.nodes.find((n) => n.id === 1)!.attributes).toEqual(attributes);
  });
});

describe('grid draft', () => {
  it('parses whole numbers, including negatives and surrounding spaces', () => {
    expect(parseGridDraft(['1', ' -2 ', '0'])).toEqual({ ok: true, value: [1, -2, 0] });
    expect(parseGridDraft(gridToDraft([3, 4, 5]))).toEqual({ ok: true, value: [3, 4, 5] });
  });

  it('normalises -0 to 0', () => {
    const r = parseGridDraft(['-0', '0', '0']);
    expect(r.ok && Object.is(r.value[0], 0)).toBe(true);
  });

  it('rejects empty, fractional and non-numeric axes with the axis name', () => {
    for (const draft of [['', '0', '0'], ['0', '1.5', '0'], ['0', '0', 'up']] as const) {
      const r = parseGridDraft(draft);
      expect(r.ok).toBe(false);
    }
    const r = parseGridDraft(['0', '0', '0.5']);
    if (!r.ok) expect(r.message).toMatch(/storey/);
  });

  it('compares grid cells', () => {
    expect(sameGrid([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(sameGrid([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('a move from the inspector reports collisions without changing the document; a relationship may stretch', () => {
    const doc = threeRooms();
    const collision = applyDesignCommand(doc, { type: 'set-node-geometry', nodeId: 2, grid: [0, 0, 1] });
    expect(collision.ok).toBe(false);
    if (!collision.ok) expect(collision.issues.map((i) => i.code)).toContain('room-overlap');
    // Rooms need not touch: the relationship stays, its spatial status is derived (never an error).
    expect(applyDesignCommand(doc, { type: 'set-node-geometry', nodeId: 2, grid: [5, 0, 0] }).ok).toBe(true);
    expect(doc.nodes.find((n) => n.id === 2)!.grid).toEqual([1, 0, 0]);
  });
});
