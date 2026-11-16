import { describe, expect, it } from 'vitest';
import { buildBuildingV2, buildPlan, planSourceV2, resolveBuildingFaces } from '@app/building';
import { createMemoryProjectStore } from '@app/project';
import { resolveWithPreferences, type DesignPort, type ScenarioCommand } from '@app/spatial';
import { modelFromV2 } from '@app/views/graph2d/diagramModel';
import { invalidConnectionRows, removeInvalidCommand } from '@app/views/graph2d/invalidConnections';
import {
  addRelationshipCommand,
  changeKindCommand,
  faceIndex,
  moveDoorHereCommand,
  removeRelationshipCommand,
  wallPanelModel,
  type WallCommand,
  type WallPanel,
} from '@app/views/three/wallInteraction/wallPanelModel';
import { activeContent, type OpenProject } from './projectStore';
import { design, fileOf } from './projectStore.fixtures';
import { createProjectController, type ProjectController } from './projectStoreController';

/*
 * Wave 2 (D): the Building / Plan wall panel and Graph 2D "Remove invalid connections" commands
 * applied through the REAL project controller (the path App's design port takes): one history step
 * each, the same graph in the document, the resolution, the Building faces and the Plan openings,
 * stable edge ids, and the clicked face as the door location.
 */

// ── Fixture: a and b share a two-face wall (no relationship); c↔d and c↔e cannot be built ─────────

const doc = () =>
  design({
    schemaVersion: 2,
    metadata: { name: 'Walls' },
    nodes: [
      { id: 'a', displayId: '01', grid: [0, 1, 0], size: [1, 2, 1], typeId: 'gallery' },
      { id: 'b', displayId: '02', grid: [1, 1, 0], size: [1, 2, 1], typeId: 'studio' },
      { id: 'c', displayId: '03', grid: [5, 5, 0], typeId: 'studio' },
      { id: 'd', displayId: '04', grid: [8, 8, 1], typeId: 'studio' },
      { id: 'e', displayId: '05', grid: [9, 2, 1], typeId: 'store' },
    ],
    edges: [
      { id: 'cd', source: 'c', target: 'd', kind: 'access' },
      { id: 'ce', source: 'c', target: 'e', kind: 'open' },
    ],
    diagram: { positions: { a: [0, 0], b: [100, 0], c: [200, 0], d: [300, 0], e: [400, 0] } },
  });

/** The two unit faces of the a|b wall (a owns them: 'a' < 'b'). */
const FACE_SOUTH = 'a:0.0.0:+x';
const FACE_NORTH = 'a:0.1.0:+x';

function controller(): ProjectController {
  let n = 0;
  return createProjectController({
    store: createMemoryProjectStore(),
    scheduler: { set: () => 0, clear: () => undefined },
    locks: null,
    now: () => '2026-11-16T12:00:00.000Z',
    newProjectId: () => `project-w${++n}`,
    newScenarioId: () => `scenario-w${++n}`,
  });
}
async function opened(): Promise<ProjectController> {
  const c = controller();
  const r = await c.open(fileOf(doc()), { kind: 'created', label: 'test' });
  if (!r.ok) throw new Error(r.message);
  return c;
}
const project = (c: ProjectController): OpenProject => c.getState().project!;

/** What the views see: the design port of the active scenario, exactly as App builds it. */
function portOf(c: ProjectController): DesignPort {
  const content = activeContent(project(c));
  const run = (command: ScenarioCommand) => {
    const r = c.command(command);
    return r.ok ? ({ ok: true } as const) : ({ ok: false, issues: r.issues } as const);
  };
  return {
    doc: content.design,
    spatial: resolveWithPreferences(content.design, content.facePreferences),
    onCommand: run,
    onScenarioCommand: run,
    proposeEdit: () => ({ status: 'rejected', issues: [], collidingRooms: [] }),
  };
}
function panelOf(c: ProjectController, faceId: string): WallPanel {
  const port = portOf(c);
  return wallPanelModel(faceId, faceIndex(resolveBuildingFaces(port.doc, port.spatial)), port.doc, port.spatial);
}
function send(c: ProjectController, command: WallCommand): void {
  const port = portOf(c);
  const r = command.port === 'design' ? port.onCommand(command.command) : port.onScenarioCommand!(command.command);
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join('; '));
}
function addAt(c: ProjectController, faceId: string, kind: 'access' | 'open'): string {
  const panel = panelOf(c, faceId);
  if (panel.kind !== 'add') throw new Error(`expected an add panel, got ${panel.kind}`);
  const { edgeId, command } = addRelationshipCommand(panel, kind, portOf(c).doc);
  send(c, command);
  return edgeId;
}

/** Same-graph evidence: where the Building and the Plan put this edge's openings. */
function openingsOf(c: ProjectController, edgeId: string) {
  const port = portOf(c);
  const building = buildBuildingV2(port.doc, { spatial: port.spatial });
  const buildingFaces = [...new Set(building.elements.filter((e) => e.edgeId === edgeId).map((e) => e.faceId))].sort();
  const doorWalls = building.elements.filter((e) => e.edgeId === edgeId && e.part === 'wall' && e.condition === 'door').length;
  const plan = buildPlan(planSourceV2(port.doc, port.spatial), 0);
  const planOpenings = plan.openings.filter((o) => o.edgeId === edgeId).map((o) => ({ faceId: o.faceId, kind: o.kind }));
  return { buildingFaces, doorWalls, planOpenings, resolution: port.spatial.byEdge.get(edgeId) };
}

// ── Through the project controller: one undo step each, same graph in every view ──────────────

describe('wall interaction through the project controller', () => {
  it('Add → Access puts the door on the CLICKED face (Building and Plan), in one undo step', async () => {
    for (const clicked of [FACE_SOUTH, FACE_NORTH]) {
      const c = await opened();
      const before = activeContent(project(c));
      const edgeId = addAt(c, clicked, 'access');
      expect(edgeId).toBe('edge-1');

      // Same graph: the edge is in the document, with the clicked face as its preference …
      const after = activeContent(project(c));
      expect(after.design.edges.map((e) => e.id)).toEqual(['cd', 'ce', 'edge-1']);
      expect(after.design.edges.find((e) => e.id === 'edge-1')).toMatchObject({ source: 'a', target: 'b', kind: 'access' });
      expect(after.facePreferences['edge-1']).toEqual({ nodeId: 'a', offset: clicked === FACE_SOUTH ? [0, 0, 0] : [0, 1, 0], direction: '+x' });
      // … resolved direct ON that face …
      const o = openingsOf(c, 'edge-1');
      expect(o.resolution).toMatchObject({ status: 'direct', preferredFace: { direction: '+x' } });
      // … built as a door on exactly that face in the Building, and drawn there in the Plan.
      expect(o.buildingFaces).toEqual([clicked]);
      expect(o.doorWalls).toBeGreaterThan(0);
      expect(o.planOpenings).toEqual([{ faceId: clicked, kind: 'door' }]);
      // The panel now shows the existing relationship, with its door here: no second Add.
      expect(panelOf(c, clicked)).toMatchObject({ kind: 'existing', edgeId: 'edge-1', relationshipKind: 'access', status: 'direct', opening: 'here', moveDoorHere: null });
      const other = clicked === FACE_SOUTH ? FACE_NORTH : FACE_SOUTH;
      expect(panelOf(c, other)).toMatchObject({ kind: 'existing', edgeId: 'edge-1', opening: 'elsewhere' });

      // ONE undo step restores the design AND the preference sidecar.
      expect(c.undo()).toBe(true);
      expect(activeContent(project(c))).toEqual(before);
      expect(c.undo()).toBe(false);
      // Redo brings back the same edge id (stable ids).
      expect(c.redo()).toBe(true);
      expect(activeContent(project(c)).design.edges.map((e) => e.id)).toContain('edge-1');
      expect(openingsOf(c, 'edge-1').planOpenings).toEqual([{ faceId: clicked, kind: 'door' }]);
    }
  });

  it('never creates a duplicate edge: a related wall offers change/remove, and the door can move here in one step', async () => {
    const c = await opened();
    addAt(c, FACE_SOUTH, 'access');
    const panel = panelOf(c, FACE_NORTH);
    if (panel.kind !== 'existing') throw new Error('existing expected');
    expect(() => addAt(c, FACE_NORTH, 'access')).toThrow(/add panel/);

    const move = moveDoorHereCommand(panel);
    expect(move).toEqual({ port: 'scenario', command: { type: 'set-face-preference', edgeId: 'edge-1', preference: { nodeId: 'a', offset: [0, 1, 0], direction: '+x' } } });
    send(c, move!);
    expect(openingsOf(c, 'edge-1').buildingFaces).toEqual([FACE_NORTH]);
    expect(openingsOf(c, 'edge-1').planOpenings).toEqual([{ faceId: FACE_NORTH, kind: 'door' }]);
    expect(activeContent(project(c)).design.edges).toHaveLength(3);
    expect(c.undo()).toBe(true);
    expect(openingsOf(c, 'edge-1').buildingFaces).toEqual([FACE_SOUTH]);

    // Change kind and remove: one design command each, same edge id.
    send(c, changeKindCommand(panel, 'open'));
    expect(activeContent(project(c)).design.edges.find((e) => e.id === 'edge-1')?.kind).toBe('open');
    expect(activeContent(project(c)).facePreferences['edge-1']).toBeUndefined();
    expect(openingsOf(c, 'edge-1').buildingFaces).toEqual([FACE_SOUTH, FACE_NORTH].sort());
    send(c, removeRelationshipCommand(panel));
    expect(activeContent(project(c)).design.edges.map((e) => e.id)).toEqual(['cd', 'ce']);
    expect(c.undo()).toBe(true);
    expect(activeContent(project(c)).design.edges.map((e) => e.id)).toEqual(['cd', 'ce', 'edge-1']);
  });

  it('Open is a plain edge without a preference: the whole shared wall opens', async () => {
    const c = await opened();
    addAt(c, FACE_NORTH, 'open');
    expect(activeContent(project(c)).facePreferences).toEqual({});
    const o = openingsOf(c, 'edge-1');
    expect(o.buildingFaces).toEqual([FACE_SOUTH, FACE_NORTH].sort());
    expect(o.planOpenings.map((p) => p.kind)).toEqual(['open', 'open']);
    expect(panelOf(c, FACE_SOUTH)).toMatchObject({ kind: 'existing', relationshipKind: 'open', opening: 'here', moveDoorHere: null });
  });

  it('moving a room so the chosen wall is no longer shared keeps the edge, unresolved, and never relocates the door', async () => {
    const c = await opened();
    addAt(c, FACE_NORTH, 'access');
    // b slides one cell south: it still shares a's south wall face, but no longer the chosen (north) one.
    const r = c.command({ type: 'set-node-geometry', nodeId: 'b', grid: [1, 0, 0] });
    expect(r.ok).toBe(true);
    const after = activeContent(project(c));
    expect(after.design.edges.map((e) => e.id)).toContain('edge-1');
    const o = openingsOf(c, 'edge-1');
    expect(o.resolution).toMatchObject({ status: 'unresolved', reason: 'preferred-face-unavailable' });
    expect(o.buildingFaces).toEqual([]);
    expect(o.planOpenings).toEqual([]);
    // The wall that is still shared reports the kept edge as unresolved and offers to put the door there.
    const panel = panelOf(c, FACE_SOUTH);
    expect(panel).toMatchObject({ kind: 'existing', edgeId: 'edge-1', status: 'unresolved', opening: 'none', reasonText: expect.stringMatching(/no longer shared/) });
    // Undo restores the door on the chosen face.
    expect(c.undo()).toBe(true);
    expect(openingsOf(c, 'edge-1').planOpenings).toEqual([{ faceId: FACE_NORTH, kind: 'door' }]);
  });

  it('Remove invalid connections: only the checked unresolved edges, in ONE undo step', async () => {
    const c = await opened();
    const port = portOf(c);
    const rows = invalidConnectionRows(modelFromV2(port.doc, port.spatial));
    expect(rows.map((r) => [r.edgeId, r.label, r.kindLabel, r.reason])).toEqual([
      ['cd', '03 ↔ 04', 'Access', 'different-level'],
      ['ce', '03 ↔ 05', 'Open', 'different-level'],
    ]);
    const command = removeInvalidCommand(rows, new Set(['ce']));
    expect(command).toEqual({ type: 'remove-edges', edgeIds: ['cd'] });
    const before = activeContent(project(c));
    expect(c.command(command!).ok).toBe(true);
    expect(activeContent(project(c)).design.edges.map((e) => e.id)).toEqual(['ce']);
    expect(c.undo()).toBe(true);
    expect(activeContent(project(c))).toEqual(before);
    expect(c.undo()).toBe(false);
    // A refused list (a direct edge) changes nothing.
    addAt(c, FACE_SOUTH, 'access');
    const refused = c.command({ type: 'remove-edges', edgeIds: ['cd', 'edge-1'] });
    expect(refused.ok).toBe(false);
    expect(activeContent(project(c)).design.edges.map((e) => e.id)).toEqual(['cd', 'ce', 'edge-1']);
  });
});
