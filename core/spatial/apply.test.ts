import { describe, expect, it } from 'vitest';
import { applyGraphCommand } from './apply';
import { setNodeAttributes, setNodeType } from './commands';
import { expectIssue, expectOk, threeRooms } from './test-fixtures';

describe('setNodeType / setNodeAttributes', () => {
  it('setNodeType changes only the type', () => {
    const doc = threeRooms();
    const next = expectOk(setNodeType(doc, 'a', 'storage'));
    const a = next.nodes.find((n) => n.id === 'a')!;
    expect(a.typeId).toBe('storage');
    expect(a.grid).toEqual([0, 0, 0]);
    expect(next.edges).toEqual(doc.edges);
    expect(next.diagram).toEqual(doc.diagram);
    expect(doc.nodes.find((n) => n.id === 'a')!.typeId).toBe('gallery'); // input not mutated
  });

  it('setNodeType rejects a malformed type and a missing node', () => {
    expectIssue(setNodeType(threeRooms(), 'a', 'Bad Type'), 'schema', ['nodes', 0, 'typeId']);
    expectIssue(setNodeType(threeRooms(), 'zzz', 'gallery'), 'not-found');
  });

  it('setNodeAttributes replaces the record and rejects non-primitive values', () => {
    const next = expectOk(setNodeAttributes(threeRooms(), 'b', { area: 9, public: true }));
    expect(next.nodes.find((n) => n.id === 'b')!.attributes).toEqual({ area: 9, public: true });
    const bad = { nested: { x: 1 } } as unknown as Record<string, number>;
    expectIssue(setNodeAttributes(threeRooms(), 'b', bad), 'schema');
  });
});

describe('applyGraphCommand', () => {
  it('dispatches each command type to the matching pure command', () => {
    let doc = threeRooms();
    doc = expectOk(applyGraphCommand(doc, { type: 'add-node', node: { id: 'd', grid: [1, 0, 1], typeId: 'studio' }, diagramPosition: [1, 2] }));
    doc = expectOk(applyGraphCommand(doc, { type: 'add-edge', edge: { id: 'cd', source: 'c', target: 'd', kind: 'door' } }));
    doc = expectOk(applyGraphCommand(doc, { type: 'change-edge-kind', edgeId: 'cd', kind: 'open' }));
    doc = expectOk(applyGraphCommand(doc, { type: 'set-diagram-position', nodeId: 'd', position: [5, 6] }));
    doc = expectOk(applyGraphCommand(doc, { type: 'set-node-type', nodeId: 'd', typeId: 'gallery' }));
    doc = expectOk(applyGraphCommand(doc, { type: 'set-node-attributes', nodeId: 'd', attributes: { k: 'v' } }));
    doc = expectOk(applyGraphCommand(doc, { type: 'remove-edge', edgeId: 'cd' }));
    doc = expectOk(applyGraphCommand(doc, { type: 'move-node', nodeId: 'd', grid: [2, 0, 1] }));
    const d = doc.nodes.find((n) => n.id === 'd')!;
    expect(d).toEqual({ id: 'd', grid: [2, 0, 1], typeId: 'gallery', attributes: { k: 'v' } });
    expect(doc.diagram.positions.d).toEqual([5, 6]);
    doc = expectOk(applyGraphCommand(doc, { type: 'remove-node', nodeId: 'd' }));
    expect(doc.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns readable issues and leaves the input untouched on rejection', () => {
    const doc = threeRooms();
    const before = JSON.stringify(doc);
    const result = applyGraphCommand(doc, { type: 'add-edge', edge: { id: 'bc', source: 'b', target: 'c', kind: 'door' } });
    expectIssue(result, 'invalid-edge-geometry');
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('set-diagram-position never changes the spatial cell (acceptance B)', () => {
    const next = expectOk(applyGraphCommand(threeRooms(), { type: 'set-diagram-position', nodeId: 'a', position: [999, -5] }));
    expect(next.nodes.find((n) => n.id === 'a')!.grid).toEqual([0, 0, 0]);
  });
});
