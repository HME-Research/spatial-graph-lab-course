import { defineGraphAlgorithm, neighbours } from '@student-api';

/** Generic graph analysis: how many relationships each room has. Changes nothing. */
export default defineGraphAlgorithm({
  id: 'count-connections',
  label: 'Count connections',
  run({ graph }) {
    const nodeValues: Record<string, number> = {};
    for (const node of graph.nodes) nodeValues[node.id] = neighbours(graph, node.id).length;
    const isolated = Object.values(nodeValues).filter((n) => n === 0).length;
    return { kind: 'analysis', summary: `${isolated} room(s) have no connection.`, nodeValues };
  },
});
