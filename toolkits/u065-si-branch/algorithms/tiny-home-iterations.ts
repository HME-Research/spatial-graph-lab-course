import { defineSpatialAlgorithm, type FunctionDefinition, type RelationshipKind, type SpatialOperation } from '@student-api';
import bedroom from '../functions/bedroom';
import couch from '../functions/couch';
import diningTable from '../functions/dining-table';
import kitchen from '../functions/kitchen';
import washroom from '../functions/washroom';
import { formatArea, LARGEST_HOME, rateSize, SMALLEST_HOME } from '../lib/sizing';

/**
 * Tiny home iterations: a transformation.
 *
 * It builds every layout of a tiny home of the chosen area, scores each one, ranks them, and adds
 * the iteration you choose (1 = the best) as new rooms beside your drawing. Nothing changes until
 * you press Apply; run it again with another iteration number to compare them side by side.
 *
 * - SIZE. One cell is 3 × 3 m = 9 m², so 9–37 m² is 1 to 4 cells, one room per cell.
 * - COMBINING. Five Functions do not fit in 4 cells, so some are combined into a compatible room
 *   (e.g. the dining table into the kitchen, a sofa bed in the couch room). A combined Function
 *   needs only half its minimum area there if its furniture folds away (`foldAway`).
 * - LAYOUTS. Every shape of the cells (row, square, L, T), every placement of the rooms in it, and
 *   with or without a boundary shift that makes the washroom 4.5 m² and its neighbour 13.5 m².
 * - CONNECTIONS. Shared rooms next to each other are open to each other; private rooms get one door.
 * - SCORE (points): spatial efficiency (60), circulation (10), shared plumbing (10),
 *   accessibility (10, or 20 when "Accessible" is on), privacy (10), multifunctional furniture (10).
 *
 * The minimum areas, furniture, plumbing, privacy and fold-away values are the Functions' own
 * defaults (in `functions/`).
 */

/** Every Function of the toolkit, in the order used to list them. */
const FUNCTIONS: readonly FunctionDefinition[] = [bedroom, couch, diningTable, kitchen, washroom];

/** Which rooms a Function can be combined into, best first. The washroom only into a studio. */
const HOSTS: Record<string, readonly string[]> = {
  [diningTable.id]: [kitchen.id, couch.id],
  [couch.id]: [diningTable.id, kitchen.id, bedroom.id],
  [bedroom.id]: [couch.id],
  [kitchen.id]: [diningTable.id, couch.id],
  [washroom.id]: [],
};

/** Minimum washroom area (m²) when "Accessible" is on: room for a 1.5 m wheelchair turning circle. */
const ACCESSIBLE_WASHROOM = 5;

/** One cell's floor area (m²). */
const CELL_AREA = 9;

/** The app's largest coordinate (in cells). */
const MAX_COORDINATE = 1000;

/** The shapes the cells can take, by number of cells. Each cell is [x, y] on the ground level. */
const SHAPES: Record<number, readonly { name: string; cells: readonly [number, number][] }[]> = {
  1: [{ name: 'studio', cells: [[0, 0]] }],
  2: [{ name: 'row of 2', cells: [[0, 0], [1, 0]] }],
  3: [
    { name: 'row of 3', cells: [[0, 0], [1, 0], [2, 0]] },
    { name: 'L-shape', cells: [[0, 0], [1, 0], [0, 1]] },
  ],
  4: [
    { name: 'row of 4', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { name: '2 × 2 square', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    { name: 'L-shape', cells: [[0, 0], [1, 0], [2, 0], [0, 1]] },
    { name: 'T-shape', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  ],
};

/** What a Function needs, read from its own defaults. */
interface Need {
  id: string;
  label: string;
  minArea: number;
  furniture: string;
  plumbing: boolean;
  private: boolean;
  foldAway: boolean;
}

/** One connection in a layout, between two cells (by index). */
interface Link {
  a: number;
  b: number;
  relationship: RelationshipKind;
}

/** One generated layout and its score. */
interface Layout {
  shape: string;
  cells: readonly [number, number][];
  rooms: string[];
  guests: string[][];
  links: Link[];
  shiftLink: number | undefined;
  areas: number[];
  required: number[];
  score: number;
  notes: string[];
}

/** A Function's default for one attribute (or undefined). */
function defaultOf(fn: FunctionDefinition, key: string) {
  return fn.custom?.[key]?.default;
}

/** Every order of the items (n! of them). */
function orders<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of orders(rest)) result.push([items[i]!, ...tail]);
  }
  return result;
}

/** Every group of `size` items, in list order. */
function groups<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  const result: T[][] = [];
  for (let i = 0; i <= items.length - size; i++) {
    for (const tail of groups(items.slice(i + 1), size - 1)) result.push([items[i]!, ...tail]);
  }
  return result;
}

export default defineSpatialAlgorithm({
  id: 'tiny-home-iterations',
  label: 'Tiny home iterations',
  parameters: {
    homeArea: {
      kind: 'number',
      min: SMALLEST_HOME,
      max: LARGEST_HOME,
      default: 27,
      label: 'Home area (m²)',
      description: 'Floor area of the tiny home, 9 to 37 m². One cell is 9 m², so it is rounded down to 1–4 cells.',
    },
    iteration: {
      kind: 'number',
      min: 1,
      default: 1,
      label: 'Iteration',
      description: 'Which ranked layout to add: 1 = the best. The summary lists the top ones and their scores.',
    },
    accessible: {
      kind: 'boolean',
      default: false,
      label: 'Accessible',
      description: 'Wheelchair use: the washroom needs at least 5 m² and a door from a shared room, and accessibility counts double.',
    },
  },
  run(ctx) {
    // The parameters (the app fills in the defaults; TypeScript still wants a fallback).
    const homeArea = ctx.params.homeArea ?? 27;
    const iteration = ctx.params.iteration ?? 1;
    const accessible = ctx.params.accessible ?? false;
    if (!Number.isInteger(iteration)) {
      return { kind: 'transformation', summary: `Iteration must be a whole number, like 1, 2 or 3 (not ${iteration}).`, operations: [] };
    }

    // How many 3 × 3 m cells fit in the home area.
    const cellCount = Math.min(4, Math.max(1, Math.floor(homeArea / CELL_AREA)));

    // What every Function needs, from its own defaults.
    const needs = new Map<string, Need>(
      FUNCTIONS.map((fn) => {
        const minArea = defaultOf(fn, 'minArea');
        const furniture = defaultOf(fn, 'furniture');
        const need: Need = {
          id: fn.id,
          label: fn.label,
          minArea: typeof minArea === 'number' ? minArea : 0,
          furniture: typeof furniture === 'string' ? furniture : fn.label,
          plumbing: defaultOf(fn, 'needsPlumbing') === true,
          private: defaultOf(fn, 'privacy') === 'private',
          foldAway: defaultOf(fn, 'foldAway') === true,
        };
        // An accessible washroom needs room to turn a wheelchair.
        if (accessible && fn.id === washroom.id) need.minArea = Math.max(need.minArea, ACCESSIBLE_WASHROOM);
        return [fn.id, need] as const;
      }),
    );
    const need = (id: string) => needs.get(id)!;

    // Every layout: which Functions get their own room, the shape, the placement, the shift.
    const layouts: Layout[] = [];
    const seen = new Set<string>();
    for (const primaries of groups(FUNCTIONS.map((f) => f.id), cellCount)) {
      // With two rooms or more, the washroom always gets its own closed room.
      if (cellCount >= 2 && !primaries.includes(washroom.id)) continue;

      // Combine every other Function into the best compatible room (a studio also takes the washroom).
      const hostOf = new Map<string, string>();
      let fits = true;
      for (const guest of FUNCTIONS.map((f) => f.id).filter((id) => !primaries.includes(id))) {
        const options = cellCount === 1 && guest === washroom.id ? primaries : HOSTS[guest]!;
        const host = options.find((id) => primaries.includes(id));
        if (host === undefined) fits = false;
        else hostOf.set(guest, host);
      }
      if (!fits) continue;

      for (const shape of SHAPES[cellCount]!) {
        for (const rooms of orders(primaries)) {
          for (const shifted of cellCount >= 2 ? [false, true] : [false]) {
            const layout = buildLayout(shape.name, shape.cells, rooms, hostOf, shifted);
            // Skip mirror images and repeats: the same rooms joined in the same way.
            const signature = describeLinks(layout) + (shifted ? ' shifted' : '') + ` ${shape.name} ${layout.score}`;
            if (seen.has(signature)) continue;
            seen.add(signature);
            layouts.push(layout);
          }
        }
      }
    }

    /** Lay out the rooms on the cells, connect them and score the result. */
    function buildLayout(
      shapeName: string,
      cells: readonly [number, number][],
      rooms: string[],
      hostOf: Map<string, string>,
      shifted: boolean,
    ): Layout {
      const n = cells.length;
      const guests = rooms.map((id) => [...hostOf].filter(([, host]) => host === id).map(([guest]) => guest));
      const isShared = (i: number) => !need(rooms[i]!).private;
      const touch = (i: number, j: number) => Math.abs(cells[i]![0] - cells[j]![0]) + Math.abs(cells[i]![1] - cells[j]![1]) === 1;

      // Shared rooms side by side are open to each other (an open-plan living space).
      const links: Link[] = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) if (isShared(i) && isShared(j) && touch(i, j)) links.push({ a: i, b: j, relationship: 'open' });
      }

      // Reach every other room by one door, starting from the shared rooms. Rooms to reach: shared
      // first, then dry private rooms, then wet ones; reach them from shared rooms first.
      const order = (i: number) => (isShared(i) ? 0 : need(rooms[i]!).plumbing ? 2 : 1);
      const reached = new Set<number>();
      const start = [...Array(n).keys()].find(isShared) ?? 0;
      const spread = () => {
        let grew = true;
        while (grew) {
          grew = false;
          for (const l of links) {
            if (reached.has(l.a) !== reached.has(l.b)) {
              reached.add(l.a);
              reached.add(l.b);
              grew = true;
            }
          }
        }
      };
      reached.add(start);
      spread();
      while (reached.size < n) {
        // Every possible new door from a reached room to an unreached neighbour, best first.
        const options: [number, number][] = [];
        for (const r of reached) for (let c = 0; c < n; c++) if (!reached.has(c) && touch(r, c)) options.push([r, c]);
        options.sort((p, q) => order(p[1]) - order(q[1]) || order(p[0]) - order(q[0]) || p[1] - q[1] || p[0] - q[0]);
        const [from, to] = options[0]!;
        links.push({ a: from, b: to, relationship: isShared(from) && isShared(to) ? 'open' : 'access' });
        reached.add(to);
        spread();
      }

      // Floor areas: 9 m² per room; a shifted washroom gives 4.5 m² to the room its door opens to.
      const areas = rooms.map(() => CELL_AREA);
      const wet = rooms.indexOf(washroom.id);
      let shiftLink: number | undefined;
      if (shifted && wet >= 0) {
        shiftLink = links.findIndex((l) => l.a === wet || l.b === wet);
        const other = links[shiftLink]!.a === wet ? links[shiftLink]!.b : links[shiftLink]!.a;
        areas[wet] = CELL_AREA / 2;
        areas[other] = CELL_AREA * 1.5;
      }

      // What every room needs: its own minimum plus its combined Functions (half if they fold away).
      const required = rooms.map((id, i) => guests[i]!.reduce((sum, g) => sum + need(g).minArea * (need(g).foldAway ? 0.5 : 1), need(id).minArea));

      // SCORE 1 — spatial efficiency (60): little wasted floor, and missing floor counts double.
      let wasted = 0;
      let missing = 0;
      for (let i = 0; i < n; i++) {
        wasted += Math.max(0, areas[i]! - required[i]!);
        missing += Math.max(0, required[i]! - areas[i]!);
      }
      const total = n * CELL_AREA;
      const efficiency = 60 * Math.max(0, 1 - (wasted + 2 * missing) / total);

      // Doors and openings of each room.
      const linked = (i: number) => links.filter((l) => l.a === i || l.b === i).map((l) => (l.a === i ? l.b : l.a));

      // SCORE 2 — circulation (10): nobody walks through a private room to reach another room.
      const passedThrough = rooms.map((id, i) => need(id).private && linked(i).length > 1);
      const circulation = Math.max(0, 10 - 5 * passedThrough.filter(Boolean).length);

      // SCORE 3 — shared plumbing (10): the wet rooms share a wall (or are one room in a studio).
      const wetRooms = rooms.map((_, i) => i).filter((i) => [rooms[i]!, ...guests[i]!].some((id) => need(id).plumbing));
      const allWetTouch = wetRooms.every((i) => wetRooms.every((j) => i === j || touch(i, j)));
      const plumbing = wetRooms.length <= 1 || allWetTouch ? 10 : 0;

      // SCORE 4 — accessibility (10, or 20): the washroom door opens from a shared room.
      // With "Accessible" on, a washroom too small to turn a wheelchair gets no points.
      const washroomFromShared = wet >= 0 && linked(wet).some(isShared);
      const tooSmallToTurn = accessible && wet >= 0 && areas[wet]! < required[wet]!;
      const accessibility = tooSmallToTurn ? 0 : (washroomFromShared ? 10 : 5) * (accessible ? 2 : 1);

      // SCORE 5 — privacy (10): private Functions have their own room that is not walked through.
      const privateIds = FUNCTIONS.map((f) => f.id).filter((id) => need(id).private);
      const privacyShare = privateIds.map((id) => {
        const i = rooms.indexOf(id);
        if (i < 0) return 0.2;
        return passedThrough[i] ? 0.5 : 1;
      });
      const privacy = 10 * (privacyShare.reduce((a, b) => a + b, 0) / Math.max(1, privacyShare.length));

      // SCORE 6 — multifunctional furniture (10): combined Functions whose furniture folds away.
      const combined = guests.flat();
      const multifunctional = Math.min(10, combined.reduce((sum, g) => sum + (need(g).foldAway ? 4 : 1), 0));

      const score = Math.round(efficiency + circulation + plumbing + accessibility + privacy + multifunctional);

      // A few words on what makes this layout good or weak.
      const notes: string[] = [];
      if (allWetTouch && wetRooms.length > 1) notes.push('shared plumbing wall');
      if (passedThrough.some(Boolean)) notes.push('walk through a private room');
      if (wet >= 0 && !washroomFromShared) notes.push('washroom only through the bedroom');
      if (missing > 0) notes.push(`${formatArea(missing)} m² too small`);

      return { shape: shapeName, cells, rooms, guests, links, shiftLink, areas, required, score, notes };
    }

    /** The rooms and connections in words, the same for mirror images. */
    function describeLinks(layout: Layout): string {
      const room = (i: number) => [layout.rooms[i]!, ...layout.guests[i]!].join('+');
      return layout.links.map((l) => [room(l.a), room(l.b)].sort().join(`-${l.relationship}-`)).sort().join(', ') || room(0);
    }

    /** One line about a layout: shape, rooms, score. */
    function describe(layout: Layout, rank: number): string {
      const rooms = layout.rooms.map((id, i) => {
        const extra = layout.guests[i]!.map((g) => need(g).label.toLowerCase());
        const area = layout.areas[i] !== CELL_AREA ? ` ${formatArea(layout.areas[i]!)} m²` : '';
        return `${need(id).label}${area}${extra.length > 0 ? ` (+ ${extra.join(', ')})` : ''}`;
      });
      const notes = layout.notes.length > 0 ? ` — ${layout.notes.join('; ')}` : '';
      return `${rank}. ${layout.score} pts · ${layout.shape}: ${rooms.join(' | ')}${notes}`;
    }

    // Rank: highest score first; equal scores in the order they were made.
    const ranked = layouts.map((layout, n) => ({ layout, n })).sort((p, q) => q.layout.score - p.layout.score || p.n - q.n);
    if (ranked.length === 0) {
      return { kind: 'transformation', summary: 'No layout fits these rooms.', operations: [] };
    }
    const chosenRank = Math.min(iteration, ranked.length);
    const chosen = ranked[chosenRank - 1]!.layout;

    // Place the new home beside everything already drawn, one empty column away, on the ground.
    const nodes = ctx.design.nodes;
    const x0 = nodes.length === 0 ? 0 : Math.max(...nodes.map((r) => r.position[0] + r.size[0])) + 1;
    const y0 = nodes.length === 0 ? 0 : Math.min(...nodes.map((r) => r.position[1]));
    if (x0 + 4 > MAX_COORDINATE) {
      return { kind: 'transformation', summary: 'There is no free space left along x for another home.', operations: [] };
    }

    // One room per cell, with its combined minimum area and furniture.
    const operations: SpatialOperation[] = [];
    chosen.rooms.forEach((id, i) => {
      const furniture = [need(id).furniture, ...chosen.guests[i]!.map((g) => `${need(g).furniture}${need(g).foldAway ? ' (folds away)' : ''}`)];
      operations.push({
        op: 'add-node',
        ref: `room-${i}`,
        position: [x0 + chosen.cells[i]![0], y0 + chosen.cells[i]![1], 0],
        function: id,
        custom: { minArea: Math.round(chosen.required[i]! * 10) / 10, furniture: furniture.join(' + ') },
      });
    });

    // The connections; the washroom is the source, so a boundary shift "toward-source" shrinks it.
    chosen.links.forEach((l, k) => {
      const [source, target] = chosen.rooms[l.b] === washroom.id ? [l.b, l.a] : [l.a, l.b];
      operations.push({
        op: 'add-edge',
        source: `room-${source}`,
        target: `room-${target}`,
        relationship: l.relationship,
        ...(k === chosen.shiftLink ? { boundaryShift: 'toward-source' as const } : {}),
      });
    });

    // The summary: what was made, the ranking, and how each room rates.
    const ratings = chosen.rooms.map((id, i) => `${need(id).label} ${rateSize(chosen.areas[i]!, chosen.required[i]!)}`);
    const header = [
      `Added iteration ${chosenRank} of ${ranked.length} for ${formatArea(homeArea)} m²: ${cellCount} cell${cellCount === 1 ? '' : 's'} of 3 × 3 m = ${cellCount * CELL_AREA} m².`,
      iteration > ranked.length ? `There are only ${ranked.length} iterations, so the last one was used.` : '',
      `Rooms: ${ratings.join(', ')}.`,
      'Run again with another Iteration to place it beside this one and compare; Undo removes it.',
      'Ranking (top 5):',
    ].filter((line) => line !== '');
    const top = ranked.slice(0, 5).map((r, k) => describe(r.layout, k + 1) + (k + 1 === chosenRank ? '  ← added' : ''));
    if (chosenRank > 5) top.push(describe(chosen, chosenRank) + '  ← added');

    return { kind: 'transformation', summary: [...header, ...top].join('\n'), operations };
  },
});
