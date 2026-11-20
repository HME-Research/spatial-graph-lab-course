import { describe, expect, it } from 'vitest';
import { clampRightWidth, keyboardRightResize, PANE_STORAGE_KEYS, readRightWidth, RIGHT_WIDTH_MAX, RIGHT_WIDTH_MIN, writeRightWidth, type PaneStorage } from './panes';

/** The Properties pane is resizable like the left pane (owner 2026-11-20). */

const memory = (initial: Record<string, string> = {}): PaneStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe('Properties pane width', () => {
  it('stays within [240, 640] px, whole pixels', () => {
    expect(clampRightWidth(333.6)).toBe(334);
    expect(clampRightWidth(10)).toBe(RIGHT_WIDTH_MIN);
    expect(clampRightWidth(5000)).toBe(RIGHT_WIDTH_MAX);
    expect(clampRightWidth(Number.NaN)).toBe(RIGHT_WIDTH_MIN);
  });

  it('its handle is on the left edge: ArrowLeft widens, ArrowRight narrows, Home / End go to the limits', () => {
    expect(keyboardRightResize(320, 'ArrowLeft')).toBe(336);
    expect(keyboardRightResize(320, 'ArrowRight')).toBe(304);
    expect(keyboardRightResize(320, 'Home')).toBe(RIGHT_WIDTH_MIN);
    expect(keyboardRightResize(320, 'End')).toBe(RIGHT_WIDTH_MAX);
    expect(keyboardRightResize(320, 'Enter')).toBeNull();
  });

  it('is remembered; never set (or unreadable) means the stylesheet default', () => {
    const storage = memory();
    expect(readRightWidth(storage)).toBeNull();
    writeRightWidth(storage, 400);
    expect(storage.data[PANE_STORAGE_KEYS.rightWidth]).toBe('400');
    expect(readRightWidth(storage)).toBe(400);
    expect(readRightWidth(memory({ [PANE_STORAGE_KEYS.rightWidth]: 'wide' }))).toBeNull();
    expect(readRightWidth(memory({ [PANE_STORAGE_KEYS.rightWidth]: '9000' }))).toBe(RIGHT_WIDTH_MAX);
    expect(readRightWidth(null)).toBeNull();
  });
});
