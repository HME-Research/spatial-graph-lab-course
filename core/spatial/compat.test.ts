import { describe, expect, it } from 'vitest';
import exampleJson from '../../student/designs/two-storey-example.json?raw';
import { applyGraphCommand, type GraphCommand } from './apply';
import { parseDesignJson, serializeDesign } from './serialize';
import { threeRooms, threeRoomsRaw } from './test-fixtures';
import { validateDocument } from './validate';

/**
 * Golden characterisation of the v1 spatial document behaviour. The snapshots were recorded
 * BEFORE the generic graph core was extracted (Stage 1) and must not change: they pin exact
 * issue codes, paths, messages and order, command results and serialised text.
 */

const outcome = (r: ReturnType<typeof validateDocument>) => (r.ok ? serializeDesign(r.value) : r.issues);

describe('v1 spatial document compatibility (golden)', () => {
  it('reports every invariant violation with unchanged codes, paths, messages and order', () => {
    const raw = threeRoomsRaw();
    raw.nodes.push(
      { id: 'a', grid: [5, 0, 0], typeId: 'gallery' }, // duplicate node id
      { id: 'd', grid: [0, 0, 0], typeId: 'nope' }, // duplicate cell + unknown type
      { id: 'e', grid: [2000, 0, -2000], typeId: 'studio' }, // out of range (two axes)
    );
    raw.edges.push(
      { id: 'ab', source: 'b', target: 'c', kind: 'open' }, // duplicate edge id + invalid geometry
      { id: 'self', source: 'b', target: 'b', kind: 'door' }, // self-edge
      { id: 'ghost', source: 'x', target: 'y', kind: 'door' }, // dangling both ends
      { id: 'ba', source: 'b', target: 'a', kind: 'open' }, // duplicate relationship (reversed)
      { id: 'ghost2', source: 'x', target: 'y', kind: 'atrium' }, // duplicate relationship, dangling
    );
    raw.diagram.positions['zzz'] = [0, 0];
    const r = validateDocument(raw, { knownTypeIds: ['gallery', 'studio'], limits: { maxNodes: 4 } });
    expect(outcome(r)).toMatchSnapshot();
  });

  it('reports schema and version failures unchanged', () => {
    expect(outcome(validateDocument({ ...threeRoomsRaw(), schemaVersion: 2 }))).toMatchSnapshot();
    expect(outcome(validateDocument({ ...threeRoomsRaw(), extra: true }))).toMatchSnapshot();
    expect(outcome(parseDesignJson('{ nope'))).toMatchSnapshot();
  });

  const commands: Array<[string, GraphCommand]> = [
    ['add-node ok', { type: 'add-node', node: { id: 'd', grid: [1, 0, 1], typeId: 'cafe' }, diagramPosition: [5, 6] }],
    ['add-node dup id + cell', { type: 'add-node', node: { id: 'a', grid: [1, 0, 0], typeId: 'cafe' } }],
    ['remove-node a', { type: 'remove-node', nodeId: 'a' }],
    ['remove-node missing', { type: 'remove-node', nodeId: 'zz' }],
    ['move-node ok', { type: 'move-node', nodeId: 'b', grid: [0, -1, 0] }],
    ['move-node collision', { type: 'move-node', nodeId: 'b', grid: [0, 0, 1] }],
    ['move-node missing', { type: 'move-node', nodeId: 'zz', grid: [9, 9, 9] }],
    ['set-node-type', { type: 'set-node-type', nodeId: 'a', typeId: 'library' }],
    ['set-node-type bad', { type: 'set-node-type', nodeId: 'a', typeId: 'Bad Type' }],
    ['set-node-attributes', { type: 'set-node-attributes', nodeId: 'a', attributes: { area: 9, lit: true } }],
    ['set-diagram-position', { type: 'set-diagram-position', nodeId: 'c', position: [1.5, -2] }],
    ['set-diagram-position missing', { type: 'set-diagram-position', nodeId: 'zz', position: [0, 0] }],
    ['add-edge bad geometry', { type: 'add-edge', edge: { id: 'bc-x', source: 'b', target: 'c', kind: 'door' } }],
    ['add-edge parallel', { type: 'add-edge', edge: { id: 'ba', source: 'b', target: 'a', kind: 'open' } }],
    ['add-edge dangling', { type: 'add-edge', edge: { id: 'ax', source: 'a', target: 'x', kind: 'door' } }],
    ['add-edge self', { type: 'add-edge', edge: { id: 'aa', source: 'a', target: 'a', kind: 'door' } }],
    ['add-edge dup id', { type: 'add-edge', edge: { id: 'ab', source: 'b', target: 'c', kind: 'atrium' } }],
    ['remove-edge', { type: 'remove-edge', edgeId: 'ab' }],
    ['remove-edge missing', { type: 'remove-edge', edgeId: 'zz' }],
    ['change-edge-kind ok', { type: 'change-edge-kind', edgeId: 'ab', kind: 'open' }],
    ['change-edge-kind bad', { type: 'change-edge-kind', edgeId: 'ac', kind: 'door' }],
    ['change-edge-kind missing', { type: 'change-edge-kind', edgeId: 'zz', kind: 'door' }],
  ];

  it.each(commands)('command %s gives an unchanged result', (_name, command) => {
    const doc = threeRooms();
    const before = serializeDesign(doc);
    expect(outcome(applyGraphCommand(doc, command))).toMatchSnapshot();
    expect(serializeDesign(doc)).toBe(before); // input never mutated
  });

  it('round-trips the shipped example design to identical canonical text', () => {
    const first = parseDesignJson(exampleJson);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const text = serializeDesign(first.value);
    expect(text).toMatchSnapshot();
    const second = parseDesignJson(text);
    expect(second.ok && serializeDesign(second.value)).toBe(text);
  });
});
