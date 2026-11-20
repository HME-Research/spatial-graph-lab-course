import { describe, expect, it } from 'vitest';
import type { PaneStorage } from './panes';
import {
  clampSplit,
  DEFAULT_SPLIT,
  keyboardSplit,
  readViewportSplit,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_STORAGE_KEY,
  splitFromPointer,
  splitStyle,
  writeViewportSplit,
} from './viewportSplit';

/** Movable divisions between the viewports (owner 2026-11-20). */

const memory = (initial: Record<string, string> = {}): PaneStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe('viewport split', () => {
  it('keeps every viewport visible: fractions within [0.15, 0.85]', () => {
    expect(clampSplit(0.5)).toBe(0.5);
    expect(clampSplit(0)).toBe(SPLIT_MIN);
    expect(clampSplit(1)).toBe(SPLIT_MAX);
    expect(clampSplit(Number.NaN)).toBe(0.5);
    expect(clampSplit(0.33333)).toBe(0.333);
  });

  it('follows the pointer: the divider centre sits under it', () => {
    // 1008 px wide box at x = 100 with an 8 px gap: 1000 px for the two columns.
    expect(splitFromPointer(100 + 4 + 500, 100, 1008, 8)).toBe(0.5);
    expect(splitFromPointer(100 + 4 + 300, 100, 1008, 8)).toBe(0.3);
    expect(splitFromPointer(0, 100, 1008, 8)).toBe(SPLIT_MIN);
    expect(splitFromPointer(5000, 100, 1008, 8)).toBe(SPLIT_MAX);
    expect(splitFromPointer(10, 0, 8, 8)).toBe(0.5);
  });

  it('arrow keys move it in steps along its own axis; Home shares the space equally', () => {
    expect(keyboardSplit(0.5, 'ArrowRight', 'x')).toBe(0.52);
    expect(keyboardSplit(0.5, 'ArrowLeft', 'x')).toBe(0.48);
    expect(keyboardSplit(0.5, 'ArrowDown', 'y')).toBe(0.52);
    expect(keyboardSplit(0.5, 'ArrowUp', 'y')).toBe(0.48);
    expect(keyboardSplit(0.5, 'ArrowUp', 'x')).toBeNull();
    expect(keyboardSplit(0.7, 'Home', 'x')).toBe(0.5);
    expect(keyboardSplit(0.85, 'ArrowRight', 'x')).toBe(SPLIT_MAX);
  });

  it('gives the grid its column and row sizes and the dividers their places', () => {
    expect(splitStyle({ x: 0.6, y: 0.25 })).toEqual({
      '--split-x': '0.6',
      '--split-y': '0.25',
      '--split-col-a': '0.6fr',
      '--split-col-b': '0.4fr',
      '--split-row-a': '0.25fr',
      '--split-row-b': '0.75fr',
    });
  });

  it('is remembered in the browser; bad or missing values give equal halves, and a refusing storage never throws', () => {
    const storage = memory();
    expect(readViewportSplit(storage)).toEqual(DEFAULT_SPLIT);
    writeViewportSplit(storage, { x: 0.7, y: 0.3 });
    expect(JSON.parse(storage.data[SPLIT_STORAGE_KEY]!)).toEqual({ x: 0.7, y: 0.3 });
    expect(readViewportSplit(storage)).toEqual({ x: 0.7, y: 0.3 });
    expect(readViewportSplit(memory({ [SPLIT_STORAGE_KEY]: '{"x": 2, "y": "a"}' }))).toEqual({ x: SPLIT_MAX, y: 0.5 });
    expect(readViewportSplit(memory({ [SPLIT_STORAGE_KEY]: 'not json' }))).toEqual(DEFAULT_SPLIT);
    const refusing: PaneStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readViewportSplit(refusing)).toEqual(DEFAULT_SPLIT);
    expect(() => writeViewportSplit(refusing, DEFAULT_SPLIT)).not.toThrow();
    expect(readViewportSplit(null)).toEqual(DEFAULT_SPLIT);
  });
});
