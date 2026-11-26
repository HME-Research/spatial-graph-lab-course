import bathroom from '../functions/bathroom';
import bedroom from '../functions/bedroom';
import corridor from '../functions/corridor';
import dining from '../functions/dining';
import hall from '../functions/hall';
import kitchen from '../functions/kitchen';
import livingRoom from '../functions/living-room';
import terrace from '../functions/terrace';

/**
 * The rules of the growing house, shared by the algorithms. Change the house here.
 */

/** Every Function of the toolkit, in the order the summaries list them. */
export const FUNCTIONS = [hall, livingRoom, dining, kitchen, terrace, corridor, bedroom, bathroom];

/** The id of the seed room's Function. */
export const SEED = hall.id;

/** Which rooms each room invites, in order (a Function that is not listed invites nothing). */
export const INVITES: Record<string, readonly string[]> = {
  [hall.id]: [livingRoom.id, corridor.id],
  [livingRoom.id]: [dining.id, terrace.id],
  [dining.id]: [kitchen.id],
  [corridor.id]: [bedroom.id, bedroom.id, bathroom.id],
};

/** The most rooms of each Function the whole plan may have (a Function that is not listed: no limit). */
export const MOST: Record<string, number> = {
  [livingRoom.id]: 1,
  [kitchen.id]: 1,
  [dining.id]: 1,
  [terrace.id]: 1,
  [bedroom.id]: 3,
  [bathroom.id]: 2,
  [corridor.id]: 2,
};

/** The complete programme: how many rooms of each Function a finished house has (what the rules grow). */
export const PROGRAMME: Record<string, number> = {
  [hall.id]: 1,
  [livingRoom.id]: 1,
  [dining.id]: 1,
  [kitchen.id]: 1,
  [terrace.id]: 1,
  [corridor.id]: 1,
  [bedroom.id]: 2,
  [bathroom.id]: 1,
};

/** Pairs of Functions joined with an Open relationship (no wall); every other pair gets Access (a door). */
const OPEN_PAIRS = [
  [kitchen.id, dining.id],
  [livingRoom.id, terrace.id],
];

/** The relationship between two rooms of these Functions. */
export function relationshipFor(a: string, b: string): 'access' | 'open' {
  const open = OPEN_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
  return open ? 'open' : 'access';
}

/** The label of a Function id, e.g. "Living room" for "living-room". */
export function labelOf(functionId: string): string {
  return FUNCTIONS.find((f) => f.id === functionId)?.label ?? functionId;
}
