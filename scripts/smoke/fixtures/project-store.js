// Dev-server-only fixture: exercises app/project/storage.ts against the browser's REAL IndexedDB
// (save, list, load, corrupt record → quarantine, refused overwrite, explicit discard, quota,
// unavailable) and prints a JSON result into #result for scripts/smoke (group `project-store`).
// Served by `vite` at /scripts/smoke/fixtures/project-store.html (not by `preview`). It uses a
// fresh, uniquely named database and deletes it afterwards.
import { PROJECTS_STORE, QUARANTINE_STORE, createIndexedDbProjectStore, projectFromLegacyDesign, projectFileFromState, projectStateFromFile, serializeProjectFile } from '../../../app/project/index.ts';

const dbName = `sgl-projects-smoke-${Date.now()}`;
const checks = [];
const expectThat = (id, okValue, detail) => checks.push({ id, ok: !!okValue, detail });

const design = (name, nodes, edges, positions) => ({ schemaVersion: 2, metadata: { name }, nodes, edges, diagram: { positions } });
const designA = design(
  'Option A',
  [
    { id: 'a', grid: [0, 0, 0], size: [2, 1, 1], typeId: 'gallery' },
    { id: 'b', grid: [2, 0, 0], typeId: 'studio' },
  ],
  [{ id: 'ab', source: 'a', target: 'b', kind: 'access' }],
  { a: [0, 0], b: [100, 0] },
);
const designB = design(
  'Option B',
  [
    { id: 'a', grid: [0, 0, 0], typeId: 'gallery' },
    { id: 'b', grid: [0, 1, 0], size: [1, 1, 2], typeId: 'studio' },
    { id: 'c', grid: [5, 5, 0], typeId: 'gallery' },
  ],
  [
    { id: 'ab', source: 'a', target: 'b', kind: 'open' },
    { id: 'bc', source: 'b', target: 'c', kind: 'access' },
  ],
  { a: [0, 0], b: [0, 100], c: [200, 100] },
);

/** Two scenarios with different topology/geometry, a face preference, a camera and display overrides. */
function project(projectId, updatedAt) {
  const imported = (raw) => {
    const r = projectFromLegacyDesign(raw, { now: () => updatedAt });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.value.scenarios[0].design;
  };
  const base = projectFromLegacyDesign(designA, { newId: () => projectId, now: () => updatedAt, name: `Project ${projectId}` });
  if (!base.ok) throw new Error(JSON.stringify(base.issues));
  const { meta } = projectStateFromFile(base.value);
  const r = projectFileFromState({
    meta: { ...meta, settings: { display: { labels: true, legend: false, roofs: true, colourPreset: 'neutral', lighting: 'soft' } } },
    activeScenarioId: 's2',
    scenarios: [
      {
        id: 's1',
        name: 'Option A',
        content: { design: imported(designA), facePreferences: { ab: { nodeId: 'a', offset: [1, 0, 0], direction: '+x' } } },
        cameras: [{ id: 'front', name: 'Front', viewMode: 'architecture', pose: { projection: 'perspective', position: [10, 8, 10], target: [0, 0, 0], up: [0, 1, 0], fov: 50 } }],
        display: { roofs: false },
      },
      { id: 's2', name: 'Option B', content: { design: imported(designB), facePreferences: {} }, cameras: [], display: {} },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const req = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Direct access to the store's database (outside the adapter), to plant and inspect raw records. */
async function raw(storeName, action) {
  const db = await req(indexedDB.open(dbName));
  try {
    const store = db.transaction(storeName, action === 'read' ? 'readonly' : 'readwrite').objectStore(storeName);
    return action === 'read' ? await req(store.getAll()) : await action(store);
  } finally {
    db.close();
  }
}

async function run() {
  const store = createIndexedDbProjectStore(dbName);
  const p1 = project('p1', '2026-11-16T10:00:00.000Z');
  const p2 = project('p2', '2026-11-16T11:00:00.000Z');

  const s1 = await store.save(p1);
  const s2 = await store.save(p2);
  expectThat('save', s1.status === 'saved' && s2.status === 'saved', { s1, s2 });

  const list = await store.list();
  expectThat('list-sorted', list.map((s) => s.projectId).join(',') === 'p2,p1' && list[0].scenarioCount === 2, list.map((s) => `${s.projectId}@${s.updatedAt}`));

  const loaded = await store.load('p1');
  expectThat('load-roundtrip', loaded.status === 'ok' && serializeProjectFile(loaded.file) === serializeProjectFile(p1), {
    status: loaded.status,
    scenarios: loaded.status === 'ok' ? loaded.file.scenarios.map((s) => `${s.id}: ${s.design.nodes.length} rooms, ${s.design.edges.length} edges, ${Object.keys(s.facePreferences).length} pref, ${s.cameras.length} cam`) : null,
  });
  expectThat('missing', (await store.load('nope')).status === 'missing', null);

  const corrupt = '{"format":"spatial-graph-lab/project", truncated';
  await raw(PROJECTS_STORE, (s) => req(s.put(corrupt, 'p-corrupt')));
  const bad = await store.load('p-corrupt');
  const quarantined = await raw(QUARANTINE_STORE, 'read');
  expectThat('corrupt-quarantined', bad.status === 'unreadable' && bad.quarantineKey?.startsWith('p-corrupt:unreadable:') && quarantined.includes(corrupt), {
    status: bad.status,
    quarantineKey: bad.quarantineKey,
    issue: bad.issues?.[0]?.code,
  });
  await store.load('p-corrupt');
  expectThat('quarantine-not-duplicated', (await raw(QUARANTINE_STORE, 'read')).length === 1, null);

  const overwrite = await store.save({ ...p1, projectId: 'p-corrupt' });
  const stillCorrupt = (await raw(PROJECTS_STORE, 'read')).includes(corrupt);
  expectThat('refused-unreadable', overwrite.status === 'blocked' && overwrite.reason === 'refused-unreadable' && stillCorrupt, { reason: overwrite.reason, stillCorrupt });

  const discarded = await store.discardUnreadable('p-corrupt');
  const afterDiscard = await store.save({ ...p1, projectId: 'p-corrupt' });
  const copyKept = (await raw(QUARANTINE_STORE, 'read')).includes(corrupt);
  expectThat('discard-then-save', discarded.status === 'discarded' && afterDiscard.status === 'saved' && copyKept, { discarded: discarded.status, afterDiscard: afterDiscard.status, copyKept });

  // Quota: the real IndexedDB store, with put() made to throw the browser's own QuotaExceededError DOMException.
  const put = IDBObjectStore.prototype.put;
  let quota;
  try {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('simulated quota', 'QuotaExceededError');
    };
    quota = await store.save({ ...p1, description: 'bigger' });
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  const kept = await store.load('p1');
  expectThat('quota-blocked', quota.status === 'blocked' && quota.reason === 'quota' && kept.status === 'ok' && kept.file.description === undefined, { reason: quota.reason, kept: kept.status });

  const unavailable = await createIndexedDbProjectStore('unused', { factory: null }).save(p1);
  expectThat('unavailable', unavailable.status === 'blocked' && unavailable.reason === 'unavailable', { reason: unavailable.reason });

  await new Promise((resolve) => {
    const d = indexedDB.deleteDatabase(dbName);
    d.onsuccess = d.onerror = d.onblocked = () => resolve();
  });
}

const out = document.getElementById('result');
run()
  .catch((error) => checks.push({ id: 'run', ok: false, detail: String(error?.stack ?? error) }))
  .finally(() => {
    out.textContent = JSON.stringify({ dbName, checks }, null, 2);
    out.dataset.done = 'true';
  });
