import { defineDesignAnalysis } from '@student-api';

/** Check for three people: one resident and up to two visitors. */
export default defineDesignAnalysis({
  id: 'workspace-capacity',
  label: 'Workspace capacity',
  description: 'Check that every Workspace has a recorded capacity of at least three people. Highlight missing, invalid or insufficient capacities.',
  inputs: [],
  uses: { functions: ['workspace'], nodeFields: ['capacity'] },
  run(ctx) {
    // Explain an empty design instead of reporting a successful capacity check.
    const workspaces = ctx.design.nodes.filter((node) => node.function === 'workspace');
    if (workspaces.length === 0) return { kind: 'analysis', text: 'No Workspace found. Add a Workspace and record its capacity.' };

    // Check each Workspace separately; a large one cannot make up for a small one.
    const problems: number[] = [];
    const reports: string[] = [];
    for (const workspace of workspaces) {
      const capacity = workspace.custom.capacity;
      if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < 0) {
        problems.push(workspace.id);
        reports.push('Workspace ' + workspace.id + ': capacity missing or invalid; record at least 3 people');
      } else if (capacity < 3) {
        problems.push(workspace.id);
        reports.push('Workspace ' + workspace.id + ': FAIL, capacity ' + capacity + ' is below 3 people');
      } else {
        reports.push('Workspace ' + workspace.id + ': PASS, capacity ' + capacity + ' meets 3 people');
      }
    }

    // The number counts Workspaces needing attention; highlight those rooms.
    return {
      kind: 'analysis',
      value: problems.length,
      text: reports.join('; '),
      highlightNodes: problems,
    };
  },
});
