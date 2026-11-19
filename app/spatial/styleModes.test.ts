import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { applyDesignCommand, type DesignCommand } from './commands';
import {
  groupOfValue,
  niceStep,
  nodeLooks,
  serializeDesignV2,
  styleModeOf,
  suggestDividers,
  validateDocumentV2,
  type DesignDocumentV2,
} from '@app/document';

/** S3 (2026-11-19): numbers as value cards OR bands, both remembered; suggested starting bands. */

function doc(settings: unknown = undefined): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'modes' },
      nodes: [
        { id: 'a', grid: [0, 0, 0], typeId: 'studio' },
        { id: 'b', grid: [0, 0, 1], typeId: 'studio' },
        { id: 'c', grid: [0, 0, 2], typeId: 'studio' },
      ],
      edges: [],
      settings,
    }),
  );
}
const run = (d: DesignDocumentV2, ...commands: DesignCommand[]) => commands.reduce((x, c) => expectOk(applyDesignCommand(x, c)), d);
const base = () => ({ windowFraction: 0.25 });

describe('niceStep and suggestDividers', () => {
  it('steps are 1, 2 or 5 × a power of ten, about a tenth of the span', () => {
    expect(niceStep(100)).toBe(10);
    expect(niceStep(250)).toBe(20);
    expect(niceStep(6)).toBe(0.5);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });

  it('splits spread values into about three bands at round numbers, each band holding a value', () => {
    const areas = [9, 18, 27, 36, 45, 54, 63, 72, 81];
    const d = suggestDividers(areas);
    expect(d).toEqual([40, 60]);
    // Every band has at least one value.
    const bands = [0, 0, 0];
    for (const a of areas) bands[a < d[0]! ? 0 : a < d[1]! ? 1 : 2]!++;
    expect(bands.every((n) => n > 0)).toBe(true);
  });

  it('ties, all-equal values, a single room and no rooms', () => {
    expect(suggestDividers([9, 9, 9, 18])).toEqual([10]);
    expect(suggestDividers([9, 9, 9])).toEqual([]);
    expect(suggestDividers([42])).toEqual([]);
    expect(suggestDividers([])).toEqual([]);
    expect(suggestDividers([1, Number.NaN, 2])).toEqual([2]);
  });

  it('integer dividers (Level): whole storeys', () => {
    expect(suggestDividers([0, 0, 1, 1, 2, 2], { integer: true })).toEqual([1, 2]);
    expect(suggestDividers([0, 1], { integer: true })).toEqual([1]);
    expect(suggestDividers([0, 0, 0, 5, 5, 9], { integer: true }).every(Number.isInteger)).toBe(true);
  });
});

describe('set-style-by with starting bands', () => {
  it('stores the dividers in the same step when the attribute has no bands yet', () => {
    const next = run(doc(), { type: 'set-style-by', by: 'metric:area', dividers: [20, 40] });
    expect(next.settings).toEqual({ styleBy: 'metric:area', styles: { 'metric:area': { dividers: [20, 40], bands: [{}, {}, {}] } } });
    expect(styleModeOf(next.settings.styles['metric:area']!)).toBe('bands');
  });

  it('keeps existing bands (dividers are only a starting point)', () => {
    const start = doc({ styleBy: 'function', styles: { 'metric:area': { dividers: [50], bands: [{ roof: 'none' }, {}] } } });
    const next = run(start, { type: 'set-style-by', by: 'metric:area', dividers: [20, 40] });
    expect(next.settings.styles['metric:area']).toEqual({ dividers: [50], bands: [{ roof: 'none' }, {}] });
  });

  it('without dividers only switches (Level starts with one card per storey)', () => {
    const next = run(doc(), { type: 'set-style-by', by: 'level' });
    expect(next.settings).toEqual({ styleBy: 'level', styles: {} });
  });
});

describe('set-style-mode: value cards or bands, both remembered', () => {
  it('switching to bands creates them; back to values keeps them for later', () => {
    let d = run(doc(), { type: 'set-style-by', by: 'level' }, { type: 'set-look', by: 'level', group: { kind: 'value', value: 2 }, patch: { roof: 'pergola' } });
    expect(nodeLooks(d, base).get('c')!.look.roof).toBe('pergola');

    d = run(d, { type: 'set-style-mode', by: 'level', mode: 'bands', dividers: [1] });
    expect(d.settings.styles.level).toEqual({ groups: [{ value: 2, look: { roof: 'pergola' } }], dividers: [1], bands: [{}, {}] });
    expect(nodeLooks(d, base).get('c')!.group).toEqual({ kind: 'band', index: 1 });
    expect(nodeLooks(d, base).get('c')!.look.roof).toBe('flat'); // the value card is inactive

    d = run(d, { type: 'set-look', by: 'level', group: { kind: 'band', index: 0 }, patch: { walls: 'open' } });
    d = run(d, { type: 'set-style-mode', by: 'level', mode: 'values' });
    expect(d.settings.styles.level!.mode).toBe('values');
    expect(nodeLooks(d, base).get('c')!.look.roof).toBe('pergola');
    expect(nodeLooks(d, base).get('a')!.group).toEqual({ kind: 'default' });

    // Back to bands: the stored bands (and their looks) come back; no mode is stored for bands.
    d = run(d, { type: 'set-style-mode', by: 'level', mode: 'bands', dividers: [7] });
    expect(d.settings.styles.level).toEqual({ groups: [{ value: 2, look: { roof: 'pergola' } }], dividers: [1], bands: [{ walls: 'open' }, {}] });
    expect(nodeLooks(d, base).get('a')!.look.walls).toBe('open');
  });

  it('values mode ignores the bands when matching; moving dividers keeps the mode', () => {
    const setup = { groups: [{ value: 1, look: {} }], dividers: [1], bands: [{}, {}], mode: 'values' as const };
    expect(groupOfValue(setup, 1)).toEqual({ kind: 'value', value: 1 });
    expect(groupOfValue(setup, 5)).toEqual({ kind: 'default' });
    const d = run(doc({ styleBy: 'level', styles: { level: setup } }), { type: 'set-band-dividers', by: 'level', dividers: [2] });
    expect(d.settings.styles.level!.mode).toBe('values');
    // Dropping the bands drops the mode too.
    const dropped = run(d, { type: 'set-band-dividers', by: 'level', dividers: null });
    expect(dropped.settings.styles.level).toEqual({ groups: [{ value: 1, look: {} }] });
  });

  it('the format: mode round-trips; "bands" needs dividers', () => {
    const d = doc({ styleBy: 'level', styles: { level: { groups: [{ value: 0, look: {} }], dividers: [1], bands: [{}, {}], mode: 'values' } } });
    expect(expectOk(validateDocumentV2(JSON.parse(serializeDesignV2(d)))).settings).toEqual(d.settings);
    expect(validateDocumentV2({ ...d, settings: { styleBy: 'level', styles: { level: { mode: 'bands' } } } }).ok).toBe(false);
    expect(validateDocumentV2({ ...d, settings: { styleBy: 'level', styles: { level: { mode: 'other' } } } }).ok).toBe(false);
  });
});
