import { describe, expect, it } from 'vitest';
import { formatIssuePath } from './errors';
import { expectIssue, expectOk, threeRoomsRaw } from './test-fixtures';
import { validateDocument } from './validate';

describe('validateDocument: valid input', () => {
  it('accepts the architecture example', () => {
    const doc = expectOk(validateDocument(threeRoomsRaw()));
    expect(doc.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('defaults missing attributes and diagram', () => {
    const raw = threeRoomsRaw();
    delete raw.nodes[0]!.attributes;
    delete (raw as Record<string, unknown>).diagram;
    const doc = expectOk(validateDocument(raw));
    expect(doc.nodes[0]!.attributes).toEqual({});
    expect(doc.diagram.positions).toEqual({});
  });

  it('allows nodes without a diagram position', () => {
    const raw = threeRoomsRaw();
    delete raw.diagram.positions.c;
    expectOk(validateDocument(raw));
  });

  it('accepts adjacent nodes with no edge (no implicit relationship)', () => {
    const raw = threeRoomsRaw();
    raw.edges = [];
    const doc = expectOk(validateDocument(raw));
    expect(doc.edges).toEqual([]);
  });

  it('does not mutate its input', () => {
    const raw = threeRoomsRaw();
    const before = JSON.stringify(raw);
    validateDocument(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });
});

describe('validateDocument: structure (strict Zod schema)', () => {
  it('rejects non-objects', () => {
    expectIssue(validateDocument(null), 'schema', []);
    expectIssue(validateDocument([]), 'schema', []);
  });

  it('rejects unsupported schemaVersion with a readable message', () => {
    const raw = threeRoomsRaw();
    raw.schemaVersion = 2;
    const i = expectIssue(validateDocument(raw), 'unsupported-schema-version', ['schemaVersion']);
    expect(i.message).toContain('unsupported schemaVersion 2');
  });

  it('rejects missing schemaVersion', () => {
    const raw = threeRoomsRaw();
    delete raw.schemaVersion;
    expectIssue(validateDocument(raw), 'schema', ['schemaVersion']);
  });

  it('rejects unknown keys (typos are not silently dropped)', () => {
    const raw = threeRoomsRaw();
    raw.nodes[0]!.typID = 'gallery';
    expectIssue(validateDocument(raw), 'schema', ['nodes', 0]);
  });

  it('rejects non-integer grid coordinates', () => {
    const raw = threeRoomsRaw();
    raw.nodes[1]!.grid = [1.5, 0, 0];
    expectIssue(validateDocument(raw), 'schema', ['nodes', 1, 'grid', 0]);
  });

  it('rejects grids that are not three numbers', () => {
    const raw = threeRoomsRaw();
    raw.nodes[1]!.grid = [1, 0];
    expectIssue(validateDocument(raw), 'schema', ['nodes', 1, 'grid']);
  });

  it('rejects an unknown edge kind', () => {
    const raw = threeRoomsRaw();
    raw.edges[0]!.kind = 'corridor';
    const i = expectIssue(validateDocument(raw), 'schema', ['edges', 0, 'kind']);
    expect(i.message).toContain('door');
  });

  it('rejects non-primitive attribute values', () => {
    const raw = threeRoomsRaw();
    raw.nodes[0]!.attributes = { nested: { a: 1 } };
    expectIssue(validateDocument(raw), 'schema', ['nodes', 0, 'attributes', 'nested']);
  });

  it('rejects malformed typeId', () => {
    const raw = threeRoomsRaw();
    raw.nodes[0]!.typeId = 'Gallery Room';
    expectIssue(validateDocument(raw), 'schema', ['nodes', 0, 'typeId']);
  });

  it('rejects malformed diagram positions', () => {
    const raw = threeRoomsRaw();
    raw.diagram.positions.a = [1, 2, 3];
    expectIssue(validateDocument(raw), 'schema', ['diagram', 'positions', 'a']);
  });
});

describe('validateDocument: graph invariants', () => {
  it('rejects duplicate node IDs', () => {
    const raw = threeRoomsRaw();
    raw.nodes[2]!.id = 'a';
    raw.edges = [];
    const i = expectIssue(validateDocument(raw), 'duplicate-node-id', ['nodes', 2, 'id']);
    expect(i.message).toContain('nodes[0]');
  });

  it('rejects duplicate grid cells', () => {
    const raw = threeRoomsRaw();
    raw.nodes[1]!.grid = [0, 0, 0];
    const i = expectIssue(validateDocument(raw), 'duplicate-grid-cell', ['nodes', 1, 'grid']);
    expect(i.message).toContain('"a"');
  });

  it('rejects duplicate edge IDs', () => {
    const raw = threeRoomsRaw();
    raw.edges[1]!.id = 'ab';
    expectIssue(validateDocument(raw), 'duplicate-edge-id', ['edges', 1, 'id']);
  });

  it('rejects dangling source and target', () => {
    const raw = threeRoomsRaw();
    raw.edges[0]!.source = 'ghost';
    raw.edges[1]!.target = 'phantom';
    const result = validateDocument(raw);
    expectIssue(result, 'dangling-edge', ['edges', 0, 'source']);
    expectIssue(result, 'dangling-edge', ['edges', 1, 'target']);
  });

  it('rejects self-edges', () => {
    const raw = threeRoomsRaw();
    raw.edges[0]!.target = 'a';
    expectIssue(validateDocument(raw), 'self-edge', ['edges', 0]);
  });

  it('rejects a second relationship for the same unordered pair, either direction', () => {
    const raw = threeRoomsRaw();
    raw.edges.push({ id: 'ba', source: 'b', target: 'a', kind: 'open', attributes: {} });
    const i = expectIssue(validateDocument(raw), 'duplicate-relationship', ['edges', 2]);
    expect(i.message).toContain('"ab"');
  });

  it('rejects a door across storeys', () => {
    const raw = threeRoomsRaw();
    raw.edges[1]!.kind = 'door'; // a(0,0,0)–c(0,0,1)
    const i = expectIssue(validateDocument(raw), 'invalid-edge-geometry', ['edges', 1, 'kind']);
    expect(i.message).toContain('horizontal face adjacency');
  });

  it('rejects an atrium between horizontal neighbours', () => {
    const raw = threeRoomsRaw();
    raw.edges[0]!.kind = 'atrium'; // a(0,0,0)–b(1,0,0)
    expectIssue(validateDocument(raw), 'invalid-edge-geometry', ['edges', 0, 'kind']);
  });

  it('rejects edges between non-adjacent cells (acceptance G: (0,0,0)–(1,0,1))', () => {
    const raw = threeRoomsRaw();
    raw.nodes[2]!.grid = [1, 0, 1];
    expectIssue(validateDocument(raw), 'invalid-edge-geometry', ['edges', 1, 'kind']);
  });

  it('rejects diagram positions for unknown nodes', () => {
    const raw = threeRoomsRaw();
    raw.diagram.positions.ghost = [0, 0];
    expectIssue(validateDocument(raw), 'unknown-node-position', ['diagram', 'positions', 'ghost']);
  });

  it('enforces configurable limits', () => {
    expectIssue(validateDocument(threeRoomsRaw(), { limits: { maxNodes: 2 } }), 'too-many-nodes', ['nodes']);
    const raw = threeRoomsRaw();
    raw.nodes[1]!.grid = [1, 0, 0];
    expectIssue(
      validateDocument(raw, { limits: { maxAbsCoordinate: 0 } }),
      'coordinate-out-of-range',
      ['nodes', 1, 'grid', 0],
    );
  });

  it('checks typeId only when a registry is supplied', () => {
    expectOk(validateDocument(threeRoomsRaw()));
    expectOk(validateDocument(threeRoomsRaw(), { knownTypeIds: ['gallery', 'studio'] }));
    expectIssue(
      validateDocument(threeRoomsRaw(), { knownTypeIds: new Set(['gallery']) }),
      'unknown-node-type',
      ['nodes', 1, 'typeId'],
    );
  });

  it('reports all issues, not just the first', () => {
    const raw = threeRoomsRaw();
    raw.nodes[1]!.grid = [0, 0, 0];
    raw.edges[1]!.source = 'ghost';
    const result = validateDocument(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe('formatIssuePath', () => {
  it('formats readable paths', () => {
    expect(formatIssuePath([])).toBe('(document)');
    expect(formatIssuePath(['edges', 1, 'kind'])).toBe('edges[1].kind');
    expect(formatIssuePath(['diagram', 'positions', 'studio-upper'])).toBe('diagram.positions["studio-upper"]');
  });
});
