import { VIEW_MODE_LABELS, VIEW_MODES, type ViewMode } from '@app/views/contracts';
import type { ConnectorStyle, RelationshipKind } from '@app/document/v2';
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
  plan: 'An architectural floor plan of one storey of the same building (not drawn yet).',
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
  plan: 'Floor plan of one storey (coming soon)',
};

/** Ordered view modes with their visible label and tooltip. */
export const VIEW_OPTIONS: readonly { readonly mode: ViewMode; readonly label: string; readonly description: string }[] = VIEW_MODES.map(
  (mode) => ({ mode, label: VIEW_LABELS[mode], description: VIEW_DESCRIPTIONS[mode] }),
);

/**
 * The LEFT navigation rail (Gate F): seven ordered destinations, top to bottom, each with an icon
 * and an always-visible label. This supersedes the phase-04 "exactly four destinations" decision.
 * The internal id `designer` is kept; students read "Building Designer". The right-hand panel
 * holds Properties only (`PROPERTIES_LABEL`). Ordering and icons: `app/workspace/destinations.ts`.
 */
export const SIDEBAR_SECTIONS = ['project', 'attributes', 'designer', 'algorithms', 'scenarios', 'camera', 'display'] as const;
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];

export const SIDEBAR_LABELS: Readonly<Record<SidebarSection, string>> = {
  project: 'Project',
  attributes: 'Attributes',
  designer: 'Building Designer',
  algorithms: 'Algorithms',
  scenarios: 'Scenarios',
  camera: 'Camera',
  display: 'Display',
};

export const SIDEBAR_DESCRIPTIONS: Readonly<Record<SidebarSection, string>> = {
  project: 'Project, designs, files and checks',
  attributes: 'Custom fields of every room (Nodes) and relationship (Edges) in this project',
  designer: 'Appearance settings per room type in this design',
  algorithms: 'Run the project’s analyses and transformations on this design',
  scenarios: 'Design alternatives of this project',
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

export const CONNECTOR_STYLE_CHOICES: readonly Choice<ConnectorStyle>[] = [
  { value: 'enclosed', label: 'Enclosed', description: 'Floor, roof and side walls. (Default)' },
  { value: 'covered', label: 'Covered', description: 'Floor and roof, open at the sides.' },
  { value: 'deck', label: 'Deck', description: 'Floor only, open to the sky.' },
];

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
          detail: resolution.kind === 'access' ? 'The rooms share a wall, so a door is made in it.' : 'The rooms share a wall, which is left out.',
          tone: 'ok',
        };
      }
      return {
        title: 'Direct',
        detail:
          resolution.kind === 'access'
            ? 'The rooms are stacked: a floor opening with an access marker is made (not a designed stair).'
            : 'The rooms are stacked: an open void joins the two floors.',
        tone: 'ok',
      };
    case 'routed': {
      const n = resolution.route.cells.length;
      const style = labelOfChoice(CONNECTOR_STYLE_CHOICES, resolution.route.style).toLowerCase();
      return {
        title: 'Connected via route',
        detail: `Joined by a generated ${style} corridor, ${n} cell${n === 1 ? '' : 's'} long, on storey ${resolution.route.level}.`,
        tone: 'ok',
      };
    }
    case 'unresolved':
      return { title: 'Unresolved', detail: UNRESOLVED_REASON_TEXT[resolution.reason], tone: 'warning' };
  }
}

// ── Spatial guidance ────────────────────────────────────────────────────────────────────────

/** The ONE place that explains diagram position vs grid position in Properties (phase 08, O02). */
export const POSITION_HELP = 'Where the room is built: x and y across the site, z is the storey. Dragging its node in Graph 2D only tidies the diagram.';

export const SIZE_HELP = 'How many cells the room spans along x, y and z. The room grows from its position (its lowest corner).';

export const UNDO_HINT = 'You can undo this with Ctrl+Z (⌘Z on a Mac).';
