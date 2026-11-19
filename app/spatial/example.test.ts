import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { serializeDesignV2, validateDocumentV2 } from '@app/document';
import exampleJson from '../document/examples/house.json';
import { resolveRelationships } from './resolve';

/**
 * The built-in example (P4): a small graph-only house, the "before" picture for teaching. Only
 * ids, Functions, geometry and relationships; no toolkit and no custom attributes.
 */
describe('built-in example: house, graph only', () => {
  const doc = expectOk(validateDocumentV2(exampleJson));

  it('loads and validates as schema v2', () => {
    expect(doc.schemaVersion).toBe(2);
    expect(doc.nodes).toHaveLength(7);
    expect(new Set(doc.nodes.map((n) => n.grid[2]))).toEqual(new Set([0, 1]));
  });

  it('uses the house Functions and no custom attributes', () => {
    expect([...new Set(doc.nodes.map((n) => n.typeId))].sort()).toEqual(['bath', 'bedroom', 'circulation', 'entrance', 'kitchen', 'living']);
    expect(doc.nodes.every((n) => Object.keys(n.attributes).length === 0)).toBe(true);
    expect(doc.edges.every((e) => Object.keys(e.attributes).length === 0)).toBe(true);
  });

  it('every relationship joins rooms that touch (built directly, no connectors)', () => {
    const resolution = resolveRelationships(doc);
    expect(doc.edges.map((e) => resolution.byEdge.get(e.id)!.status)).toEqual(doc.edges.map(() => 'direct'));
  });

  it('the file is in canonical form (what Export writes)', () => {
    expect(serializeDesignV2(doc)).toBe(serializeDesignV2(expectOk(validateDocumentV2(JSON.parse(serializeDesignV2(doc))))));
  });
});
