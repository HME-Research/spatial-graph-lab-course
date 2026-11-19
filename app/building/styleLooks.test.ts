import { describe, expect, it } from 'vitest';
import { expectIssue, expectOk } from '@app/document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2, type StyleSetup } from '@app/document';
import { applyDesignCommand, type DesignCommand } from '@app/spatial';
import { buildBuildingV2 } from './buildingV2';

/** "Style rooms by" commands (owner 2026-11-18). */

function design(): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'styles' },
      // low = 1 (ground), high = 2 (storey 2)
      nodes: [
        { id: 1, grid: [0, 0, 0], size: [1, 1, 1], typeId: 'gallery' },
        { id: 2, grid: [4, 0, 2], size: [1, 1, 1], typeId: 'gallery' },
      ],
      edges: [],
    }),
  );
}

const run = (doc: DesignDocumentV2, ...commands: DesignCommand[]) => commands.reduce((d, c) => expectOk(applyDesignCommand(d, c)), doc);
const setup = (doc: DesignDocumentV2, by: string): StyleSetup | undefined => doc.settings.styles[by];

describe('set-style-by and set-look', () => {
  it('switching the attribute keeps every setup, so switching back restores it', () => {
    const doc = run(
      design(),
      { type: 'set-look', by: 'function', group: { kind: 'value', value: 'gallery' }, patch: { roof: 'pergola' } },
      { type: 'set-style-by', by: 'level' },
      { type: 'set-look', by: 'level', group: { kind: 'default' }, patch: { windowFraction: 0.5 } },
      { type: 'set-style-by', by: 'function' },
    );
    expect(doc.settings.styleBy).toBe('function');
    expect(setup(doc, 'function')).toEqual({ groups: [{ value: 'gallery', look: { roof: 'pergola' } }] });
    expect(setup(doc, 'level')).toEqual({ default: { windowFraction: 0.5 } });
  });

  it('Default disappears when emptied; a value card stays (empty) until removed', () => {
    const doc = run(
      design(),
      { type: 'set-look', by: 'function', group: { kind: 'default' }, patch: { roof: 'none' } },
      { type: 'set-look', by: 'function', group: { kind: 'default' }, patch: { roof: null } },
      { type: 'set-look', by: 'function', group: { kind: 'value', value: 'studio' }, patch: {} },
    );
    expect(setup(doc, 'function')).toEqual({ groups: [{ value: 'studio', look: {} }] });
    const removed = run(doc, { type: 'remove-style-group', by: 'function', value: 'STUDIO ' });
    expect(removed.settings.styles).toEqual({});
    expectIssue(applyDesignCommand(removed, { type: 'remove-style-group', by: 'function', value: 'studio' }), 'not-found');
  });

  it('refuses a band that does not exist and an invalid attribute key', () => {
    expectIssue(applyDesignCommand(design(), { type: 'set-look', by: 'level', group: { kind: 'band', index: 0 }, patch: { roof: 'none' } }), 'not-found');
    expect(applyDesignCommand(design(), { type: 'set-style-by', by: 'colour' }).ok).toBe(false);
  });
});

describe('set-band-dividers', () => {
  const banded = () =>
    run(
      design(),
      { type: 'set-band-dividers', by: 'level', dividers: [1, 3] },
      { type: 'set-look', by: 'level', group: { kind: 'band', index: 0 }, patch: { windowFraction: 0.1 } },
      { type: 'set-look', by: 'level', group: { kind: 'band', index: 1 }, patch: { windowFraction: 0.5 } },
      { type: 'set-look', by: 'level', group: { kind: 'band', index: 2 }, patch: { windowFraction: 0.9 } },
    );

  it('creates empty bands, and moving dividers keeps each band’s look', () => {
    expect(setup(run(design(), { type: 'set-band-dividers', by: 'level', dividers: [2] }), 'level')).toEqual({ dividers: [2], bands: [{}, {}] });
    expect(setup(run(banded(), { type: 'set-band-dividers', by: 'level', dividers: [2, 5] }), 'level')!.bands).toEqual([
      { windowFraction: 0.1 },
      { windowFraction: 0.5 },
      { windowFraction: 0.9 },
    ]);
  });

  it('adding a divider copies the look of the band it splits; removing one keeps the lower band', () => {
    expect(setup(run(banded(), { type: 'set-band-dividers', by: 'level', dividers: [1, 2, 3] }), 'level')!.bands).toEqual([
      { windowFraction: 0.1 },
      { windowFraction: 0.5 },
      { windowFraction: 0.5 },
      { windowFraction: 0.9 },
    ]);
    expect(setup(run(banded(), { type: 'set-band-dividers', by: 'level', dividers: [3] }), 'level')!.bands).toEqual([{ windowFraction: 0.1 }, { windowFraction: 0.9 }]);
  });

  it('null drops the bands (Default and cards stay); unordered dividers are refused', () => {
    const doc = run(banded(), { type: 'set-look', by: 'level', group: { kind: 'default' }, patch: { roof: 'pergola' } }, { type: 'set-band-dividers', by: 'level', dividers: null });
    expect(setup(doc, 'level')).toEqual({ default: { roof: 'pergola' } });
    expect(applyDesignCommand(banded(), { type: 'set-band-dividers', by: 'level', dividers: [3, 1] }).ok).toBe(false);
  });
});

describe('the Building follows the per-room look', () => {
  it('two rooms of the same function get different windows when styled by Level', () => {
    const doc = run(
      design(),
      { type: 'set-style-by', by: 'level' },
      { type: 'set-band-dividers', by: 'level', dividers: [1] },
      { type: 'set-look', by: 'level', group: { kind: 'band', index: 0 }, patch: { windowFraction: 0 } },
      { type: 'set-look', by: 'level', group: { kind: 'band', index: 1 }, patch: { roof: 'none' } },
    );
    const building = buildBuildingV2(doc);
    const glazing = (owner: number) => building.elements.filter((e) => e.ownerNodeId === owner && e.part === 'glazing').length;
    const roofs = (owner: number) => building.elements.filter((e) => e.ownerNodeId === owner && e.part === 'roof').length;
    expect(glazing(1)).toBe(0); // windows 0 %
    expect(glazing(2)).toBeGreaterThan(0); // the example façade of gallery
    expect(roofs(1)).toBeGreaterThan(0);
    expect(roofs(2)).toBe(0); // roof: none
    expect(building.looks.get(2)!.group).toEqual({ kind: 'band', index: 1 });
  });
});
