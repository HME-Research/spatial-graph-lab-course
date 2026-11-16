import { describe, expect, it } from 'vitest';
import type { Coloring } from './colorBy';
import { isNeutral, NEUTRAL_COLOUR, neutralColoring, presetColour, type SceneDisplay } from './viewDisplay';

const display = (over: Partial<SceneDisplay>): SceneDisplay => ({
  mode: 'architecture',
  labels: true,
  legend: true,
  roofs: true,
  colourPreset: 'by-function',
  lighting: 'default',
  ...over,
});

describe('colour preset', () => {
  it('neutral applies only to Building and Voxels, and never without a provider', () => {
    expect(isNeutral(display({ colourPreset: 'neutral' }))).toBe(true);
    expect(isNeutral(display({ colourPreset: 'neutral', mode: 'voxels' }))).toBe(true);
    expect(isNeutral(display({ colourPreset: 'neutral', mode: 'graph3d' }))).toBe(false);
    expect(isNeutral(display({}))).toBe(false);
    expect(isNeutral(null)).toBe(false);
    expect(presetColour('#ff0000', display({ colourPreset: 'neutral' }))).toBe(NEUTRAL_COLOUR);
    expect(presetColour('#ff0000', display({}))).toBe('#ff0000');
  });

  it('neutralColoring paints every node one colour with one legend row', () => {
    const coloring: Coloring = {
      title: 'Type',
      colorOf: new Map([
        ['a', '#111111'],
        ['b', '#222222'],
      ]),
      missing: new Set(),
      legend: [
        { label: 'gallery', color: '#111111', count: 1 },
        { label: 'studio', color: '#222222', count: 1 },
      ],
    };
    const n = neutralColoring(coloring);
    expect([...n.colorOf.values()]).toEqual([NEUTRAL_COLOUR, NEUTRAL_COLOUR]);
    expect(n.legend).toEqual([{ label: 'All rooms (Display: neutral)', color: NEUTRAL_COLOUR, count: 2 }]);
    expect(coloring.colorOf.get('a')).toBe('#111111'); // input untouched
    expect(neutralColoring({ ...coloring, colorOf: new Map(), legend: [] }).legend).toEqual([]);
  });
});
