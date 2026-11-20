import { describe, expect, it } from 'vitest';
import { clampColumnWidth, columnWidthCss, keyboardColumnWidth, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, withColumnWidth } from './columnWidths';

/** Resizable Data table columns (owner 2026-11-20). */
describe('Data table column widths', () => {
  it('are whole pixels within [40, 800]', () => {
    expect(clampColumnWidth(120.4)).toBe(120);
    expect(clampColumnWidth(5)).toBe(MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(5000)).toBe(MAX_COLUMN_WIDTH);
  });

  it('are set and cleared per column, without changing the others', () => {
    const one = withColumnWidth({}, 'function', 150);
    expect(one).toEqual({ function: 150 });
    expect(withColumnWidth(one, 'custom:targetArea', 10)).toEqual({ function: 150, 'custom:targetArea': MIN_COLUMN_WIDTH });
    expect(withColumnWidth(one, 'function', null)).toEqual({});
  });

  it('move in 10 px steps with the arrow keys', () => {
    expect(keyboardColumnWidth(100, 'ArrowRight')).toBe(110);
    expect(keyboardColumnWidth(100, 'ArrowLeft')).toBe(90);
    expect(keyboardColumnWidth(45, 'ArrowLeft')).toBe(MIN_COLUMN_WIDTH);
    expect(keyboardColumnWidth(100, 'Enter')).toBeNull();
  });

  it('become one CSS rule per resized column, scoped to its table, cutting long text with …', () => {
    expect(columnWidthCss(':r1:', {})).toBe('');
    expect(columnWidthCss(':r1:', { function: 150, 'custom:target "x"': 90 })).toBe(
      [
        '.sgl-dataview-table[data-width-scope=":r1:"] [data-column="function"]{width:150px;min-width:150px;max-width:150px;overflow:hidden;text-overflow:ellipsis}',
        '.sgl-dataview-table[data-width-scope=":r1:"] [data-column="custom:target \\"x\\""]{width:90px;min-width:90px;max-width:90px;overflow:hidden;text-overflow:ellipsis}',
      ].join('\n'),
    );
  });
});

describe('Data table headings', () => {
  it('put a trailing part in brackets on its own line', async () => {
    const { headingLines } = await import('./columnWidths');
    expect(headingLines('z (Level)')).toEqual(['z', '(Level)']);
    expect(headingLines('z (Floors)')).toEqual(['z', '(Floors)']);
    expect(headingLines('Target area (m²)')).toEqual(['Target area', '(m²)']);
    expect(headingLines('Function')).toEqual(['Function', null]);
    expect(headingLines('(only brackets)')).toEqual(['(only brackets)', null]);
    expect(headingLines('a (b) c')).toEqual(['a (b) c', null]);
  });
});
