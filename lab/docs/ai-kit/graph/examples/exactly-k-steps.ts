// A graph analysis for Spatial Graph Lab.
//
// Use it in either of two ways (the same file works in both):
//   1. Analyse › "Upload your own (.ts)" (at the top of the tab) in the app, or
//   2. save it as toolkits/<your-toolkit>/algorithms/exactly-k-steps.ts.
//
// An analysis only READS the graph: node ids and edges (each edge has a source and a target).
// It never changes the design, and it cannot see functions, positions, sizes or custom attributes.

import { defineGraphAlgorithm, neighbours } from '@student-api';

export default defineGraphAlgorithm({
  // A unique name: lowercase letters, digits and "-", starting with a letter.
  id: 'exactly-k-steps',
  // What the Analyse panel shows on the button.
  label: 'Exactly k steps away',
  // Shown by the ⓘ button: what the answer tells you.
  description: 'Finds every node that is exactly k steps away from the start node (not closer).',

  // What the student picks, in order. One node and a number → the Queries section.
  inputs: [
    { kind: 'node', label: 'Start' },
    { kind: 'number', label: 'Steps', min: 1, max: 20, default: 2 },
  ],

  run({ graph, inputs }) {
    // One value per input, in the same order as `inputs` above.
    const start = inputs[0]!;
    const steps = inputs[1]!;

    // Breadth-first search: visit the start, then its neighbours, then theirs, …
    const distance = new Map<number, number>();
    distance.set(start, 0);
    let frontier = [start];
    for (let step = 1; step <= steps; step++) {
      const next: number[] = [];
      for (const node of frontier) {
        for (const other of neighbours(graph, node)) {
          if (!distance.has(other)) {
            distance.set(other, step);
            next.push(other);
          }
        }
      }
      frontier = next;
    }

    // `frontier` now holds the nodes found at exactly `steps` steps.
    return {
      kind: 'analysis',
      value: frontier.length,
      text: `${frontier.length} node(s) exactly ${steps} step(s) from node ${start}`,
      highlightNodes: [start, ...frontier],
    };
  },
});
