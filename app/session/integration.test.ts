import { describe, expect, it } from 'vitest';
import exampleDesign from '../document/test-designs/two-storey.json';
import { expectOk } from '@app/document/test-fixtures';
import { readDesign, readDesignJson, serializeDesignV2, validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
import { v2Raw } from '@app/document/v2/test-fixtures';
import { resolveRelationships } from '@app/spatial';
import { buildNodeItems, cellBounds, includeBoxes, storeyLevels } from '@app/views/three/sceneModel';
import { spatialToThree } from '@core/viewer/coordinates';
import { NO_SELECTION, reconcileSelection, selectEdge, selectNode } from '@core/viewer/selection';
import { applyPreviewV2 } from './algorithmSession';
import {
  applyDesignCommandToSession,
  currentDocument,
  designCommandLabel,
  isModified,
  markExported,
  openDocument,
  redoDocument,
  undoDocument,
  versionOf,
} from './documentSession';
import { canRedo, canUndo, undoLabel } from './history';

/** The shell stores and edits schema-v2 documents; these pin the pure integration pieces. */

const v2 = (): DesignDocumentV2 => expectOk(validateDocumentV2(v2Raw()));
const example = (): DesignDocumentV2 => expectOk(readDesign(exampleDesign)).doc;

describe('selection against the stored document (views read it directly)', () => {
  it('keeps existing ids and drops removed ones', () => {
    const doc = v2();
    expect(reconcileSelection(selectEdge('ab'), doc)).toEqual(selectEdge('ab'));
    expect(reconcileSelection(selectNode('gone'), doc)).toEqual(NO_SELECTION);
  });
});

describe('v2 document session (one command = one history step)', () => {
  it('records successful changes once, labels them, and undo/redo restore exact documents', () => {
    let s = openDocument(v2(), 'test', null);
    const base = currentDocument(s);
    const moved = applyDesignCommandToSession(s, { type: 'set-node-geometry', nodeId: 'b', grid: [5, 0, 0], size: [1, 1, 1] });
    expect(moved.ok && moved.changed).toBe(false); // no-op: nothing recorded
    const r = applyDesignCommandToSession(s, { type: 'set-connector-style', edgeId: 'ab', style: 'deck' });
    if (!r.ok) throw new Error('expected ok');
    s = r.session;
    expect(undoLabel(s.history)).toBe('Change the connector style of 01 ↔ 02'); // phase 07: readable label, not the id
    expect(s.history.past).toHaveLength(1);
    expect(isModified(s)).toBe(true);
    s = undoDocument(s);
    expect(currentDocument(s)).toBe(base);
    expect(isModified(s)).toBe(false);
    s = redoDocument(s);
    expect(currentDocument(s).edges[0]!.connectorStyle).toBe('deck');
    expect(canRedo(s.history)).toBe(false);
  });

  it('records nothing for a refused command (room overlap, unconfirmed corridor displacement)', () => {
    const s = openDocument(v2(), 'test', null);
    const overlap = applyDesignCommandToSession(s, { type: 'set-node-geometry', nodeId: 'b', grid: [1, 1, 0] });
    expect(overlap.ok).toBe(false);
    const corridorCell = resolveRelationships(currentDocument(s)).byEdge.get('ab');
    expect(corridorCell?.status).toBe('routed');
    const raw = v2Raw();
    raw.nodes.push({ id: 'c', grid: [3, 5, 0], typeId: 'studio' });
    const s2 = openDocument(expectOk(validateDocumentV2(raw)), 'test', null);
    const displaced = applyDesignCommandToSession(s2, { type: 'set-node-geometry', nodeId: 'c', grid: [3, 0, 0] });
    expect(!displaced.ok && displaced.issues.map((i) => i.code)).toEqual(['route-displacement']);
    const confirmed = applyDesignCommandToSession(s2, { type: 'set-node-geometry', nodeId: 'c', grid: [3, 0, 0], confirmRouteDisplacement: true });
    if (!confirmed.ok) throw new Error('expected ok');
    expect(confirmed.session.history.past).toHaveLength(1);
    expect(resolveRelationships(currentDocument(confirmed.session)).byEdge.get('ab')?.status).toBe('unresolved');
    expect(canUndo(s.history)).toBe(false);
  });

  it('export marks the clean state; v2 export re-reads to the same content', () => {
    let s = openDocument(example(), 'test', null);
    const r = applyDesignCommandToSession(s, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'gallery' }, patch: { windowFraction: 0.6 } });
    if (!r.ok) throw new Error('expected ok');
    s = markExported(r.session, currentDocument(r.session));
    expect(isModified(s)).toBe(false);
    const text = serializeDesignV2(currentDocument(s));
    expect(serializeDesignV2(expectOk(readDesignJson(text)).doc)).toBe(text);
  });
});

describe('undo labels name what changes', () => {
  const doc = v2();
  it.each([
    [{ type: 'set-node-geometry', nodeId: 'b', grid: [6, 0, 0], size: [1, 1, 1] }, 'Move room 02 to [6, 0, 0]'],
    [{ type: 'set-node-geometry', nodeId: 'b', grid: [5, 0, 0], size: [2, 1, 1] }, 'Resize room 02 to 2×1×1'],
    [{ type: 'set-node-geometry', nodeId: 'b', grid: [6, 0, 0], size: [2, 1, 1] }, 'Move and resize room 02'],
    [{ type: 'add-node', node: { id: 'n', grid: [9, 9, 0], typeId: 'x' } }, 'Add room 03'],
    [{ type: 'set-look', by: 'function', group: { kind: 'value', value: 'gallery' }, patch: { roof: 'none' } }, 'Change Designer settings for gallery'],
  ] as const)('%j → %s', (command, label) => {
    expect(designCommandLabel(command as Parameters<typeof designCommandLabel>[0], doc)).toBe(label);
  });
});

describe('applyPreviewV2 guards', () => {
  const doc = v2();
  const s = openDocument(doc, 'test', null);
  const after = expectOk(validateDocumentV2({ ...v2Raw(), metadata: { name: 'after' } }));
  const preview = { before: doc, after, operations: [], resolvedDiagnosticIds: [], displacedRoutes: [] as string[] };

  it('applies only at the exact document and revision it ran on', () => {
    expect(applyPreviewV2(versionOf(s), preview, s.revision)).toEqual({ ok: true, doc: after });
    expect(applyPreviewV2(versionOf(s), preview, s.revision - 1)).toMatchObject({ ok: false, reason: 'stale' });
    expect(applyPreviewV2(null, preview, s.revision)).toMatchObject({ ok: false, reason: 'no-document' });
  });

  it('requires confirmation when new rooms displace generated corridors', () => {
    const displacing = { ...preview, displacedRoutes: ['ab'] };
    expect(applyPreviewV2(versionOf(s), displacing, s.revision)).toMatchObject({ ok: false, reason: 'needs-confirmation' });
    expect(applyPreviewV2(versionOf(s), displacing, s.revision, { confirmRouteDisplacement: true })).toEqual({ ok: true, doc: after });
  });
});

describe('3D scene model with multicell rooms', () => {
  it('centres a sized room on its footprint and bounds its full extent', () => {
    const [a] = buildNodeItems(v2().nodes);
    expect(a!.position).toEqual(spatialToThree([0.5, 1, 0]));
    expect(a!.extent).toEqual([6, 3, 9]);
    const b = cellBounds(v2().nodes)!;
    expect(b.min[0]).toBe(-1.5);
    expect(b.max[0]).toBe(5 * 3 + 1.5);
    expect(storeyLevels([{ id: 'x', typeId: 't', grid: [0, 0, 1], size: [1, 1, 2] }])).toEqual([1, 2]);
  });

  it('grows the camera bounds with connector boxes', () => {
    const grown = includeBoxes(cellBounds(v2().nodes), [{ position: [0, 0, -40], size: [2, 2, 2] }])!;
    expect(grown.min[2]).toBe(-41);
  });
});
