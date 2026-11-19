import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import exampleDesign from '../../document/test-designs/two-storey.json';
import { readDesign, type DesignDocumentV2 } from '@app/document';
import { resolveRelationships } from '@app/spatial';
import { modelFromV2 } from './diagramModel';
import { checkedEdgeIds, invalidConnectionRows, NO_INVALID_CONNECTIONS, removeInvalidCommand, removeSummary } from './invalidConnections';
import { LEGEND_OPEN_MIN_HEIGHT, LEGEND_OPEN_MIN_WIDTH, legendStartsOpen } from './legendPlacement';
import { menuItems } from './NodeContextMenu';
import { RemoveInvalidDialog } from './RemoveInvalidDialog';

function v2(raw: unknown): DesignDocumentV2 {
  const r = readDesign(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value.doc;
}

/** Three unresolved relationships (different storeys, not touching) and one direct one. */
const withInvalid = () =>
  v2({
    schemaVersion: 2,
    metadata: { name: 'Invalid' },
    nodes: [
      { id: 1, grid: [0, 0, 0], typeId: 'gallery' },
      { id: 2, grid: [1, 0, 0], typeId: 'studio' },
      { id: 3, grid: [6, 6, 1], typeId: 'studio' },
      { id: 4, grid: [9, 1, 2], typeId: 'store' },
    ],
    edges: [
      { id: 1, source: 1, target: 2, kind: 'access' },
      { id: 2, source: 1, target: 3, kind: 'access' },
      { id: 3, source: 2, target: 3, kind: 'open' },
      { id: 4, source: 1, target: 4, kind: 'access' },
    ],
    diagram: { positions: {} },
  });

const model = (doc: DesignDocumentV2) => modelFromV2(doc, resolveRelationships(doc));

describe('Remove invalid connections (pure)', () => {
  it('lists only unresolved relationships, with readable names, kinds and reasons, in document order', () => {
    const rows = invalidConnectionRows(model(withInvalid()));
    expect(rows.map((r) => r.edgeId)).toEqual([2, 3, 4]);
    expect(rows[0]).toMatchObject({ label: '1 ↔ 3', kindLabel: 'Access', reason: 'different-level' });
    expect(rows[1]).toMatchObject({ label: '2 ↔ 3', kindLabel: 'Open' });
    // Labels are the room ids; raw edge ids are never the label.
    expect(rows[2]!.label).toBe('1 ↔ 4');
    expect(rows.every((r) => r.reasonText.length > 10)).toBe(true);
  });

  it('every row starts checked; unchecking keeps that edge out of the ONE remove-edges command', () => {
    const rows = invalidConnectionRows(model(withInvalid()));
    expect(checkedEdgeIds(rows, new Set())).toEqual([2, 3, 4]);
    expect(removeInvalidCommand(rows, new Set([3]))).toEqual({ type: 'remove-edges', edgeIds: [2, 4] });
    expect(removeInvalidCommand(rows, new Set([2, 3, 4]))).toBeNull();
    // Stale unchecked ids (edges no longer listed) are harmless.
    expect(removeInvalidCommand(rows, new Set([99]))).toEqual({ type: 'remove-edges', edgeIds: [2, 3, 4] });
  });

  it('a design without unresolved relationships has nothing to remove', () => {
    const example = readDesign(exampleDesign);
    if (!example.ok) throw new Error('example');
    expect(invalidConnectionRows(model(example.value.doc))).toEqual([]);
    expect(NO_INVALID_CONNECTIONS).toMatch(/no invalid connections/);
  });

  it('summarises the confirmation', () => {
    expect(removeSummary(3, 2)).toBe('Remove 2 of 3 invalid connections; 1 is kept. One undo step restores them.');
    expect(removeSummary(1, 1)).toBe('Remove 1 of 1 invalid connection. One undo step restores them.');
    expect(removeSummary(2, 0)).toMatch(/Nothing is selected/);
  });

  it('the canvas menu offers it (with the count)', () => {
    const items = menuItems(model(withInvalid()), { kind: 'pane' });
    expect(items.map((i) => i.label)).toEqual(['Add node here', 'Remove invalid connections (3)…']);
    expect(items[1]!.action).toEqual({ type: 'remove-invalid' });
    const example = readDesign(exampleDesign);
    if (!example.ok) throw new Error('example');
    expect(menuItems(model(example.value.doc), { kind: 'pane' })[1]).toMatchObject({ label: 'Remove invalid connections…', title: 'There are no invalid connections' });
  });

  it('the review list shows every row checked unless unchecked, and disables Remove with nothing checked', () => {
    const rows = invalidConnectionRows(model(withInvalid()));
    const render = (unchecked: ReadonlySet<number>) =>
      renderToStaticMarkup(createElement(RemoveInvalidDialog, { rows, unchecked, onToggle: () => {}, onConfirm: () => {}, onCancel: () => {} }));
    const all = render(new Set());
    expect(all.match(/checked=""/g)?.length).toBe(3);
    expect(all).toContain('Remove 3 selected');
    expect(all).toContain('1 ↔ 3');
    const one = render(new Set([2, 4]));
    expect(one.match(/checked=""/g)?.length).toBe(1);
    expect(one).toContain('Remove 1 selected');
    expect(render(new Set([2, 3, 4]))).toMatch(/disabled=""[^>]*>Remove 0 selected|>Remove 0 selected/);
  });
});

describe('Graph 2D legend placement', () => {
  it('starts folded in a quarter panel at laptop sizes, open in a large panel', () => {
    // 4-viewport layout at 1280×720 and 1366×768: about 450 × 300 px per panel.
    expect(legendStartsOpen({ width: 450, height: 300 })).toBe(false);
    expect(legendStartsOpen({ width: 520, height: 330 })).toBe(false);
    // Split layout on a wide panel, or a single panel.
    expect(legendStartsOpen({ width: LEGEND_OPEN_MIN_WIDTH, height: LEGEND_OPEN_MIN_HEIGHT })).toBe(true);
    expect(legendStartsOpen({ width: 980, height: 620 })).toBe(true);
  });
});
