import { VIEW_MODE_LABELS, VIEW_MODES, type ViewMode } from '@app/views/contracts';
import type { EffectiveCorridorLook, RelationshipKind, RoofStyle, WallStyle } from '@app/document';
import type { EdgeResolution, UnresolvedReason } from '@app/spatial';

/**
 * Beginner-facing vocabulary for the application shell and the Properties panel (Stage 05).
 * Pure data and string helpers only; one place to change what students read.
 *
 * Words used everywhere: "Properties" (never "Inspector"), "Building" (never "Architecture"),
 * "room" for a node and "relationship" / "connection" for an edge.
 */

/** Visible view names. `architecture` is the internal mode id; students see "Building". */
export const VIEW_LABELS: Readonly<Record<ViewMode, string>> = {
  ...VIEW_MODE_LABELS,
  architecture: 'Building',
};

/** One-line tooltip per view, shown on the view selector. */
export const VIEW_DESCRIPTIONS: Readonly<Record<ViewMode, string>> = {
  graph2d: 'Diagram of rooms and their relationships. Its layout is free: dragging a node never moves the room.',
  graph3d: 'Rooms as points at their physical cells, with relationships drawn as lines.',
  voxels: 'The occupied cells of the building grid, coloured by room type.',
  architecture: 'The building generated from the graph: walls, doors, openings, floors and roofs.',
  plan: 'An architectural floor plan of one storey of the same building, cut at 1.2 m: walls, doors, openings and rooms.',
  data: 'The same graph as data: the saved JSON text, or a table with one row per node and per edge.',
};

/**
 * One-line caption under each view panel header (phase 08, O07): graph → grid → building.
 * "Voxels" is kept as the established name; the caption explains it.
 */
export const VIEW_CAPTIONS: Readonly<Record<ViewMode, string>> = {
  graph2d: 'Relationships · free layout',
  graph3d: 'Relationships at real cell positions',
  voxels: 'Occupied grid cells (one box per cell)',
  architecture: 'Building generated from rooms and relationships',
  plan: 'Floor plan of one storey of the building',
  data: 'The graph as JSON text or as tables',
};

/** Ordered view modes with their visible label and tooltip. */
export const VIEW_OPTIONS: readonly { readonly mode: ViewMode; readonly label: string; readonly description: string }[] = VIEW_MODES.map(
  (mode) => ({ mode, label: VIEW_LABELS[mode], description: VIEW_DESCRIPTIONS[mode] }),
);

/**
 * The LEFT navigation rail (Gate F; P4: Algorithms became Analyse and Transform): eight ordered destinations, top to bottom, each with an icon
 * and an always-visible label. This supersedes the phase-04 "exactly four destinations" decision.
 * The internal id `designer` is kept; students read "Building Designer". The right-hand panel
 * holds Properties only (`PROPERTIES_LABEL`). Ordering and icons: `app/workspace/destinations.ts`.
 */
export const SIDEBAR_SECTIONS = ['project', 'attributes', 'designer', 'analyse', 'transform', 'scenarios', 'camera', 'display'] as const;
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];

export const SIDEBAR_LABELS: Readonly<Record<SidebarSection, string>> = {
  project: 'Project',
  attributes: 'Attributes',
  designer: 'Building Designer',
  analyse: 'Analyse',
  transform: 'Transform',
  scenarios: 'Scenarios',
  camera: 'Camera',
  display: 'Display',
};

export const SIDEBAR_DESCRIPTIONS: Readonly<Record<SidebarSection, string>> = {
  project: 'Project information, files and checks',
  attributes: 'Attributes of every node and edge in this project',
  designer: 'Appearance per function in this scenario',
  analyse: 'Read the graph and show a result; never changes the design',
  transform: 'Propose a change to the design: preview, then Apply (one undo step)',
  scenarios: 'Alternatives within this project',
  camera: 'Saved camera views of the 3D viewports',
  display: 'How each view looks: labels, legend, colours and lighting',
};

export const PROPERTIES_LABEL = 'Properties';
export const PROPERTIES_DESCRIPTION = 'Properties of the selected room or relationship';

// ── Relationships (schema v2) ────────────────────────────────────────────────────────────────

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description: string;
}

export const RELATIONSHIP_KIND_CHOICES: readonly Choice<RelationshipKind>[] = [
  {
    value: 'access',
    label: 'Access',
    description: 'People can move between the rooms: a door, a floor opening, or a generated corridor. (Default)',
  },
  {
    value: 'open',
    label: 'Open',
    description: 'The rooms flow into each other with nothing between them: no wall, an open void, or an open connector.',
  },
];

/** Walls of a generated corridor (the same words as a room card's walls). */
export const CORRIDOR_WALL_CHOICES: readonly Choice<WallStyle>[] = [
  { value: 'enclosed', label: 'Enclosed', description: 'A side wall on each side.' },
  { value: 'open', label: 'Open', description: 'Open sides; slim posts carry the roof (no roof: no posts).' },
];

/** Roof of a generated corridor (the same words as a room card's roof). */
export const CORRIDOR_ROOF_CHOICES: readonly Choice<RoofStyle>[] = [
  { value: 'flat', label: 'Flat', description: 'A flat roof.' },
  { value: 'pergola', label: 'Pergola (open slats)', description: 'Open slats across the corridor, like a room pergola.' },
  { value: 'none', label: 'None (open top)', description: 'No roof, open to the sky.' },
];

const CORRIDOR_WALL_WORDS: Readonly<Record<WallStyle, string>> = { enclosed: 'side walls', open: 'open sides' };
const CORRIDOR_ROOF_WORDS: Readonly<Record<RoofStyle, string>> = { flat: 'a flat roof', pergola: 'a pergola roof', none: 'no roof' };

/** "open sides and a flat roof": a corridor look in words. */
export const corridorLookText = (look: EffectiveCorridorLook): string => `${CORRIDOR_WALL_WORDS[look.walls]} and ${CORRIDOR_ROOF_WORDS[look.roof]}`;

export const labelOfChoice = <T extends string>(choices: readonly Choice<T>[], value: T): string =>
  choices.find((c) => c.value === value)?.label ?? value;

/** Why a relationship is not built, in plain language, with what the student can do about it. */
export const UNRESOLVED_REASON_TEXT: Readonly<Record<UnresolvedReason, string>> = {
  'different-level':
    'The rooms are on different storeys and do not touch. Stairs and ramps are not generated yet: stack the rooms or put them on a shared storey.',
  'not-aligned': 'No straight corridor can join facing walls of the two rooms. Line the rooms up along x or y on a shared storey.',
  'blocked-by-room': 'Another room is in the way of every straight corridor between these rooms.',
  'blocked-by-route': 'Another generated corridor is in the way.',
  'endpoint-clearance': 'There is not enough clear space at one end of the corridor.',
  'routing-unavailable': 'Corridors between rooms that do not touch are not generated in this version yet.',
  'preferred-face-unavailable':
    'The wall chosen for this connection is no longer shared by the two rooms. Choose another shared wall or clear the choice.',
};

export type StatusTone = 'ok' | 'warning';

export interface ResolutionText {
  /** Short status, e.g. "Direct" or "Unresolved". */
  readonly title: string;
  /** One-sentence explanation. */
  readonly detail: string;
  readonly tone: StatusTone;
}

/** Plain-language spatial status of one relationship. An unresolved relationship is a warning, never an error. */
export function describeResolution(resolution: EdgeResolution): ResolutionText {
  switch (resolution.status) {
    case 'direct':
      if (resolution.contact === 'horizontal') {
        return {
          title: 'Direct',
          detail: resolution.relationship === 'access' ? 'The rooms share a wall, so a door is made in it.' : 'The rooms share a wall, which is left out.',
          tone: 'ok',
        };
      }
      return {
        title: 'Direct',
        detail:
          resolution.relationship === 'access'
            ? 'The rooms are stacked: a floor opening with an access marker is made (not a designed stair).'
            : 'The rooms are stacked: an open void joins the two floors.',
        tone: 'ok',
      };
    case 'routed': {
      const n = resolution.route.cells.length;
      return {
        title: 'Connected via route',
        detail: `Joined by a generated corridor (${corridorLookText(resolution.route.look)}), ${n} cell${n === 1 ? '' : 's'} long, on storey ${resolution.route.level}.`,
        tone: 'ok',
      };
    }
    case 'unresolved':
      return { title: 'Unresolved', detail: UNRESOLVED_REASON_TEXT[resolution.reason], tone: 'warning' };
  }
}

// ── Spatial guidance ────────────────────────────────────────────────────────────────────────

/** The ONE place that explains diagram position vs Position in Properties (phase 08, O02). */
export const POSITION_HELP = 'Where the room is built: x and y across the site, z is the storey. Dragging its node in Graph 2D only tidies the diagram.';

export const SIZE_HELP = 'How many cells the room spans along x, y and z. The room grows from its position (its lowest corner).';

export const UNDO_HINT = 'You can undo this with Ctrl+Z (⌘Z on a Mac).';
