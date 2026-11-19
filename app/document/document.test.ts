import { functionLooks, functionStyleSettings } from './index';
import { describe, expect, it } from 'vitest';
import exampleJson from './test-designs/two-storey.json?raw';
import { expectIssue, expectOk } from './test-fixtures';
import {
  effectiveLook,
  styleSetupOf,
  footprintCells,
  nodeLabel,
  relationshipLabel,
  readDesign,
  readDesignJson,
  roomContact,
  serializeDesignV2,
  sharedFaces,
  validateDocumentV2,
  connectorStyleOf,
  type DesignDocumentV2,
} from './index';
import { v2Raw } from './test-fixtures';

/** Effective look of a function's rooms (its card → Default → base). */
const fnLook = (doc: Pick<DesignDocumentV2, 'settings'>, typeId: string, base: { windowFraction: number }) =>
  effectiveLook(styleSetupOf(doc.settings, 'function'), { kind: 'value', value: typeId }, base);

describe('reading and writing', () => {
  it('reads schema v2 and writes the same canonical text', () => {
    const read = expectOk(readDesignJson(exampleJson));
    const text = serializeDesignV2(read.doc);
    expect(text.startsWith('{\n  "schemaVersion": 2,')).toBe(true);
    const back = expectOk(readDesignJson(text));
    expect(back.doc).toEqual(read.doc);
    expect(serializeDesignV2(back.doc)).toBe(text);
  });

  it('round-trips v2-only data (size, id counters, connector style, appearance overrides)', () => {
    const raw = v2Raw();
    raw.edges[0]!.connectorStyle = 'deck';
    raw.settings = functionStyleSettings({ gallery: { windowFraction: 0.3 }, studio: { roof: 'none' } });
    const doc = expectOk(readDesign(raw)).doc;
    const back = expectOk(readDesignJson(serializeDesignV2(doc))).doc;
    expect(back).toEqual(doc);
    expect(back.nodes[0]!.size).toEqual([2, 3, 1]);
    expect(back.nodes[1]!.size).toEqual([1, 1, 1]); // default filled in on read
    expect(back.edges[0]!.connectorStyle).toBe('deck');
    expect([back.nextNodeId, back.nextEdgeId]).toEqual([3, 2]); // filled on read: largest id + 1
  });

  it('fills missing counters on read (largest id + 1, or 1 when empty) and always writes them after metadata', () => {
    const empty = expectOk(readDesign({ ...v2Raw(), nodes: [], edges: [], diagram: { positions: {} } })).doc;
    expect([empty.nextNodeId, empty.nextEdgeId]).toEqual([1, 1]);
    const raw = { ...v2Raw(), nextNodeId: 10, nextEdgeId: 4 };
    const doc = expectOk(readDesign(raw)).doc;
    expect([doc.nextNodeId, doc.nextEdgeId]).toEqual([10, 4]); // explicit counters are kept, never lowered
    const text = serializeDesignV2(doc);
    expect(text).toContain('"nextNodeId": 10');
    expect(text).toContain('"nextEdgeId": 4');
    expect(text.indexOf('"metadata"')).toBeLessThan(text.indexOf('"nextNodeId"'));
    expect(text.indexOf('"nextNodeId"')).toBeLessThan(text.indexOf('"nodes"'));
  });

  it('round-trips an imported façade with door / open bay variants in canonical order', () => {
    const raw = v2Raw();
    const facade = { open: { flip: true, assetId: 'facade-00000000000000bb' }, door: { assetId: 'facade-00000000000000aa' }, placement: 'stretch', assetId: 'facade-0123456789abcdef' };
    raw.settings = functionStyleSettings({ gallery: { facade } } as never);
    const doc = expectOk(readDesign(raw)).doc;
    const text = serializeDesignV2(doc);
    const back = expectOk(readDesignJson(text)).doc;
    expect(back).toEqual(doc);
    expect(JSON.stringify(functionLooks(back.settings).gallery!.facade)).toBe(
      '{"assetId":"facade-0123456789abcdef","placement":"stretch","door":{"assetId":"facade-00000000000000aa"},"open":{"assetId":"facade-00000000000000bb","flip":true}}',
    );
    expect(text.indexOf('"door"')).toBeLessThan(text.indexOf('"open"'));
  });

  it('reports invalid input with its issues', () => {
    const raw = v2Raw();
    raw.edges[0]!.target = 99;
    expectIssue(readDesign(raw), 'dangling-edge', ['edges', 0, 'target']);
  });

  it('rejects unknown versions and bad JSON without throwing', () => {
    const r = readDesign({ ...v2Raw(), schemaVersion: 3 });
    expectIssue(r, 'unsupported-schema-version', ['schemaVersion']);
    expectIssue(readDesignJson('{ nope'), 'invalid-json', []);
  });
});

describe('v2 validation is structural, not spatial feasibility', () => {
  it('accepts a relationship between rooms that do not touch', () => {
    const doc = expectOk(validateDocumentV2(v2Raw()));
    expect(roomContact(doc.nodes[0]!, doc.nodes[1]!)).toBeNull();
  });

  it('rejects overlapping multi-cell rooms', () => {
    const raw = v2Raw();
    raw.nodes[1]!.grid = [1, 2, 0]; // inside a's 2×3 footprint
    const i = expectIssue(validateDocumentV2(raw), 'room-overlap', ['nodes', 1, 'grid']);
    expect(i.message).toContain('"1"');
  });

  it('rejects non-positive or fractional sizes, self-edges and duplicate pairs', () => {
    const raw = v2Raw();
    raw.nodes[0]!.size = [0, 1, 1];
    expectIssue(validateDocumentV2(raw), 'schema', ['nodes', 0, 'size', 0]);
    raw.nodes[0]!.size = [1.5, 1, 1];
    expectIssue(validateDocumentV2(raw), 'schema', ['nodes', 0, 'size', 0]);
    const self = v2Raw();
    self.edges.push({ id: 2, source: 1, target: 1, kind: 'open' });
    expectIssue(validateDocumentV2(self), 'self-edge');
    const pair = v2Raw();
    pair.edges.push({ id: 2, source: 2, target: 1, kind: 'open' });
    expectIssue(validateDocumentV2(pair), 'duplicate-relationship');
  });

  it('ids are unique non-negative whole numbers below their counter', () => {
    for (const bad of ['a', 1.5, -1]) {
      const raw = v2Raw();
      raw.nodes[1]!.id = bad;
      expect(validateDocumentV2(raw).ok, String(bad)).toBe(false);
    }
    const dup = v2Raw();
    dup.nodes[1]!.id = 1;
    dup.nodes[1]!.grid = [9, 0, 0];
    dup.edges = [];
    dup.diagram = { positions: {} };
    expectIssue(validateDocumentV2(dup), 'duplicate-node-id');
    const dupEdge = v2Raw();
    dupEdge.nodes.push({ id: 3, grid: [9, 0, 0], typeId: 'studio' });
    dupEdge.edges.push({ id: 1, source: 1, target: 3, kind: 'open' });
    expectIssue(validateDocumentV2(dupEdge), 'duplicate-edge-id');
    expectIssue(validateDocumentV2({ ...v2Raw(), nextNodeId: 2 }), 'id-counter', ['nodes', 1, 'id']);
    expectIssue(validateDocumentV2({ ...v2Raw(), nextEdgeId: 1 }), 'id-counter', ['edges', 0, 'id']);
    expectOk(validateDocumentV2({ ...v2Raw(), nextNodeId: 3, nextEdgeId: 2 }));
  });

  it('rejects v1 edge kinds and out-of-range footprints', () => {
    const raw = v2Raw();
    raw.edges[0]!.kind = 'door';
    expectIssue(validateDocumentV2(raw), 'schema', ['edges', 0, 'kind']);
    const far = v2Raw();
    far.nodes[1]!.grid = [999, 0, 0];
    far.nodes[1]!.size = [3, 1, 1];
    expectIssue(validateDocumentV2(far), 'coordinate-out-of-range', ['nodes', 1, 'size', 0]);
  });

  it('rejects a schema-v1 document: v1 is retired and never read (P4)', () => {
    const v1 = { ...v2Raw(), schemaVersion: 1 }; // v1 refused
    expectIssue(validateDocumentV2(v1), 'unsupported-schema-version', ['schemaVersion']);
    expectIssue(readDesign(v1), 'unsupported-schema-version', ['schemaVersion']);
  });
});

describe('footprints (minimum-corner boxes)', () => {
  const box = (grid: [number, number, number], size: [number, number, number]) => ({ grid, size });

  it('enumerates 2×3×1 and 1×1×2 footprints deterministically', () => {
    expect(footprintCells(box([0, 0, 0], [2, 3, 1]))).toHaveLength(6);
    expect(footprintCells(box([4, 4, 0], [1, 1, 2]))).toEqual([
      [4, 4, 0],
      [4, 4, 1],
    ]);
  });

  it('finds every shared face of rooms of different sizes, seen from the first room', () => {
    const a = box([0, 0, 0], [2, 3, 1]);
    const b = box([2, 1, 0], [1, 1, 1]);
    expect(sharedFaces(a, b)).toEqual([{ cell: [1, 1, 0], direction: '+x' }]);
    expect(roomContact(a, b)).toBe('horizontal');
    expect(roomContact(box([0, 0, 0], [1, 1, 1]), box([0, 0, 1], [2, 2, 1]))).toBe('vertical');
    expect(roomContact(a, box([3, 0, 0], [1, 1, 1]))).toBeNull();
  });
});

describe('labels and appearance settings', () => {
  it('a room is labelled by its id and a relationship by its rooms (source → target)', () => {
    const doc = expectOk(validateDocumentV2(v2Raw()));
    expect(nodeLabel(doc.nodes[0]!)).toBe('1');
    expect(nodeLabel({ id: 12 })).toBe('12');
    expect(relationshipLabel(doc, 1)).toBe('1 → 2');
    expect(relationshipLabel(doc, 99)).toBe('99');
  });

  it('design overrides win; omitted values inherit the project default and the flat roof', () => {
    const raw = v2Raw();
    raw.settings = functionStyleSettings({ gallery: { windowFraction: 0.3 } });
    const doc: DesignDocumentV2 = expectOk(validateDocumentV2(raw));
    expect(fnLook(doc, 'gallery', { windowFraction: 0.7 })).toEqual({
      windowFraction: 0.3,
      windowLayout: 'repeat',
      walls: 'enclosed',
      roof: 'flat',
      facade: null,
      source: { windowFraction: 'card', windowLayout: 'base', walls: 'base', roof: 'base', facade: 'base' },
    });
    expect(fnLook(doc, 'studio', { windowFraction: 0.25 }).windowFraction).toBe(0.25);
    expect(fnLook(doc, 'constructor', { windowFraction: 0.1 }).windowFraction).toBe(0.1);
    expect(connectorStyleOf(doc.edges[0]!)).toBe('deck');
  });

  it('window layout is stored per type (default repeat), round-trips, and unknown layouts are rejected', () => {
    const raw = v2Raw();
    raw.settings = functionStyleSettings({ gallery: { windowLayout: 'stretch' } });
    const doc: DesignDocumentV2 = expectOk(validateDocumentV2(raw));
    expect(fnLook(doc, 'gallery', { windowFraction: 0.7 })).toMatchObject({
      windowFraction: 0.7,
      windowLayout: 'stretch',
      source: { windowFraction: 'base', windowLayout: 'card' },
    });
    expect(fnLook(doc, 'studio', { windowFraction: 0.25 }).windowLayout).toBe('repeat');
    const text = serializeDesignV2(doc);
    expect(text).toContain('"windowLayout": "stretch"');
    expect(functionLooks(expectOk(readDesignJson(text)).doc.settings)).toEqual({ gallery: { windowLayout: 'stretch' } });
    const bad = v2Raw();
    bad.settings = functionStyleSettings({ gallery: { windowLayout: 'scatter' as never } });
    expectIssue(validateDocumentV2(bad), 'schema', ['settings', 'styles', 'function', 'groups', 0, 'look', 'windowLayout']);
  });

  it('rejects window fractions outside [0, 1]', () => {
    const raw = v2Raw();
    raw.settings = functionStyleSettings({ gallery: { windowFraction: 1.2 } });
    expectIssue(validateDocumentV2(raw), 'schema', ['settings', 'styles', 'function', 'groups', 0, 'look', 'windowFraction']);
  });
});
