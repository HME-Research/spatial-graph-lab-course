import { functionStyleSettings } from '@app/document/v2';
import { functionLooks } from '@app/document/v2';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createFacadeAsset,
  facadeMeshData,
  FACADE_LIMITS,
  finishOf,
  materialsFor,
  withFinish,
  normaliseFacadeSource,
  type FacadeAssetV1,
  type SourceMesh,
} from '@app/assets';
import { importFacade3dm } from '@app/assets/importFacade';
import { loadRhino3dm } from '@app/assets/rhino/loader';
import {
  createMemoryProjectStore,
  facadeAssetsOf,
  readProjectFile,
  saveAsNewProject,
  serializeProjectFile,
  type ProjectFileV2,
} from '@app/project';
import { activeDesign, addFacadeAsset, facadeUses, undoActive, openProject, projectFileOf, readProjectOrDesign, removeFacadeAsset, renameFacadeAsset, setFacadeAssetMaterials, type OpenProject } from './projectStore';
import { fileOf, fixtureIds } from './projectStore.fixtures';
import { createProjectController, type Scheduler } from './projectStoreController';

/**
 * Imported façades survive local autosave and complete portable export / import (owner decision
 * D4): the normalised mesh is embedded in the project file, which is both the stored record and
 * the exported file. Binary geometry is never silently dropped: a damaged asset rejects the file.
 */

function box(x0: number, x1: number, depth: number): SourceMesh {
  const v = [x0, 0, 0, x1, 0, 0, x1, depth, 0, x0, depth, 0, x0, 0, 3, x1, 0, 3, x1, depth, 3, x0, depth, 3];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  return { positions: v, indices: quads.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]) };
}

/** A small, distinct asset per `variant` (different geometry → different content id). */
function asset(variant = 0, name?: string): FacadeAssetV1 {
  const n = normaliseFacadeSource({ unit: 'm', meshes: [box(0, 3, 0.2), box(1, 1.1 + variant * 0.001, 0.5)] });
  if (!n.ok) throw new Error(JSON.stringify(n.diagnostics));
  const made = createFacadeAsset(n.component, { fileName: `Module ${variant}.3dm`, fileBytes: 100, fileSha256: 'b'.repeat(64), unit: 'm', unitAssumed: false, reader: 'rhino3dm@8.17.0', ...(name && { name }) });
  if (!made.ok) throw new Error(JSON.stringify(made.issues));
  return made.value;
}

const opened = (file: ProjectFileV2 = fileOf()): OpenProject => openProject(file, { kind: 'created', label: 'test' });
const ok = <T>(r: { ok: true; value: T } | { ok: false; message: string }): T => {
  if (!r.ok) throw new Error(r.message);
  return r.value;
};

function withAssets(file: ProjectFileV2, items: readonly FacadeAssetV1[], designSettings?: object): ProjectFileV2 {
  const scenarios = designSettings
    ? file.scenarios.map((s) => ({ ...s, design: { ...s.design, settings: { ...s.design.settings, ...designSettings } } }))
    : file.scenarios;
  return { ...file, scenarios, assets: { policy: 'embedded-mesh-v1', items } };
}

describe('project file: embedded façade assets', () => {
  it('a project without imported façades is written exactly as before ({"policy": "none"})', () => {
    const file = fileOf();
    const text = serializeProjectFile(file);
    expect(text).toContain('"assets": {\n    "policy": "none"\n  }\n}');
    const again = readProjectFile(text);
    expect(again.ok && serializeProjectFile(again.value)).toBe(text);
    // An explicit empty list collapses to "none" (no empty embedded list is ever written).
    expect(serializeProjectFile({ ...file, assets: { policy: 'embedded-mesh-v1', items: [] } })).toBe(text);
  });

  it('assets and the scenario settings that use them round-trip through the canonical text', () => {
    const a = asset(1);
    const file = withAssets(fileOf(), [a], functionStyleSettings({ gallery: { facade: { assetId: a.id, placement: 'stretch' } } }));
    const text = serializeProjectFile(file);
    const read = readProjectFile(text);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(facadeAssetsOf(read.value.assets)).toEqual([a]);
    expect(functionLooks(read.value.scenarios[0]!.design.settings).gallery?.facade).toEqual({ assetId: a.id, placement: 'stretch' });
    expect(serializeProjectFile(read.value)).toBe(text);
  });

  it('a damaged, duplicated or malformed asset rejects the WHOLE file (nothing is silently dropped)', () => {
    const a = asset(2);
    // Change one base64 character in the index part (the start is mostly zero floats, "AAAA…").
    const k = a.mesh.data.length - 12;
    const swapped = a.mesh.data[k] === 'B' ? 'C' : 'B';
    const damaged = { ...a, mesh: { ...a.mesh, data: `${a.mesh.data.slice(0, k)}${swapped}${a.mesh.data.slice(k + 1)}` } };
    expect(damaged.mesh.data).not.toBe(a.mesh.data);
    for (const [items, pattern] of [
      [[damaged], /SHA-256/],
      [[a, a], /listed more than once/],
      [[{ ...a, kind: 'glb' }], /imported façade/],
    ] as const) {
      const read = readProjectFile(serializeUnchecked(withAssets(fileOf(), items as unknown as FacadeAssetV1[])));
      expect(read.ok).toBe(false);
      if (!read.ok) {
        expect(read.issues.every((i) => i.code === 'invalid-asset')).toBe(true);
        expect(read.issues.map((i) => i.message).join(' ')).toMatch(pattern);
        expect(read.issues[0]!.path.slice(0, 2)).toEqual(['assets', 'items']);
      }
    }
    const bogusPolicy = JSON.parse(serializeProjectFile(fileOf())) as Record<string, unknown>;
    bogusPolicy.assets = { policy: 'linked', items: [] };
    expect(readProjectFile(bogusPolicy).ok).toBe(false);
    bogusPolicy.assets = { policy: 'embedded-mesh-v1', items: [] };
    expect(readProjectFile(bogusPolicy).ok).toBe(false);
  });

  it('a project may hold at most 32 imported façades', () => {
    const many = Array.from({ length: FACADE_LIMITS.maxAssets + 1 }, (_, i) => asset(i));
    expect(new Set(many.map((m) => m.id)).size).toBe(many.length);
    const read = readProjectFile(serializeUnchecked(withAssets(fileOf(), many)));
    expect(read.ok).toBe(false);
    let p = opened();
    for (const m of many.slice(0, -1)) p = ok(addFacadeAsset(p, m));
    const refused = addFacadeAsset(p, many[many.length - 1]!);
    expect(refused.ok === false && refused.message).toMatch(/at most 32/);
  });

  it('Save As copies the imported façades into the new project', () => {
    const a = asset(3);
    const copy = saveAsNewProject(withAssets(fileOf(), [a]), fixtureIds());
    expect(copy.ok && facadeAssetsOf(copy.value.assets)).toEqual([a]);
  });
});

describe('project store: the façade library', () => {
  it('add is idempotent by content id; rename keeps id and geometry; changes are counted for autosave', () => {
    const a = asset(4);
    const p0 = opened();
    const p1 = ok(addFacadeAsset(p0, a));
    expect(p1.changes).toBe(p0.changes + 1);
    expect(ok(addFacadeAsset(p1, { ...a, name: 'Same content' }))).toBe(p1);
    const p2 = ok(renameFacadeAsset(p1, a.id, '  Brick bay  '));
    expect(facadeAssetsOf(p2.meta.assets)).toEqual([{ ...a, name: 'Brick bay' }]);
    expect(renameFacadeAsset(p2, a.id, ' ').ok).toBe(false);
  });

  it('Materials: colour and solid/glass per part change the façade, keep its id and geometry, and round-trip', () => {
    const a = asset(6);
    const p1 = ok(addFacadeAsset(opened(), a));
    const materials = a.groups.map((_, i) => ({ color: i === 0 ? '#AA3300' : a.groups[i]!.color, glass: i === 0 ? !a.groups[0]!.glass : a.groups[i]!.glass }));
    const p2 = ok(setFacadeAssetMaterials(p1, a.id, materials));
    expect(p2.changes).toBe(p1.changes + 1);
    const changed = facadeAssetsOf(p2.meta.assets)[0]!;
    expect(changed.id).toBe(a.id);
    expect(changed.mesh).toEqual(a.mesh);
    expect(changed.groups[0]).toMatchObject({ color: '#aa3300', glass: !a.groups[0]!.glass, start: a.groups[0]!.start, count: a.groups[0]!.count });
    // Unchanged materials are no change; wrong counts and colours are refused.
    expect(ok(setFacadeAssetMaterials(p2, a.id, materials))).toBe(p2);
    expect(setFacadeAssetMaterials(p2, a.id, [...materials, materials[0]!]).ok).toBe(false);
    expect(setFacadeAssetMaterials(p2, a.id, materials.map((m) => ({ ...m, color: 'red' }))).ok).toBe(false);
    // Saved and read back with the project.
    const file = projectFileOf(p2, '2026-11-17T09:00:00.000Z');
    if (!file.ok) throw new Error('export failed');
    const read = readProjectFile(serializeProjectFile(file.value));
    expect(read.ok && facadeAssetsOf(read.value.assets)[0]!.groups).toEqual(changed.groups);
  });

  it('Materials: an Open finish, and separate materials per use (door bay / open bay), round-trip; null = same as the façade', () => {
    const a = asset(6);
    const p1 = ok(addFacadeAsset(opened(), a));
    const base = materialsFor(a, 'wall');
    expect(materialsFor(a, 'door')).toEqual(base); // no own door materials yet
    // Façade: first part Open (not drawn).
    const wall = base.map((m, i) => (i === 0 ? withFinish(m.color, 'open') : m));
    const p2 = ok(setFacadeAssetMaterials(p1, a.id, wall, 'wall'));
    expect(facadeAssetsOf(p2.meta.assets)[0]!.groups[0]).toMatchObject({ glass: false, open: true });
    // Door bay: its own materials (first part glass, red); the façade is unchanged.
    const door = base.map((m, i) => (i === 0 ? withFinish('#cc0000', 'glass') : m));
    const p3 = ok(setFacadeAssetMaterials(p2, a.id, door, 'door'));
    const stored = facadeAssetsOf(p3.meta.assets)[0]!;
    expect(finishOf(materialsFor(stored, 'wall')[0]!)).toBe('open');
    expect(materialsFor(stored, 'door')[0]).toEqual({ color: '#cc0000', glass: true });
    expect(materialsFor(stored, 'open')).toEqual(materialsFor(stored, 'wall'));
    expect(stored.id).toBe(a.id);
    expect(ok(setFacadeAssetMaterials(p3, a.id, door, 'door'))).toBe(p3);
    // Saved and read back with the project.
    const file = projectFileOf(p3, '2026-11-17T09:00:00.000Z');
    if (!file.ok) throw new Error('export failed');
    const read = readProjectFile(serializeProjectFile(file.value));
    expect(read.ok && facadeAssetsOf(read.value.assets)[0]).toEqual(stored);
    // null: the door bay uses the façade's materials again (and the field disappears); the façade needs its own.
    const p4 = ok(setFacadeAssetMaterials(p3, a.id, null, 'door'));
    expect(facadeAssetsOf(p4.meta.assets)[0]!.bayMaterials).toBeUndefined();
    expect(setFacadeAssetMaterials(p4, a.id, null, 'wall').ok).toBe(false);
    expect(setFacadeAssetMaterials(p4, a.id, door.slice(1), 'open').ok).toBe(false);
  });

  it('a façade used by any scenario cannot be removed; an unused one can (and the file says "none" again)', () => {
    const a = asset(5);
    const used = opened(withAssets(fileOf(), [a], functionStyleSettings({ gallery: { facade: { assetId: a.id, placement: 'repeat' } } })));
    const refused = removeFacadeAsset(used, a.id);
    expect(refused.ok === false && refused.message).toMatch(/used in scenario “Scenario 1”/);
    const unused = opened(withAssets(fileOf(), [a]));
    const removed = ok(removeFacadeAsset(unused, a.id));
    expect(removed.meta.assets).toEqual({ policy: 'none' });
    expect(removeFacadeAsset(removed, a.id).ok).toBe(false);
  });

  it('a used façade can be removed once confirmed (replaceUses): its functions become Automatic, one undo step each', () => {
    const a = asset(5);
    const used = opened(withAssets(fileOf(), [a], functionStyleSettings({ gallery: { facade: { assetId: a.id, placement: 'repeat' } }, studio: { roof: 'none' } })));
    expect(facadeUses(used, a.id)).toEqual([{ scenarioId: used.activeScenarioId, scenario: 'Scenario 1', cards: ['gallery'] }]);
    const removed = ok(removeFacadeAsset(used, a.id, { replaceUses: true }));
    expect(removed.meta.assets).toEqual({ policy: 'none' });
    expect(removed.changes).toBe(used.changes + 1);
    const design = activeDesign(removed);
    expect(functionLooks(design.settings)).toEqual({ gallery: {}, studio: { roof: 'none' } });
    expect(facadeUses(removed, a.id)).toEqual([]);
    expect(removed.revision).toBeGreaterThan(used.revision);
    // Undo in the scenario brings the setting back (the façade itself stays removed: drawn as missing).
    const undone = undoActive(removed);
    expect(functionLooks(activeDesign(undone).settings).gallery?.facade?.assetId).toBe(a.id);
    expect(undone.meta.assets).toEqual({ policy: 'none' });
  });
});

describe('end to end: .3dm → project → autosave → restore → export → open', () => {
  let rhino: unknown;
  beforeAll(async () => {
    rhino = await loadRhino3dm();
  }, 30_000);

  const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): { readFileSync(url: URL): Uint8Array } } }).process.getBuiltinModule('node:fs');

  it('keeps the imported geometry bit-for-bit through every persistence path', async () => {
    const bytes = new Uint8Array(fs.readFileSync(new URL('../assets/__fixtures__/F1-bay-window-m.3dm', import.meta.url)));
    const imported = importFacade3dm(bytes, { fileName: 'F1-bay-window-m.3dm', rhino, reader: 'rhino3dm@8.17.0' });
    if (imported.status !== 'ok') throw new Error(JSON.stringify(imported));
    const original = facadeMeshData(imported.asset);

    // A controller with manual timers (autosave runs when the test says so).
    const queue: (() => void)[] = [];
    const scheduler: Scheduler = { set: (cb) => queue.push(cb), clear: () => undefined };
    const store = createMemoryProjectStore();
    const c = createProjectController({ store, scheduler, locks: null, now: () => '2026-11-17T09:00:00.000Z' });
    await c.open(fileOf(), { kind: 'created', label: 'test' });
    expect(c.addFacadeAsset(imported.asset)).toEqual({ ok: true, value: undefined });
    const set = c.command({ type: 'set-look', by: 'function', group: { kind: 'value', value: 'gallery' }, patch: { facade: { assetId: imported.asset.id, placement: 'repeat' } } });
    expect(set.ok).toBe(true);
    await c.flush();
    const projectId = c.getState().project!.meta.projectId;

    // 1. Autosave: the stored record carries the asset.
    const record = store.records.get(projectId) as string;
    expect(record).toContain(imported.asset.mesh.data);

    // 2. Restore in a "new tab".
    const tab = createProjectController({ store, scheduler, locks: null });
    expect((await tab.restore(projectId)).ok).toBe(true);
    const restored = tab.getState().project!;
    expect(facadeAssetsOf(restored.meta.assets)).toEqual([imported.asset]);
    expect(functionLooks(activeDesign(restored).settings).gallery?.facade).toEqual({ assetId: imported.asset.id, placement: 'repeat' });

    // 3. Export, then open the exported text as a user-chosen file.
    const exported = tab.exportFile();
    if (!exported.ok) throw new Error(exported.message);
    const reopened = readProjectOrDesign(exported.value.text);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    const [again] = facadeAssetsOf(reopened.file.assets);
    expect(again).toEqual(imported.asset);
    const decoded = facadeMeshData(again!);
    expect(decoded.positions).toEqual(original.positions);
    expect(decoded.indices).toEqual(original.indices);
  });

  it('a full browser quota blocks the save visibly instead of dropping the asset', async () => {
    const queue: (() => void)[] = [];
    const scheduler: Scheduler = { set: (cb) => queue.push(cb), clear: () => undefined };
    // Room for the project itself plus about two small assets, not seven.
    const store = createMemoryProjectStore({ quotaBytes: serializeProjectFile(fileOf()).length + 1500 });
    const c = createProjectController({ store, scheduler, locks: null });
    await c.open(fileOf(), { kind: 'created', label: 'test' });
    await c.flush();
    expect(c.getState().save.local).toBe('saved');
    for (let i = 0; i < 6; i++) expect(c.addFacadeAsset(asset(10 + i, `${'Façade '.repeat(10)}${i}`)).ok).toBe(true);
    c.addFacadeAsset(asset(6));
    await c.flush();
    const save = c.getState().save;
    expect(save.local).toBe('blocked');
    expect(save.local === 'blocked' && save.reason).toBe('quota');
    // Still in the open project (nothing was dropped), so the student can export it.
    expect(facadeAssetsOf(c.getState().project!.meta.assets)).toHaveLength(7);
    const exported = c.exportFile();
    if (!exported.ok) throw new Error(exported.message);
    const read = readProjectFile(exported.value.text);
    expect(read.ok && facadeAssetsOf(read.value.assets)).toHaveLength(7);
  });
});

/** Serialise without the canonical asset pass (to write deliberately broken files). */
function serializeUnchecked(file: ProjectFileV2): string {
  const value = JSON.parse(serializeProjectFile({ ...file, assets: { policy: 'none' } })) as Record<string, unknown>;
  value.assets = file.assets;
  return JSON.stringify(value);
}
