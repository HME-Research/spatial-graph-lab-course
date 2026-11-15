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
  graph2d: 'Diagram of rooms and their relationships. Moving a node here only rearranges the diagram; it never moves the room.',
  graph3d: 'Rooms as points at their physical cells, with relationships drawn as lines.',
  voxels: 'The occupied cells of the building grid, coloured by room type.',
  architecture: 'The building generated from the graph: walls, doors, openings, floors and roofs.',
};

/** Ordered view modes with their visible label and tooltip. */
export const VIEW_OPTIONS: readonly { readonly mode: ViewMode; readonly label: string; readonly description: string }[] = VIEW_MODES.map(
  (mode) => ({ mode, label: VIEW_LABELS[mode], description: VIEW_DESCRIPTIONS[mode] }),
);

/** Sidebar sections, in display order (top to bottom of the vertical navigation). */
export const SIDEBAR_SECTIONS = ['properties', 'algorithms', 'designer'] as const;
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];

export const SIDEBAR_LABELS: Readonly<Record<SidebarSection, string>> = {
  properties: 'Properties',
  algorithms: 'Algorithms',
  designer: 'Designer',
};

export const SIDEBAR_DESCRIPTIONS: Readonly<Record<SidebarSection, string>> = {
  properties: 'Properties of the selected room or relationship',
  algorithms: 'Run the project’s algorithms on this design',
  designer: 'Appearance settings per room type',
};

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
};

export type StatusTone = 'ok' | 'warning';

export interface ResolutionText {
  /** Short status, e.g. "Direct" or "Not built". */
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
        title: 'Corridor',
        detail: `Joined by a generated ${style} corridor, ${n} cell${n === 1 ? '' : 's'} long, on storey ${resolution.route.level}.`,
        tone: 'ok',
      };
    }
    case 'unresolved':
      return { title: 'Not built', detail: UNRESOLVED_REASON_TEXT[resolution.reason], tone: 'warning' };
  }
}

// ── Spatial guidance ────────────────────────────────────────────────────────────────────────

export const POSITION_HELP =
  'The room’s physical cell in the building grid: x and y across the site, z is the storey. Changing it moves the room in the Voxels and Building views. Moving a node in Graph 2D only rearranges the diagram and never moves the room.';

export const SIZE_HELP = 'How many cells the room spans along x, y and z. The room grows from its position (its lowest corner).';

export const UNDO_HINT = 'You can undo this with Ctrl+Z (⌘Z on a Mac).';
