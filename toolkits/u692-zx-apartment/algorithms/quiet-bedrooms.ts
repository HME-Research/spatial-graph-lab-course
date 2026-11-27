import { defineDesignAnalysis } from '@student-api';
import bedroom from '../functions/bedroom';
import entrance from '../functions/entrance';
import kitchen from '../functions/kitchen';
import livingRoom from '../functions/living-room';
import { edgeBetween, innerRoomCauses, isNoisy, roomName, sameStorey } from '../lib/bedrooms';

/**
 * Quiet bedrooms: a design analysis with no input, so it appears in Analyse › Network.
 *
 * It checks every Bedroom for two problems:
 * 1. Noise: it touches a Living room or Kitchen through a door (Access), an opening (Open),
 *    a shared wall, or because that room is directly above or below it.
 * 2. Inner room: it has no door or opening to an Entrance, but is joined to a Living room or
 *    Kitchen, so you reach it by walking through that room.
 * Bedrooms with a problem are highlighted; the text names the room that causes it.
 *
 * `uses` lists the Function ids it names; it reads no custom fields.
 */
export default defineDesignAnalysis({
  id: 'quiet-bedrooms',
  label: 'Quiet bedrooms',
  description: 'Highlights every Bedroom that touches a Living room or Kitchen (noise) or can only be reached through one (inner room).',
  inputs: [],
  uses: { functions: [bedroom.id, livingRoom.id, kitchen.id, entrance.id] },
  run(ctx) {
    const { nodes, edges } = ctx.design;
    const bedrooms = nodes.filter((room) => room.function === bedroom.id);
    // Nothing to check without Bedrooms.
    if (bedrooms.length === 0) {
      return { kind: 'analysis', value: 0, text: 'No Bedrooms yet: draw a Bedroom to check it.' };
    }

    const problemBedrooms: number[] = [];
    const lines: string[] = [];
    for (const room of bedrooms) {
      const problems: string[] = [];

      // 1. Noise: every Living room or Kitchen this Bedroom touches, and how.
      const noise: string[] = [];
      for (const other of nodes.filter(isNoisy)) {
        const edge = edgeBetween(edges, room.id, other.id);
        if (edge) {
          // A relationship: Access is a door, Open an opening.
          noise.push(`${roomName(other)} (${edge.relationship === 'access' ? 'door' : 'opening'})`);
        } else if (ctx.touches(room.id, other.id)) {
          // Touching without a relationship: a shared wall, or a floor if on another storey.
          const how = sameStorey(room, other) ? 'shared wall' : other.position[2] > room.position[2] ? 'room above' : 'room below';
          noise.push(`${roomName(other)} (${how})`);
        }
      }
      if (noise.length > 0) problems.push(`noise from ${noise.join(', ')}`);

      // 2. Inner room: reached only through a Living room or Kitchen.
      const causes = innerRoomCauses(nodes, edges, room);
      if (causes.length > 0) problems.push(`inner room, reached through ${causes.map(roomName).join(' or ')}`);

      // Remember the Bedroom and its problems.
      if (problems.length > 0) {
        problemBedrooms.push(room.id);
        lines.push(`Bedroom ${room.id}: ${problems.join('; ')}.`);
      }
    }

    // One summary sentence, then one sentence per Bedroom with a problem.
    const summary = problemBedrooms.length === 0
      ? `All ${bedrooms.length} Bedroom(s) are quiet and private.`
      : `${problemBedrooms.length} of ${bedrooms.length} Bedroom(s) have a problem.`;
    return {
      kind: 'analysis',
      value: problemBedrooms.length,
      text: [summary, ...lines].join(' '),
      highlightNodes: problemBedrooms,
    };
  },
});
