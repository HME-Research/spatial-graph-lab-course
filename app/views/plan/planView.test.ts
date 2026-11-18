import {  } from '@app/document/v2';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import exampleJson from '../../document/examples/two-storey-example.json';
import { validateDocument } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { readDesign, validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
import { resolveRelationships, type DesignPort } from '@app/spatial';
import { buildPlan, planSourceV2, type PlanOpening } from '@app/building';
import { NO_SELECTION, selectEdge, selectNode, type Selection } from '@core/viewer/selection';
import { PanelMemoryContext, createPanelMemory } from '../panelMemory';
import { PlanView } from './PlanView';
import { doorSwingPath } from './planShapes';
import { MAX_SCALE, MIN_SCALE, effectiveLevel, fitViewport, panBy, toPlan, viewBoxOf, wheelFactor, zoomAt } from './planViewport';

const example = expectOk(readDesign(exampleJson)).doc;
const v1Example = expectOk(validateDocument(exampleJson));

function port(doc: DesignDocumentV2): DesignPort {
  return {
    doc,
    spatial: resolveRelationships(doc),
    onCommand: () => {
      throw new Error('the Plan never issues commands');
    },
    proposeEdit: () => {
      throw new Error('the Plan never proposes edits');
    },
  };
}

function render(doc: DesignDocumentV2 | null, selection: Selection = NO_SELECTION, level?: number): string {
  const props = {
    doc: v1Example,
    selection,
    onSelect: () => {},
    onCommand: () => ({ ok: true }) as const,
    ...(doc ? { design: port(doc) } : {}),
  };
  const view = createElement(PlanView, props);
  if (level === undefined) return renderToStaticMarkup(view);
  const memory = createPanelMemory();
  memory.set('plan:view', { level });
  return renderToStaticMarkup(createElement(PanelMemoryContext.Provider, { value: memory }, view));
}

const twoRooms = expectOk(
  validateDocumentV2({
    schemaVersion: 2,
    metadata: { name: 'plan-view' },
    nodes: [
      { id: 'a', grid: [0, 0, 0], size: [1, 1, 1], typeId: 'gallery', displayId: '1' },
      { id: 'b', grid: [1, 0, 0], size: [1, 1, 2], typeId: 'studio', displayId: '2' },
      { id: 'c', grid: [5, 5, 0], size: [1, 1, 1], typeId: 'studio', displayId: '3' },
      { id: 'd', grid: [5, 7, 3], size: [1, 1, 1], typeId: 'studio', displayId: '4' },
    ],
    edges: [
      { id: 'ab', source: 'a', target: 'b', kind: 'access' },
      // Not adjacent and on different storeys: unresolved, so never drawn as an opening.
      { id: 'cd', source: 'c', target: 'd', kind: 'access' },
    ],
    settings: { styleBy: 'function', styles: {} },
  }),
);

describe('PlanView', () => {
  it('draws the plan (no placeholder) on an SVG surface the smoke test can find', () => {
    const html = render(example);
    expect(html).not.toContain('data-placeholder');
    expect(html).toContain('data-view-surface="plan"');
    expect(html).toContain('class="sgl-plan-wall');
    expect(html).toContain('sgl-plan-opening door');
  });

  it('offers only existing storeys in the selector and labels rooms with displayId ?? id', () => {
    const html = render(twoRooms);
    const options = [...html.matchAll(/<option value="(-?\d+)"/g)].map((m) => Number(m[1]));
    expect(options).toEqual([0, 1, 3]);
    expect(html).toContain('aria-label="Floor plan of Level 0"');
    expect(html).toMatch(/>1<\/text>/);
    expect(html).toMatch(/>2<tspan[^>]*>L0–L1<\/tspan><\/text>/);
  });

  it('the remembered storey is shown; a multi-storey room appears on its upper storey too', () => {
    const html = render(twoRooms, NO_SELECTION, 1);
    expect(html).toContain('aria-label="Floor plan of Level 1"');
    expect(html).toContain('data-node-id="b"');
    expect(html).not.toContain('data-node-id="a"');
  });

  it('a remembered storey that no longer exists falls back to the ground storey', () => {
    expect(render(twoRooms, NO_SELECTION, 2)).toContain('aria-label="Floor plan of Level 0"');
  });

  it('highlights the selected room, and the selected relationship with its rooms', () => {
    expect(render(twoRooms, selectNode('a'))).toMatch(/class="sgl-plan-room selected" data-node-id="a"/);
    const edge = render(twoRooms, selectEdge('ab'));
    expect(edge).toMatch(/class="sgl-plan-opening door selected"[^>]*data-edge-id="ab"/);
    expect(edge).toMatch(/class="sgl-plan-room related" data-node-id="a"/);
  });

  it('never draws an unresolved relationship and says it is not drawn', () => {
    const html = render(twoRooms);
    expect(html).not.toContain('data-edge-id="cd"');
    expect(html).toContain('1 unresolved relationship not drawn');
  });

  it('wall targets are not drawn without the wall data hook, and are with it (shared walls only)', () => {
    expect(render(twoRooms)).not.toContain('sgl-plan-wall-target');
    const html = renderToStaticMarkup(
      createElement(PlanView, {
        doc: v1Example,
        selection: NO_SELECTION,
        onSelect: () => {},
        onCommand: () => ({ ok: true }) as const,
        design: port(twoRooms),
        onWallTarget: () => {},
      }),
    );
    const targets = [...html.matchAll(/class="sgl-plan-wall-target[^"]*" data-face-id="([^"]+)"/g)].map((m) => m[1]);
    // a | b share exactly one wall on Level 0; c stands alone.
    expect(targets).toEqual(['a:+x']);
  });

  it('an empty design shows an explanation and a disabled storey selector', () => {
    const empty = expectOk(validateDocumentV2({ schemaVersion: 2, metadata: { name: 'e' }, nodes: [], edges: [], settings: { styleBy: 'function', styles: {} } }));
    const html = render(empty);
    expect(html).toContain('This scenario has no rooms yet');
    expect(html).toMatch(/<select[^>]*disabled/);
  });

  it('without the design port it explains instead of drawing', () => {
    const html = render(null);
    expect(html).toContain('needs the schema-v2 design');
    expect(html).not.toContain('<svg');
  });
});

describe('plan viewport (pan / zoom / fit)', () => {
  const size = { width: 400, height: 200 };

  it('fit frames the bounds with padding, centred', () => {
    const v = fitViewport({ x0: 0, x1: 30, y0: 0, y1: 10 }, size, 20);
    expect(v.cx).toBe(15);
    expect(v.cy).toBe(5);
    expect(v.scale).toBeCloseTo(30 / 360, 12);
    expect(viewBoxOf(v, size).split(' ').map(Number)[2]).toBeCloseTo(400 * v.scale, 9);
    expect(fitViewport(null, size).cx).toBe(0);
  });

  it('zoom keeps the point under the pointer fixed and is clamped', () => {
    const v = fitViewport({ x0: 0, x1: 30, y0: 0, y1: 10 }, size);
    const before = toPlan(v, size, 50, 70);
    const z = zoomAt(v, size, 2, 50, 70);
    expect(z.scale).toBeCloseTo(v.scale / 2, 12);
    const after = toPlan(z, size, 50, 70);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
    expect(zoomAt(v, size, 1e9).scale).toBe(MIN_SCALE);
    expect(zoomAt(v, size, 1e-9).scale).toBe(MAX_SCALE);
    expect(zoomAt(v, size, Number.NaN)).toBe(v);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-100)).toBeGreaterThan(1);
  });

  it('pan moves the drawing with the pointer', () => {
    const v = { cx: 10, cy: 10, scale: 0.1 };
    expect(panBy(v, 20, -10)).toEqual({ cx: 8, cy: 11, scale: 0.1 });
  });

  it('storey choice: wanted if present, else ground, else lowest, else none', () => {
    expect(effectiveLevel([0, 1, 3], 3)).toBe(3);
    expect(effectiveLevel([0, 1, 3], 2)).toBe(0);
    expect(effectiveLevel([-1, 2], undefined)).toBe(-1);
    expect(effectiveLevel([], 0)).toBeNull();
  });
});

describe('plan shapes', () => {
  it('a door swings into its owner room, with a leaf as long as the opening is wide', () => {
    const doc = expectOk(
      validateDocumentV2({
        schemaVersion: 2,
        metadata: { name: 'door' },
        nodes: [
          { id: 'a', grid: [0, 0, 0], size: [1, 1, 1], typeId: 'gallery' },
          { id: 'b', grid: [0, 1, 0], size: [1, 1, 1], typeId: 'gallery' },
        ],
        edges: [{ id: 'ab', source: 'a', target: 'b', kind: 'access' }],
        settings: { styleBy: 'function', styles: {} },
      }),
    );
    const plan = buildPlan(planSourceV2(doc, resolveRelationships(doc)), 0);
    const door = plan.openings.find((o) => o.kind === 'door')! as PlanOpening;
    const owner = plan.rooms.find((r) => r.nodeId === 'a')!;
    // `a:+y` faces grid +y = plan −y; the leaf goes the other way, into room a.
    expect(door.faceId).toBe('a:+y');
    const nums = doorSwingPath(door).match(/-?\d+(\.\d+)?/g)!.map(Number);
    const [hx, hy, lx, ly] = nums;
    expect(lx).toBeCloseTo(hx!, 9);
    expect(ly! - hy!).toBeCloseTo(door.width, 9);
    expect(ly!).toBeGreaterThan(owner.rect.y0);
    expect(ly!).toBeLessThanOrEqual(owner.rect.y1);
  });
});
