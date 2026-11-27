import { defineDesignAnalysis } from '@student-api';
import { connections } from '../lib/connections';

// Compare population with shelter places separately in each connected component.
export default defineDesignAnalysis({
  id: 'shelter-capacity-assessment',
  label: 'Shelter Capacity Assessment',
  description: 'Totals residents and shelter places in each connected component. Highlights confirmed shortages and labels incomplete data as unknown.',
  inputs: [],
  uses: { functions: ['residential', 'emergency-shelter'], nodeFields: ['residentCount', 'shelterCapacity'] },
  run({ design }) {
    // An empty graph has no component to assess.
    if (design.nodes.length === 0) return { kind: 'analysis', text: 'Empty graph: no population or shelter capacity to assess.' };
    const adjacent = connections(design);
    const nodes = new Map(design.nodes.map((node) => [node.id, node]));
    const visited = new Set<number>();
    const nodeValues: Record<number, string> = {};
    const highlightNodes: number[] = [];
    const reports: string[] = [];

    // Start components in numeric id order so their labels remain predictable.
    for (const start of [...nodes.keys()].sort((a, b) => a - b)) {
      if (visited.has(start)) continue;
      const component = [start];
      visited.add(start);
      for (let head = 0; head < component.length; head++) {
        for (const next of adjacent.get(component[head]!) ?? []) {
          if (visited.has(next)) continue;
          visited.add(next);
          component.push(next);
        }
      }

      // Sum only valid counts and keep the ids of every missing or invalid value.
      let population = 0;
      let capacity = 0;
      let shelters = 0;
      const missingPopulation: number[] = [];
      const missingCapacity: number[] = [];
      for (const id of component) {
        const node = nodes.get(id)!;
        if (node.function === 'residential') {
          const count = node.custom.residentCount;
          if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) population += count;
          else missingPopulation.push(id);
        }
        if (node.function === 'emergency-shelter') {
          shelters++;
          const count = node.custom.shelterCapacity;
          if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) capacity += count;
          else missingCapacity.push(id);
        }
      }

      // A shortage is certain when known demand already exceeds a complete capacity total.
      const overflow = !Number.isSafeInteger(population) || !Number.isSafeInteger(capacity);
      const incomplete = missingPopulation.length > 0 || missingCapacity.length > 0 || overflow;
      const shortage = !overflow && missingCapacity.length === 0 && population > capacity;
      const status = shortage ? 'Insufficient' : incomplete ? 'Unknown' : 'Sufficient';
      for (const id of component) {
        nodeValues[id] = status;
        if (shortage) highlightNodes.push(id);
      }

      // Label partial sums explicitly, and explain exactly which fields need attention.
      const peopleText = missingPopulation.length ? `${population} known (partial)` : `${population}`;
      const capacityText = missingCapacity.length ? `${capacity} known (partial)` : `${capacity}`;
      let report = `Component ${start}: population ${peopleText}, shelter capacity ${capacityText}; ${status}.`;
      if (shelters === 0) report += ' No shelters (capacity 0).';
      if (missingPopulation.length) report += ` Missing/invalid residentCount: nodes ${missingPopulation.join(', ')}.`;
      if (missingCapacity.length) report += ` Missing/invalid shelterCapacity: nodes ${missingCapacity.join(', ')}.`;
      if (overflow) report += ' Totals exceed safe numeric precision; reduce counts.';
      reports.push(report);
    }
    return { kind: 'analysis', text: reports.join(' '), nodeValues, highlightNodes };
  },
});
