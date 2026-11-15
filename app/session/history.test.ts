import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, HISTORY_LIMIT, record, redo, redoLabel, undo, undoLabel, type History } from './history';

const presentOf = <T>(h: History<T>) => h.present;

describe('snapshot history', () => {
  it('records, undoes and redoes with labels', () => {
    let h = createHistory('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    h = record(h, 'b', 'to b');
    h = record(h, 'c', 'to c');
    expect(h.present).toBe('c');
    expect(undoLabel(h)).toBe('to c');

    h = undo(h);
    expect(h.present).toBe('b');
    expect(undoLabel(h)).toBe('to b');
    expect(redoLabel(h)).toBe('to c');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h); // nothing to undo: same object

    h = redo(h);
    expect(h.present).toBe('b');
    h = redo(h);
    expect(h.present).toBe('c');
    expect(canRedo(h)).toBe(false);
    expect(redo(h)).toBe(h); // nothing to redo: same object
    expect(undoLabel(h)).toBe('to c');
  });

  it('resets to an empty history', () => {
    const h = record(record(createHistory(1), 2), 3);
    const reset = createHistory(10);
    expect(reset).toEqual({ past: [], present: 10, future: [] });
    expect(h.past).toHaveLength(2); // the old history is untouched
  });

  it('a no-op is not recorded and returns the same history', () => {
    const h = record(createHistory({ v: 1 }), { v: 2 });
    expect(record(h, h.present)).toBe(h);
    const sameContent = (a: { v: number }, b: { v: number }) => a.v === b.v;
    expect(record(h, { v: 2 }, 'equal content', sameContent)).toBe(h);
    expect(record(h, { v: 3 }, 'changed', sameContent).past).toHaveLength(2);
  });

  it('recording after undo starts a new branch and clears redo', () => {
    let h = record(record(createHistory('a'), 'b'), 'c');
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = record(h, 'x', 'branch');
    expect(h.present).toBe('x');
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe('b');
    expect(undo(undo(h)).present).toBe('a');
  });

  it(`keeps at most ${HISTORY_LIMIT} previous entries, dropping the oldest`, () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 25; i++) h = record(h, i, `step ${i}`);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]!.value).toBe(25);
    let steps = 0;
    while (canUndo(h)) {
      h = undo(h);
      steps++;
    }
    expect(steps).toBe(HISTORY_LIMIT);
    expect(h.present).toBe(25);
    expect(record(createHistory(0), 1, null, Object.is, 1).past).toHaveLength(1);
  });

  it('is pure: inputs are never mutated and repeated calls give equal results (StrictMode double invocation)', () => {
    const h = Object.freeze({
      past: Object.freeze([Object.freeze({ value: 'a', label: 'x' })]),
      present: 'b',
      future: Object.freeze([Object.freeze({ value: 'c', label: 'y' })]),
    }) as History<string>;
    for (const step of [(x: History<string>) => record(x, 'z'), undo, redo] as const) {
      const first = step(h);
      const second = step(h);
      expect(second).toEqual(first);
      expect(presentOf(h)).toBe('b');
    }
    expect(h.past).toHaveLength(1);
    expect(h.future).toHaveLength(1);
  });
});
