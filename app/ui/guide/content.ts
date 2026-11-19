import { GUIDE_TAB_IDS, type Explainer, type GuideTabId } from '../guideContracts';

/** One Guide tab: an optional lead-in and its blocks (each block is an Explainer; `id` is the section anchor). */
export interface GuideTabContent {
  readonly tab: GuideTabId;
  readonly blocks: readonly Explainer[];
}

/**
 * PLACEHOLDER CONTENT (Programme P4, item B3 supplies the real text). One short entry per tab so
 * the Guide is exercised end to end; replace the entries, keep the shape.
 */
export const GUIDE_CONTENT: readonly GuideTabContent[] = [
  {
    tab: 'graphs',
    blocks: [
      {
        id: 'graphs-placeholder',
        title: 'Graphs (placeholder)',
        summary: 'A graph is rooms (nodes) joined by relationships (edges).',
        example: 'Placeholder: a Kitchen connected to a Living room by a door.',
      },
    ],
  },
  {
    tab: 'attributes',
    blocks: [
      {
        id: 'attributes-placeholder',
        title: 'Attributes (placeholder)',
        summary: 'Attributes describe a room: its type, area, or any value you define.',
        example: 'Placeholder: a Bedroom with area 12.',
      },
    ],
  },
  {
    tab: 'views',
    blocks: [
      {
        id: 'views-placeholder',
        title: 'Views (placeholder)',
        summary: 'The same design is shown as a diagram, a 3D graph, voxels and architecture.',
        example: 'Placeholder: dragging a room in the diagram does not move it in 3D.',
      },
    ],
  },
  {
    tab: 'toolkits',
    blocks: [
      {
        id: 'toolkits-placeholder',
        title: 'Toolkits and JSON (placeholder)',
        summary: 'A toolkit supplies room types, designs and algorithms; designs are saved as JSON.',
        example: 'Placeholder: open a design file, change it, save it again.',
      },
    ],
  },
  {
    tab: 'how-to',
    blocks: [
      {
        id: 'how-to-placeholder',
        title: 'How to (placeholder)',
        summary: 'Short recipes for common tasks.',
        example: 'Placeholder: add a room, connect it, and see it in 3D.',
        learnMore: { label: 'About graphs (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Graph_theory' },
      },
    ],
  },
];

export function guideTabContent(tab: GuideTabId, content: readonly GuideTabContent[] = GUIDE_CONTENT): GuideTabContent | undefined {
  return content.find((c) => c.tab === tab);
}

/** Tabs that have no content entry (a check for the real content, used by tests). */
export function tabsWithoutContent(content: readonly GuideTabContent[] = GUIDE_CONTENT): GuideTabId[] {
  return GUIDE_TAB_IDS.filter((t) => !content.some((c) => c.tab === t));
}
