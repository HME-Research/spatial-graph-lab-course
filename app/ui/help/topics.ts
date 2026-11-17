/**
 * Beginner help topics (pure data; Stage 07). Each topic has ONE short sentence that is shown on
 * hover or keyboard focus, and longer details behind a "More details" disclosure. Wording uses the
 * shared vocabulary in `app/views/presentation/vocabulary.ts` (Direct / Connected via route /
 * Unresolved, Access / Open).
 */
export interface HelpTopic {
  readonly id: string;
  readonly title: string;
  /** One sentence, ≤ 140 characters (tested). */
  readonly summary: string;
  /** Longer explanation for "More details". */
  readonly details: string;
}

const topics = [
  {
    id: 'graph-vs-grid',
    title: 'Diagram position vs grid position',
    summary: 'Moving a room in the diagram only tidies the drawing; its grid position decides where it is built.',
    details:
      'The 2D diagram is an abstract picture of the graph. Dragging a circle changes only the diagram. ' +
      'The grid position (x, y, z) is the room’s place in the building, measured in 3 m cells with z going up. ' +
      'Change it in Properties or with the 3D move tool.',
  },
  {
    id: 'access-open',
    title: 'Access or Open',
    summary: 'Access means people can pass between separate rooms; Open means the rooms merge into one space.',
    details:
      'Access: on the same storey a door is placed in the shared wall; between storeys a floor opening with an access marker is shown ' +
      '(a symbol only, not a designed staircase). Open: on the same storey the wall is removed; between storeys the floor becomes an open void. ' +
      'New relationships are Access by default.',
  },
  {
    id: 'relationship-status',
    title: 'Direct, Connected via route, Unresolved',
    summary: 'Every relationship stays in the graph; its spatial status says whether and how it can be built.',
    details:
      'Direct: the rooms touch, so the connection is in their shared wall or floor. ' +
      'Connected via route: the rooms are on the same storey and face each other along x or y with free cells between, so a straight connector is generated. ' +
      'Unresolved: neither is possible yet. The status is recalculated after every change and is never an error in your design.',
  },
  {
    id: 'unresolved',
    title: 'Unresolved relationship',
    summary: 'A short-dashed muted red line: the relationship is kept, but nothing can be built for it in the current layout.',
    details:
      'Common causes: the rooms are on different storeys and do not touch, they do not line up along x or y, or another room or connector is in the way. ' +
      'Move or resize a room so they touch or face each other with clear cells between. Unresolved is not a validation error and the design can still be saved.',
  },
  {
    id: 'connector-style',
    title: 'Connector style',
    summary: 'A generated connector can be an enclosed corridor, a covered walkway or an open deck.',
    details:
      'Enclosed (default): roof and two side walls. Covered: roof with open sides. Deck: floor only. ' +
      'The style is chosen per relationship and only matters when the relationship is Connected via route. Connector cells are reserved, so rooms cannot be placed on them without confirmation.',
  },
  {
    id: 'room-size',
    title: 'Room size',
    summary: 'Size counts whole grid cells in x, y and z; the grid position is the room’s lowest corner.',
    details:
      'A room of size 2 × 3 × 1 fills 6 cells on one storey. Resizing keeps the minimum corner fixed and grows towards +x, +y and +z. ' +
      'Rooms may never overlap; an edit that would overlap another room is refused.',
  },
  {
    id: 'gizmo-snap',
    title: '3D move and resize snapping',
    summary: 'The 3D handles move or resize in whole 3 m cells; the change is applied once, when you release.',
    details:
      'While dragging you see a preview. Releasing commits one change that Undo can reverse. ' +
      'If the room would cover a generated connector you can Cancel or choose “Move anyway and recalculate”; overlapping another room is always refused.',
  },
  {
    id: 'designer-windows',
    title: 'Designer: windows and roofs',
    summary: 'Window amount and flat roof are set per room type for this design, not per individual room.',
    details:
      'Window coverage is the fraction of each exterior wall that is glazed (0 = none, 1 = fully glazed). ' +
      'A flat roof is drawn only on room tops that are exposed to the sky, not between stacked storeys. Project defaults apply until you change them.',
  },
  {
    id: 'analysis-results',
    title: 'Analysis results',
    summary: 'Analysis colours show computed values temporarily; they are not saved and do not change the design.',
    details:
      'Grey means no value: the room was unreachable, returned null, or was added after the analysis ran. ' +
      'The pink selection outline always stays on top. Use Clear to remove the colours.',
  },
  {
    id: 'stale-results',
    title: 'Out-of-date results',
    summary: 'After any edit, undo or load, earlier results are marked out of date until you run the algorithm again.',
    details:
      'Results are tied to the exact version of the design they were computed on. Returning to an equal-looking design does not make them current again; run the algorithm again.',
  },
  {
    id: 'project-attributes',
    title: 'Attributes',
    summary: 'Every node (and every edge) in a project has the same attributes; a value set on one node applies to that node only.',
    details:
      'Attributes are defined once per project in Attributes (Node and Edge) and shared by every scenario. ' +
      'A node shows the value set on it, else its function’s default, else the attribute default. “Use default” removes the node’s own value. ' +
      'Renaming an attribute keeps every stored value; deleting one hides its stored values, which return if it is added again.',
  },
  {
    id: 'display-id',
    title: 'Room label',
    summary: 'The short label (such as 01) is for reading; the permanent id never changes.',
    details:
      'Labels are stored in the design and must be unique. Renumbering labels does not change relationships, which refer to permanent ids.',
  },
] as const satisfies readonly HelpTopic[];

export type HelpTopicId = (typeof topics)[number]['id'];

export const HELP_TOPICS: Readonly<Record<HelpTopicId, HelpTopic>> = Object.freeze(
  Object.fromEntries(topics.map((t) => [t.id, t])) as Record<HelpTopicId, HelpTopic>,
);

export const HELP_TOPIC_IDS: readonly HelpTopicId[] = topics.map((t) => t.id);

/** Topic by id, or undefined for unknown ids (never throws). */
export function helpTopic(id: string): HelpTopic | undefined {
  return Object.hasOwn(HELP_TOPICS, id) ? HELP_TOPICS[id as HelpTopicId] : undefined;
}

/** `{ topicId: details }`, for `RelationshipLegend`'s `helpDetails` prop. */
export const HELP_DETAILS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(topics.map((t) => [t.id, t.details])),
);
