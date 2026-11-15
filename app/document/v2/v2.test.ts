import { describe, expect, it } from 'vitest';
import exampleJson from '../examples/two-storey-example.json?raw';
import { isFaceAdjacent } from '../adjacency';
import { parseDesignJson, serializeDesign } from '../serialize';
import { expectIssue, expectOk, threeRoomsRaw } from '../test-fixtures';
import {
  effectiveTypeAppearance,
  footprintCells,
  migrateV1toV2,
  nextDisplayId,
  nodeLabel,
  readDesign,
  readDesignJson,
  roomContact,
  serializeDesignV2,
  sharedFaces,
  v1KindFor,
  validateDocumentV2,
  connectorStyleOf,
  type DesignDocumentV2,
} from './index';
import { v2Raw } from './test-fixtures';

describe('v1 → v2 migration (frozen mapping)', () => {
  const v1 = expectOk(parseDesignJson(exampleJson));
  const v2 = migrateV1toV2(v1);

  it('maps all four v1 edge kinds explicitly', () => {
    const kinds = Object.fromEntries(v1.edges.map((e, i) => [e.kind, v2.edges[i]!.kind]));
    expect(kinds).toEqual({ door: 'access', 'vertical-access': 'access', open: 'open', atrium: 'open' });
  });

  it('keeps ids, cells, types, attributes and diagram positions; sizes are 1×1×1', () => {
    expect(v2.nodes.map((n) => [n.id, n.grid, n.typeId, n.attributes])).toEqual(
      v1.nodes.map((n) => [n.id, n.grid, n.typeId, n.attributes]),
    );
    expect(v2.nodes.every((n) => n.size.join() === '1,1,1')).toBe(true);
    expect(v2.edges.map((e) => [e.id, e.source, e.target, e.attributes])).toEqual(
      v1.edges.map((e) => [e.id, e.source, e.target, e.attributes]),
    );
    expect(v2.diagram).toEqual(v1.diagram);
    expect(v2.metadata).toEqual(v1.metadata);
    expect(v2.settings).toEqual({ typeAppearance: {} });
    expect(v2.edges.some((e) => 'connectorStyle' in e)).toBe(false);
  });

  it('assigns display ids once, from the v1 order', () => {
    expect(v2.nodes.map((n) => n.displayId)).toEqual(['01', '02', '03', '04', '05', '06']);
  });

  it('loses no direct-contact semantics: v1KindFor recovers every original kind', () => {
    for (const [i, e] of v1.edges.entries()) {
      const a = v2.nodes.find((n) => n.id === e.source)!;
      const b = v2.nodes.find((n) => n.id === e.target)!;
      expect(isFaceAdjacent(a.grid, b.grid)).toBe(true);
      expect(v1KindFor(v2.edges[i]!.kind, roomContact(a, b))).toBe(e.kind);
    }
  });

  it('is pure and deterministic', () => {
    const before = serializeDesign(v1);
    expect(serializeDesignV2(migrateV1toV2(v1))).toBe(serializeDesignV2(v2));
    expect(serializeDesign(v1)).toBe(before);
  });

  it('produces a valid v2 document', () => {
    expect(expectOk(validateDocumentV2(v2))).toEqual(v2);
  });
});

describe('reading and writing (compatibility policy)', () => {
  it('reads v1 (migrated) and v2, and always writes v2', () => {
    const fromV1 = expectOk(readDesignJson(exampleJson));
    expect(fromV1.sourceVersion).toBe(1);
    const text = serializeDesignV2(fromV1.doc);
    expect(text.startsWith('{\n  "schemaVersion": 2,')).toBe(true);
    const back = expectOk(readDesignJson(text));
    expect(back.sourceVersion).toBe(2);
    expect(back.doc).toEqual(fromV1.doc);
    expect(serializeDesignV2(back.doc)).toBe(text);
  });

  it('round-trips v2-only data (size, displayId, connector style, appearance overrides)', () => {
    const raw = v2Raw();
    raw.edges[0]!.connectorStyle = 'deck';
    raw.settings = { typeAppearance: { gallery: { windowFraction: 0.3 }, studio: { roof: 'none' } } };
    const doc = expectOk(readDesign(raw)).doc;
    const back = expectOk(readDesignJson(serializeDesignV2(doc))).doc;
    expect(back).toEqual(doc);
    expect(back.nodes[0]!.size).toEqual([2, 3, 1]);
    expect(back.nodes[1]!.size).toEqual([1, 1, 1]); // default filled in on read
    expect(back.edges[0]!.connectorStyle).toBe('deck');
  });

  it('reports invalid v1 input with the unchanged v1 issues', () => {
    const raw = threeRoomsRaw();
    raw.edges[0]!.target = 'ghost';
    expectIssue(readDesign(raw), 'dangling-edge', ['edges', 0, 'target']);
  });

  it('rejects unknown versions and bad JSON without throwing', () => {
    const r = readDesign({ ...v2Raw(), schemaVersion: 3 });
    expectIssue(r, 'unsupported-schema-version', ['schemaVersion']);
    expectIssue(readDesignJson('{ nope'), 'invalid-json', []);
  });

  it('leaves the v1 parser strictly v1 (golden behaviour)', () => {
    expectIssue(parseDesignJson(JSON.stringify(v2Raw())), 'unsupported-schema-version', ['schemaVersion']);
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
    expect(i.message).toContain('"a"');
  });

  it('rejects non-positive or fractional sizes, duplicate display ids, self-edges and duplicate pairs', () => {
    const raw = v2Raw();
    raw.nodes[0]!.size = [0, 1, 1];
    expectIssue(validateDocumentV2(raw), 'schema', ['nodes', 0, 'size', 0]);
    raw.nodes[0]!.size = [1.5, 1, 1];
    expectIssue(validateDocumentV2(raw), 'schema', ['nodes', 0, 'size', 0]);
    const dup = v2Raw();
    dup.nodes[1]!.displayId = '01';
    expectIssue(validateDocumentV2(dup), 'duplicate-display-id', ['nodes', 1, 'displayId']);
    const self = v2Raw();
    self.edges.push({ id: 'aa', source: 'a', target: 'a', kind: 'open' });
    expectIssue(validateDocumentV2(self), 'self-edge');
    const pair = v2Raw();
    pair.edges.push({ id: 'ba', source: 'b', target: 'a', kind: 'open' });
    expectIssue(validateDocumentV2(pair), 'duplicate-relationship');
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

  it('rejects a v1 document (must go through readDesign)', () => {
    expectIssue(validateDocumentV2(threeRoomsRaw()), 'unsupported-schema-version', ['schemaVersion']);
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

describe('display ids and appearance settings', () => {
  it('nextDisplayId continues after the largest numeric id; labels fall back to the permanent id', () => {
    expect(nextDisplayId({ nodes: [] })).toBe('01');
    const doc = expectOk(validateDocumentV2(v2Raw()));
    expect(nextDisplayId(doc)).toBe('03');
    expect(nodeLabel({ id: 'legacy-room' })).toBe('legacy-room');
    expect(nodeLabel(doc.nodes[0]!)).toBe('01');
  });

  it('design overrides win; omitted values inherit the project default and the flat roof', () => {
    const raw = v2Raw();
    raw.settings = { typeAppearance: { gallery: { windowFraction: 0.3 } } };
    const doc: DesignDocumentV2 = expectOk(validateDocumentV2(raw));
    expect(effectiveTypeAppearance(doc, 'gallery', { windowFraction: 0.7 })).toEqual({
      windowFraction: 0.3,
      roof: 'flat',
      source: { windowFraction: 'design', roof: 'default' },
    });
    expect(effectiveTypeAppearance(doc, 'studio', { windowFraction: 0.25 }).windowFraction).toBe(0.25);
    expect(effectiveTypeAppearance(doc, 'constructor', { windowFraction: 0.1 }).windowFraction).toBe(0.1);
    expect(connectorStyleOf(doc.edges[0]!)).toBe('enclosed');
  });

  it('rejects window fractions outside [0, 1]', () => {
    const raw = v2Raw();
    raw.settings = { typeAppearance: { gallery: { windowFraction: 1.2 } } };
    expectIssue(validateDocumentV2(raw), 'schema', ['settings', 'typeAppearance', 'gallery', 'windowFraction']);
  });
});
