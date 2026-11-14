import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addNode,
  changeEdgeKind,
  moveNode,
  removeEdge,
  removeNode,
  setDiagramPosition,
} from './commands';
import { expectIssue, expectOk, threeRooms } from './test-fixtures';

describe('node commands', () => {
  it('addNode adds the node and position but never creates edges for adjacent cells', () => {
    const doc = threeRooms();
    const next = expectOk(addNode(doc, { id: 'd', grid: [1, 0, 1], typeId: 'studio' }, [200, 0]));
    expect(next.nodes.find((n) => n.id === 'd')?.grid).toEqual([1, 0, 1]);
    expect(next.diagram.positions.d).toEqual([200, 0]);
    expect(next.edges).toEqual(doc.edges); // d touches b and c but no edge is created
  });

  it('addNode rejects an occupied cell and a duplicate ID', () => {
    const doc = threeRooms();
    expectIssue(addNode(doc, { id: 'd', grid: [1, 0, 0], typeId: 'studio' }), 'duplicate-grid-cell');
    expectIssue(addNode(doc, { id: 'a', grid: [5, 5, 5], typeId: 'studio' }), 'duplicate-node-id');
  });

  it('removeNode removes incident edges and its diagram position', () => {
    const next = expectOk(removeNode(threeRooms(), 'a'));
    expect(next.nodes.map((n) => n.id)).toEqual(['b', 'c']);
    expect(next.edges).toEqual([]);
    expect(next.diagram.positions).not.toHaveProperty('a');
    expect(next.diagram.positions).toHaveProperty('b');
  });

  it('removeNode keeps edges not touching the node', () => {
    const next = expectOk(removeNode(threeRooms(), 'b'));
    expect(next.edges.map((e) => e.id)).toEqual(['ac']);
  });

  it('removeNode reports a missing node', () => {
    expectIssue(removeNode(threeRooms(), 'ghost'), 'not-found');
  });

  it('moveNode to a free cell keeping edges valid succeeds and leaves the diagram unchanged', () => {
    // b(1,0,0) has door to a(0,0,0); (0,-1,0) is also horizontally adjacent to a.
    const doc = threeRooms();
    const next = expectOk(moveNode(doc, 'b', [0, -1, 0]));
    expect(next.nodes.find((n) => n.id === 'b')?.grid).toEqual([0, -1, 0]);
    expect(next.diagram.positions).toEqual(doc.diagram.positions);
  });

  it('moveNode rejects a collision', () => {
    expectIssue(moveNode(threeRooms(), 'b', [0, 0, 1]), 'duplicate-grid-cell');
  });

  it('moveNode rejects a move that would break an incident edge', () => {
    expectIssue(moveNode(threeRooms(), 'b', [3, 0, 0]), 'invalid-edge-geometry', ['edges', 0, 'kind']);
  });

  it('setDiagramPosition changes only the diagram, never the spatial cell (acceptance B, data level)', () => {
    const doc = threeRooms();
    const next = expectOk(setDiagramPosition(doc, 'a', [999, -5]));
    expect(next.diagram.positions.a).toEqual([999, -5]);
    expect(next.nodes).toEqual(doc.nodes);
    expect(next.edges).toEqual(doc.edges);
  });

  it('setDiagramPosition reports a missing node', () => {
    expectIssue(setDiagramPosition(threeRooms(), 'ghost', [0, 0]), 'not-found');
  });
});

describe('edge commands', () => {
  it('addEdge adds a valid typed relationship', () => {
    const base = expectOk(addNode(threeRooms(), { id: 'd', grid: [0, 1, 0], typeId: 'storage' }));
    const next = expectOk(addEdge(base, { id: 'ad', source: 'a', target: 'd', kind: 'open' }));
    expect(next.edges.at(-1)).toEqual({ id: 'ad', source: 'a', target: 'd', kind: 'open', attributes: {} });
  });

  it('addEdge rejects a duplicate pair, a self-edge, a dangling target and invalid geometry', () => {
    const doc = threeRooms();
    expectIssue(addEdge(doc, { id: 'ba', source: 'b', target: 'a', kind: 'open' }), 'duplicate-relationship');
    expectIssue(addEdge(doc, { id: 'aa', source: 'a', target: 'a', kind: 'door' }), 'self-edge');
    expectIssue(addEdge(doc, { id: 'ax', source: 'a', target: 'x', kind: 'door' }), 'dangling-edge');
    expectIssue(addEdge(doc, { id: 'bc', source: 'b', target: 'c', kind: 'door' }), 'invalid-edge-geometry');
  });

  it('removeEdge removes only that edge and keeps both nodes', () => {
    const doc = threeRooms();
    const next = expectOk(removeEdge(doc, 'ab'));
    expect(next.edges.map((e) => e.id)).toEqual(['ac']);
    expect(next.nodes).toEqual(doc.nodes);
  });

  it('changeEdgeKind switches within the same adjacency category', () => {
    const next = expectOk(changeEdgeKind(threeRooms(), 'ab', 'open'));
    expect(next.edges.find((e) => e.id === 'ab')?.kind).toBe('open');
    expectOk(changeEdgeKind(threeRooms(), 'ac', 'vertical-access'));
  });

  it('changeEdgeKind rejects a kind that does not match the adjacency', () => {
    expectIssue(changeEdgeKind(threeRooms(), 'ab', 'atrium'), 'invalid-edge-geometry');
    expectIssue(changeEdgeKind(threeRooms(), 'ac', 'door'), 'invalid-edge-geometry');
  });

  it('edge commands report missing edges', () => {
    expectIssue(removeEdge(threeRooms(), 'nope'), 'not-found');
    expectIssue(changeEdgeKind(threeRooms(), 'nope', 'door'), 'not-found');
  });
});

describe('immutability', () => {
  it('no command mutates its input document', () => {
    const doc = threeRooms();
    const snapshot = structuredClone(doc);
    addNode(doc, { id: 'd', grid: [2, 0, 0], typeId: 'studio' }, [1, 1]);
    removeNode(doc, 'a');
    moveNode(doc, 'b', [0, -1, 0]);
    setDiagramPosition(doc, 'a', [5, 5]);
    addEdge(doc, { id: 'x', source: 'b', target: 'c', kind: 'door' });
    removeEdge(doc, 'ab');
    changeEdgeKind(doc, 'ab', 'open');
    expect(doc).toEqual(snapshot);
  });
});
