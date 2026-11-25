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
  isRoomShown,
  effectiveLevelFilter,
  hiddenSelectionNote,
  isCellShown,
  isFaceShown,
  levelFilterFromValue,
  levelFilterOptions,
  levelFilterToValue,
  levelRange,
  roomsOnLevels,
  storeysOf,
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
    expect(roomsOnLevels(nodes, levelRange(ALL_LEVELS))).toBe(nodes);
  });

  it('Level n only keeps the rooms with a storey on n, a multi-storey room WHOLE', () => {
    const shown = roomsOnLevels(nodes, levelRange(only(1)));
    expect(shown.map((n) => n.id)).toEqual([2, 3]);
    expect(shown[1]).toBe(nodes[2]); // the same object: position and size unchanged
    expect(roomsOnLevels(nodes, levelRange(only(2))).map((n) => n.id)).toEqual([3]);
  });

  it('Up to level n keeps every room with a storey on or below n, a tall room whole', () => {
    expect(roomsOnLevels(nodes, levelRange(upTo(0))).map((n) => n.id)).toEqual([1, 3]);
    expect(roomsOnLevels(nodes, levelRange(upTo(1))).map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it('a one-cell room without size is one storey', () => {
    expect(roomsOnLevels([{ id: 9, position: [0, 0, 2] }], levelRange(only(2)))).toHaveLength(1);
    expect(roomsOnLevels([{ id: 9, position: [0, 0, 2] }], levelRange(upTo(1)))).toHaveLength(0);
    expect(isRoomShown({ position: [0, 0, 2] }, levelRange(only(3)))).toBe(false);
  });

  it('the shown storeys follow the rooms (a whole tall room keeps its upper labels)', () => {
    expect(storeysOf(roomsOnLevels(nodes, levelRange(upTo(0))))).toEqual([0, 1, 2]);
    expect(storeysOf([nodes[1]!])).toEqual([1]);
  });
});

describe('level filter: faces follow the rooms', () => {
  const face = (ownerNodeId: number, direction: LevelFace['direction'], neighbourNodeId: number | null = null): LevelFace => ({
    ownerNodeId,
    direction,
    orientation: direction === '+z' || direction === '-z' ? 'slab' : 'wall',
    neighbourNodeId,
  });
  const shown = new Set([1, 2]);

  it('a wall is drawn when the room on either side is shown', () => {
    expect(isFaceShown(face(1, '+x'), shown, false)).toBe(true);
    expect(isFaceShown(face(3, '+x'), shown, true)).toBe(false);
    expect(isFaceShown(face(1, '-y', 3), shown, false)).toBe(true);
    expect(isFaceShown(face(3, '-y', 2), shown, false)).toBe(true); // owned by a hidden room, wall of a shown one
    expect(isFaceShown(face(3, '-y', 4), shown, true)).toBe(false);
  });

  it('the floor of a shown room is drawn, whatever is below it', () => {
    expect(isFaceShown(face(1, '-z'), shown, false)).toBe(true); // ground floor / underside
    expect(isFaceShown(face(3, '+z', 1), shown, false)).toBe(true); // slab over a hidden room, floor of room 1
    expect(isFaceShown(face(1, '-z', 3), shown, false)).toBe(true); // the same, owned from above
    expect(isFaceShown(face(1, '+z', 2), shown, false)).toBe(true); // slab between two shown rooms
  });

  it('the lid of a shown room (its roof, or the slab under a hidden room) follows the Roofs toggle', () => {
    expect(isFaceShown(face(1, '+z'), shown, true)).toBe(true);
    expect(isFaceShown(face(1, '+z'), shown, false)).toBe(false);
    expect(isFaceShown(face(1, '+z', 3), shown, true)).toBe(true);
    expect(isFaceShown(face(1, '+z', 3), shown, false)).toBe(false);
    expect(isFaceShown(face(3, '-z', 1), shown, false)).toBe(false); // the same lid owned from above
    expect(isFaceShown(face(3, '-z', 1), shown, true)).toBe(true);
  });

  it('faces of hidden rooms only are not drawn', () => {
    expect(isFaceShown(face(3, '+z'), shown, true)).toBe(false);
    expect(isFaceShown(face(3, '-z'), shown, true)).toBe(false);
    expect(isFaceShown(face(3, '+z', 4), shown, true)).toBe(false);
  });

  it('All levels shows every face', () => {
    expect(isFaceShown(face(9, '+z'), null, false)).toBe(true);
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
  const shownIdsOf = (filter: LevelFilter) => {
    const range = levelRange(filter);
    return range === null ? null : new Set(roomsOnLevels(doc.nodes, range).map((n) => n.id));
  };
  const shownElements = (filter: LevelFilter, roofs: boolean) =>
    building.elements.filter((e) => isFaceShown(faces.get(e.faceId)!, shownIdsOf(filter), roofs) && (roofs || e.part !== 'roof'));
  const storeyOf = (e: (typeof building.elements)[number]) => faces.get(e.faceId)!.cell[2];

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

  it('Level 0 only shows the two-storey room whole (walls on both storeys), not room 3 on level 1', () => {
    const shown = shownElements(only(0), false);
    expect(shown.some((e) => e.ownerNodeId === 1 && e.part === 'wall' && storeyOf(e) === 0)).toBe(true);
    expect(shown.some((e) => e.ownerNodeId === 1 && e.part === 'wall' && storeyOf(e) === 1)).toBe(true);
    expect(shown.some((e) => e.ownerNodeId === 3)).toBe(false);
    expect(shown.some((e) => e.ownerNodeId === 2 && e.part === 'wall')).toBe(true);
  });

  it('Roofs off leaves the shown rooms open from above; Roofs on closes them (roof of room 1, slab under room 3)', () => {
    const open = shownElements(only(0), false);
    const closed = shownElements(only(0), true);
    expect(open.some((e) => faces.get(e.faceId)!.neighbourNodeId === 3)).toBe(false);
    expect(closed.some((e) => e.part === 'slab' && faces.get(e.faceId)!.neighbourNodeId === 3)).toBe(true);
    expect(open.some((e) => e.ownerNodeId === 1 && e.part === 'roof')).toBe(false);
    expect(closed.some((e) => e.ownerNodeId === 1 && e.part === 'roof')).toBe(true);
  });

  it('Level 1 only shows room 3 on its floor (the slab over hidden room 2) and room 1 whole', () => {
    const shown = shownElements(only(1), false);
    expect(shown.some((e) => e.part === 'slab' && e.ownerNodeId === 2 && faces.get(e.faceId)!.neighbourNodeId === 3)).toBe(true);
    expect(shown.some((e) => e.ownerNodeId === 2 && e.part === 'wall')).toBe(false);
    expect(shown.some((e) => e.ownerNodeId === 1 && e.part === 'wall' && storeyOf(e) === 0)).toBe(true);
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
