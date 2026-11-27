import { defineDesignAnalysis, neighbours } from '@student-api';
import bedroom from '../functions/bedroom';
import ensuite from '../functions/ensuite';

/**
 * Ensuite check: a design analysis (it reads each room's Function, not only the graph).
 * It takes no input, so it appears in Analyse › Network and checks the whole design.
 * A Bedroom "has" an Ensuite when a relationship (Access or Open) joins the two rooms.
 * It highlights every Bedroom without exactly one Ensuite, and every Ensuite without
 * exactly one Bedroom.
 */
export default defineDesignAnalysis({
  id: 'ensuite-check',
  label: 'Ensuite check',
  description:
    'Checks that every Bedroom is joined to exactly one Ensuite and every Ensuite to exactly one Bedroom, and highlights the rooms that are not.',
  inputs: [],
  uses: { functions: [bedroom.id, ensuite.id] },
  run(ctx) {
    // The Function of every room, looked up by the room's id.
    const functionOf = new Map(ctx.design.nodes.map((room) => [room.id, room.function]));

    // How many rooms of Function `fn` are joined to room `roomId` by a relationship.
    const countJoined = (roomId: number, fn: string) =>
      neighbours(ctx.design, roomId).filter((id) => functionOf.get(id) === fn).length;

    // All Bedrooms and all Ensuites of the design.
    const bedrooms = ctx.design.nodes.filter((room) => room.function === bedroom.id);
    const ensuites = ctx.design.nodes.filter((room) => room.function === ensuite.id);

    // Nothing to check yet: say so instead of giving an answer.
    if (bedrooms.length === 0 && ensuites.length === 0) {
      return { kind: 'analysis', value: 0, text: 'No Bedrooms or Ensuites in this design yet.' };
    }

    // Bedrooms with no Ensuite, and Bedrooms with more than one.
    const noEnsuite = bedrooms.filter((room) => countJoined(room.id, ensuite.id) === 0).map((room) => room.id);
    const manyEnsuites = bedrooms.filter((room) => countJoined(room.id, ensuite.id) > 1).map((room) => room.id);

    // Ensuites joined to no Bedroom, and Ensuites shared by more than one Bedroom.
    const noBedroom = ensuites.filter((room) => countJoined(room.id, bedroom.id) === 0).map((room) => room.id);
    const sharedEnsuite = ensuites.filter((room) => countJoined(room.id, bedroom.id) > 1).map((room) => room.id);

    // Every room with a problem, to highlight in every view.
    const problems = [...noEnsuite, ...manyEnsuites, ...noBedroom, ...sharedEnsuite];

    // All good: every Bedroom and every Ensuite is paired one to one.
    if (problems.length === 0) {
      return {
        kind: 'analysis',
        value: 0,
        text: `All ${bedrooms.length} Bedroom(s) have exactly one Ensuite, and every Ensuite serves one Bedroom.`,
      };
    }

    // Describe each kind of problem that was found, with the room ids.
    const parts: string[] = [];
    if (noEnsuite.length > 0) parts.push(`Bedroom(s) without an Ensuite: ${noEnsuite.join(', ')}`);
    if (manyEnsuites.length > 0) parts.push(`Bedroom(s) with more than one Ensuite: ${manyEnsuites.join(', ')}`);
    if (noBedroom.length > 0) parts.push(`Ensuite(s) without a Bedroom: ${noBedroom.join(', ')}`);
    if (sharedEnsuite.length > 0) parts.push(`Ensuite(s) shared by several Bedrooms: ${sharedEnsuite.join(', ')}`);

    return {
      kind: 'analysis',
      value: problems.length,
      text: `${parts.join('. ')}.`,
      highlightNodes: problems,
    };
  },
});
