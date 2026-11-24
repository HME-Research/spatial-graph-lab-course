import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BoundaryShift } from '@app/document';
import { resolveRelationships } from '@app/spatial';
import { selectEdge, selectNode, type Selection } from '@core/viewer/selection';
import { directionChevron } from '@app/views/graph2d/RelationEdge';
import { Inspector } from './Inspector';
import { fakePort } from './test-fixtures';

/**
 * Properties for boundary shifts (2026-11-24): source/target and Reverse, the requested shift with
 * its applied status and reason, the choices disabled (with a reason) for stacked rooms or rooms on
 * different storeys, and a room's nominal / actual area and Boundary adjusted.
 */

const raw = (shift: BoundaryShift | undefined, room2: { position: number[]; size?: number[] } = { position: [1, 0, 0] }) => ({
  schemaVersion: 2,
  metadata: { name: 'shift' },
  nodes: [
    { id: 1, position: [0, 0, 0], function: 'bedroom' },
    { id: 2, function: 'bathroom', ...room2 },
  ],
  edges: [{ id: 1, source: 1, target: 2, relationship: 'access', ...(shift ? { boundaryShift: shift } : {}) }],
});

function render(rawDoc: unknown, selection: Selection) {
  const design = fakePort(rawDoc, resolveRelationships);
  const html = renderToStaticMarkup(createElement(Inspector, { onSelect: () => {}, design, selection }));
  return { html, design };
}

/** The `<label>` of one shift choice. */
const choice = (html: string, value: BoundaryShift) => html.match(new RegExp(`<label[^>]*data-shift="${value}"[^>]*>`))?.[0] ?? '';

describe('edge Properties', () => {
  it('names source and target, offers Reverse, and shows an applied request with its effect', () => {
    const { html } = render(raw('toward-target'), selectEdge(1));
    expect(html).toContain('data-attribute="source"');
    expect(html).toContain('data-attribute="target"');
    expect(html).toContain('⇄ Reverse source and target');
    expect(choice(html, 'toward-target')).toContain('class="checked"');
    expect(html).toContain('data-shift-status="applied"');
    expect(html).toContain('room 2: 9 → 4.5 m²; room 1: 9 → 13.5 m²');
  });

  it('a request that cannot apply stays selected, marked Not applied with its reason', () => {
    const { html } = render(raw('toward-source', { position: [3, 0, 0] }), selectEdge(1));
    expect(choice(html, 'toward-source')).toContain('class="checked"');
    expect(html).toContain('data-shift-status="not-touching"');
    expect(html).toContain('Not applied');
    expect(html).toContain('The rooms do not share a wall.');
    expect(html).toContain('The request is kept.');
  });

  it('stacked rooms: both shift choices disabled with the reason; No shift stays available to clear a stored request', () => {
    const { html } = render(raw('toward-target', { position: [0, 0, 1] }), selectEdge(1));
    for (const v of ['toward-source', 'toward-target'] as const) {
      expect(choice(html, v)).toMatch(/disabled/);
      expect(choice(html, v)).toContain('the rooms are stacked');
    }
    expect(choice(html, 'none')).not.toMatch(/disabled/);
    // The stored (now impossible) request stays shown as chosen; No shift can still be picked.
    const input = (value: BoundaryShift) => html.match(new RegExp(`<input[^>]*value="${value}"[^>]*>`))?.[0] ?? '';
    expect(input('toward-target')).toMatch(/disabled=""/);
    expect(input('toward-target')).toMatch(/checked=""/);
    expect(input('none')).not.toMatch(/disabled/);
  });

  it('rooms spanning different storeys: disabled too', () => {
    const { html } = render(raw(undefined, { position: [1, 0, 0], size: [1, 1, 2] }), selectEdge(1));
    expect(choice(html, 'toward-source')).toContain('the rooms span different storeys');
  });
});

describe('node Properties', () => {
  it('shows nominal and actual area and Boundary adjusted (read-only)', () => {
    const shifted = render(raw('toward-target'), selectNode(1)).html;
    expect(shifted).toContain('<span data-area="nominal">Nominal 9 m²</span>');
    expect(shifted).toContain('<span data-area="actual">Actual 13.5 m²</span>');
    expect(shifted).toMatch(/data-boundary-adjusted="yes">Yes \(gains area, <button[^>]*>edge 1<\/button>/);
    const plain = render(raw(undefined), selectNode(2)).html;
    expect(plain).toContain('Actual 9 m²');
    expect(plain).toContain('data-boundary-adjusted="no">No<');
  });
});

describe('Graph 2D orientation chevron', () => {
  it('points from source to target, sits past the middle, and is left out on a very short edge', () => {
    const path = directionChevron([0, 0], [100, 0])!;
    const [, , tipX, tipY] = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(tipY).toBe(0);
    expect(tipX).toBeGreaterThan(50);
    const back = directionChevron([100, 0], [0, 0])!;
    expect(Number(back.match(/-?\d+(\.\d+)?/g)![2])).toBeLessThan(50);
    expect(directionChevron([0, 0], [10, 0])).toBeNull();
  });
});
