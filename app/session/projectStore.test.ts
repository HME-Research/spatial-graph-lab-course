import { describe, expect, it } from 'vitest';
import { serializeDesignV2 } from '@app/document/v2';
import { fileOf, fixtureIds, twoRooms } from './projectStore.fixtures';
import { makeAttributeRecord, serializeAttributeRecord } from '@app/extensions/projectAttributes';
import { projectFromLegacyDesign, readProjectFile, serializeProjectFile } from '@app/project';
import exampleV1 from '../document/examples/two-storey-example.json';
import { canRedo, canUndo, undoLabel } from './history';
import { currentDocument } from './documentSession';
import {
  activeContent,
  activeDesign,
  activeSession,
  applyActiveCommand,
  commitActiveDesign,
  contentSignature,
  createScenario,
  deleteScenario,
  duplicateScenario,
  isExported,
  markProjectExported,
  moveScenario,
  openProject,
  projectFileOf,
  readProjectOrDesign,
  redoActive,
  renameProject,
  renameScenario,
  saveProjectAs,
  scenarioById,
  separateIdentity,
  setAttributeRecord,
  setScenarioCameras,
  switchScenario,
  undoActive,
  uniqueScenarioName,
  type OpenProject,
  type Outcome,
} from './projectStore';

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

const ids = fixtureIds;

const ok = <T>(o: Outcome<T>): T => {
  if (!o.ok) throw new Error(o.message);
  return o.value;
};

const origin = { kind: 'created', label: 'test' } as const;
const open = (file = fileOf()) => openProject(file, origin);

const move = (p: OpenProject, nodeId: string, grid: [number, number, number]) => {
  const r = applyActiveCommand(p, { type: 'set-node-geometry', nodeId, grid });
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join('; '));
  return r.project;
};
const gridOf = (p: OpenProject, nodeId: string) => activeDesign(p).nodes.find((n) => n.id === nodeId)!.grid;

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────

describe('open project', () => {
  it('opens a file with one scenario, a fresh history and no changes', () => {
    const p = open();
    expect(p.scenarios).toHaveLength(1);
    expect(p.changes).toBe(0);
    expect(canUndo(activeSession(p).history)).toBe(false);
    expect(activeDesign(p).nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('round-trips through the project file without loss', () => {
    const original = fileOf();
    const file = projectFileOf(open(original));
    if (!file.ok) throw new Error('invalid');
    expect(serializeProjectFile(file.value)).toBe(serializeProjectFile(original));
  });
});

describe('per-scenario undo isolation', () => {
  it('edits, undoes and redoes only the active scenario', () => {
    let p = open();
    const first = p.activeScenarioId;
    p = move(p, 'c', [6, 7, 0]);
    p = ok(createScenario(p, { id: 'sc-2', from: 'current' }));
    expect(p.activeScenarioId).toBe('sc-2');
    // The copy starts with the CURRENT content and an EMPTY history.
    expect(gridOf(p, 'c')).toEqual([6, 7, 0]);
    expect(canUndo(activeSession(p).history)).toBe(false);
    p = move(p, 'b', [2, 1, 0]);
    expect(undoLabel(activeSession(p).history)).toMatch(/Move room/);

    // Switching does not touch either history.
    p = ok(switchScenario(p, first));
    expect(gridOf(p, 'b')).toEqual([2, 0, 0]);
    expect(gridOf(p, 'c')).toEqual([6, 7, 0]);
    p = undoActive(p);
    expect(gridOf(p, 'c')).toEqual([6, 6, 0]);
    expect(canUndo(activeSession(p).history)).toBe(false);
    // Undo in scenario 1 never reaches scenario 2's step.
    expect(undoActive(p)).toBe(p);

    p = ok(switchScenario(p, 'sc-2'));
    expect(gridOf(p, 'b')).toEqual([2, 1, 0]);
    expect(canUndo(activeSession(p).history)).toBe(true);
    p = undoActive(p);
    expect(gridOf(p, 'b')).toEqual([2, 0, 0]);
    p = redoActive(p);
    expect(gridOf(p, 'b')).toEqual([2, 1, 0]);
    expect(canRedo(activeSession(p).history)).toBe(false);
  });

  it('gives the newly active session a revision above every revision shown before', () => {
    let p = open();
    p = move(p, 'c', [6, 7, 0]);
    const shown = activeSession(p).revision;
    p = ok(createScenario(p, { id: 'sc-2', from: 'current' }));
    expect(activeSession(p).revision).toBeGreaterThan(shown);
    const second = activeSession(p).revision;
    p = ok(switchScenario(p, scenarioById(p, 'sc-2') ? p.scenarios[0]!.id : ''));
    expect(activeSession(p).revision).toBeGreaterThan(second);
  });

  it('runs scenario commands (face preferences) and remove-edges as single steps', () => {
    let p = open();
    const pref = { nodeId: 'a', offset: [1, 0, 0] as [number, number, number], direction: '+x' as const };
    const r = applyActiveCommand(p, { type: 'set-face-preference', edgeId: 'ab', preference: pref });
    if (!r.ok) throw new Error(r.issues.map((i) => i.message).join());
    p = r.project;
    expect(activeContent(p).facePreferences['ab']).toEqual(pref);
    expect(undoLabel(activeSession(p).history)).toMatch(/Choose the wall/);
    const removed = applyActiveCommand(p, { type: 'remove-edges', edgeIds: ['ac'] });
    if (!removed.ok) throw new Error(removed.issues.map((i) => i.message).join());
    p = removed.project;
    expect(activeDesign(p).edges.map((e) => e.id)).toEqual(['ab']);
    p = undoActive(p);
    expect(activeDesign(p).edges.map((e) => e.id)).toEqual(['ab', 'ac']);
  });

  it('refuses invalid commands without a history step or a change', () => {
    const p = open();
    const r = applyActiveCommand(p, { type: 'remove-node', nodeId: 'nope' });
    expect(r.ok).toBe(false);
    expect(p.changes).toBe(0);
  });

  it('commits an algorithm result as one step and prunes preferences of removed edges', () => {
    let p = open();
    const pref = { nodeId: 'a', offset: [1, 0, 0] as [number, number, number], direction: '+x' as const };
    const r = applyActiveCommand(p, { type: 'set-face-preference', edgeId: 'ab', preference: pref });
    if (!r.ok) throw new Error('pref');
    p = r.project;
    const d = activeDesign(p);
    p = commitActiveDesign(p, { ...d, edges: d.edges.filter((e) => e.id !== 'ab') }, 'Apply “x”');
    expect(activeContent(p).facePreferences).toEqual({});
    expect(undoLabel(activeSession(p).history)).toBe('Apply “x”');
  });
});

describe('scenario management', () => {
  it('creates blank scenarios that keep the Building settings but no rooms', () => {
    let p = open();
    p = ok(createScenario(p, { id: 'blank', from: 'blank', name: 'Empty' }));
    expect(activeDesign(p).nodes).toEqual([]);
    expect(activeDesign(p).settings).toEqual(scenarioById(p, p.scenarios[0]!.id)!.session.history.present.design.settings);
    expect(scenarioById(p, 'blank')!.name).toBe('Empty');
  });

  it('creates a scenario from a given design (e.g. a toolkit design), and refuses a missing one', () => {
    let p = open();
    expect(createScenario(p, { id: 'x', from: 'design' }).ok).toBe(false);
    const d = twoRooms();
    p = ok(createScenario(p, { id: 'from-design', from: 'design', design: d, name: 'Starter', source: 'toolkits/x/designs/s.json' }));
    expect(activeDesign(p)).toBe(d);
    expect(activeSession(p).source).toBe('toolkits/x/designs/s.json');
    expect(activeContent(p).facePreferences).toEqual({});
  });

  it('duplicates current content and settings, not history, with a unique name', () => {
    let p = open();
    const first = p.activeScenarioId;
    p = move(p, 'c', [6, 8, 0]);
    p = setScenarioCameras(p, first, [
      { id: 'cam', name: 'Front', viewMode: 'architecture', pose: { projection: 'perspective', position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], fov: 50 } },
    ]);
    p = ok(duplicateScenario(p, first, 'dup'));
    p = ok(duplicateScenario(p, first, 'dup2'));
    expect(p.scenarios.map((s) => s.name)).toEqual(['Scenario 1', 'Scenario 1 copy (2)', 'Scenario 1 copy']);
    expect(scenarioById(p, 'dup')!.cameras).toHaveLength(1);
    // Deep copies with NEW ids: no camera object or id is shared with the source scenario.
    const original = scenarioById(p, first)!.cameras[0]!;
    const copied = scenarioById(p, 'dup')!.cameras[0]!;
    expect(copied.id).toBe('dup-camera-1');
    expect(copied.id).not.toBe(original.id);
    expect(scenarioById(p, 'dup2')!.cameras[0]!.id).toBe('dup2-camera-1');
    expect(copied.pose).not.toBe(original.pose);
    expect(copied.pose).toEqual(original.pose);
    expect(copied.name).toBe('Front');
    const fromCurrent = ok(createScenario(ok(switchScenario(p, first)), { id: 'cur', from: 'current' }));
    expect(scenarioById(fromCurrent, 'cur')!.cameras[0]!.id).toBe('cur-camera-1');
    expect(projectFileOf(fromCurrent).ok).toBe(true);
    expect(currentDocument(scenarioById(p, 'dup')!.session).design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 8, 0]);
    expect(canUndo(scenarioById(p, 'dup')!.session.history)).toBe(false);
  });

  it('renames with trimming, refuses empty and duplicate names', () => {
    let p = ok(createScenario(open(), { id: 's2', from: 'current', name: 'Option B' }));
    expect(renameScenario(p, 's2', '   ').ok).toBe(false);
    expect(renameScenario(p, 's2', 'scenario 1').ok).toBe(false);
    expect(renameScenario(p, 's2', 'x'.repeat(81)).ok).toBe(false);
    p = ok(renameScenario(p, 's2', '  Option   C '));
    expect(scenarioById(p, 's2')!.name).toBe('Option C');
    const same = ok(renameScenario(p, 's2', 'Option C'));
    expect(same).toBe(p);
  });

  it('never deletes the last scenario; deleting the active one activates a neighbour', () => {
    let p = open();
    expect(deleteScenario(p, p.activeScenarioId).ok).toBe(false);
    p = ok(createScenario(p, { id: 's2', from: 'current' }));
    p = ok(createScenario(p, { id: 's3', from: 'blank' }));
    p = ok(switchScenario(p, 's2'));
    p = ok(deleteScenario(p, 's2'));
    expect(p.scenarios.map((s) => s.id)).not.toContain('s2');
    expect(p.activeScenarioId).toBe('s3');
    expect(deleteScenario(p, 'unknown').ok).toBe(false);
  });

  it('reorders scenarios', () => {
    let p = ok(createScenario(open(), { id: 's2', from: 'current' }));
    const [a, b] = p.scenarios.map((s) => s.id);
    p = moveScenario(p, 's2', -1);
    expect(p.scenarios.map((s) => s.id)).toEqual([b, a]);
    expect(moveScenario(p, 's2', -1)).toBe(p);
  });

  it('counts every saved change (and nothing for no-ops)', () => {
    let p = open();
    expect(ok(switchScenario(p, p.activeScenarioId))).toBe(p);
    p = ok(renameProject(p, 'Renamed'));
    expect(p.changes).toBe(1);
    expect(ok(renameProject(p, 'Renamed'))).toBe(p);
    expect(renameProject(p, '').ok).toBe(false);
  });

  it('makes unique names', () => {
    const p = open();
    expect(uniqueScenarioName(p, 'Scenario 1')).toBe('Scenario 1 (2)');
    expect(uniqueScenarioName(p, 'Other')).toBe('Other');
  });
});

describe('export bookkeeping', () => {
  it('is independent of local saving: exported until the content changes', () => {
    let p = openProject(fileOf(), { kind: 'opened-file', label: 'x.json' }, { exported: true });
    expect(isExported(p)).toBe(true);
    p = move(p, 'c', [6, 7, 0]);
    expect(isExported(p)).toBe(false);
    p = markProjectExported(p);
    expect(isExported(p)).toBe(true);
    // Saving only moves updatedAt: still exported.
    const saved: OpenProject = { ...p, meta: { ...p.meta, updatedAt: '2030-01-01T00:00:00.000Z' } };
    expect(contentSignature(saved)).toBe(contentSignature(p));
  });
});

describe('all-scenario JSON round trip', () => {
  it('exports every scenario, the attribute record and the settings, and reads them back identically', () => {
    let p = open();
    p = move(p, 'c', [6, 7, 0]);
    p = ok(createScenario(p, { id: 'sc-b', from: 'current', name: 'Option B' }));
    p = move(p, 'b', [2, 1, 0]);
    const pref = { nodeId: 'a', offset: [1, 0, 0] as [number, number, number], direction: '+x' as const };
    p = ok(switchScenario(p, p.scenarios[0]!.id));
    const r = applyActiveCommand(p, { type: 'set-face-preference', edgeId: 'ab', preference: pref });
    if (!r.ok) throw new Error('pref');
    p = r.project;
    const record = JSON.parse(serializeAttributeRecord(makeAttributeRecord('example-gallery', { nodes: [], edges: [], nodeTypeDefaults: {} }, 'x')));
    p = setAttributeRecord(p, record);

    const file = projectFileOf(p, '2026-11-16T11:00:00.000Z');
    if (!file.ok) throw new Error('invalid');
    const text = serializeProjectFile(file.value);
    const read = readProjectOrDesign(text);
    if (!read.ok) throw new Error(JSON.stringify(read.issues));
    expect(read.kind).toBe('project');
    expect(serializeProjectFile(read.file)).toBe(text);
    const reopened = openProject(read.file, { kind: 'opened-file', label: 'x' });
    expect(reopened.scenarios.map((s) => s.name)).toEqual(['Scenario 1', 'Option B']);
    expect(currentDocument(reopened.scenarios[0]!.session).facePreferences['ab']).toEqual(pref);
    expect(currentDocument(reopened.scenarios[1]!.session).design.nodes.find((n) => n.id === 'b')!.grid).toEqual([2, 1, 0]);
    expect(reopened.meta.attributes).toEqual(record);
  });
});

describe('reading files', () => {
  it('imports a legacy v1 design as a new project with one scenario', () => {
    const r = readProjectOrDesign(JSON.stringify(exampleV1), { ...ids(), toolkit: { id: 'example-gallery' } });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.kind).toBe('design');
    expect(r.file.scenarios).toHaveLength(1);
    expect(r.file.toolkit).toEqual({ id: 'example-gallery' });
    expect(r.file.scenarios[0]!.design.schemaVersion).toBe(2);
  });

  it('imports a v2 design file', () => {
    const r = readProjectOrDesign(serializeDesignV2(twoRooms()), ids());
    expect(r.ok && r.file.scenarios[0]!.design.nodes.length).toBe(3);
  });

  it('rejects invalid JSON, unknown files, newer project versions and invalid designs', () => {
    const bad = (text: string) => {
      const r = readProjectOrDesign(text);
      if (r.ok) throw new Error('accepted');
      return r.issues.map((i) => i.code);
    };
    expect(bad('{ nope')).toEqual(['invalid-json']);
    expect(bad('[]')).toEqual(['wrong-format']);
    expect(bad('{"hello":1}')).toEqual(['wrong-format']);
    const newer = JSON.parse(serializeProjectFile(fileOf()));
    newer.version = 3;
    expect(bad(JSON.stringify(newer))).toEqual(['unsupported-version']);
    expect(bad(JSON.stringify({ format: 'something-else' }))).toEqual(['wrong-format']);
    expect(bad(JSON.stringify({ schemaVersion: 3, metadata: { name: 'x' }, nodes: [], edges: [] }))).toEqual(['invalid-design']);
    const brokenScenario = JSON.parse(serializeProjectFile(fileOf()));
    brokenScenario.scenarios[0].design.nodes[0].grid = 'x';
    expect(bad(JSON.stringify(brokenScenario))).toContain('invalid-design');
  });

  it('accepts a project file whose scenario is still a v1 design (schema compatibility)', () => {
    const file = JSON.parse(serializeProjectFile(fileOf()));
    file.scenarios[0].design = exampleV1;
    const r = readProjectOrDesign(JSON.stringify(file));
    expect(r.ok && r.file.scenarios[0]!.design.schemaVersion).toBe(2);
  });
});

describe('Save As and identity', () => {
  it('Save As is an independent copy with new ids; editing one never changes the other', () => {
    let p = open();
    p = ok(createScenario(p, { id: 'sc-b', from: 'current', name: 'Option B' }));
    p = move(p, 'b', [2, 1, 0]);
    const copy = ok(saveProjectAs(p, 'Copy', ids()));
    expect(copy.meta.projectId).not.toBe(p.meta.projectId);
    expect(copy.meta.name).toBe('Copy');
    expect(copy.scenarios.map((s) => s.name)).toEqual(['Scenario 1', 'Option B']);
    expect(copy.scenarios.some((s) => p.scenarios.some((o) => o.id === s.id))).toBe(false);
    expect(copy.scenarios.findIndex((s) => s.id === copy.activeScenarioId)).toBe(1);
    expect(gridOf(copy, 'b')).toEqual([2, 1, 0]);
    // Histories are not copied.
    expect(canUndo(activeSession(copy).history)).toBe(false);
    const edited = move(copy, 'b', [2, 2, 0]);
    expect(gridOf(edited, 'b')).toEqual([2, 2, 0]);
    expect(gridOf(p, 'b')).toEqual([2, 1, 0]);
    expect(saveProjectAs(p, '  ').ok).toBe(false);
  });

  it('re-identifies an opened file only when its id is taken', () => {
    const file = fileOf();
    const same = separateIdentity(file, false);
    expect(same.ok && same.value).toBe(file);
    const other = separateIdentity(file, true, ids());
    expect(other.ok && other.value.projectId).not.toBe(file.projectId);
    expect(other.ok && other.value.name).toBe(file.name);
  });

  it('a legacy import is validated as a whole project', () => {
    const r = projectFromLegacyDesign({ schemaVersion: 2, metadata: { name: 'x' }, nodes: [{ id: 'a', grid: [0, 0, 0], typeId: 't' }, { id: 'a', grid: [1, 0, 0], typeId: 't' }], edges: [] });
    expect(r.ok).toBe(false);
    expect(readProjectFile('{').ok).toBe(false);
  });
});
