import { describe, expect, it } from 'vitest';
import { removeEdge, removeNode } from '@app/document';
import { expectOk, threeRooms } from '@app/document/test-fixtures';
import { FALLBACK_TYPE_PALETTE, typeColor } from './appearance';
import { DEFAULT_CELL_SIZE, spatialToThree } from './coordinates';
import {
  NO_SELECTION,
  isEdgeSelected,
  isNodeSelected,
  reconcileSelection,
  sameSelection,
  selectEdge,
  selectNode,
} from './selection';

describe('spatialToThree', () => {
  it('maps grid z (storey) to Three Y and grid y to −Z, with the ground storey on Y = 0', () => {
    expect(DEFAULT_CELL_SIZE).toEqual({ horizontal: 3, vertical: 3 });
    expect(spatialToThree([0, 0, 0])).toEqual([0, 1.5, 0]);
    expect(spatialToThree([1, 0, 0])).toEqual([3, 1.5, 0]);
    expect(spatialToThree([0, 1, 0])).toEqual([0, 1.5, -3]);
    expect(spatialToThree([0, 0, 1])).toEqual([0, 4.5, 0]);
    expect(spatialToThree([0, 0, -0.5])).toEqual([0, 0, 0]); // floor of storey 0
  });

  it('accepts fractional points for shared faces and a custom cell size', () => {
    expect(spatialToThree([0.5, 0, 0])).toEqual([1.5, 1.5, 0]);
    expect(spatialToThree([2, -1, 1], { horizontal: 4, vertical: 2.5 })).toEqual([8, 3.75, 4]);
  });

  it('preserves handedness: grid x × grid y = grid z maps to X × (−Z) = Y', () => {
    const o = spatialToThree([0, 0, 0]);
    const d = (g: [number, number, number]) => spatialToThree(g).map((v, i) => v - o[i]!);
    const [ax, ay, az] = d([1, 0, 0]);
    const [bx, by, bz] = d([0, 1, 0]);
    const cross = [ay! * bz! - az! * by!, az! * bx! - ax! * bz!, ax! * by! - ay! * bx!];
    const up = d([0, 0, 1]);
    expect(cross.map((v) => Math.sign(v) + 0)).toEqual(up.map((v) => Math.sign(v) + 0));
  });
});

describe('selection', () => {
  it('predicates and equality', () => {
    expect(isNodeSelected(selectNode('a'), 'a')).toBe(true);
    expect(isNodeSelected(selectEdge('a'), 'a')).toBe(false);
    expect(isEdgeSelected(selectEdge('ab'), 'ab')).toBe(true);
    expect(sameSelection(selectNode('a'), selectNode('a'))).toBe(true);
    expect(sameSelection(selectNode('a'), selectEdge('a'))).toBe(false);
    expect(sameSelection(NO_SELECTION, { kind: 'none' })).toBe(true);
  });

  it('reconcileSelection keeps valid selections by identity and drops removed ones', () => {
    const doc = threeRooms();
    const sel = selectNode('a');
    expect(reconcileSelection(sel, doc)).toBe(sel);
    expect(reconcileSelection(sel, expectOk(removeNode(doc, 'a')))).toBe(NO_SELECTION);
    const edge = selectEdge('ab');
    expect(reconcileSelection(edge, doc)).toBe(edge);
    expect(reconcileSelection(edge, expectOk(removeEdge(doc, 'ab')))).toBe(NO_SELECTION);
  });
});

describe('typeColor', () => {
  it('is deterministic and drawn from the palette', () => {
    expect(typeColor('gallery')).toBe(typeColor('gallery'));
    for (const t of ['gallery', 'studio', 'storage', 'x']) {
      expect(FALLBACK_TYPE_PALETTE).toContain(typeColor(t));
    }
  });
});
