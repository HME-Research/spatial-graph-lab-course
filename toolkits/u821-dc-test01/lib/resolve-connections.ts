import { type SpatialAlgorithmContext, type SpatialOperation, type TransformationResult } from '@student-api';
import { connectionProblem, hasDirectContact, pairKey, planHouseConnections } from './house-connections';

export function resolveConnections(ctx: SpatialAlgorithmContext, suitesOnly = false): TransformationResult {
    const plan = planHouseConnections(ctx);
    const operations: SpatialOperation[] = [];
    const required = new Set(plan.required.map(([a, b]) => pairKey(a.id, b.id)));
    const nodes = new Map(ctx.design.nodes.map((room) => [room.id, room]));
    const blocked: string[] = [];
    const prohibited: string[] = [];
    const bathroomsWithBadLinks = new Set<number>();
    const bedroomsWithBadBathroomLinks = new Set<number>();

    // Identify invalid edges for manual removal. The Student API has no remove-edge operation.
    for (const edge of ctx.design.edges) {
      const a = nodes.get(edge.source);
      const b = nodes.get(edge.target);
      if (a && b && connectionProblem(ctx, edge, a, b, required)) {
        prohibited.push(`#${edge.id} (rooms #${a.id}–#${b.id})`);
        if (a.function === 'bathroom') bathroomsWithBadLinks.add(a.id);
        if (b.function === 'bathroom') bathroomsWithBadLinks.add(b.id);
        if (a.function === 'bedroom' && b.function === 'bathroom') bedroomsWithBadBathroomLinks.add(a.id);
        if (b.function === 'bedroom' && a.function === 'bathroom') bedroomsWithBadBathroomLinks.add(b.id);
      }
    }

    // Add direct links. Wait for manual cleanup before giving a bathroom another door.
    for (const [a, b] of plan.required) {
      if (suitesOnly && (a.function !== 'bedroom' || b.function !== 'bathroom')) continue;
      if (plan.byPair.has(pairKey(a.id, b.id))) continue;
      if (!hasDirectContact(ctx, a, b)) {
        blocked.push(`#${a.id}–#${b.id}`);
        continue;
      }
      if (b.function === 'bathroom' && (bathroomsWithBadLinks.has(b.id) || bedroomsWithBadBathroomLinks.has(a.id))) continue;
      operations.push({ op: 'add-edge', source: a.id, target: b.id, relationship: 'access' });
    }

    // Explain which fixes need room edits or manual removal before rerunning.
    const notes = [`${operations.length} missing Access connection(s) proposed.`];
    if (prohibited.length) notes.push(`Remove or correct these edges manually: ${prohibited.join(', ')}.`);
    if (blocked.length) notes.push(`Move these room pairs to share the required wall or slab: ${blocked.join(', ')}.`);
    if (plan.unpaired.length) notes.push(`Arrange separate bathroom pairs for rooms #${plan.unpaired.map((room) => room.id).join(', #')}.`);
    if (plan.missingRoles.size) notes.push(`Add or move these room types to the required floors: ${[...plan.missingRoles].join(', ')}.`);
    const summary = notes.join('\n');
    return {
      kind: 'transformation',
      summary: summary.length > 2000 ? `${summary.slice(0, 1940)}… See Check Spatial Connectivity for more details.` : summary,
      operations,
    };
}
