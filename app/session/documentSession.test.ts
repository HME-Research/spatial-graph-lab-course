import { beforeAll, describe, expect, it } from 'vitest';
import { resolveFaces } from '@app/building';
import { applyGraphCommand, parseDesignJson, serializeDesign, type DesignDocument, type GraphCommand } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { activate, PROJECT_GLOBS, type ActiveProject, type TransformationPreview } from '@app/extensions';
import { NO_SELECTION, reconcileSelection, selectEdge, selectNode } from '@core/viewer/selection';
import builtInText from '../document/examples/two-storey-example.json?raw';
import { applyPreview, isStale, listAlgorithms, runEntry } from './algorithmSession';
import {
  applyCommand,
  commandLabel,
  commitDocument,
  currentDocument,
  documentSignature,
  isModified,
  markExported,
  openDocument,
  redoDocument,
  undoDocument,
  versionOf,
  type DocumentSession,
} from './documentSession';
import { canRedo, canUndo, HISTORY_LIMIT, redoLabel, undoLabel } from './history';

const builtIn = expectOk(parseDesignJson(builtInText));
let example: ActiveProject;

beforeAll(async () => {
  const { activation } = await activate(PROJECT_GLOBS, { query: 'example-gallery' });
  if (activation.status !== 'active') throw new Error('example-gallery did not activate');
  example = activation.project;
});

const open = (doc: DesignDocument = builtIn) => openDocument(doc, 'test', null);

/** Apply a command that must succeed; returns the new session. */
function edit(session: DocumentSession, command: GraphCommand): DocumentSession {
  const outcome = applyCommand(session, command);
  if (!outcome.ok) throw new Error(outcome.issues.map((i) => i.message).join('; '));
  return outcome.session;
}

const doc = currentDocument;
const nodeIds = (s: DocumentSession) => doc(s).nodes.map((n) => n.id);

/** Run an example-gallery transformation on the session's current version. */
function previewOf(session: DocumentSession, algorithmId: string) {
  const entry = listAlgorithms(example).find((a) => a.id === algorithmId)!;
  const run = runEntry(versionOf(session), example, entry, {});
  if (!run.outcome.ok || run.outcome.value.kind !== 'transformation') throw new Error('expected a transformation');
  return { run, preview: run.outcome.value.preview as TransformationPreview };
}

const wallBetween = (d: DesignDocument, a: string, b: string) =>
  resolveFaces(d).find((f) => [f.ownerNodeId, f.neighbourNodeId].sort().join() === [a, b].sort().join())!.condition;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('document signature', () => {
  it('is deterministic and independent of object key order, but not of node/edge order', () => {
    const reordered = JSON.parse(builtInText) as { nodes: { attributes: Record<string, unknown> }[] };
    reordered.nodes[0]!.attributes = { public: true, daylight: 'high' }; // same content, other key order
    const twin = expectOk(parseDesignJson(JSON.stringify(reordered)));
    expect(twin).not.toBe(builtIn);
    expect(documentSignature(twin)).toBe(documentSignature(builtIn));
    expect(documentSignature(builtIn)).toBe(documentSignature(builtIn));

    const changed = expectOk(applyGraphCommand(builtIn, { type: 'set-diagram-position', nodeId: 'store', position: [361, 300] }));
    expect(documentSignature(changed)).not.toBe(documentSignature(builtIn));

    const swapped = JSON.parse(builtInText) as { nodes: unknown[] };
    swapped.nodes.reverse();
    expect(documentSignature(expectOk(parseDesignJson(JSON.stringify(swapped))))).not.toBe(documentSignature(builtIn));
  });
});

describe('every supported edit is one undoable step', () => {
  const cases: readonly (readonly [string, readonly GraphCommand[]])[] = [
    ['add node', [{ type: 'add-node', node: { id: 'n1', grid: [2, 0, 0], typeId: 'gallery', attributes: {} }, diagramPosition: [500, 140] }]],
    ['delete node', [{ type: 'remove-node', nodeId: 'store' }]],
    ['add edge', [{ type: 'add-edge', edge: { id: 'e1', source: 'reading-gallery', target: 'store', kind: 'door' } }]],
    ['delete edge', [{ type: 'remove-edge', edgeId: 'upper-door' }]],
    ['change edge', [{ type: 'change-edge-kind', edgeId: 'upper-door', kind: 'open' }]],
    ['node type', [{ type: 'set-node-type', nodeId: 'store', typeId: 'studio' }]],
    ['attributes', [{ type: 'set-node-attributes', nodeId: 'store', attributes: { daylight: 'low', public: false } }]],
    ['grid move', [{ type: 'remove-edge', edgeId: 'studio-to-store' }, { type: 'move-node', nodeId: 'store', grid: [2, 1, 0] }]],
    ['diagram drag', [{ type: 'set-diagram-position', nodeId: 'store', position: [10, 20] }]],
  ];

  for (const [name, commands] of cases) {
    it(name, () => {
      const start = open();
      let s = start;
      const docs = [doc(s)];
      for (const command of commands) {
        s = edit(s, command);
        docs.push(doc(s));
      }
      expect(s.history.past).toHaveLength(commands.length);
      expect(undoLabel(s.history)).toBe(commandLabel(commands[commands.length - 1]!));
      expect(isModified(s)).toBe(true);
      // Undo walks back through the exact snapshots; redo walks forward again.
      for (let i = commands.length - 1; i >= 0; i--) {
        s = undoDocument(s);
        expect(doc(s)).toBe(docs[i]);
      }
      expect(doc(s)).toBe(builtIn);
      expect(isModified(s)).toBe(false);
      for (let i = 1; i <= commands.length; i++) {
        s = redoDocument(s);
        expect(doc(s)).toBe(docs[i]);
      }
      expect(isModified(s)).toBe(true);
    });
  }

  it('undoing a node deletion restores its connections and diagram position', () => {
    const deleted = edit(open(), { type: 'remove-node', nodeId: 'studio-ground' });
    expect(doc(deleted).edges.map((e) => e.id)).toEqual(['entry-to-reading', 'entry-up', 'upper-door']);
    const restored = undoDocument(deleted);
    expect(serializeDesign(doc(restored))).toBe(serializeDesign(builtIn));
    expect(doc(restored).edges.filter((e) => e.source === 'studio-ground' || e.target === 'studio-ground').map((e) => e.id)).toEqual([
      'entry-to-studio',
      'studio-to-store',
      'studio-atrium',
    ]);
  });

  it('one completed diagram drag is one step and never moves the grid cell', () => {
    const s = edit(open(), { type: 'set-diagram-position', nodeId: 'store', position: [10, 20] });
    expect(s.history.past).toHaveLength(1);
    expect(doc(s).nodes.find((n) => n.id === 'store')!.grid).toEqual([1, 1, 0]);
    expect(doc(undoDocument(s)).diagram.positions['store']).toEqual([360, 300]);
    expect(doc(undoDocument(s)).nodes.find((n) => n.id === 'store')!.grid).toEqual([1, 1, 0]);
    // A drag that ends where it started is a no-op.
    const back = applyCommand(s, { type: 'set-diagram-position', nodeId: 'store', position: [10, 20] });
    expect(back.ok && back.changed).toBe(false);
  });
});

describe('failed and no-op commands are not recorded', () => {
  it('an invalid command leaves the session and history untouched', () => {
    const s = edit(open(), { type: 'set-diagram-position', nodeId: 'store', position: [1, 1] });
    const outcome = applyCommand(s, { type: 'add-edge', edge: { id: 'bad', source: 'entry-gallery', target: 'gallery-upper', kind: 'door' } });
    expect(outcome.ok).toBe(false);
    expect(applyCommand(s, { type: 'remove-node', nodeId: 'missing' }).ok).toBe(false);
    expect(s.history.past).toHaveLength(1);
    expect(canRedo(s.history)).toBe(false);
  });

  it('a command that produces identical content returns the same session (no step, no redo loss)', () => {
    const s = undoDocument(edit(open(), { type: 'set-node-type', nodeId: 'store', typeId: 'studio' }));
    const same = applyCommand(s, { type: 'set-node-attributes', nodeId: 'store', attributes: { public: false, daylight: null } });
    expect(same.ok && same.session).toBe(s);
    expect(same.ok && same.changed).toBe(false);
    expect(canRedo(s.history)).toBe(true);
  });

  it('branching after undo clears redo', () => {
    let s = edit(edit(open(), { type: 'remove-node', nodeId: 'store' }), { type: 'remove-edge', edgeId: 'upper-door' });
    s = undoDocument(s);
    expect(canRedo(s.history)).toBe(true);
    s = edit(s, { type: 'set-node-type', nodeId: 'entry-gallery', typeId: 'studio' });
    expect(canRedo(s.history)).toBe(false);
    expect(redoDocument(s)).toBe(s);
    expect(s.history.past).toHaveLength(2);
  });

  it(`the document history is capped at ${HISTORY_LIMIT} steps`, () => {
    let s = open();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = edit(s, { type: 'set-diagram-position', nodeId: 'store', position: [i, 0] });
    expect(s.history.past).toHaveLength(HISTORY_LIMIT);
    while (canUndo(s.history)) s = undoDocument(s);
    expect(doc(s).diagram.positions['store']).toEqual([9, 0]);
    expect(isModified(s)).toBe(true); // the clean state has fallen out of the history
  });
});

describe('clean-state tracking', () => {
  it('follows the last loaded or exported content across edits, undo, redo and exports', () => {
    const at = (n: number): GraphCommand => ({ type: 'set-diagram-position', nodeId: 'store', position: [n, 0] });
    let s = open();
    expect(isModified(s)).toBe(false);
    s = edit(s, at(1));
    s = edit(s, at(2));
    expect(isModified(s)).toBe(true);
    s = undoDocument(undoDocument(s));
    expect(isModified(s)).toBe(false); // back to the loaded state
    s = redoDocument(s);
    expect(isModified(s)).toBe(true); // redo away from it

    s = markExported(redoDocument(s), doc(redoDocument(s))); // export at position 2
    expect(isModified(s)).toBe(false);
    expect(s.history.past).toHaveLength(2); // exporting keeps history
    s = undoDocument(s);
    expect(isModified(s)).toBe(true); // the loaded state is no longer the clean one
    s = redoDocument(s);
    expect(isModified(s)).toBe(false);

    s = edit(s, at(3));
    expect(isModified(s)).toBe(true);
    s = markExported(s, doc(s)); // second export
    expect(isModified(s)).toBe(false);
    s = undoDocument(s);
    expect(isModified(s)).toBe(true);
  });

  it('is defined by content, not identity or history length: editing back to equal content is clean', () => {
    let s = edit(open(), { type: 'set-node-attributes', nodeId: 'store', attributes: { daylight: 'low', public: false } });
    s = edit(s, { type: 'set-node-attributes', nodeId: 'store', attributes: { public: false, daylight: null } });
    expect(s.history.past).toHaveLength(2);
    expect(doc(s)).not.toBe(builtIn);
    expect(isModified(s)).toBe(false);
  });

  it('opening a document resets history and the clean state, with an increasing revision', () => {
    const edited = edit(open(), { type: 'remove-node', nodeId: 'store' });
    const reopened = openDocument(builtIn, 'other', edited);
    expect(reopened.history).toEqual({ past: [], present: builtIn, future: [] });
    expect(isModified(reopened)).toBe(false);
    expect(reopened.revision).toBeGreaterThan(edited.revision);
    expect(reopened.source).toBe('other');
    expect(isModified(null)).toBe(false);
  });

  it('markExported with unchanged content returns the same session', () => {
    const s = open();
    expect(markExported(s, doc(s))).toBe(s);
  });
});

describe('transformations and previews', () => {
  it('one Apply is one history step, regardless of its operation count, and undo/redo change the opening', () => {
    const s0 = open();
    const { run, preview } = previewOf(s0, 'connect-storage-to-galleries');
    const applied = applyPreview(versionOf(s0), preview, run.revision);
    if (!applied.ok) throw new Error(applied.message);
    const s1 = commitDocument(s0, applied.doc, `Apply “${run.label}”`);
    expect(s1.history.past).toHaveLength(1);
    expect(undoLabel(s1.history)).toBe(`Apply “${run.label}”`);
    expect(wallBetween(doc(s1), 'reading-gallery', 'store')).toBe('door');
    const s2 = undoDocument(s1);
    expect(wallBetween(doc(s2), 'reading-gallery', 'store')).toBe('solid');
    expect(redoLabel(s2.history)).toBe(`Apply “${run.label}”`);
    expect(wallBetween(doc(redoDocument(s2)), 'reading-gallery', 'store')).toBe('door');

    // Any number of changes committed together (as an applied preview is) is still one step.
    let many = builtIn;
    for (const command of [
      { type: 'add-node', node: { id: 'n1', grid: [2, 0, 0], typeId: 'gallery', attributes: {} } },
      { type: 'add-edge', edge: { id: 'e1', source: 'studio-ground', target: 'n1', kind: 'door' } },
      { type: 'set-node-attributes', nodeId: 'store', attributes: { daylight: 'low', public: false } },
    ] satisfies GraphCommand[]) {
      many = expectOk(applyGraphCommand(many, command));
    }
    const atomic = commitDocument(s0, many, 'Apply “many”');
    expect(atomic.history.past).toHaveLength(1);
    expect(doc(undoDocument(atomic))).toBe(builtIn);
  });

  it('a preview becomes stale on undo/redo, even when redo returns the very same document', () => {
    const s0 = edit(open(), { type: 'set-diagram-position', nodeId: 'store', position: [1, 1] });
    const { run, preview } = previewOf(s0, 'daylight-from-exposure');
    expect(isStale(run, versionOf(s0))).toBe(false);

    const undone = undoDocument(s0);
    expect(isStale(run, versionOf(undone))).toBe(true);
    expect(applyPreview(versionOf(undone), preview, run.revision)).toMatchObject({ ok: false, reason: 'stale' });

    const redone = redoDocument(undone);
    expect(doc(redone)).toBe(doc(s0)); // the identical snapshot…
    expect(isStale(run, versionOf(redone))).toBe(true); // …but the result is still stale
    expect(applyPreview(versionOf(redone), preview, run.revision)).toMatchObject({ ok: false, reason: 'stale' });

    // Running again (the new validation step) makes it applicable.
    const again = previewOf(redone, 'daylight-from-exposure');
    expect(applyPreview(versionOf(redone), again.preview, again.run.revision).ok).toBe(true);
  });

  it('an analysis becomes stale on edits, undo and redo', () => {
    const s0 = open();
    const entry = listAlgorithms(example).find((a) => a.id === 'access-depth')!;
    const run = runEntry(versionOf(s0), example, entry, { start: 'store' });
    const s1 = edit(s0, { type: 'remove-edge', edgeId: 'upper-door' });
    expect(isStale(run, versionOf(s0))).toBe(false);
    expect(isStale(run, versionOf(s1))).toBe(true);
    expect(isStale(run, versionOf(undoDocument(s1)))).toBe(true);
    expect(isStale(run, null)).toBe(true);
  });

  it('a preview from before a document was reopened is stale', () => {
    const s0 = open();
    const { run, preview } = previewOf(s0, 'daylight-from-exposure');
    const reopened = openDocument(builtIn, 'again', s0); // same document object, new revision
    expect(applyPreview(versionOf(reopened), preview, run.revision)).toMatchObject({ ok: false, reason: 'stale' });
  });
});

describe('selection after undo/redo', () => {
  it('a selected node or edge that disappears is deselected; other selections survive', () => {
    const added = edit(open(), { type: 'add-node', node: { id: 'n1', grid: [2, 0, 0], typeId: 'gallery', attributes: {} } });
    expect(reconcileSelection(selectNode('n1'), doc(undoDocument(added)))).toEqual(NO_SELECTION);
    expect(reconcileSelection(selectNode('store'), doc(undoDocument(added)))).toEqual(selectNode('store'));

    const removedEdge = edit(open(), { type: 'add-edge', edge: { id: 'e1', source: 'reading-gallery', target: 'store', kind: 'door' } });
    expect(reconcileSelection(selectEdge('e1'), doc(undoDocument(removedEdge)))).toEqual(NO_SELECTION);
    expect(reconcileSelection(selectEdge('e1'), doc(redoDocument(undoDocument(removedEdge))))).toEqual(selectEdge('e1'));
  });
});

describe('StrictMode safety', () => {
  it('transitions are pure: frozen inputs are never mutated and repeated calls give equal results', () => {
    const frozenDoc = deepFreeze(expectOk(parseDesignJson(builtInText)));
    const base = deepFreeze(edit(openDocument(frozenDoc, 'frozen', null), { type: 'set-diagram-position', nodeId: 'store', position: [1, 1] }));
    const before = JSON.stringify(base);
    const transitions = [
      (s: DocumentSession) => edit(s, { type: 'remove-node', nodeId: 'store' }),
      undoDocument,
      redoDocument,
      (s: DocumentSession) => markExported(s, doc(s)),
      (s: DocumentSession) => openDocument(frozenDoc, 'again', s),
    ];
    for (const step of transitions) {
      const first = step(base);
      const second = step(base); // what React StrictMode does with an updater
      expect(serializeDesign(doc(second))).toBe(serializeDesign(doc(first)));
      expect({ ...second, history: null }).toEqual({ ...first, history: null });
      expect(second.history.past.length).toBe(first.history.past.length);
    }
    expect(JSON.stringify(base)).toBe(before);
    expect(nodeIds(base)).toContain('store');
  });
});
