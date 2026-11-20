import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { validateDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { resolveRelationships } from '@app/spatial';
import { buildBuildingV2 } from '@app/building';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';
import { createPanelMemory, PanelMemoryContext } from '../panelMemory';
import { LevelFilterSelect, useLevelFilter } from './LevelFilterSelect';
import {
  ALL_LEVELS,
  clipToLevels,
  effectiveLevelFilter,
  hiddenSelectionNote,
  isCellShown,
  isFaceShown,
  levelFilterFromValue,
  levelFilterOptions,
  levelFilterToValue,
  levelRange,
  type LevelFace,
  type LevelFilter,
} from './levelFilter';
import { connectorCells } from './v2Scene';

const only = (level: number): LevelFilter => ({ kind: 'only', level });
const upTo = (level: number): LevelFilter => ({ kind: 'up-to', level });

describe('level filter: rooms', () => {
  const nodes = [
    { id: 1, position: [0, 0, 0] as [number, number, number], size: [1, 1, 1] as const },
    { id: 2, position: [1, 0, 1] as [number, number, number], size: [1, 1, 1] as const },
    // A three-storey atrium spanning levels 0..2.
    { id: 3, position: [2, 0, 0] as [number, number, number], size: [2, 1, 3] as const },
  ];

  it('All levels returns the rooms unchanged', () => {
    expect(clipToLevels(nodes, levelRange(ALL_LEVELS))).toBe(nodes);
  });

  it('Level n only keeps the rooms with a storey on n, multi-storey rooms clipped to it', () => {
    const shown = clipToLevels(nodes, levelRange(only(1)));
    expect(shown.map((n) => n.id)).toEqual([2, 3]);
    expect(shown[0]).toBe(nodes[1]); // wholly inside: the same object
    expect(shown[1]).toMatchObject({ id: 3, position: [2, 0, 1], size: [2, 1, 1] });
    expect(nodes[2]!.position).toEqual([2, 0, 0]); // never mutated
  });

  it('Up to level n keeps every room below or on n, a tall room cut at the top of n', () => {
    const shown = clipToLevels(nodes, levelRange(upTo(0)));
    expect(shown.map((n) => n.id)).toEqual([1, 3]);
    expect(shown[1]).toMatchObject({ position: [2, 0, 0], size: [2, 1, 1] });
    expect(clipToLevels(nodes, levelRange(upTo(1)))[2]).toMatchObject({ size: [2, 1, 2] });
  });

  it('a one-cell room without size is one storey', () => {
    expect(clipToLevels([{ id: 9, position: [0, 0, 2] }], levelRange(only(2)))).toHaveLength(1);
    expect(clipToLevels([{ id: 9, position: [0, 0, 2] }], levelRange(upTo(1)))).toHaveLength(0);
  });
});

describe('level filter: faces', () => {
  const face = (cell: [number, number, number], direction: LevelFace['direction'], neighbourNodeId: number | null = null): LevelFace => ({
    cell,
    direction,
    orientation: direction === '+z' || direction === '-z' ? 'slab' : 'wall',
    neighbourNodeId,
  });

  it('walls belong to their cell storey', () => {
    expect(isFaceShown(face([0, 0, 1], '+x'), levelRange(only(1)), true)).toBe(true);
    expect(isFaceShown(face([0, 0, 1], '+x'), levelRange(only(0)), true)).toBe(false);
    expect(isFaceShown(face([0, 0, 1], '-y'), levelRange(upTo(1)), false)).toBe(true);
    expect(isFaceShown(face([0, 0, 2], '-y'), levelRange(upTo(1)), false)).toBe(false);
  });

  it('floors of shown storeys are drawn; a lower wing roof under the lowest shown storey is not', () => {
    const r = levelRange(only(1));
    expect(isFaceShown(face([0, 0, 1], '-z'), r, false)).toBe(true); // exposed underside / floor of a level-1 room
    expect(isFaceShown(face([0, 0, 0], '+z', 7), r, false)).toBe(true); // slab between level 0 and a level-1 room
    expect(isFaceShown(face([0, 0, 0], '+z'), r, true)).toBe(false); // roof of a level-0 wing
    expect(isFaceShown(face([0, 0, 0], '-z'), r, true)).toBe(false); // ground floor of level 0
  });

  it('the lid on the top shown storey follows the Roofs toggle', () => {
    const r = levelRange(upTo(0));
    expect(isFaceShown(face([0, 0, 0], '+z'), r, true)).toBe(true); // roof of a level-0 room
    expect(isFaceShown(face([0, 0, 0], '+z', 4), r, true)).toBe(true); // slab under level 1
    expect(isFaceShown(face([0, 0, 1], '-z', 4), r, true)).toBe(true); // the same slab owned from above
    expect(isFaceShown(face([0, 0, 0], '+z'), r, false)).toBe(false);
    expect(isFaceShown(face([0, 0, 1], '-z', 4), r, false)).toBe(false);
    expect(isFaceShown(face([0, 0, 1], '-z'), r, true)).toBe(false); // underside of an overhang above empty ground
    expect(isFaceShown(face([0, 0, 1], '+z'), r, true)).toBe(false); // roof of level 1
    expect(isFaceShown(face([0, 0, 0], '-z'), r, false)).toBe(true); // ground floor (up to: no bottom cut)
  });

  it('All levels shows every face', () => {
    expect(isFaceShown(face([0, 0, 5], '+z'), null, false)).toBe(true);
  });
});

/** Room 1 is two storeys at x=0; rooms 2 (level 0) and 3 (level 1) are stacked at x=4; corridors on both levels. */
function corridorDesign() {
  const raw = {
    schemaVersion: 2,
    metadata: { name: 'levels' },
    nodes: [
      { id: 1, position: [0, 0, 0], size: [1, 1, 2], function: 'gallery', custom: {} },
      { id: 2, position: [4, 0, 0], size: [1, 1, 1], function: 'studio', custom: {} },
      { id: 3, position: [4, 0, 1], size: [1, 1, 1], function: 'studio', custom: {} },
    ],
    edges: [
      { id: 1, source: 1, target: 2, relationship: 'access', custom: {} },
      { id: 2, source: 1, target: 3, relationship: 'access', custom: {} },
    ],
    diagram: { positions: {} },
    settings: { styleBy: 'function', styles: {} },
  };
  return expectOk(validateDocumentV2(raw));
}

describe('level filter: building model', () => {
  const doc = corridorDesign();
  const spatial = resolveRelationships(doc);
  const building = buildBuildingV2(doc, { spatial });
  const faces = new Map(building.faces.map((f) => [f.id, f]));
  const shownElements = (filter: LevelFilter, roofs: boolean) =>
    building.elements.filter((e) => isFaceShown(faces.get(e.faceId)!, levelRange(filter), roofs) && (roofs || e.part !== 'roof'));

  it('corridors are routed on both storeys and belong to their route cells storey', () => {
    const levels = new Set(building.connectors.map((c) => c.cell[2]));
    expect([...levels].sort()).toEqual([0, 1]);
    const level0 = building.connectors.filter((c) => isCellShown(c.cell, levelRange(only(0))));
    expect(level0.length).toBeGreaterThan(0);
    expect(level0.every((c) => c.edgeId === 1)).toBe(true);
    expect(building.connectors.filter((c) => isCellShown(c.cell, levelRange(only(1)))).every((c) => c.edgeId === 2)).toBe(true);
    // Voxels: the reserved cells follow the same rule.
    const cells = connectorCells({ doc, spatial } as Parameters<typeof connectorCells>[0]);
    expect(cells.filter((c) => isCellShown(c.cell, levelRange(only(1)))).every((c) => c.edgeId === 2)).toBe(true);
  });

  it('Level 0 only with Roofs off draws no element above storey 0 (the level is open from above)', () => {
    const shown = shownElements(only(0), false);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(building.elements.length);
    const top = Math.max(...shown.map((e) => e.position[1] + e.size[1] / 2));
    const storey1Floor = Math.min(...building.elements.filter((e) => faces.get(e.faceId)!.cell[2] === 1 && e.part === 'wall').map((e) => e.position[1] - e.size[1] / 2));
    expect(top).toBeLessThanOrEqual(storey1Floor + 1e-9);
    // Walls of the two-storey room: only its level-0 half.
    expect(shown.some((e) => e.ownerNodeId === 1 && e.part === 'wall')).toBe(true);
    expect(shown.some((e) => faces.get(e.faceId)!.cell[2] === 1 && e.part === 'wall')).toBe(false);
  });

  it('with Roofs on the top shown storey is closed (its roofs and the slab under the next storey)', () => {
    const closed = shownElements(only(0), true);
    const open = shownElements(only(0), false);
    expect(closed.length).toBeGreaterThan(open.length);
    expect(closed.some((e) => e.part === 'slab' && faces.get(e.faceId)!.neighbourNodeId === 3)).toBe(true);
  });

  it('All levels draws the whole model', () => {
    expect(shownElements(ALL_LEVELS, true)).toHaveLength(building.elements.length);
  });
});

describe('level filter: state and toolbar', () => {
  it('options: All levels, Level n only per storey, Up to level n below the top', () => {
    expect(levelFilterOptions([0, 1, 2]).map((o) => o.label)).toEqual([
      'All levels',
      'Level 0 only',
      'Level 1 only',
      'Level 2 only',
      'Up to level 0',
      'Up to level 1',
    ]);
    expect(levelFilterOptions([0])).toEqual([]);
    expect(levelFilterOptions([])).toEqual([]);
  });

  it('values round-trip; unknown values mean All', () => {
    for (const f of [ALL_LEVELS, only(0), only(3), upTo(1), only(-1)]) expect(levelFilterFromValue(levelFilterToValue(f))).toEqual(f);
    expect(levelFilterFromValue('nonsense')).toEqual(ALL_LEVELS);
  });

  it('resets to All when the chosen storey no longer exists (or only one storey is left)', () => {
    const f = only(1);
    expect(effectiveLevelFilter(f, [0, 1])).toBe(f);
    expect(effectiveLevelFilter(f, [0, 2])).toBe(ALL_LEVELS);
    expect(effectiveLevelFilter(upTo(2), [0, 1])).toBe(ALL_LEVELS);
    expect(effectiveLevelFilter(only(0), [0])).toBe(ALL_LEVELS);
  });

  it('the control renders the options with an accessible name, and nothing for one storey', () => {
    const html = renderToStaticMarkup(createElement(LevelFilterSelect, { levels: [0, 1], filter: only(1), onChange: () => {} }));
    expect(html).toContain('aria-label="Show levels"');
    expect(html).toContain('<option value="only:1" selected="">Level 1 only</option>');
    expect(html).toContain('Up to level 0');
    expect(html).not.toContain('Up to level 1');
    expect(renderToStaticMarkup(createElement(LevelFilterSelect, { levels: [0], filter: ALL_LEVELS, onChange: () => {} }))).toBe('');
  });

  it('is remembered per panel and view, and a stale remembered storey shows All', () => {
    const memory = createPanelMemory();
    memory.set('levels:architecture', only(1));
    memory.set('levels:voxels', only(5));
    const Probe = ({ view }: { readonly view: 'voxels' | 'architecture' }) => {
      const [filter, set] = useLevelFilter(view, [0, 1]);
      return createElement(LevelFilterSelect, { levels: [0, 1], filter, onChange: set });
    };
    const render = (view: 'voxels' | 'architecture') =>
      renderToStaticMarkup(createElement(PanelMemoryContext.Provider, { value: memory }, createElement(Probe, { view })));
    expect(render('architecture')).toContain('<option value="only:1" selected="">');
    expect(render('voxels')).toContain('<option value="all" selected="">');
  });

  it('notes a selected room on a hidden level; keeps quiet otherwise', () => {
    const shown = new Set([1, 2]);
    expect(hiddenSelectionNote(selectNode(3), shown, only(0))).toMatch(/hidden level/);
    expect(hiddenSelectionNote(selectNode(1), shown, only(0))).toBeNull();
    expect(hiddenSelectionNote(selectNode(3), shown, ALL_LEVELS)).toBeNull();
    expect(hiddenSelectionNote(selectEdge(3), shown, only(0))).toBeNull();
    expect(hiddenSelectionNote(NO_SELECTION, shown, only(0))).toBeNull();
  });
});
