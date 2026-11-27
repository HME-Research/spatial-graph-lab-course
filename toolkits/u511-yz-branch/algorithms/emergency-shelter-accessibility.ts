import { defineDesignAnalysis } from '@student-api';
import { connections } from '../lib/connections';

// Search from every shelter at once to find each residence's shortest connection count.
export default defineDesignAnalysis({
  id: 'emergency-shelter-accessibility',
  label: 'Emergency Shelter Accessibility',
  description: 'Minimum graph connections to any shelter. Highlights unreachable residences. This measures connectivity, not wheelchair access or available shelter places.',
  inputs: [],
  uses: { functions: ['residential', 'emergency-shelter'] },
  run({ design }) {
    // Explain an empty graph before starting the search.
    if (design.nodes.length === 0) return { kind: 'analysis', text: 'Empty graph: add residences and shelters.' };
    const adjacent = connections(design);
    const distances = new Map<number, number>();
    const queue: number[] = [];
    for (const node of design.nodes) {
      if (node.function !== 'emergency-shelter') continue;
      distances.set(node.id, 0);
      queue.push(node.id);
    }
    const shelterCount = queue.length;

    // Breadth-first search visits each node once, in order of distance from shelters.
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head]!;
      for (const next of adjacent.get(id) ?? []) {
        if (distances.has(next)) continue;
        distances.set(next, distances.get(id)! + 1);
        queue.push(next);
      }
    }

    // Colour residences by exact distance category; highlight every unreachable residence.
    const nodeValues: Record<number, string> = {};
    const unreachable: number[] = [];
    let residences = 0;
    for (const node of design.nodes) {
      if (node.function !== 'residential') continue;
      residences++;
      const distance = distances.get(node.id);
      nodeValues[node.id] = distance === undefined ? 'Unreachable' : `${distance} connection(s)`;
      if (distance === undefined) unreachable.push(node.id);
    }
    const note = shelterCount === 0 ? 'No shelters in this graph. ' : '';
    return {
      kind: 'analysis',
      text: `${note}${residences} residence(s); ${unreachable.length} unreachable. Colours show minimum connections, not travel time, wheelchair access or capacity.`,
      nodeValues,
      highlightNodes: unreachable,
    };
  },
});
