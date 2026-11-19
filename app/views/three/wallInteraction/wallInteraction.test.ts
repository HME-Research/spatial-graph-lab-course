import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildPlan, planSourceV2, resolveBuildingFaces } from '@app/building';
import { readDesign, type DesignDocumentV2 } from '@app/document';
import { applyScenarioCommand, resolveWithPreferences, type DesignPort } from '@app/spatial';
import {
  addRelationshipCommand,
  eligibleWallFaces,
  faceIndex,
  selectionAfterRemove,
  wallActionOf,
  wallClickSelection,
  wallPanelModel,
} from './wallPanelModel';
import { WallActionPanel } from './WallActionPanel';
import { PlanWallView } from './PlanWallView';
import exampleJson from '../../../document/test-designs/two-storey.json';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';

/*
 * Pure wall-panel model tests (wave 2, D). The one-undo-step and same-graph tests through the
 * project controller live in app/session/wallInteraction.test.ts (views may not import the shell).
 */

function design(raw: unknown): DesignDocumentV2 {
  const r = readDesign(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value.doc;
}

// ── Fixture: 1 and 2 share a two-face wall (no relationship); 3↔4 and 3↔5 cannot be built ─────────

const doc = () =>
  design({
    schemaVersion: 2,
    metadata: { name: 'Walls' },
    nodes: [
      { id: 1, position: [0, 1, 0], size: [1, 2, 1], function: 'gallery' },
      { id: 2, position: [1, 1, 0], size: [1, 2, 1], function: 'studio' },
      { id: 3, position: [5, 5, 0], function: 'studio' },
      { id: 4, position: [8, 8, 1], function: 'studio' },
      { id: 5, position: [9, 2, 1], function: 'store' },
    ],
    edges: [
      { id: 1, source: 3, target: 4, relationship: 'access' },
      { id: 2, source: 3, target: 5, relationship: 'open' },
    ],
    diagram: { positions: { 1: [0, 0], 2: [100, 0], 3: [200, 0], 4: [300, 0], 5: [400, 0] } },
  });

/** The two unit faces of the 1|2 wall (1 owns them: the lower id). */
const FACE_SOUTH = '1:0.0.0:+x';
const FACE_NORTH = '1:0.1.0:+x';

// ── Pure UI model ─────────────────────────────────────────────────────────────────────────────

describe('wall panel model (wallAction-driven)', () => {
  const d = doc();
  const spatial = resolveWithPreferences(d, {});
  const faces = resolveBuildingFaces(d, spatial);
  const index = faceIndex(faces);

  it('offers exactly the shared walls between two distinct rooms', () => {
    expect([...eligibleWallFaces(faces, d, spatial)].sort()).toEqual([FACE_SOUTH, FACE_NORTH].sort());
    // The Plan offers the same faces as wall targets.
    const plan = buildPlan(planSourceV2(d, spatial), 0);
    expect(plan.wallTargets.map((t) => t.faceId).sort()).toEqual([FACE_SOUTH, FACE_NORTH].sort());
  });

  it('explains exterior, slab and unknown faces instead of offering an action', () => {
    expect(wallPanelModel('1:0.0.0:-x', index, d, spatial)).toMatchObject({ kind: 'unavailable', message: expect.stringMatching(/exterior/) });
    expect(wallPanelModel('1:0.0.0:-z', index, d, spatial)).toMatchObject({ kind: 'unavailable', message: expect.stringMatching(/floor or ceiling/) });
    expect(wallPanelModel('1:0.0.0:+y', index, d, spatial)).toMatchObject({ kind: 'unavailable', message: expect.stringMatching(/inside one room/) });
    expect(wallPanelModel('nope:+x', index, d, spatial)).toMatchObject({ kind: 'unavailable' });
  });

  it('an unrelated shared wall offers Add with readable room names and the clicked face as preference', () => {
    const panel = wallPanelModel(FACE_NORTH, index, d, spatial);
    expect(panel).toMatchObject({
      kind: 'add',
      rooms: [
        { id: 1, label: '1', function: 'gallery' },
        { id: 2, label: '2', function: 'studio' },
      ],
      source: 1,
      target: 2,
      preference: { nodeId: 1, offset: [0, 1, 0], direction: '+x' },
    });
  });

  it('Access = ONE add-edge-at-face (edge + preference); Open = a plain add-edge (preferences are access-only)', () => {
    const panel = wallPanelModel(FACE_NORTH, index, d, spatial);
    if (panel.kind !== 'add') throw new Error('add expected');
    // The new relationship takes the design's next edge id (3: edges 1 and 2 exist).
    expect(d.nextEdgeId).toBe(3);
    expect(addRelationshipCommand(panel, 'access', d)).toEqual({
      edgeId: 3,
      command: {
        port: 'scenario',
        command: {
          type: 'add-edge-at-face',
          edge: { source: 1, target: 2, relationship: 'access' },
          preference: { nodeId: 1, offset: [0, 1, 0], direction: '+x' },
        },
      },
    });
    expect(addRelationshipCommand(panel, 'open', d)).toEqual({
      edgeId: 3,
      command: { port: 'design', command: { type: 'add-edge', edge: { source: 1, target: 2, relationship: 'open' } } },
    });
  });

  it('renders Add relationship for a free wall and change / remove (never Add) for a related one', () => {
    const port: DesignPort = {
      doc: d,
      spatial,
      onCommand: () => ({ ok: true }),
      onScenarioCommand: () => ({ ok: true }),
      proposeEdit: () => ({ status: 'rejected', issues: [], collidingRooms: [] }),
    };
    const html = renderToStaticMarkup(createElement(WallActionPanel, { design: port, faceId: FACE_NORTH, faces: index, onSelect: () => {}, onClose: () => {} }));
    expect(html).toContain('Wall between 1 and 2');
    expect(html).toContain('Add relationship');
    expect(html).toContain('data-wall-state="add"');
    expect(html).not.toContain('Remove relationship');
  });
});

describe('wall panel for a related wall', () => {
  it('shows the relationship, where its door is, change / remove (never Add), and moves the door here in one command', () => {
    const d = doc();
    const added = applyScenarioCommand(
      { design: d, facePreferences: {} },
      { type: 'add-edge-at-face', edge: { source: 1, target: 2, relationship: 'access' }, preference: { nodeId: 1, offset: [0, 0, 0], direction: '+x' } },
    );
    if (!added.ok) throw new Error('add-edge-at-face refused');
    const { design: d2, facePreferences } = added.value;
    const spatial = resolveWithPreferences(d2, facePreferences);
    const index = faceIndex(resolveBuildingFaces(d2, spatial));
    expect(wallPanelModel(FACE_SOUTH, index, d2, spatial)).toMatchObject({ kind: 'existing', opening: 'here', moveDoorHere: null, statusLabel: 'Direct' });
    expect(wallPanelModel(FACE_NORTH, index, d2, spatial)).toMatchObject({
      kind: 'existing',
      opening: 'elsewhere',
      moveDoorHere: { nodeId: 1, offset: [0, 1, 0], direction: '+x' },
    });
    const port: DesignPort = {
      doc: d2,
      spatial,
      onCommand: () => ({ ok: true }),
      onScenarioCommand: () => ({ ok: true }),
      proposeEdit: () => ({ status: 'rejected', issues: [], collidingRooms: [] }),
    };
    const html = renderToStaticMarkup(createElement(WallActionPanel, { design: port, faceId: FACE_NORTH, faces: index, onSelect: () => {}, onClose: () => {} }));
    expect(html).toContain('data-wall-state="existing"');
    expect(html).toContain('data-wall-opening="elsewhere"');
    expect(html).toContain('Put the door on this wall');
    expect(html).toContain('Change to Open');
    expect(html).toContain('Remove relationship');
    expect(html).not.toContain('Add relationship');
    // Without the scenario port the door cannot be placed on a chosen wall: the button is disabled.
    const { onScenarioCommand: _omit, ...plain } = port;
    const noScenario = renderToStaticMarkup(createElement(WallActionPanel, { design: plain, faceId: FACE_NORTH, faces: index, onSelect: () => {}, onClose: () => {} }));
    expect(noScenario).toMatch(/disabled=""[^>]*>Put the door on this wall/);
  });
});

describe('what a wall click selects (integration I2)', () => {
  it('an unrelated shared wall selects its owner room (as before the wall panel), not nothing', () => {
    const d = doc();
    const spatial = resolveWithPreferences(d, {});
    const index = faceIndex(resolveBuildingFaces(d, spatial));
    for (const face of [FACE_SOUTH, FACE_NORTH]) {
      const action = wallActionOf(face, index, d, spatial);
      expect(action.kind).toBe('add');
      expect(wallClickSelection(face, index, action)).toEqual(selectNode(1));
    }
    // A non-eligible face selects nothing (the views do not even open the panel for it).
    expect(wallClickSelection('1:0.0.0:-x', index, wallActionOf('1:0.0.0:-x', index, d, spatial))).toEqual(NO_SELECTION);
  });

  it('a wall of two related rooms selects the relationship, on the door wall and on the other shared wall', () => {
    const added = applyScenarioCommand(
      { design: doc(), facePreferences: {} },
      { type: 'add-edge-at-face', edge: { source: 1, target: 2, relationship: 'access' }, preference: { nodeId: 1, offset: [0, 0, 0], direction: '+x' } },
    );
    if (!added.ok) throw new Error('add-edge-at-face refused');
    const { design: d2, facePreferences } = added.value;
    const spatial = resolveWithPreferences(d2, facePreferences);
    const index = faceIndex(resolveBuildingFaces(d2, spatial));
    expect(index.get(FACE_SOUTH)?.edgeId).toBe(3);
    expect(wallClickSelection(FACE_SOUTH, index, wallActionOf(FACE_SOUTH, index, d2, spatial))).toEqual(selectEdge(3));
    expect(wallClickSelection(FACE_NORTH, index, wallActionOf(FACE_NORTH, index, d2, spatial))).toEqual(selectEdge(3));
    // After "Remove relationship" the removed edge is not left selected: the owner room is, as a fresh click would.
    const panel = wallPanelModel(FACE_SOUTH, index, d2, spatial);
    if (panel.kind !== 'existing') throw new Error('expected an existing relationship');
    expect(selectionAfterRemove(panel)).toEqual(selectNode(1));
  });
});

describe('Plan with the wall interaction (the registry Plan view)', () => {
  const example = design(exampleJson);
  const port: DesignPort = {
    doc: example,
    spatial: resolveWithPreferences(example, {}),
    onCommand: () => ({ ok: true }),
    proposeEdit: () => ({ status: 'rejected', issues: [], collidingRooms: [] }),
  };
  const baseProps = { selection: NO_SELECTION, onSelect: () => {}, design: port };
  it('offers the wall targets (reading gallery 3 | store 4 has no relationship)', () => {
    const html = renderToStaticMarkup(createElement(PlanWallView, baseProps));
    expect(html).toContain('data-view-surface="plan"');
    expect(html).toMatch(/class="sgl-plan-wall-target" data-face-id="3:\+x"/);
    // No wall panel until a wall is clicked.
    expect(html).not.toContain('sgl-wall-panel');
  });
});
