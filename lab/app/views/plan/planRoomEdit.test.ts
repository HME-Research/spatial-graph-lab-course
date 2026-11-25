import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { applyDesignCommand, proposeSpatialEdit, resolveRelationships, type DesignCommand, type DesignPort } from '@app/spatial';
import { buildPlan, planSourceV2 } from '@app/building';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { NO_SELECTION, selectNode, type Selection } from '@core/viewer/selection';
import { PanelMemoryContext, createPanelMemory } from '../panelMemory';
import { beginDrag, cancelEdit, endDrag, previewTone, updateDraft, type RoomEditState } from '../three/editing/roomEditSession';
import type { RoomGeometry } from '../three/editing/roomGeometry';
import { PlanView } from './PlanView';
import { PLAN_RESIZE_HANDLES, geometryRect, handleMode, handlePoint, handleTitle, planDraft, planSteps, spansLevel, type PlanHandle } from './planRoomEdit';

const H = DEFAULT_CELL_SIZE.horizontal; // 3 m

/** Room 1: 2 × 1 at the origin; room 2: 1 × 1 two cells to its right; room 3 on storey 1. */
const doc = expectOk(
  validateDocumentV2({
    schemaVersion: 2,
    metadata: { name: 'plan-edit' },
    nodes: [
      { id: 1, position: [0, 0, 0], size: [2, 1, 1], function: 'gallery' },
      { id: 2, position: [3, 0, 0], size: [1, 1, 1], function: 'studio' },
      { id: 3, position: [0, 0, 1], size: [1, 1, 1], function: 'studio' },
    ],
    edges: [{ id: 1, source: 1, target: 3, relationship: 'access' }],
    settings: { styleBy: 'function', styles: {} },
  }),
);

/** A host stand-in: one successful command = one history entry (as the app's DesignPort). */
function fakeHost(start: DesignDocumentV2 = doc) {
  const history: DesignDocumentV2[] = [start];
  const sent: DesignCommand[] = [];
  return {
    history,
    sent,
    get port(): DesignPort {
      const current = history.at(-1)!;
      return {
        doc: current,
        spatial: resolveRelationships(current),
        proposeEdit: (request) => proposeSpatialEdit(current, request),
        onCommand: (command) => {
          sent.push(command);
          const r = applyDesignCommand(current, command);
          if (!r.ok) return { ok: false, issues: r.issues };
          history.push(r.value);
          return { ok: true };
        },
      };
    },
  };
}

/** One Plan drag: press on `handle`, pointer travel in plan metres, release. */
function planGesture(host: ReturnType<typeof fakeHost>, nodeId: number, handle: PlanHandle, moves: readonly (readonly [number, number])[]) {
  const node = host.port.doc.nodes.find((n) => n.id === nodeId)!;
  const start: RoomGeometry = { position: node.position, size: node.size };
  let s: RoomEditState = beginDrag(host.port, nodeId, handleMode(handle), 'x', 1);
  for (const [dx, dy] of moves) s = updateDraft(host.port, s, planDraft(start, handle, dx, dy));
  return { during: s, ...endDrag(host.port, s) };
}

describe('plan room editing: geometry', () => {
  const start: RoomGeometry = { position: [0, 0, 2], size: [2, 3, 1] };

  it('snaps pointer travel to the nearest whole cell; screen down is grid −y', () => {
    expect(planSteps(0.4 * H, 0)).toEqual({ x: 0, y: 0 });
    expect(planSteps(0.6 * H, 0)).toEqual({ x: 1, y: 0 });
    expect(planSteps(-1.6 * H, 2.4 * H)).toEqual({ x: -2, y: -2 });
    expect(planSteps(0, -1.2 * H)).toEqual({ x: 0, y: 1 });
    expect(Object.is(planSteps(-0.2, 0.2).x, -0)).toBe(false);
  });

  it('moves on x and y at once and never changes the storey or the size', () => {
    expect(planDraft(start, 'move', 2 * H, -1 * H)).toEqual({ position: [2, 1, 2], size: [2, 3, 1] });
    expect(planDraft(start, 'move', 0.2, 0.2)).toEqual(start);
  });

  it('resizes one axis from an edge with the opposite face fixed', () => {
    // East (right) edge: the maximum x face follows.
    expect(planDraft(start, 'e', 2 * H, 5 * H)).toEqual({ position: [0, 0, 2], size: [4, 3, 1] });
    // West (left) edge dragged left: the minimum x face follows, the room grows to −x.
    expect(planDraft(start, 'w', -1 * H, 0)).toEqual({ position: [-1, 0, 2], size: [3, 3, 1] });
    // North (top of the screen) = maximum y: dragging up grows +y.
    expect(planDraft(start, 'n', 0, -2 * H)).toEqual({ position: [0, 0, 2], size: [2, 5, 1] });
    // South (bottom) dragged up shrinks from the minimum y face.
    expect(planDraft(start, 's', 0, -1 * H)).toEqual({ position: [0, 1, 2], size: [2, 2, 1] });
  });

  it('resizes both axes from a corner and keeps at least one cell', () => {
    expect(planDraft(start, 'ne', 1 * H, -1 * H)).toEqual({ position: [0, 0, 2], size: [3, 4, 1] });
    expect(planDraft(start, 'sw', -1 * H, 1 * H)).toEqual({ position: [-1, -1, 2], size: [3, 4, 1] });
    // Far past the opposite face: clamped to 1 cell, the opposite face stays put.
    expect(planDraft(start, 'se', -9 * H, -9 * H)).toEqual({ position: [0, 2, 2], size: [1, 1, 1] });
    expect(planDraft(start, 'nw', 9 * H, 9 * H)).toEqual({ position: [1, 0, 2], size: [1, 1, 1] });
  });

  it('draws the same footprint as the Plan model, with handles on its edges and corners', () => {
    const plan = buildPlan(planSourceV2(doc, resolveRelationships(doc)), 0);
    const room = plan.rooms.find((r) => r.nodeId === 1)!;
    const rect = geometryRect({ position: [0, 0, 0], size: [2, 1, 1] });
    expect(rect).toEqual(room.rect);
    expect(handlePoint(rect, 'nw')).toEqual([rect.x0, rect.y0]);
    expect(handlePoint(rect, 'se')).toEqual([rect.x1, rect.y1]);
    expect(handlePoint(rect, 'e')).toEqual([rect.x1, (rect.y0 + rect.y1) / 2]);
    expect(PLAN_RESIZE_HANDLES).toHaveLength(8);
    expect(spansLevel({ position: [0, 0, 1], size: [1, 1, 2] }, 2)).toBe(true);
    expect(spansLevel({ position: [0, 0, 1], size: [1, 1, 2] }, 3)).toBe(false);
  });

  it('says in every tooltip that the storey and height stay the same', () => {
    for (const h of ['move', ...PLAN_RESIZE_HANDLES] as const) expect(handleTitle(h)).toMatch(/storey and height stay the same/);
  });
});

describe('plan room editing: the 3D session rules', () => {
  it('moves to a free place with exactly one set-node-geometry command', () => {
    const host = fakeHost();
    const r = planGesture(host, 2, 'move', [
      [0.4 * H, 0],
      [1 * H, -2 * H],
    ]);
    expect(previewTone(r.during)).toBe('normal');
    expect(host.sent).toEqual([{ type: 'set-node-geometry', nodeId: 2, position: [4, 2, 0], size: [1, 1, 1] }]);
    expect(host.history).toHaveLength(2);
    expect(r.feedback?.text).toMatch(/Moved room 2 to \[4, 2, 0\]/);
  });

  it('resizes larger from a corner (one command, z and height unchanged)', () => {
    const host = fakeHost();
    const r = planGesture(host, 2, 'ne', [[1 * H, -1 * H]]);
    expect(host.sent).toEqual([{ type: 'set-node-geometry', nodeId: 2, position: [3, 0, 0], size: [2, 2, 1] }]);
    expect(r.feedback?.text).toMatch(/Resized room 2 to 2 × 2 × 1 cells/);
  });

  it('refuses an overlap: red preview, nothing sent, a readable reason', () => {
    const host = fakeHost();
    const r = planGesture(host, 2, 'w', [[-2 * H, 0]]); // grows left into room 1 (x 0…1)
    expect(previewTone(r.during)).toBe('blocked');
    expect(host.sent).toEqual([]);
    expect(host.history).toHaveLength(1);
    expect(r.feedback).toEqual({ tone: 'error', text: expect.stringMatching(/cannot go there: it would overlap room 1/) });
  });

  it('sends nothing for an unchanged drop or a cancelled drag (Escape)', () => {
    const host = fakeHost();
    planGesture(host, 1, 'move', [[0.3 * H, 0.3 * H]]);
    let s: RoomEditState = beginDrag(host.port, 1, 'move', 'x', 1);
    s = updateDraft(host.port, s, planDraft({ position: [0, 0, 0], size: [2, 1, 1] }, 'move', 0, 3 * H));
    expect(cancelEdit(s).state.phase).toBe('idle');
    expect(host.sent).toEqual([]);
  });
});

describe('plan room editing: toggle', () => {
  function render(selection: Selection, remembered?: object): string {
    const port: DesignPort = {
      doc,
      spatial: resolveRelationships(doc),
      onCommand: () => ({ ok: true }),
      proposeEdit: (request) => proposeSpatialEdit(doc, request),
    };
    const view = createElement(PlanView, { selection, onSelect: () => {}, design: port });
    if (!remembered) return renderToStaticMarkup(view);
    const memory = createPanelMemory();
    memory.set('plan:view', remembered);
    return renderToStaticMarkup(createElement(PanelMemoryContext.Provider, { value: memory }, view));
  }

  it('is off by default: the toggle is not pressed and no handles are drawn', () => {
    const html = render(selectNode(1));
    expect(html).toMatch(/aria-pressed="false"[^>]*data-plan-edit-toggle/);
    expect(html).toContain('Edit rooms');
    expect(html).not.toContain('data-plan-handle');
  });

  it('is remembered by the panel; when on, the selected room on this storey gets a move surface and 8 handles', () => {
    const html = render(selectNode(1), { level: 0, editRooms: true });
    expect(html).toMatch(/aria-pressed="true"[^>]*data-plan-edit-toggle/);
    expect(html.match(/data-plan-handle="/g)).toHaveLength(9);
    expect(html).toContain('data-plan-edit-room="1"');
  });

  it('shows no handles for nothing selected or a room on another storey, only a hint', () => {
    for (const selection of [NO_SELECTION, selectNode(3)]) {
      const html = render(selection, { level: 0, editRooms: true });
      expect(html).not.toContain('data-plan-handle');
      expect(html).toContain('Select a room on this storey to move or resize it.');
    }
  });
});
