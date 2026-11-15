import { describe, expect, it } from 'vitest';
import { DEFAULT_CELL_SIZE, spatialToThree } from '@core/viewer/coordinates';
import { MAX_ROOM_SIZE, validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
import { v2Raw } from '@app/document/v2/test-fixtures';
import {
  applyDesignCommand,
  buildOccupancy,
  proposeSpatialEdit,
  resolveRelationships,
  type DesignCommand,
  type DesignPort,
  type EdgeResolution,
  type RelationshipResolver,
} from '@app/spatial';
import {
  beginDrag,
  cancelEdit,
  confirmEdit,
  displayedGeometry,
  dragStatus,
  endDrag,
  IDLE,
  nudge,
  previewTone,
  updateDrag,
  type RoomEditState,
} from './roomEditSession';
import { applyAxisSteps, roomWorldBox, sameGeometry, type RoomGeometry } from './roomGeometry';

/**
 * Fixture (v2Raw): room a "01" at [0,0,0] size 2×3×1, room b "02" at [5,0,0] 1×1×1, edge "ab".
 * `router` reserves a straight connector at x = 2…4, y = 0 while those cells are free of rooms.
 */
const router: RelationshipResolver = (d) => {
  const rooms = buildOccupancy(d);
  const cells: [number, number, number][] = [
    [2, 0, 0],
    [3, 0, 0],
    [4, 0, 0],
  ];
  const edges: EdgeResolution[] = d.edges.map((e) =>
    cells.some((c) => rooms.at(c))
      ? { edgeId: e.id, kind: e.kind, status: 'unresolved', reason: 'blocked-by-room', message: 'blocked' }
      : {
          edgeId: e.id,
          kind: e.kind,
          status: 'routed',
          route: {
            edgeId: e.id,
            axis: 'x',
            level: 0,
            cells,
            from: { nodeId: e.source, cell: [1, 0, 0], direction: '+x' },
            to: { nodeId: e.target, cell: [5, 0, 0], direction: '-x' },
            style: 'enclosed',
          },
        },
  );
  return { edges, byEdge: new Map(edges.map((r) => [r.edgeId, r])), occupancy: buildOccupancy(d, edges) };
};

function baseDoc(): DesignDocumentV2 {
  const r = validateDocumentV2(v2Raw());
  if (!r.ok) throw new Error('fixture invalid');
  return r.value;
}

/** A host stand-in: one successful command = one history entry. */
function fakeHost(resolve: RelationshipResolver = resolveRelationships, doc = baseDoc()) {
  const history: DesignDocumentV2[] = [];
  const sent: DesignCommand[] = [];
  const host = {
    history,
    sent,
    get port(): DesignPort {
      const current = history.at(-1) ?? doc;
      return {
        doc: current,
        spatial: resolve(current),
        proposeEdit: (request) => proposeSpatialEdit(current, request, { resolve }),
        onCommand: (command) => {
          sent.push(command);
          const r = applyDesignCommand(current, command, { resolve });
          if (!r.ok) return { ok: false, issues: r.issues };
          history.push(r.value);
          return { ok: true };
        },
      };
    },
  };
  return host;
}

const room = (port: DesignPort, id: string) => port.doc.nodes.find((n) => n.id === id)!;

/** Simulate one pointer gesture: press, a sequence of snapped step values, release. */
function gesture(host: ReturnType<typeof fakeHost>, nodeId: string, mode: 'move' | 'resize', axis: 'x' | 'y' | 'z', steps: number[]) {
  let s: RoomEditState = beginDrag(host.port, nodeId, mode, axis);
  for (const n of steps) s = updateDrag(host.port, s, n);
  return { during: s, ...endDrag(host.port, s) };
}

describe('room geometry', () => {
  const start: RoomGeometry = { grid: [0, 0, 0], size: [2, 3, 1] };

  it('moves the minimum corner by whole cells along one axis only', () => {
    expect(applyAxisSteps(start, 'move', 'x', 2)).toEqual({ grid: [2, 0, 0], size: [2, 3, 1] });
    expect(applyAxisSteps(start, 'move', 'y', -1)).toEqual({ grid: [0, -1, 0], size: [2, 3, 1] });
    expect(applyAxisSteps(start, 'move', 'z', 1)).toEqual({ grid: [0, 0, 1], size: [2, 3, 1] });
  });

  it('resizes with the minimum corner anchored and sizes kept positive', () => {
    expect(applyAxisSteps(start, 'resize', 'y', 2)).toEqual({ grid: [0, 0, 0], size: [2, 5, 1] });
    expect(applyAxisSteps(start, 'resize', 'x', -5)).toEqual({ grid: [0, 0, 0], size: [1, 3, 1] });
    expect(applyAxisSteps(start, 'resize', 'z', 999).size[2]).toBe(MAX_ROOM_SIZE);
  });

  it('zero steps is a no-op', () => {
    expect(sameGeometry(applyAxisSteps(start, 'move', 'x', 0), start)).toBe(true);
    expect(sameGeometry(applyAxisSteps(start, 'resize', 'z', 0), start)).toBe(true);
  });

  it('places the world box with spatialToThree and the app cell size', () => {
    const box = roomWorldBox({ grid: [0, 0, 0], size: [2, 3, 1] });
    expect(box.center).toEqual(spatialToThree([0.5, 1, 0]));
    expect(box.size).toEqual([6, 3, 9]);
    const custom = roomWorldBox({ grid: [1, 0, 2], size: [1, 1, 2] }, { horizontal: 4, vertical: 2 });
    expect(custom.center).toEqual(spatialToThree([1, 0, 2.5], { horizontal: 4, vertical: 2 }));
    expect(custom.size).toEqual([4, 4, 4]);
    expect(DEFAULT_CELL_SIZE.horizontal).toBe(3);
  });
});

describe('one gesture = at most one command', () => {
  it('previews while dragging and commits exactly once on release', () => {
    const host = fakeHost();
    const r = gesture(host, 'b', 'move', 'y', [1, 2, 3, 4, 3]);
    expect(host.sent).toHaveLength(1);
    expect(host.history).toHaveLength(1);
    expect(host.sent[0]).toEqual({ type: 'set-node-geometry', nodeId: 'b', grid: [5, 3, 0], size: [1, 1, 1] });
    expect(room(host.port, 'b').grid).toEqual([5, 3, 0]);
    expect(r.state).toBe(IDLE);
    expect(r.feedback).toEqual({ tone: 'info', text: 'Moved room 02 to [5, 3, 0].' });
  });

  it('a drag that returns to the start sends nothing', () => {
    const host = fakeHost();
    const r = gesture(host, 'b', 'move', 'x', [1, 2, 0]);
    expect(host.sent).toHaveLength(0);
    expect(r.feedback).toBeNull();
  });

  it('Escape (cancel) during a drag sends nothing and restores the stored geometry', () => {
    const host = fakeHost();
    let s = beginDrag(host.port, 'b', 'move', 'x');
    s = updateDrag(host.port, s, 3);
    expect(displayedGeometry(host.port.doc, s, 'b')?.grid).toEqual([8, 0, 0]);
    const r = cancelEdit(s);
    expect(r.state).toBe(IDLE);
    expect(host.sent).toHaveLength(0);
    expect(displayedGeometry(host.port.doc, r.state, 'b')?.grid).toEqual([5, 0, 0]);
  });

  it('resizing commits size only, anchored at the minimum corner', () => {
    const host = fakeHost();
    gesture(host, 'a', 'resize', 'z', [1]);
    expect(host.sent).toEqual([{ type: 'set-node-geometry', nodeId: 'a', grid: [0, 0, 0], size: [2, 3, 2] }]);
    expect(room(host.port, 'a')).toMatchObject({ grid: [0, 0, 0], size: [2, 3, 2] });
  });

  it('proposes only when the snapped step changes', () => {
    const host = fakeHost();
    let calls = 0;
    const port = host.port;
    const counting: DesignPort = { ...port, proposeEdit: (r) => (calls++, port.proposeEdit(r)) };
    let s = beginDrag(counting, 'b', 'move', 'x');
    for (const n of [1, 1, 1, 2, 2]) s = updateDrag(counting, s, n);
    expect(calls).toBe(2);
  });
});

describe('room collisions are refused', () => {
  it('blocks, names the room, sends nothing and restores', () => {
    const host = fakeHost();
    const r = gesture(host, 'b', 'move', 'x', [-1, -2, -3, -4]);
    expect(previewTone(r.during)).toBe('blocked');
    expect(dragStatus(host.port.doc, r.during)).toBe('1 × 1 × 1 at [1, 0, 0]: overlaps room 01');
    expect(host.sent).toHaveLength(0);
    expect(r.feedback).toEqual({ tone: 'error', text: 'Room 02 cannot go there: it would overlap room 01. Restored.' });
    expect(room(host.port, 'b').grid).toEqual([5, 0, 0]);
  });

  it('a resize into another room is refused too', () => {
    const host = fakeHost();
    const r = gesture(host, 'a', 'resize', 'x', [4]);
    expect(r.feedback?.tone).toBe('error');
    expect(host.sent).toHaveLength(0);
  });

  it('the keyboard nudge follows the same rules (one command or none)', () => {
    const host = fakeHost();
    expect(nudge(host.port, 'b', 'move', 'z', 1).feedback?.tone).toBe('info');
    expect(host.sent).toHaveLength(1);
    expect(nudge(host.port, 'b', 'resize', 'x', -1).feedback?.text).toMatch(/at least 1 cell/);
    expect(host.sent).toHaveLength(1);
    expect(nudge(host.port, 'missing', 'move', 'x', 1)).toEqual({ state: IDLE, feedback: null });
  });
});

describe('corridor reservations need confirmation', () => {
  it('warns, sends nothing until "Move anyway and recalculate", then exactly one confirmed command', () => {
    const host = fakeHost(router);
    const r = gesture(host, 'b', 'move', 'x', [-1, -2]);
    expect(previewTone(r.during)).toBe('warning');
    expect(r.state.phase).toBe('confirm');
    expect(r.feedback?.tone).toBe('warning');
    expect(r.feedback?.text).toContain('relationship "ab"');
    expect(host.sent).toHaveLength(0);
    expect(displayedGeometry(host.port.doc, r.state, 'b')?.grid).toEqual([3, 0, 0]);

    const c = confirmEdit(host.port, r.state);
    expect(host.sent).toEqual([
      { type: 'set-node-geometry', nodeId: 'b', grid: [3, 0, 0], size: [1, 1, 1], confirmRouteDisplacement: true },
    ]);
    expect(host.history).toHaveLength(1);
    expect(c.state).toBe(IDLE);
    expect(host.port.doc.edges.map((e) => e.id)).toEqual(['ab']); // relationship kept
    expect(host.port.spatial.byEdge.get('ab')?.status).toBe('unresolved');
  });

  it('Cancel sends nothing', () => {
    const host = fakeHost(router);
    const r = gesture(host, 'b', 'move', 'x', [-2]);
    const c = cancelEdit(r.state);
    expect(c.state).toBe(IDLE);
    expect(c.feedback?.text).toMatch(/nothing changed/);
    expect(host.sent).toHaveLength(0);
    expect(room(host.port, 'b').grid).toEqual([5, 0, 0]);
  });

  it('a host refusal is reported and not retried', () => {
    const host = fakeHost(router);
    const r = gesture(host, 'b', 'move', 'x', [-2]);
    const refusing: DesignPort = { ...host.port, onCommand: () => ({ ok: false, issues: [{ path: [], code: 'route-displacement', message: 'nope' }] }) };
    const c = confirmEdit(refusing, r.state);
    expect(c.state).toBe(IDLE);
    expect(c.feedback).toEqual({ tone: 'error', text: 'Room 02 was not changed: nope.' });
  });
});

describe('robustness', () => {
  it('ending a drag of a room that disappeared (e.g. undo mid-drag) sends nothing', () => {
    const host = fakeHost();
    let s = beginDrag(host.port, 'b', 'move', 'x');
    s = updateDrag(host.port, s, 1);
    host.port.onCommand({ type: 'remove-node', nodeId: 'b' });
    host.sent.length = 0;
    const r = endDrag(host.port, s);
    expect(r).toEqual({ state: IDLE, feedback: null });
    expect(host.sent).toHaveLength(0);
  });

  it('beginDrag on an unknown room stays idle; actions outside their phase are no-ops', () => {
    const host = fakeHost();
    expect(beginDrag(host.port, 'zzz', 'move', 'x')).toBe(IDLE);
    expect(updateDrag(host.port, IDLE, 3)).toBe(IDLE);
    expect(endDrag(host.port, IDLE).state).toBe(IDLE);
    expect(confirmEdit(host.port, IDLE).state).toBe(IDLE);
    expect(host.sent).toHaveLength(0);
  });
});
