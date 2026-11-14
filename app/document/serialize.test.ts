import { describe, expect, it } from 'vitest';
import example from './examples/two-storey-example.json';
import { isHorizontalFaceAdjacent } from './adjacency';
import { parseDesignJson, serializeDesign } from './serialize';
import { expectIssue, expectOk, threeRooms } from './test-fixtures';
import { validateDocument } from './validate';

describe('serialisation round trip (acceptance A)', () => {
  it('retains IDs, grid and diagram coordinates, node types, typed edges and attributes', () => {
    const doc = threeRooms();
    doc.nodes[0]!.attributes = { area: 9, label: 'Hall', lit: true, note: null };
    const back = expectOk(parseDesignJson(serializeDesign(doc)));
    expect(back).toEqual(doc);
  });

  it('is deterministic: serialise → parse → serialise gives identical text', () => {
    const text = serializeDesign(threeRooms());
    expect(serializeDesign(expectOk(parseDesignJson(text)))).toBe(text);
  });

  it('writes schemaVersion first and ends with a newline', () => {
    const text = serializeDesign(threeRooms());
    expect(text.startsWith('{\n  "schemaVersion": 1,')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });
});

describe('parseDesignJson (acceptance I, data level)', () => {
  it('returns an invalid-json issue instead of throwing on malformed text', () => {
    const i = expectIssue(parseDesignJson('{ "schemaVersion": 1, '), 'invalid-json', []);
    expect(i.message).toMatch(/not valid JSON/);
  });

  it('returns located issues for structurally valid JSON that breaks graph rules', () => {
    const raw = JSON.parse(serializeDesign(threeRooms()));
    raw.edges[0].target = 'ghost';
    expectIssue(parseDesignJson(JSON.stringify(raw)), 'dangling-edge', ['edges', 0, 'target']);
  });
});

describe('app/document/examples/two-storey-example.json', () => {
  const doc = expectOk(validateDocument(example, { knownTypeIds: ['gallery', 'studio', 'storage'] }));

  it('validates and spans two storeys', () => {
    expect(new Set(doc.nodes.map((n) => n.grid[2]))).toEqual(new Set([0, 1]));
  });

  it('uses every edge kind', () => {
    expect(new Set(doc.edges.map((e) => e.kind))).toEqual(new Set(['door', 'open', 'atrium', 'vertical-access']));
  });

  it('has at least one adjacent pair without an edge (future solid wall)', () => {
    const connected = new Set(doc.edges.flatMap((e) => [`${e.source}|${e.target}`, `${e.target}|${e.source}`]));
    const unconnectedNeighbours = doc.nodes.flatMap((a) =>
      doc.nodes.filter((b) => a.id < b.id && isHorizontalFaceAdjacent(a.grid, b.grid) && !connected.has(`${a.id}|${b.id}`)),
    );
    expect(unconnectedNeighbours.length).toBeGreaterThan(0);
  });

  it('has a diagram position for every node, independent of the grid', () => {
    for (const n of doc.nodes) expect(doc.diagram.positions[n.id]).toBeDefined();
  });
});
